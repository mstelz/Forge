import { Hono } from "hono";
import { eq, and, desc, lt, lte, gte, like, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { sessions, sessionSetLogs } from "../../db/schema";
import {
  HistoryFilterSchema,
  type SessionSummary,
  type HistorySummary,
  type HistorySessionsResponse,
} from "../../shared/history";
import { validationError } from "../lib/errors";

export const historyRoute = new Hono();

// ---------------------------------------------------------------------------
// Helper: resolve date range bounds from filter
// ---------------------------------------------------------------------------
function resolveDateBounds(
  range: string,
  from?: number,
  to?: number,
): { fromMs: number | null; toMs: number | null } {
  const now = Date.now();
  if (range === "custom") {
    return { fromMs: from ?? null, toMs: to ?? null };
  }
  if (range === "week") {
    return { fromMs: now - 7 * 24 * 60 * 60 * 1000, toMs: null };
  }
  if (range === "month") {
    return { fromMs: now - 30 * 24 * 60 * 60 * 1000, toMs: null };
  }
  if (range === "year") {
    return { fromMs: now - 365 * 24 * 60 * 60 * 1000, toMs: null };
  }
  // 'all'
  return { fromMs: null, toMs: null };
}

// ---------------------------------------------------------------------------
// Helper: decode cursor
// ---------------------------------------------------------------------------
type Cursor = { endedAt: number; id: string };

function decodeCursor(cursor: string): Cursor | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "endedAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as Cursor).endedAt === "number" &&
      typeof (parsed as Cursor).id === "string"
    ) {
      return parsed as Cursor;
    }
    return null;
  } catch {
    return null;
  }
}

function encodeCursor(endedAt: number, id: string): string {
  return Buffer.from(JSON.stringify({ endedAt, id })).toString("base64");
}

// ---------------------------------------------------------------------------
// Helper: build WHERE conditions for finished sessions
// ---------------------------------------------------------------------------
function buildSessionConditions(
  filter: {
    range: string;
    from?: number;
    to?: number;
    routine?: string;
    q?: string;
  },
  cursorVal?: Cursor,
) {
  const { fromMs, toMs } = resolveDateBounds(filter.range, filter.from, filter.to);

  const conditions = [eq(sessions.status, "finished")];

  if (fromMs !== null) {
    conditions.push(gte(sessions.endedAt, new Date(fromMs)));
  }
  if (toMs !== null) {
    conditions.push(lte(sessions.endedAt, new Date(toMs)));
  }
  if (filter.routine) {
    conditions.push(eq(sessions.sourceRoutineId, filter.routine));
  }
  if (filter.q) {
    const pattern = `%${filter.q}%`;
    conditions.push(
      sql`(${sessions.title} LIKE ${pattern} OR ${sessions.notes} LIKE ${pattern})`,
    );
  }
  if (cursorVal) {
    // Paginate: endedAt < cursor.endedAt OR (endedAt = cursor.endedAt AND id < cursor.id)
    conditions.push(
      sql`(${sessions.endedAt} < ${cursorVal.endedAt} OR (${sessions.endedAt} = ${cursorVal.endedAt} AND ${sessions.id} < ${cursorVal.id}))`,
    );
  }

  return conditions;
}

// ---------------------------------------------------------------------------
// Helper: load per-session aggregates from sessionSetLogs
// ---------------------------------------------------------------------------
type SessionAggregates = {
  exerciseCount: number;
  setCount: number;
  volumeKg: number;
};

async function loadAggregates(
  sessionIds: string[],
): Promise<Map<string, SessionAggregates>> {
  if (sessionIds.length === 0) return new Map();

  // Fetch all logged logs for these sessions in one query
  const logs = await db
    .select({
      sessionId: sessionSetLogs.sessionId,
      exerciseId: sessionSetLogs.exerciseId,
      setType: sessionSetLogs.setType,
      status: sessionSetLogs.status,
      reps: sessionSetLogs.reps,
      weightKg: sessionSetLogs.weightKg,
    })
    .from(sessionSetLogs)
    .where(
      and(
        eq(sessionSetLogs.status, "logged"),
        sql`${sessionSetLogs.sessionId} IN (${sql.join(
          sessionIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    )
    .all();

  const volumeSetTypes = new Set(["normal", "drop", "amrap", "failure"]);
  const result = new Map<string, SessionAggregates>();

  for (const log of logs) {
    const agg = result.get(log.sessionId) ?? {
      exerciseCount: 0,
      setCount: 0,
      volumeKg: 0,
    };

    agg.setCount += 1;

    // Track distinct exercise IDs via a Set stored on the map (we'll compute after)
    if (!result.has(log.sessionId)) {
      result.set(log.sessionId, agg);
    }

    if (
      volumeSetTypes.has(log.setType) &&
      log.reps != null &&
      log.reps > 0 &&
      log.weightKg != null &&
      log.weightKg > 0
    ) {
      agg.volumeKg += log.weightKg * log.reps;
    }

    result.set(log.sessionId, agg);
  }

  // Count distinct exerciseIds per session separately
  const exercisesBySession = new Map<string, Set<string>>();
  for (const log of logs) {
    const set = exercisesBySession.get(log.sessionId) ?? new Set<string>();
    set.add(log.exerciseId);
    exercisesBySession.set(log.sessionId, set);
  }
  for (const [sessionId, exerciseSet] of exercisesBySession) {
    const agg = result.get(sessionId);
    if (agg) {
      agg.exerciseCount = exerciseSet.size;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper: filter session IDs by exercise (has ≥1 logged log with exerciseId)
// ---------------------------------------------------------------------------
async function filterByExercise(
  sessionIds: string[],
  exerciseId: string,
): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();

  const rows = await db
    .selectDistinct({ sessionId: sessionSetLogs.sessionId })
    .from(sessionSetLogs)
    .where(
      and(
        eq(sessionSetLogs.exerciseId, exerciseId),
        eq(sessionSetLogs.status, "logged"),
        sql`${sessionSetLogs.sessionId} IN (${sql.join(
          sessionIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    )
    .all();

  return new Set(rows.map((r) => r.sessionId));
}

// ---------------------------------------------------------------------------
// GET /history/sessions
// ---------------------------------------------------------------------------
historyRoute.get("/sessions", async (c) => {
  // Parse query params — HistoryFilterSchema has number fields but query params are strings
  const raw = c.req.query();
  const coerced = {
    range: raw.range,
    from: raw.from !== undefined ? Number(raw.from) : undefined,
    to: raw.to !== undefined ? Number(raw.to) : undefined,
    routine: raw.routine,
    program: raw.program,
    exercise: raw.exercise,
    q: raw.q,
    cursor: raw.cursor,
    limit: raw.limit !== undefined ? Number(raw.limit) : undefined,
  };

  const parsed = HistoryFilterSchema.safeParse(coerced);
  if (!parsed.success) return validationError(c, parsed.error);

  const filter = parsed.data;
  const cursorVal = filter.cursor ? decodeCursor(filter.cursor) : undefined;

  // Fetch limit+1 to determine if there's a next page
  const fetchLimit = filter.limit + 1;

  const conditions = buildSessionConditions(filter, cursorVal ?? undefined);

  const rows = await db
    .select()
    .from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.endedAt), desc(sessions.id))
    .limit(fetchLimit)
    .all();

  const hasMore = rows.length > filter.limit;
  const page = hasMore ? rows.slice(0, filter.limit) : rows;

  // Apply exercise filter if specified (post-filter since it requires a join)
  let filteredPage = page;
  if (filter.exercise) {
    const sessionIds = page.map((r) => r.id);
    const matchingIds = await filterByExercise(sessionIds, filter.exercise);
    filteredPage = page.filter((r) => matchingIds.has(r.id));
  }

  // Load aggregates for filtered sessions
  const aggregatesMap = await loadAggregates(filteredPage.map((r) => r.id));

  const sessionSummaries: SessionSummary[] = filteredPage.map((row) => {
    const agg = aggregatesMap.get(row.id) ?? {
      exerciseCount: 0,
      setCount: 0,
      volumeKg: 0,
    };

    const startedAtMs =
      row.startedAt instanceof Date ? row.startedAt.getTime() : row.startedAt;
    const endedAtMs =
      row.endedAt instanceof Date ? row.endedAt.getTime() : (row.endedAt ?? startedAtMs);

    return {
      id: row.id,
      title: row.title ?? null,
      sourceType: row.sourceType as SessionSummary["sourceType"],
      sourceRoutineId: row.sourceRoutineId ?? null,
      sourceRoutineName: null, // v1: not joined
      sourceProgramId: row.sourceProgramId ?? null,
      sourceProgramName: null, // v1: not joined
      sourceProgramWeekIndex: row.sourceProgramWeekIndex ?? null,
      sourceProgramDayIndex: row.sourceProgramDayIndex ?? null,
      startedAt: startedAtMs,
      endedAt: endedAtMs,
      exerciseCount: agg.exerciseCount,
      setCount: agg.setCount,
      volumeKg: Math.round(agg.volumeKg * 100) / 100,
      durationMs: endedAtMs - startedAtMs,
      hasPr: false,
    };
  });

  // Compute next cursor from the last item in the unfiltered page
  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const last = page[page.length - 1]!;
    const lastEndedAt =
      last.endedAt instanceof Date ? last.endedAt.getTime() : (last.endedAt ?? 0);
    nextCursor = encodeCursor(lastEndedAt, last.id);
  }

  const response: HistorySessionsResponse = {
    sessions: sessionSummaries,
    nextCursor,
  };

  return c.json(response);
});

// ---------------------------------------------------------------------------
// GET /history/summary
// ---------------------------------------------------------------------------
historyRoute.get("/summary", async (c) => {
  const raw = c.req.query();
  const coerced = {
    range: raw.range,
    from: raw.from !== undefined ? Number(raw.from) : undefined,
    to: raw.to !== undefined ? Number(raw.to) : undefined,
    routine: raw.routine,
    program: raw.program,
    exercise: raw.exercise,
    q: raw.q,
    cursor: raw.cursor,
    limit: raw.limit !== undefined ? Number(raw.limit) : undefined,
  };

  const parsed = HistoryFilterSchema.safeParse(coerced);
  if (!parsed.success) return validationError(c, parsed.error);

  const filter = parsed.data;
  const conditions = buildSessionConditions(filter);

  // Fetch all matching finished sessions (no pagination for summary)
  const rows = await db
    .select()
    .from(sessions)
    .where(and(...conditions))
    .all();

  // Apply exercise filter if needed
  let filteredRows = rows;
  if (filter.exercise) {
    const sessionIds = rows.map((r) => r.id);
    const matchingIds = await filterByExercise(sessionIds, filter.exercise);
    filteredRows = rows.filter((r) => matchingIds.has(r.id));
  }

  if (filteredRows.length === 0) {
    const summary: HistorySummary = {
      totalSessions: 0,
      totalVolumeKg: 0,
      totalSets: 0,
      totalExercises: 0,
      totalDurationMs: 0,
    };
    return c.json(summary);
  }

  const aggregatesMap = await loadAggregates(filteredRows.map((r) => r.id));

  let totalVolumeKg = 0;
  let totalSets = 0;
  let totalExercises = 0;
  let totalDurationMs = 0;

  for (const row of filteredRows) {
    const agg = aggregatesMap.get(row.id) ?? {
      exerciseCount: 0,
      setCount: 0,
      volumeKg: 0,
    };
    const startedAtMs =
      row.startedAt instanceof Date ? row.startedAt.getTime() : row.startedAt;
    const endedAtMs =
      row.endedAt instanceof Date ? row.endedAt.getTime() : (row.endedAt ?? startedAtMs);

    totalVolumeKg += agg.volumeKg;
    totalSets += agg.setCount;
    totalExercises += agg.exerciseCount;
    totalDurationMs += endedAtMs - startedAtMs;
  }

  const summary: HistorySummary = {
    totalSessions: filteredRows.length,
    totalVolumeKg: Math.round(totalVolumeKg * 100) / 100,
    totalSets,
    totalExercises,
    totalDurationMs,
  };

  return c.json(summary);
});
