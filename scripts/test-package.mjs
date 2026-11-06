import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const npmPath = process.env.npm_execpath;
if (!npmPath) throw new Error('Run this smoke test with npm run test:package.');
const npm = (args, cwd, input) => execFileSync(process.execPath, [npmPath, ...args], {
  cwd, input, encoding: 'utf8', timeout: 120000,
});
const [pack] = JSON.parse(npm(['pack', '--json'], process.cwd()));
// npm 8 may report a scoped path in JSON while writing an unscoped filename.
const archive = resolve(pack.filename.replace(/^@/, '').replace('/', '-'));
assert.ok(existsSync(archive), archive);
assert.ok(pack.files.every(({ path }) =>
  !/^\.codex\/|performance\.sqlite|context-usage\.jsonl|context-packages\.json|context-history\//.test(path)));

const project = mkdtempSync(join(tmpdir(), 'ai-performance-package-'));
const file = (...parts) => join(project, ...parts);
const cli = (args, input) => npm(['exec', '--', 'aip', ...args], project, input);
const callHook = (dir, role, payload) => execFileSync(process.execPath, [file(dir, 'hooks', 'ai-performance.cjs'), role], {
  cwd: project, encoding: 'utf8', input: JSON.stringify(payload),
});
try {
  execFileSync('git', ['init', '-q'], { cwd: project });
  writeFileSync(file('package.json'), '{"name":"release-smoke","version":"1.0.0","private":true}');
  npm(['install', '-D', archive, '--no-audit', '--no-fund', '--fetch-retries=0'], project);
  const db = file('.codex', 'performance.sqlite');
  const marker = file('.codex', 'ai-performance-enabled.json');
  assert.ok(!existsSync(db) && !existsSync(marker));
  assert.equal(cli(['--version']).trim(), pack.version);

  mkdirSync(file('.codex'));
  const old = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing', timeout: 2 }] }] } };
  writeFileSync(file('.codex', 'hooks.json'), JSON.stringify(old));
  cli(['init', '--codex', '--kiro']);
  const config = readFileSync(file('.codex', 'hooks.json'), 'utf8');
  assert.deepEqual(JSON.parse(config).hooks.Stop[0], old.hooks.Stop[0]);
  cli(['init', '--codex', '--kiro']);
  assert.equal(readFileSync(file('.codex', 'hooks.json'), 'utf8'), config);

  const codex = { hook_event_name: 'PostModelRequest', session_id: 'test-session', turn_id: 'codex-turn',
    token_usage: { total_tokens: 123 } };
  const kiro = { session_id: 'kiro-session', turn_id: 'kiro-turn' };
  callHook('.codex', 'codex-usage', codex);
  callHook('.kiro', 'kiro-run', kiro);
  assert.ok(existsSync(db));
  const originalDatabase = readFileSync(db);
  for (const provider of ['.codex', '.kiro']) {
    const launcher = file(provider, 'hooks', 'ai-performance.cjs');
    writeFileSync(launcher, readFileSync(launcher, 'utf8').replace(
      '@tobiasoberpaul/aip/hook', '@tobiasoberpaul/ai-performance/hook',
    ));
  }
  cli(['init', '--codex', '--kiro']);
  assert.deepEqual(readFileSync(db), originalDatabase);
  for (const provider of ['.codex', '.kiro']) {
    assert.match(readFileSync(file(provider, 'hooks', 'ai-performance.cjs'), 'utf8'), /@tobiasoberpaul\/aip\/hook/);
  }
  execFileSync('git', ['check-ignore', '.codex/performance.sqlite', '.codex/ai-performance-enabled.json'], { cwd: project });
  cli(['record', 'ticket', '-'], JSON.stringify({
    id: 'SMOKE-1', name: 'Installed package test', epic: 'Release',
    subtasks: [{ sessionId: codex.session_id, turnId: codex.turn_id, name: 'Codex run', kind: 'implementation', workSeconds: 4 }],
  }));
  cli(['record', 'link', 'kiro/kiro-session:kiro-turn', 'SMOKE-1']);
  cli(['disable']);
  assert.ok(!existsSync(marker));
  callHook('.codex', 'codex-usage', { ...codex, token_usage: { total_tokens: 500 } });
  callHook('.kiro', 'kiro-run', { ...kiro, turn_id: 'disabled-turn' });

  const installedCli = file('node_modules', '@tobiasoberpaul', 'aip', 'cli.mjs');
  const server = spawn(process.execPath, [installedCli, 'serve'], { cwd: project, stdio: ['ignore', 'pipe', 'inherit'] });
  const ended = new Promise(resolve => server.once('exit', resolve));
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 20000);
      server.stdout.on('data', chunk => {
        const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      ended.then(code => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
    });
    const [page, css, api] = await Promise.all(['/', '/styles.css', '/api/analytics'].map(route => fetch(url + route)));
    assert.equal(page.status, 200);
    assert.equal(css.status, 200);
    assert.match(await css.text(), /\.bg-background/);
    const analytics = await api.json();
    assert.equal(api.status, 200, analytics.error);
    assert.equal(analytics.items[0].tokens, 123);
    assert.deepEqual(analytics.items[0].subtasks.map(step => step.provider).sort(), ['codex', 'kiro']);
    assert.deepEqual(analytics.unassignedRuns, []);
  } finally {
    server.kill();
    await ended;
  }
  console.log('Verified npm installation, opt-in, hook capture, disable, and installed dashboard.');
  console.log('Archive:', archive);
  console.log('Integrity:', pack.integrity);
} finally {
  rmSync(project, { recursive: true, force: true });
}
