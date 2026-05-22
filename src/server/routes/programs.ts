import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, sqlite } from "../../db/client";
import { programs, programDays } from "../../db/schema";
import {
  ProgramCreateInput,
  ProgramUpdateInput,
  type Program,
  type ProgramDay,
} from "../../shared/program";
import { idConflict, notFound, validationError } from "../lib/errors";

export const programsRoute = new Hono();

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
type ProgramRow = typeof programs.$inferSelect;
type ProgramDayRow = typeof programDays.$inferSelect;

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------
function rowToDay(row: ProgramDayRow): ProgramDay {
  return {
    id: row.id,
    weekIndex: row.weekIndex,
    dayIndex: row.dayIndex,
    routineId: row.routineId ?? null,
    isRestDay: row.isRestDay === 1,
    notes: row.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// loadProgram helper
// ---------------------------------------------------------------------------
async function loadProgram(id: string): Promise<Program | null> {
  const program = await db
    .select()
    .from(programs)
    .where(eq(programs.id, id))
    .get();
  if (!program) return null;

  const days = await db
    .select()
    .from(programDays)
    .where(eq(programDays.programId, id))
    .all();

  days.sort((a, b) => a.weekIndex - b.weekIndex || a.dayIndex - b.dayIndex);

  return {
    id: program.id,
    name: program.name,
    description: program.description ?? null,
    durationWeeks: program.durationWeeks,
    days: days.map(rowToDay),
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// insertDays helper (inside existing transaction)
// ---------------------------------------------------------------------------
function insertDays(programId: string, days: ProgramCreateInput["days"]): void {
  for (const day of days) {
    db.insert(programDays)
      .values({
        id: day.id,
        programId,
        weekIndex: day.weekIndex,
        dayIndex: day.dayIndex,
        routineId: day.routineId ?? null,
        isRestDay: day.isRestDay ? 1 : 0,
        notes: day.notes ?? null,
      })
      .run();
  }
}

// ---------------------------------------------------------------------------
// GET /programs
// ---------------------------------------------------------------------------
programsRoute.get("/", async (c) => {
  const rows = await db.select().from(programs).all();
  const result: Program[] = [];
  for (const row of rows) {
    const full = await loadProgram(row.id);
    if (full) result.push(full);
  }
  return c.json({ programs: result });
});

// ---------------------------------------------------------------------------
// GET /programs/:id
// ---------------------------------------------------------------------------
programsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const program = await loadProgram(id);
  if (!program) return notFound(c);
  return c.json(program);
});

// ---------------------------------------------------------------------------
// POST /programs
// ---------------------------------------------------------------------------
programsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = ProgramCreateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;
  const now = Date.now();

  const existing = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.id, input.id))
    .get();
  if (existing) return idConflict(c, input.id);

  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;

  const tx = sqlite.transaction(() => {
    db.insert(programs)
      .values({
        id: input.id,
        name: input.name,
        description: input.description ?? null,
        durationWeeks: input.durationWeeks,
        createdAt,
        updatedAt,
      })
      .run();

    insertDays(input.id, input.days);
  });

  tx();

  const program = await loadProgram(input.id);
  return c.json(program!, 201);
});

// ---------------------------------------------------------------------------
// PATCH /programs/:id (full-document replace)
// ---------------------------------------------------------------------------
programsRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ProgramUpdateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;

  const existing = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.id, id))
    .get();
  if (!existing) return notFound(c);

  const now = Date.now();
  const updatedAt = Math.max(input.updatedAt, now);

  const tx = sqlite.transaction(() => {
    // Delete existing program_days (cascade not needed since we're replacing)
    db.delete(programDays).where(eq(programDays.programId, id)).run();

    // Re-insert from payload
    insertDays(id, input.days);

    // Update programs row
    db.update(programs)
      .set({
        name: input.name,
        description: input.description ?? null,
        durationWeeks: input.durationWeeks,
        updatedAt,
      })
      .where(eq(programs.id, id))
      .run();
  });

  tx();

  const program = await loadProgram(id);
  return c.json(program!);
});

// ---------------------------------------------------------------------------
// DELETE /programs/:id
// ---------------------------------------------------------------------------
programsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(programs).where(eq(programs.id, id)).run();
  return c.body(null, 204);
});
