import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import store from './telemetry/.codex/hooks/performance-store.cjs';

const [kind, file, target] = process.argv.slice(2);
const project = resolve(target ?? process.env.INIT_CWD ?? process.cwd());
const kinds = ['ticket', 'run', 'quota'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const amount = value => Number.isFinite(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function validate(record) {
  if (!nonempty(record?.id)) throw new Error('Each record needs a stable ID.');
  if (kind === 'ticket') {
    if (!nonempty(record.name) || !nonempty(record.epic)) throw new Error('A ticket needs a name and epic.');
    if (record.subtasks != null && !Array.isArray(record.subtasks)) throw new Error('Ticket subtasks must be an array.');
    return record;
  }
  if (!nonempty(record.provider)) throw new Error('A provider is required.');
  if (kind === 'run') {
    if (!nonempty(record.name) || !['implementation', 'feedback', 'handoff'].includes(record.kind)) {
      throw new Error('A run needs a name and kind (implementation, feedback or handoff).');
    }
    if (record.workSeconds != null && !amount(record.workSeconds)) throw new Error('Invalid run duration.');
    if (record.metrics != null && (!Array.isArray(record.metrics) ||
        record.metrics.some(metric => !nonempty(metric?.unit) || !amount(metric.value)))) {
      throw new Error('Run metrics need a unit and a nonnegative value.');
    }
    return { ...record, metrics: record.metrics ?? [], workSeconds: record.workSeconds ?? null };
  }
  if (!nonempty(record.account) || !nonempty(record.unit) || !timestamp(record.periodStart) ||
      !timestamp(record.periodEnd) || Date.parse(record.periodStart) >= Date.parse(record.periodEnd) ||
      !timestamp(record.observedAt) || !amount(record.used) || (record.limit != null && !amount(record.limit)) ||
      (record.overage != null && !amount(record.overage))) {
    throw new Error('Quota records need account, unit, period, observation time and observed usage.');
  }
  return record;
}

if (!['migrate', 'list', 'link', ...kinds].includes(kind) || (kind !== 'migrate' && !file)) {
  throw new Error('Usage: npm run record -- migrate | list <kind> | link <provider/run-id> <ticket-id> | <ticket|run|quota> <json-file|-> [project]');
}

store.withStore(kind === 'link' ? resolve(process.env.INIT_CWD ?? process.cwd()) : project, db => {
  if (kind === 'migrate') {
    console.log('Local telemetry database is ready.');
  } else if (kind === 'list') {
    if (!kinds.includes(file)) throw new Error('Unknown record kind.');
    console.log(JSON.stringify(store.records(db, file), null, 2));
  } else if (kind === 'link') {
    db.exec('BEGIN IMMEDIATE');
    try {
      const ticketRow = db.prepare("SELECT body FROM records WHERE kind = 'ticket' AND id = ?").get(target ?? '');
      if (!ticketRow) throw new Error('Unknown ticket.');
      const row = db.prepare("SELECT body FROM records WHERE kind = 'run' AND id = ?").get(file);
      if (row) {
        store.put(db, 'run', file, { ...JSON.parse(row.body), ticketId: target });
      } else {
        const [, sessionId, turnId] = file.match(/^codex\/([^:]+):([^:]+)$/) ?? [];
        if (!sessionId || !store.records(db, 'attempt').some(entry => entry.sessionId === sessionId && entry.turnId === turnId)) {
          throw new Error('Unknown run.');
        }
        const tickets = store.records(db, 'ticket');
        const linked = tickets.find(item => item.subtasks?.some(step => step.sessionId === sessionId && step.turnId === turnId) ||
          (!item.subtasks && item.sessionIds?.includes(sessionId) && (!item.turnIds || item.turnIds.includes(turnId))));
        if (linked && linked.id !== target) throw new Error('The Codex run already belongs to another ticket.');
        const ticket = JSON.parse(ticketRow.body);
        if (!linked) {
          if (!ticket.subtasks) throw new Error('Convert this legacy ticket to subtasks before linking additional runs.');
          ticket.subtasks.push({ sessionId, turnId, name: 'Codex run', kind: 'implementation', workSeconds: null });
          store.put(db, 'ticket', target, ticket);
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } else {
    const record = validate(JSON.parse(readFileSync(file === '-' ? 0 : resolve(file), 'utf8').replace(/^\uFEFF/, '')));
    const id = kind === 'ticket' ? record.id : `${record.provider}/${record.id}`;
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT body FROM records WHERE kind = ? AND id = ?').get(kind, id);
      const before = previous ? JSON.parse(previous.body) : {};
      const updated = { ...before, ...record };
      if (kind === 'ticket' && !updated.sessionIds) updated.subtasks ??= [];
      store.put(db, kind, id, updated);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
});
