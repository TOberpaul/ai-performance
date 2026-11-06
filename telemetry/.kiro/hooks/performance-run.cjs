const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { withStore, put } = require('../../.codex/hooks/performance-store.cjs');

const input = readFileSync(0, 'utf8').trim();
const event = input ? JSON.parse(input) : {};
const project = join(__dirname, '..', '..');
const sessionId = typeof event.session_id === 'string' ? event.session_id : null;
const turnId = typeof event.turn_id === 'string' ? event.turn_id : null;
const id = sessionId && turnId ? `${sessionId}:${turnId}` : randomUUID();
const key = 'kiro/' + id;
withStore(project, db => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const previous = db.prepare("SELECT body FROM records WHERE kind = 'run' AND id = ?").get(key);
    if (!previous) put(db, 'run', key, {
      id, provider: 'kiro', name: 'Kiro run', kind: 'implementation', sessionId, turnId,
      model: typeof event.model === 'string' ? event.model : null,
      ticketId: process.env.AI_PERFORMANCE_TICKET_ID || null,
      endedAt: new Date().toISOString(), workSeconds: null, metrics: [],
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
});
