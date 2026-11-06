import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readAnalytics } from './data.mjs';
import { importHistory } from './import-history.mjs';
import store from './telemetry/.codex/hooks/performance-store.cjs';

test('project retains measurements after the Codex transcript disappears', async () => {
  const root = await mkdtemp(join(tmpdir(), 'analytics-history-test-'));
  try {
    const project = join(root, 'project');
    const config = join(project, '.codex');
    const codexHome = join(root, 'codex');
    const archive = join(codexHome, 'archived_sessions');
    const sessionId = '01234567-1234-1234-1234-123456789abc';
    const turnId = 'measured-turn';
    const transcript = join(archive, `rollout-test-${sessionId}.jsonl`);
    const hooks = join(config, 'hooks');
    await mkdir(hooks, { recursive: true });
    await mkdir(archive, { recursive: true });
    await writeFile(join(config, 'context-packages.json'), JSON.stringify([{
      id: 'ticket', epic: 'Analytics', points: 2, completedAt: '2026-11-06T07:01:00Z',
      subtasks: [{ name: 'Measure', kind: 'implementation', sessionId, turnId, workSeconds: 60 }],
    }]));
    await writeFile(join(config, 'context-usage.jsonl'), JSON.stringify({
      sessionId, turnId, tokenUsage: { total_tokens: 150 },
    }) + '\n');
    const event = (type, payload, timestamp) => ({ type, payload, timestamp });
    const message = (type, fields, timestamp) => event('event_msg', { type, ...fields }, timestamp);
    const tokens = (used, info) => message('token_count', {
      info, rate_limits: { primary: { window_minutes: 300, resets_at: 1793952000, used_percent: used } },
    });
    const events = [
      tokens(10),
      message('task_started', { turn_id: turnId }, '2026-11-06T07:00:00Z'),
      event('turn_context', { turn_id: turnId, model: 'test-model', instructions: 'private content' }),
      event('response_item', { content: 'private content' }),
      tokens(12, {
        total_token_usage: { total_tokens: 150 },
        last_token_usage: { total_tokens: 150, input_tokens: 100 },
        model_context_window: 1000,
      }),
      message('task_complete', { turn_id: turnId, last_agent_message: 'private content' }, '2026-11-06T07:01:00Z'),
    ];
    await writeFile(transcript, events.slice(0, -1).map(row => JSON.stringify(row)).join('\n') + '\n');
    assert.deepEqual(await importHistory(project, codexHome), { saved: 1, found: 1, total: 1 });
    await writeFile(transcript, events.map(row => JSON.stringify(row)).join('\n') + '\n');
    const hook = join(hooks, 'context-history.cjs');
    await copyFile(new URL('./telemetry/.codex/hooks/context-history.cjs', import.meta.url), hook);
    await copyFile(new URL('./telemetry/.codex/hooks/performance-store.cjs', import.meta.url), join(hooks, 'performance-store.cjs'));
    execFileSync(process.execPath, [hook], { input: JSON.stringify({
      hook_event_name: 'Stop', transcript_path: transcript, session_id: sessionId,
    }) });
    assert.deepEqual(await importHistory(project, codexHome), { saved: 0, found: 1, total: 1 });
    const before = await readAnalytics(project);
    assert.equal(before.tokens, 150);
    assert.equal(before.attempts, 1);
    assert.equal(before.items[0].startContext.percent, 10);
    assert.equal(before.items[0].quotaUsed, 2);
    assert.equal(before.items[0].workSeconds, 60);
    const measurements = store.withStore(project, db => db.prepare('SELECT measurements FROM transcripts').all());
    assert.equal(measurements.length, 1);
    assert.doesNotMatch(measurements[0].measurements, /private content/);
    await rm(transcript);
    await rm(join(config, 'context-packages.json'));
    await rm(join(config, 'context-usage.jsonl'));
    assert.deepEqual(await importHistory(project, codexHome), { saved: 0, found: 0, total: 1 });
    assert.deepEqual(await readAnalytics(project), before);

    const record = (kind, value) => execFileSync(process.execPath,
      [fileURLToPath(new URL('./record.mjs', import.meta.url)), kind, '-', project],
      { input: JSON.stringify(value) });
    const kiroRun = { id: 'run-1', provider: 'kiro', name: 'Review', kind: 'feedback',
      workSeconds: 30, metrics: [{ unit: 'credits', value: 2.4 }] };
    record('run', kiroRun);
    assert.equal((await readAnalytics(project)).unassignedRuns[0].provider, 'kiro');
    record('run', { ...kiroRun, ticketId: 'ticket' });
    record('run', kiroRun);
    record('quota', { id: 'november', provider: 'kiro', account: 'team',
      periodStart: '2026-11-01', periodEnd: '2026-12-01', observedAt: '2026-11-06',
      unit: 'credits', used: 21, limit: 100, overage: 0 });
    const mixed = await readAnalytics(project);
    assert.equal(mixed.items[0].tokens, 150);
    assert.equal(mixed.items[0].workSeconds, 90);
    assert.deepEqual(mixed.items[0].subtasks.find(run => run.provider === 'kiro').metrics, kiroRun.metrics);
    assert.equal(mixed.quotaSnapshots[0].used, 21);
    assert.equal(mixed.unassignedRuns.length, 0);

    const kiroHooks = join(project, '.kiro', 'hooks');
    await mkdir(kiroHooks, { recursive: true });
    const kiroHook = join(kiroHooks, 'performance-run.cjs');
    await copyFile(new URL('./telemetry/.kiro/hooks/performance-run.cjs', import.meta.url), kiroHook);
    for (let retry = 0; retry < 2; retry++) {
      execFileSync(process.execPath, [kiroHook], { input: JSON.stringify({
        session_id: 'kiro-session', turn_id: 'kiro-turn', prompt: 'private content',
      }), env: { ...process.env, AI_PERFORMANCE_TICKET_ID: '' } });
    }
    const kiroCaptured = (await readAnalytics(project)).unassignedRuns;
    assert.equal(kiroCaptured.length, 1);
    assert.equal(kiroCaptured[0].provider, 'kiro');
    assert.deepEqual(kiroCaptured[0].metrics, []);
    assert.doesNotMatch(JSON.stringify(kiroCaptured), /private content/);

    const usageHook = join(hooks, 'context-usage.cjs');
    await copyFile(new URL('./telemetry/.codex/hooks/context-usage.cjs', import.meta.url), usageHook);
    execFileSync(process.execPath, [usageHook], { input: JSON.stringify({
      hook_event_name: 'PostModelRequest', session_id: 'new-codex-session', turn_id: 'new-turn',
      token_usage: { total_tokens: 50 },
    }) });
    const unassigned = (await readAnalytics(project)).unassignedRuns;
    assert.equal(unassigned.find(run => run.provider === 'codex').tokens, 50);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
