import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import hook from './hook.cjs';

const packageName = '@tobiasoberpaul/ai-performance';
const launcher = `const { join } = require('node:path');
require('${packageName}/hook').run(join(__dirname, '..', '..'), process.argv[2]);
`;
const ignoreRules = [
  '/.codex/performance.sqlite*', '/.codex/ai-performance-enabled.json',
  '/.codex/context-packages.json', '/.codex/context-usage.jsonl', '/.codex/context-history/',
];
const codexHandlers = {
  UserPromptSubmit: [['codex-check', 5]],
  Stop: [['codex-check', 5], ['codex-history', 15]],
  Interrupt: [['codex-check', 3], ['codex-history', 3]],
  SessionEnd: [['codex-history', 3]],
  PostModelRequest: [['codex-usage', 5]],
};
const kiroConfig = {
  version: 'v1',
  hooks: [{ name: 'Record Kiro performance run', trigger: 'AgentStop',
    action: { type: 'command', command: 'node .kiro/hooks/ai-performance.cjs kiro-run' } }],
};

async function read(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function json(path, fallback) {
  const contents = await read(path);
  return contents === null ? fallback : JSON.parse(contents.replace(/^\uFEFF/, ''));
}

function git(project, args) {
  return execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
}

function requireRoot(project) {
  if (git(project, ['rev-parse', '--show-prefix'])) throw new Error('Run this command from the Git repository root.');
}

function codexConfig(config) {
  config.hooks ??= {};
  for (const [event, handlers] of Object.entries(codexHandlers)) {
    const groups = config.hooks[event] ??= [];
    for (const group of groups) {
      for (const handler of group.hooks ?? []) {
        if (/context-(?:history|usage|package-check)\.cjs/.test(handler.command ?? '')) {
          throw new Error('Standalone AI Performance hooks are already configured in .codex/hooks.json. Remove their entries before switching to the npm hooks.');
        }
      }
    }
    for (const [name, timeout] of handlers) {
      const command = 'node "$(git rev-parse --show-toplevel)/.codex/hooks/ai-performance.cjs" ' + name;
      if (!groups.some(group => group.hooks?.some(handler => handler.command === command))) {
        groups.push({ hooks: [{ type: 'command', command, timeout, ...(name === 'codex-usage' && { async: true }) }] });
      }
    }
  }
  return config;
}

export async function init(project, args) {
  if (!args.length || args.some(arg => !['--codex', '--kiro'].includes(arg))) {
    throw new Error('Choose --codex, --kiro, or both to enable local collection.');
  }
  requireRoot(project);
  createRequire(join(project, 'package.json')).resolve(packageName + '/hook');
  if (git(project, ['ls-files', '--', '.codex/performance.sqlite*', '.codex/ai-performance-enabled.json',
    '.codex/context-packages.json', '.codex/context-usage.jsonl', '.codex/context-history/'])) {
    throw new Error('Local analytics data is tracked by Git. Untrack it before enabling collection.');
  }

  const files = new Map();
  const enabledPath = join(project, hook.marker);
  const enabled = await json(enabledPath, {});
  const queueJson = (path, value) => files.set(path, JSON.stringify(value, null, 2) + '\n');
  const queueLauncher = async (path) => {
    const existing = await read(path);
    if (existing !== null && existing !== launcher) throw new Error(`Refusing to overwrite ${path}.`);
    files.set(path, launcher);
  };
  if (args.includes('--codex')) {
    const path = join(project, '.codex', 'hooks.json');
    queueJson(path, codexConfig(await json(path, {})));
    await queueLauncher(join(project, '.codex', 'hooks', 'ai-performance.cjs'));
    enabled.codex = true;
  }
  if (args.includes('--kiro')) {
    const path = join(project, '.kiro', 'hooks', 'performance.json');
    const existing = await json(path, null);
    if (existing && JSON.stringify(existing) !== JSON.stringify(kiroConfig)) {
      throw new Error('Refusing to overwrite .kiro/hooks/performance.json. Move any standalone AI Performance configuration out of the hook directory first.');
    }
    await queueLauncher(join(project, '.kiro', 'hooks', 'ai-performance.cjs'));
    queueJson(path, kiroConfig);
    enabled.kiro = true;
  }

  const ignore = join(project, '.gitignore');
  const current = await read(ignore) ?? '';
  const missing = ignoreRules.filter(rule => !current.split(/\r?\n/).includes(rule));
  if (missing.length) files.set(ignore, (current && !current.endsWith('\n') ? current + '\n' : current) + missing.join('\n') + '\n');
  for (const [path, contents] of files) {
    await mkdir(dirname(path), { recursive: true });
    if (await read(path) !== contents) await writeFile(path, contents);
  }
  for (const path of [hook.marker, '.codex/performance.sqlite']) git(project, ['check-ignore', '--', path]);
  queueJson(enabledPath, enabled);
  await mkdir(dirname(enabledPath), { recursive: true });
  await writeFile(enabledPath, files.get(enabledPath));
  console.log('Local collection enabled. Review new Codex hooks in Settings → Hooks if you enabled Codex.');
}

export async function disable(project) {
  requireRoot(project);
  await rm(join(project, hook.marker), { force: true });
  console.log('Local npm hook collection disabled. Saved data is still available.');
}
