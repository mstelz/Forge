// Integration check against an isolated SQLite database: bun scripts/test-set-segments.ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const dir = await mkdtemp(join(tmpdir(), 'forge-segments-'));
process.env.FORGE_DB_PATH = join(dir, 'test.db');
const { db, sqlite } = await import('../src/db/client');
try {
  migrate(db, { migrationsFolder: './src/db/migrations' });
  const { sessions } = await import('../src/db/schema');
  const { sessionsRoute } = await import('../src/server/routes/sessions');
  const { syncRoute } = await import('../src/server/routes/sync');
  const { rowToSessionSetLog } = await import('../src/server/routes/export-mappers');
  const sessionId = crypto.randomUUID();
  db.insert(sessions).values({ id: sessionId, status: 'in_progress', sourceType: 'freeform', liveStructure: '{"blocks":[]}', startedAt: 1, createdAt: 1, updatedAt: 1 }).run();
  const log = {
    id: crypto.randomUUID(), sessionId, performedExerciseId: crypto.randomUUID(), exerciseId: 'bench',
    sessionItemId: crypto.randomUUID(), plannedSetId: null, order: 0, reps: 8, weightKg: 60, rpe: null,
    durationSec: null, distanceM: null, notes: null, setType: 'rest_pause', status: 'logged', loggedAt: 2,
    restAfterSec: null, enteredWeight: 60, enteredWeightUnit: 'kg', enteredDistance: null, enteredDistanceUnit: null,
    segments: [{ weightKg: 40, reps: 5, pauseSec: 20 }],
  };
  const create = await sessionsRoute.request(`/${sessionId}/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(log) });
  assert.equal(create.status, 201, await create.clone().text());
  const load = async () => {
    const response = await sessionsRoute.request(`/${sessionId}/logs`);
    const body = await response.json() as any;
    return Array.isArray(body) ? body[0] : body.logs[0];
  };
  assert.deepEqual((await load()).segments, log.segments);
  const { sessionSetLogs } = await import('../src/db/schema');
  assert.deepEqual(rowToSessionSetLog(db.select().from(sessionSetLogs).get()!).segments, log.segments);
  for (const segments of [[{ weightKg: 35, reps: 6, pauseSec: 0 }], null]) {
    const response = await syncRoute.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [{ id: crypto.randomUUID(), entity: 'session_log', op: 'update', payload: { ...log, setType: segments ? 'drop' : 'normal', segments }, createdAt: 3 }] }) });
    assert.equal(response.status, 200);
    assert.deepEqual((await load()).segments, segments);
    assert.equal((await load()).setType, segments ? 'drop' : 'normal');
  }
  console.log('PASS: migration, API create/read, export mapper, sync update and segment removal');
} finally {
  sqlite.close();
  await rm(dir, { recursive: true, force: true });
}
