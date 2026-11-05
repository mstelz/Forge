// Run with `bun run scripts/check-calendar-sync.ts`. Uses an isolated in-memory database.
import assert from "node:assert/strict";

process.env.FORGE_DB_PATH = ":memory:";
const { sqlite } = await import("../src/db/client");
const { syncRoute } = await import("../src/server/routes/sync");

sqlite.exec(`
  CREATE TABLE program_runs (
    id TEXT PRIMARY KEY, program_id TEXT, status TEXT, started_at INTEGER, ended_at INTEGER,
    current_week_index INTEGER, current_day_index INTEGER, week_zero_start_date INTEGER,
    created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE program_run_day_states (
    id TEXT PRIMARY KEY, program_run_id TEXT, week_index INTEGER, day_index INTEGER,
    status TEXT, session_id TEXT, completed_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, status TEXT, source_type TEXT, source_routine_id TEXT,
    source_program_id TEXT, source_program_week_index INTEGER, source_program_day_index INTEGER,
    template_snapshot TEXT, live_structure TEXT, rest_timer TEXT, title TEXT, notes TEXT,
    started_at INTEGER, ended_at INTEGER, paused_at INTEGER, created_at INTEGER,
    updated_at INTEGER, archived_at INTEGER
  );
`);

const completedAt = new Date("2026-11-02T21:07:18-06:00").getTime();
const runId = crypto.randomUUID();
const workout = { id: crypto.randomUUID(), weekIndex: 1, dayIndex: 4, status: "completed", sessionId: null, completedAt, updatedAt: completedAt };
const rest = { ...workout, id: crypto.randomUUID(), dayIndex: 5, completedAt: completedAt + 86400000 };
const payload = {
  id: runId, programId: "program", status: "active", startedAt: completedAt - 86400000,
  currentWeekIndex: 2, currentDayIndex: 0, createdAt: completedAt, updatedAt: completedAt,
  dayStates: [workout, rest],
};
async function sync(op: "create" | "update") {
  const response = await syncRoute.request("/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [{ id: crypto.randomUUID(), entity: "program_run", op, payload, createdAt: completedAt }] }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { results: { status: string }[] };
  assert.equal(body.results[0]?.status, "ok", JSON.stringify(body));
}
function stored(id: string): number | null {
  return (sqlite.query("SELECT completed_at FROM program_run_day_states WHERE id=?").get(id) as { completed_at: number | null }).completed_at;
}

try {
  await sync("create");
  assert.equal(stored(workout.id), completedAt, "batch create dropped workout completion date");
  assert.equal(stored(rest.id), rest.completedAt, "batch create dropped rest-day completion date");
  await sync("update");
  assert.equal(stored(workout.id), completedAt, "batch update dropped workout completion date");
  assert.equal(stored(rest.id), rest.completedAt, "batch update dropped rest-day completion date");

  sqlite.query(`INSERT INTO sessions (id,status,source_type,source_program_id,source_program_week_index,
    source_program_day_index,started_at,ended_at) VALUES ('session','finished','program_day','program',1,4,?,?)`)
    .run(completedAt - 3600000, completedAt);
  Object.assign(workout, { sessionId: "session", completedAt: undefined });
  await sync("update");
  assert.equal(stored(workout.id), completedAt, "batch update failed to recover a missing workout completion date");
  console.log("Calendar sync passed: create and update preserve workout/rest dates; missing workout dates recover from session history.");
} finally {
  sqlite.close();
}
