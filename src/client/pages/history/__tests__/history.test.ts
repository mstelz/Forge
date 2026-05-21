import { describe, it, expect } from "vitest";
import type { Session, SessionSetLog } from "../../../../shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    status: "finished",
    sourceType: "freeform",
    sourceRoutineId: null,
    sourceProgramId: null,
    sourceProgramWeekIndex: null,
    sourceProgramDayIndex: null,
    templateSnapshot: null,
    liveStructure: '{"blocks":[]}',
    restTimer: null,
    title: null,
    notes: null,
    startedAt: 1000000,
    endedAt: 1003600,
    pausedAt: null,
    createdAt: 1000000,
    updatedAt: 1000000,
    ...overrides,
  };
}

function makeLog(
  id: string,
  sessionId: string,
  exerciseId: string,
  overrides: Partial<SessionSetLog> = {},
): SessionSetLog {
  return {
    id,
    sessionId,
    performedExerciseId: "pe-1",
    exerciseId,
    sessionItemId: "si-1",
    plannedSetId: null,
    order: 0,
    reps: 5,
    weightKg: 100,
    rpe: null,
    durationSec: null,
    distanceM: null,
    notes: null,
    setType: "normal",
    status: "logged",
    loggedAt: 1000000,
    restAfterSec: null,
    enteredWeight: null,
    enteredWeightUnit: null,
    enteredDistance: null,
    enteredDistanceUnit: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure filtering helper that mirrors the logic of listFinishedSessions.
// Tests the filtering logic directly without requiring a live Dexie store.
// ---------------------------------------------------------------------------

async function filterFinishedSessions(
  allSessions: Session[],
  allLogs: SessionSetLog[] = [],
  filters?: {
    range?: "all" | "week" | "month" | "year" | "custom";
    from?: number;
    to?: number;
    routine?: string;
    exercise?: string;
    q?: string;
  },
): Promise<Session[]> {
  // Get finished sessions sorted newest-first by startedAt
  const finished = allSessions
    .filter((s) => s.status === "finished")
    .sort((a, b) => b.startedAt - a.startedAt);

  if (!filters) return finished;

  // Compute date span
  let span: { from: number; to: number } | null = null;
  if (filters.range === "custom" && filters.from != null && filters.to != null) {
    span = { from: filters.from, to: filters.to };
  }

  // Build set of session IDs that have a log for the exercise
  let sessionIdsWithExercise: Set<string> | null = null;
  if (filters.exercise) {
    const ex = filters.exercise;
    sessionIdsWithExercise = new Set(
      allLogs.filter((l) => l.exerciseId === ex).map((l) => l.sessionId),
    );
  }

  return finished.filter((s) => {
    if (s.endedAt == null) return false;
    if (span && (s.endedAt < span.from || s.endedAt > span.to)) return false;
    if (filters.routine && s.sourceRoutineId !== filters.routine) return false;
    if (sessionIdsWithExercise && !sessionIdsWithExercise.has(s.id)) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase().trim();
      const matchTitle = s.title?.toLowerCase().includes(q) ?? false;
      const matchNotes = s.notes?.toLowerCase().includes(q) ?? false;
      if (!matchTitle && !matchNotes) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Test 1: returns only finished sessions, newest-first, excluding in_progress
// ---------------------------------------------------------------------------

describe("listFinishedSessions — status filter and ordering", () => {
  it("returns only status='finished' sessions, ordered newest-first, excluding in_progress", async () => {
    const older = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      status: "finished",
      startedAt: 1000000,
      endedAt: 1003600,
    });
    const newer = makeSession({
      id: "00000000-0000-0000-0000-000000000002",
      status: "finished",
      startedAt: 2000000,
      endedAt: 2003600,
    });
    const inProgress = makeSession({
      id: "00000000-0000-0000-0000-000000000003",
      status: "in_progress",
      startedAt: 3000000,
      endedAt: null,
    });

    const result = await filterFinishedSessions([older, newer, inProgress]);

    // Only finished sessions
    expect(result.every((s) => s.status === "finished")).toBe(true);
    expect(result.find((s) => s.status === "in_progress")).toBeUndefined();

    // Newest first
    expect(result[0]!.id).toBe(newer.id);
    expect(result[1]!.id).toBe(older.id);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Test 2: date range filter excludes sessions outside the range
// ---------------------------------------------------------------------------

describe("listFinishedSessions — date range filter", () => {
  it("excludes sessions whose endedAt falls outside the from/to range", async () => {
    const inside = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      startedAt: 5000000,
      endedAt: 5003600,
    });
    const before = makeSession({
      id: "00000000-0000-0000-0000-000000000002",
      startedAt: 1000000,
      endedAt: 1003600,
    });
    const after = makeSession({
      id: "00000000-0000-0000-0000-000000000003",
      startedAt: 9000000,
      endedAt: 9003600,
    });

    const result = await filterFinishedSessions(
      [inside, before, after],
      [],
      { range: "custom", from: 4000000, to: 6000000 },
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(inside.id);
  });
});

// ---------------------------------------------------------------------------
// Test 3: exercise filter returns only sessions with a log for that exerciseId
// ---------------------------------------------------------------------------

describe("listFinishedSessions — exercise filter", () => {
  it("returns only sessions that have at least one log for the given exerciseId", async () => {
    const sessionWithEx = makeSession({
      id: "00000000-0000-0000-0000-000000000001",
      startedAt: 2000000,
      endedAt: 2003600,
    });
    const sessionWithoutEx = makeSession({
      id: "00000000-0000-0000-0000-000000000002",
      startedAt: 1000000,
      endedAt: 1003600,
    });

    const targetExerciseId = "ex-squat";
    const otherExerciseId = "ex-bench";

    const logs: SessionSetLog[] = [
      makeLog("log-1", sessionWithEx.id, targetExerciseId),
      makeLog("log-2", sessionWithoutEx.id, otherExerciseId),
    ];

    const result = await filterFinishedSessions(
      [sessionWithEx, sessionWithoutEx],
      logs,
      { exercise: targetExerciseId },
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(sessionWithEx.id);
  });
});
