import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

function quota(payload) {
  const limits = payload.rate_limits;
  if (limits?.limit_id && limits.limit_id !== 'codex') return null;
  const window = [limits?.primary, limits?.secondary].find((entry) => entry?.window_minutes === 300);
  return Number.isFinite(window?.used_percent) && Number.isFinite(window.resets_at)
    ? { used: window.used_percent, resetsAt: window.resets_at } : null;
}

async function* files(directory, sessions, depth = 0) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'EPERM') return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (depth < 3 && entry.isDirectory() && /^\d{2,4}$/.test(entry.name)) yield* files(path, sessions, depth + 1);
    if (!entry.isFile() || !entry.name.startsWith('rollout-')) continue;
    const id = entry.name.match(/([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})\.jsonl$/i)?.[1];
    if (sessions.has(id)) yield { id, path };
  }
}

export async function readRolloutUsage(directory, packages) {
  const sessions = new Map();
  for (const item of packages) {
    for (const step of Array.isArray(item?.subtasks) ? item.subtasks : []) {
      if (!step?.sessionId || !step.turnId) continue;
      if (!sessions.has(step.sessionId)) sessions.set(step.sessionId, new Set());
      sessions.get(step.sessionId).add(step.turnId);
    }
  }
  const rows = [];
  const quotas = new Map();
  const timings = new Map();
  const startContexts = new Map();
  const accountUsage = new Map();
  const unassigned = new Map();
  if (!sessions.size) return { rows, quotas, accountUsage, unassigned, timings, startContexts };
  for await (const { id, path } of files(directory, sessions)) {
    const turns = sessions.get(id);
    sessions.delete(id);
    let current, started, model, before, latest, observed, previousTotal;
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (!line.includes('"token_count"') && !line.includes('"task_started"') &&
            !line.includes('"task_complete"') && !line.includes('"turn_context"')) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        const payload = event?.payload;
        if (!payload) continue;
        if (event.type === 'turn_context' && payload.turn_id === current) model = payload.model;
        if (event.type !== 'event_msg') continue;
        if (payload.type === 'task_started') {
          current = payload.turn_id;
          started = Date.parse(event.timestamp) / 1000;
          model = null;
          before = latest;
          observed = null;
        } else if (payload.type === 'task_complete' && payload.turn_id === current) {
          const endedAt = Date.parse(event.timestamp);
          if (turns.has(current) && Number.isFinite(started) && endedAt >= started * 1000) {
            timings.set(JSON.stringify([id, current]), { startedAt: started * 1000, endedAt });
          }
          if (observed) {
            const sameWindow = before && Math.abs(before.resetsAt - observed.resetsAt) <= 2;
            const withinWindow = started >= observed.resetsAt - 18000 && started < observed.resetsAt;
            if (sameWindow || withinWindow) {
              const measurement = {
                resetsAt: observed.resetsAt,
                used: sameWindow && observed.used >= before.used ? observed.used - before.used : null,
              };
              if (turns.has(current)) quotas.set(JSON.stringify([id, current]), measurement);
              else if (measurement.used > 0) {
                const group = unassigned.get(measurement.resetsAt) ?? { count: 0, used: 0 };
                group.count++;
                group.used += measurement.used;
                unassigned.set(measurement.resetsAt, group);
              }
            }
          }
          current = null;
        } else if (payload.type === 'token_count') {
          const snapshot = quota(payload);
          if (snapshot) {
            latest = snapshot;
            accountUsage.set(snapshot.resetsAt, Math.max(accountUsage.get(snapshot.resetsAt) ?? 0, snapshot.used));
            if (current) observed = snapshot;
          }
          const cumulative = payload.info?.total_token_usage?.total_tokens;
          if (!Number.isSafeInteger(cumulative) || cumulative === previousTotal) continue;
          if (turns.has(current)) {
            const key = JSON.stringify([id, current]);
            if (!startContexts.has(key)) {
              const input = payload.info?.last_token_usage?.input_tokens;
              const limit = payload.info?.model_context_window;
              startContexts.set(key, model && Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(limit) && limit > 0
                ? { model, input, limit, percent: 100 * input / limit } : null);
            }
          }
          const last = payload.info?.last_token_usage?.total_tokens;
          if (turns.has(current) && Number.isSafeInteger(last) && last >= 0) {
            rows.push({ sessionId: id, turnId: current, model, tokens: last });
          }
          previousTotal = cumulative;
        }
      }
    } finally {
      lines.close();
    }
    if (!sessions.size) break;
  }
  return { rows, quotas, accountUsage, unassigned, timings, startContexts };
}
