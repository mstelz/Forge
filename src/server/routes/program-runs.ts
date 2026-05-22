import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../../db/client";
import { programs, programRuns, programRunDayStates } from "../../db/schema";
import {
  ProgramRunCreateInput,
  ProgramRunUpdateInput,
  type ProgramRun,
  type ProgramRunDayState,
} from "../../shared/program-run";
import { idConflict, notFound, validationError, apiError } from "../lib/errors";

export const programRunsRoute = new Hono();

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
type ProgramRunDayStateRow = typeof programRunDayStates.$inferSelect;

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------
function rowToDayState(row: ProgramRunDayStateRow): ProgramRunDayState {
  return {
    id: row.id,
    weekIndex: row.weekIndex,
    dayIndex: row.dayIndex,
    status: row.status as ProgramRunDayState["status"],
    sessionId: row.sessionId ?? null,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// loadProgramRun helper
// ---------------------------------------------------------------------------
async function loadProgramRun(id: string): Promise<ProgramRun | null> {
  const run = await db
    .select()
    .from(programRuns)
    .where(eq(programRuns.id, id))
    .get();
  if (!run) return null;

  const dayStates = await db
    .select()
    .from(programRunDayStates)
    .where(eq(programRunDayStates.programRunId, id))
    .all();

  dayStates.sort((a, b) => a.weekIndex - b.weekIndex || a.dayIndex - b.dayIndex);

  return {
    id: run.id,
    programId: run.programId,
    status: run.status as ProgramRun["status"],
    startedAt: run.startedAt,
    endedAt: run.endedAt ?? null,
    currentWeekIndex: run.currentWeekIndex,
    currentDayIndex: run.currentDayIndex,
    dayStates: dayStates.map(rowToDayState),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// insertDayStates helper
// ---------------------------------------------------------------------------
function insertDayStates(
  programRunId: string,
  dayStates: ProgramRunDayState[],
): void {
  for (const ds of dayStates) {
    db.insert(programRunDayStates)
      .values({
        id: ds.id,
        programRunId,
        weekIndex: ds.weekIndex,
        dayIndex: ds.dayIndex,
        status: ds.status,
        sessionId: ds.sessionId ?? null,
        updatedAt: ds.updatedAt,
      })
      .run();
  }
}

// ---------------------------------------------------------------------------
// GET /program-runs
// ---------------------------------------------------------------------------
programRunsRoute.get("/", async (c) => {
  const rows = await db.select().from(programRuns).all();
  const result: ProgramRun[] = [];
  for (const row of rows) {
    const full = await loadProgramRun(row.id);
    if (full) result.push(full);
  }
  return c.json({ runs: result });
});

// ---------------------------------------------------------------------------
// GET /program-runs/:id
// ---------------------------------------------------------------------------
programRunsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const run = await loadProgramRun(id);
  if (!run) return notFound(c);
  return c.json(run);
});

// ---------------------------------------------------------------------------
// POST /program-runs
// ---------------------------------------------------------------------------
programRunsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = ProgramRunCreateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;
  const now = Date.now();

  // id collision check
  const existing = await db
    .select({ id: programRuns.id })
    .from(programRuns)
    .where(eq(programRuns.id, input.id))
    .get();
  if (existing) return idConflict(c, input.id);

  // Check: no globally active run
  const globalActive = await db
    .select({ id: programRuns.id })
    .from(programRuns)
    .where(eq(programRuns.status, "active"))
    .get();
  if (globalActive) {
    return apiError(c, 409, { error: "active_run_exists", id: globalActive.id });
  }

  const tx = sqlite.transaction(() => {
    db.insert(programRuns)
      .values({
        id: input.id,
        programId: input.programId,
        status: "active",
        startedAt: input.startedAt,
        endedAt: null,
        currentWeekIndex: 0,
        currentDayIndex: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  tx();

  const run = await loadProgramRun(input.id);
  return c.json(run!, 201);
});

// ---------------------------------------------------------------------------
// PATCH /program-runs/:id (full-document replace)
// ---------------------------------------------------------------------------
programRunsRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ProgramRunUpdateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;

  const existing = await db
    .select({ id: programRuns.id })
    .from(programRuns)
    .where(eq(programRuns.id, id))
    .get();
  if (!existing) return notFound(c);

  // Validate dayState weekIndex bounds against program's durationWeeks
  const program = await db
    .select({ durationWeeks: programs.durationWeeks })
    .from(programs)
    .where(eq(programs.id, input.programId))
    .get();

  if (program) {
    for (const ds of input.dayStates) {
      if (ds.weekIndex >= program.durationWeeks) {
        return c.json(
          {
            error: "validation",
            issues: [
              {
                code: "custom",
                path: ["dayStates"],
                message: `dayStates weekIndex ${ds.weekIndex} exceeds program durationWeeks ${program.durationWeeks}`,
              },
            ],
          },
          400,
        );
      }
    }
  }

  const now = Date.now();
  const updatedAt = Math.max(input.updatedAt, now);

  const tx = sqlite.transaction(() => {
    // Delete existing day states
    db.delete(programRunDayStates)
      .where(eq(programRunDayStates.programRunId, id))
      .run();

    // Re-insert from payload
    insertDayStates(id, input.dayStates);

    // Update program_runs row
    db.update(programRuns)
      .set({
        programId: input.programId,
        status: input.status,
        startedAt: input.startedAt,
        endedAt: input.endedAt ?? null,
        currentWeekIndex: input.currentWeekIndex,
        currentDayIndex: input.currentDayIndex,
        updatedAt,
      })
      .where(eq(programRuns.id, id))
      .run();
  });

  tx();

  const run = await loadProgramRun(id);
  return c.json(run!);
});

// ---------------------------------------------------------------------------
// DELETE /program-runs/:id
// ---------------------------------------------------------------------------
programRunsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(programRuns).where(eq(programRuns.id, id)).run();
  return c.body(null, 204);
});
