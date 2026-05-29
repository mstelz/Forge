import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, asc, gte, lt, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { sessions, sessionSetLogs } from "../../db/schema";
import {
  SessionCreateInput,
  SessionUpdateInput,
  SessionFinishInput,
  type Session,
} from "../../shared/session";
import {
  SessionSetLogCreateInput,
  SessionSetLogUpdateInput,
  type SessionSetLog,
} from "../../shared/session-log";
import { idConflict, notFound, validationError, apiError } from "../lib/errors";

export const sessionsRoute = new Hono();

// ---------------------------------------------------------------------------
// Types inferred from schema rows
// ---------------------------------------------------------------------------
type SessionRow = typeof sessions.$inferSelect;
type SessionSetLogRow = typeof sessionSetLogs.$inferSelect;

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------
function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    status: row.status as Session["status"],
    sourceType: row.sourceType as Session["sourceType"],
    sourceRoutineId: row.sourceRoutineId ?? null,
    sourceProgramId: row.sourceProgramId ?? null,
    sourceProgramWeekIndex: row.sourceProgramWeekIndex ?? null,
    sourceProgramDayIndex: row.sourceProgramDayIndex ?? null,
    templateSnapshot: row.templateSnapshot ?? null,
    liveStructure: row.liveStructure,
    restTimer: row.restTimer ?? null,
    title: row.title ?? null,
    notes: row.notes ?? null,
    startedAt: row.startedAt instanceof Date ? row.startedAt.getTime() : row.startedAt,
    endedAt: row.endedAt instanceof Date ? row.endedAt.getTime() : (row.endedAt ?? null),
    pausedAt: row.pausedAt instanceof Date ? row.pausedAt.getTime() : (row.pausedAt ?? null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? null,
  };
}

function rowToLog(row: SessionSetLogRow): SessionSetLog {
  return {
    id: row.id,
    sessionId: row.sessionId,
    performedExerciseId: row.performedExerciseId,
    exerciseId: row.exerciseId,
    sessionItemId: row.sessionItemId,
    plannedSetId: row.plannedSetId ?? null,
    order: row.order,
    reps: row.reps ?? null,
    weightKg: row.weightKg ?? null,
    rpe: row.rpe ?? null,
    durationSec: row.durationSec ?? null,
    distanceM: row.distanceM ?? null,
    notes: row.notes ?? null,
    setType: row.setType as SessionSetLog["setType"],
    status: row.status as SessionSetLog["status"],
    loggedAt: row.loggedAt instanceof Date ? row.loggedAt.getTime() : row.loggedAt,
    restAfterSec: row.restAfterSec ?? null,
    enteredWeight: row.enteredWeight ?? null,
    enteredWeightUnit: (row.enteredWeightUnit ?? null) as SessionSetLog["enteredWeightUnit"],
    enteredDistance: row.enteredDistance ?? null,
    enteredDistanceUnit: (row.enteredDistanceUnit ?? null) as SessionSetLog["enteredDistanceUnit"],
  };
}

// ---------------------------------------------------------------------------
// Routes: Sessions
// ---------------------------------------------------------------------------

// GET /sessions
sessionsRoute.get("/", async (c) => {
  const since = Number(c.req.query("since") ?? 0);
  // Default: exclude archived sessions (historical data stays on server).
  // With since: include archived so clients can receive the archivedAt signal.
  const rows = since > 0
    ? await db.select().from(sessions).where(gte(sessions.updatedAt, since)).orderBy(desc(sessions.startedAt)).all()
    : await db.select().from(sessions).where(isNull(sessions.archivedAt)).orderBy(desc(sessions.startedAt)).all();
  return c.json({ sessions: rows.map(rowToSession) });
});

// GET /sessions/logs  — bulk fetch all logs for reconciliation
sessionsRoute.get("/logs", async (c) => {
  const since = Number(c.req.query("since") ?? 0);
  const logs = since > 0
    ? await db.select().from(sessionSetLogs).where(gte(sessionSetLogs.loggedAt, new Date(since))).orderBy(asc(sessionSetLogs.loggedAt)).all()
    : await db.select().from(sessionSetLogs).orderBy(asc(sessionSetLogs.loggedAt)).all();
  return c.json({ logs: logs.map(rowToLog) });
});

// GET /sessions/:id
sessionsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();
  if (!row) return notFound(c);
  return c.json(rowToSession(row));
});

// POST /sessions
sessionsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = SessionCreateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;

  // Check id_conflict
  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, input.id))
    .get();
  if (existing) return idConflict(c, input.id);

  // Check for existing in_progress session
  const inProgress = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.status, "in_progress"))
    .get();
  if (inProgress) {
    return apiError(c, 409, { error: "in_progress_exists", id: inProgress.id });
  }

  const now = Date.now();

  db.insert(sessions)
    .values({
      id: input.id,
      status: "in_progress",
      sourceType: input.sourceType,
      sourceRoutineId: input.sourceRoutineId ?? null,
      sourceProgramId: input.sourceProgramId ?? null,
      sourceProgramWeekIndex: input.sourceProgramWeekIndex ?? null,
      sourceProgramDayIndex: input.sourceProgramDayIndex ?? null,
      templateSnapshot: input.templateSnapshot ?? null,
      liveStructure: input.liveStructure,
      restTimer: null,
      title: input.title ?? null,
      notes: input.notes ?? null,
      startedAt: new Date(input.startedAt),
      endedAt: null,
      pausedAt: null,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    })
    .run();

  const row = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, input.id))
    .get();
  return c.json(rowToSession(row!), 201);
});

// PATCH /sessions/:id/times — edit startedAt/endedAt on any session (including finished)
sessionsRoute.patch("/:id/times", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const parsed = z.object({
    startedAt: z.number().int(),
    endedAt: z.number().int().nullable(),
  }).safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const existing = await db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!existing) return notFound(c);

  db.update(sessions)
    .set({
      startedAt: new Date(parsed.data.startedAt),
      endedAt: parsed.data.endedAt != null ? new Date(parsed.data.endedAt) : null,
      updatedAt: Date.now(),
    })
    .where(eq(sessions.id, id))
    .run();

  const row = await db.select().from(sessions).where(eq(sessions.id, id)).get();
  return c.json(rowToSession(row!));
});

// PATCH /sessions/:id
sessionsRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = SessionUpdateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;

  const existing = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();
  if (!existing) return notFound(c);

  if (existing.status === "finished") {
    return apiError(c, 409, { error: "finished" });
  }

  const now = Date.now();
  const updatedAt = Math.max(input.updatedAt, now);

  db.update(sessions)
    .set({
      status: input.status,
      sourceType: input.sourceType,
      sourceRoutineId: input.sourceRoutineId ?? null,
      sourceProgramId: input.sourceProgramId ?? null,
      sourceProgramWeekIndex: input.sourceProgramWeekIndex ?? null,
      sourceProgramDayIndex: input.sourceProgramDayIndex ?? null,
      templateSnapshot: input.templateSnapshot ?? null,
      liveStructure: input.liveStructure,
      restTimer: input.restTimer ?? null,
      title: input.title ?? null,
      notes: input.notes ?? null,
      startedAt: new Date(input.startedAt),
      endedAt: input.endedAt != null ? new Date(input.endedAt) : null,
      pausedAt: input.pausedAt != null ? new Date(input.pausedAt) : null,
      updatedAt,
    })
    .where(eq(sessions.id, id))
    .run();

  const row = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();
  return c.json(rowToSession(row!));
});

// POST /sessions/:id/finish
sessionsRoute.post("/:id/finish", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = SessionFinishInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;

  const existing = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();
  if (!existing) return notFound(c);

  if (existing.status === "finished") {
    return apiError(c, 409, { error: "finished" });
  }

  const now = Date.now();

  db.update(sessions)
    .set({
      status: "finished",
      endedAt: new Date(input.endedAt),
      restTimer: null,
      updatedAt: now,
    })
    .where(eq(sessions.id, id))
    .run();

  const row = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();
  return c.json(rowToSession(row!));
});

// DELETE /sessions/:id
sessionsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  // Cascade handles logs
  await db.delete(sessions).where(eq(sessions.id, id)).run();
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// Routes: Session Set Logs
// ---------------------------------------------------------------------------

// GET /sessions/:id/logs
sessionsRoute.get("/:id/logs", async (c) => {
  const sessionId = c.req.param("id");

  const session = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!session) return notFound(c);

  const logs = await db
    .select()
    .from(sessionSetLogs)
    .where(eq(sessionSetLogs.sessionId, sessionId))
    .orderBy(asc(sessionSetLogs.loggedAt))
    .all();

  return c.json({ logs: logs.map(rowToLog) });
});

// POST /sessions/:id/logs
sessionsRoute.post("/:id/logs", async (c) => {
  const sessionId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = SessionSetLogCreateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;

  // Check parent session exists
  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!session) return notFound(c);

  // Check parent session is not finished
  if (session.status === "finished") {
    return apiError(c, 409, { error: "finished" });
  }

  // Check id_conflict
  const existing = await db
    .select({ id: sessionSetLogs.id })
    .from(sessionSetLogs)
    .where(eq(sessionSetLogs.id, input.id))
    .get();
  if (existing) return idConflict(c, input.id);

  db.insert(sessionSetLogs)
    .values({
      id: input.id,
      sessionId,
      performedExerciseId: input.performedExerciseId,
      exerciseId: input.exerciseId,
      sessionItemId: input.sessionItemId,
      plannedSetId: input.plannedSetId ?? null,
      order: input.order,
      reps: input.reps ?? null,
      weightKg: input.weightKg ?? null,
      rpe: input.rpe ?? null,
      durationSec: input.durationSec ?? null,
      distanceM: input.distanceM ?? null,
      notes: input.notes ?? null,
      setType: input.setType,
      status: input.status,
      loggedAt: new Date(input.loggedAt),
      restAfterSec: input.restAfterSec ?? null,
      enteredWeight: input.enteredWeight ?? null,
      enteredWeightUnit: input.enteredWeightUnit ?? null,
      enteredDistance: input.enteredDistance ?? null,
      enteredDistanceUnit: input.enteredDistanceUnit ?? null,
    })
    .run();

  const row = await db
    .select()
    .from(sessionSetLogs)
    .where(eq(sessionSetLogs.id, input.id))
    .get();
  return c.json(rowToLog(row!), 201);
});

// PATCH /sessions/:id/logs/:logId
sessionsRoute.patch("/:id/logs/:logId", async (c) => {
  const sessionId = c.req.param("id");
  const logId = c.req.param("logId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = SessionSetLogUpdateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;

  // Check parent session exists and status
  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!session) return notFound(c);

  if (session.status === "finished") {
    return apiError(c, 409, { error: "finished" });
  }

  // Check log exists and belongs to this session
  const existingLog = await db
    .select()
    .from(sessionSetLogs)
    .where(and(eq(sessionSetLogs.id, logId), eq(sessionSetLogs.sessionId, sessionId)))
    .get();
  if (!existingLog) return notFound(c);

  db.update(sessionSetLogs)
    .set({
      performedExerciseId: input.performedExerciseId,
      exerciseId: input.exerciseId,
      sessionItemId: input.sessionItemId,
      plannedSetId: input.plannedSetId ?? null,
      order: input.order,
      reps: input.reps ?? null,
      weightKg: input.weightKg ?? null,
      rpe: input.rpe ?? null,
      durationSec: input.durationSec ?? null,
      distanceM: input.distanceM ?? null,
      notes: input.notes ?? null,
      setType: input.setType,
      status: input.status,
      loggedAt: new Date(input.loggedAt),
      restAfterSec: input.restAfterSec ?? null,
      enteredWeight: input.enteredWeight ?? null,
      enteredWeightUnit: input.enteredWeightUnit ?? null,
      enteredDistance: input.enteredDistance ?? null,
      enteredDistanceUnit: input.enteredDistanceUnit ?? null,
    })
    .where(eq(sessionSetLogs.id, logId))
    .run();

  const row = await db
    .select()
    .from(sessionSetLogs)
    .where(eq(sessionSetLogs.id, logId))
    .get();
  return c.json(rowToLog(row!));
});

// DELETE /sessions/:id/logs/:logId
sessionsRoute.delete("/:id/logs/:logId", async (c) => {
  const sessionId = c.req.param("id");
  const logId = c.req.param("logId");

  // Check parent session exists and status
  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!session) return notFound(c);

  if (session.status === "finished") {
    return apiError(c, 409, { error: "finished" });
  }

  await db
    .delete(sessionSetLogs)
    .where(and(eq(sessionSetLogs.id, logId), eq(sessionSetLogs.sessionId, sessionId)))
    .run();

  return c.body(null, 204);
});

// POST /sessions/archive — soft-archive finished sessions older than N months.
// Returns count of newly archived sessions.
sessionsRoute.post("/archive", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const months = Number(body.olderThanMonths ?? 12);
  const cutoff = Date.now() - months * 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const toArchive = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(
      eq(sessions.status, "finished"),
      lt(sessions.updatedAt, cutoff),
      isNull(sessions.archivedAt),
    ))
    .all();
  for (const row of toArchive) {
    await db.update(sessions).set({ archivedAt: now }).where(eq(sessions.id, row.id)).run();
  }
  return c.json({ archived: toArchive.length });
});
