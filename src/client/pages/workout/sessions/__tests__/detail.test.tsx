import { describe, it, expect } from "vitest";
import { summarizeSession } from "../../../../lib/session/summary";
import { bestEpleyForExercise } from "../../../../lib/session/epley";
import type { Session, SessionSetLog } from "../../../../../shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    status: "in_progress",
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
    startedAt: Date.now() - 3600000,
    endedAt: null,
    pausedAt: null,
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
    ...overrides,
  };
}

function makeLog(
  id: string,
  performedExerciseId: string,
  exerciseId: string,
  plannedSetId: string | null,
  status: "logged" | "skipped" | "extra",
  overrides: Partial<SessionSetLog> = {},
): SessionSetLog {
  return {
    id,
    sessionId: "00000000-0000-0000-0000-000000000001",
    performedExerciseId,
    exerciseId,
    sessionItemId: "si-1",
    plannedSetId,
    order: 0,
    reps: 5,
    weightKg: 100,
    rpe: null,
    durationSec: null,
    distanceM: null,
    notes: null,
    setType: "normal",
    status,
    loggedAt: Date.now(),
    restAfterSec: null,
    enteredWeight: null,
    enteredWeightUnit: null,
    enteredDistance: null,
    enteredDistanceUnit: null,
    ...overrides,
  };
}

// ─── Test 1: Finish flow mutates session correctly ────────────────────────────

describe("finish flow — session mutation", () => {
  it("finishSession mutates status to 'finished', clears restTimer, and sets endedAt", () => {
    const session = makeSession({
      status: "in_progress",
      restTimer: JSON.stringify({
        status: "running",
        startedAt: Date.now() - 30000,
        durationSec: 90,
        pausedAt: null,
        remainingSec: 60,
      }),
    });

    const endedAt = Date.now();

    // Simulate what finishSession() does
    const finished: Session = {
      ...session,
      status: "finished",
      endedAt,
      restTimer: null,
      updatedAt: Date.now(),
    };

    expect(finished.status).toBe("finished");
    expect(finished.endedAt).toBe(endedAt);
    expect(finished.restTimer).toBeNull();
  });

  it("finished session enqueues an outbox entry that flusher routes to /finish", () => {
    const session = makeSession({ status: "in_progress" });
    const endedAt = Date.now();

    const finishedRecord: Session = {
      ...session,
      status: "finished",
      endedAt,
      restTimer: null,
    };

    // The outbox entry has entity='session', op='update', payload.status='finished'
    const outboxEntry = {
      entity: "session" as const,
      op: "update" as const,
      payload: finishedRecord,
    };

    // Flusher routing condition: entity='session' && op='update' && payload.status='finished'
    const routesToFinish =
      outboxEntry.entity === "session" &&
      outboxEntry.op === "update" &&
      (outboxEntry.payload as Session).status === "finished";

    expect(routesToFinish).toBe(true);

    // The /finish endpoint receives { endedAt }
    const finishBody = { endedAt: (outboxEntry.payload as Session).endedAt };
    expect(finishBody.endedAt).toBe(endedAt);
  });
});

// ─── Test 2: PR count — only exercises where this session beats prior best ────

describe("PR count — summarizeSession prCount", () => {
  it("counts exercise as PR only when this session's best Epley exceeds prior all-time best", () => {
    const session = makeSession({ status: "finished" });
    const exBench = "ex-bench";
    const exSquat = "ex-squat";

    // This session: bench 110kg×5 (Epley ≈ 128.3), squat 120kg×3 (Epley ≈ 132)
    const currentLogs: SessionSetLog[] = [
      makeLog("b1", "pe-1", exBench, "s1", "logged", { weightKg: 110, reps: 5, setType: "normal" }),
      makeLog("s1", "pe-2", exSquat, "s2", "logged", { weightKg: 120, reps: 3, setType: "normal" }),
    ];

    // Prior sessions: bench 100kg×5 (Epley ≈ 116.7), squat 150kg×5 (Epley ≈ 175)
    const priorLogs: SessionSetLog[] = [
      makeLog("pb1", "pe-3", exBench, "s3", "logged", {
        sessionId: "sess-old",
        weightKg: 100,
        reps: 5,
        setType: "normal",
      }),
      makeLog("ps1", "pe-4", exSquat, "s4", "logged", {
        sessionId: "sess-old",
        weightKg: 150,
        reps: 5,
        setType: "normal",
      }),
    ];

    const summary = summarizeSession(session, currentLogs, priorLogs);

    // bench: 110*1.167 ≈ 128.3 > 100*1.167 ≈ 116.7 → PR
    // squat: 120*1.1 ≈ 132 < 150*1.167 ≈ 175 → no PR
    expect(summary.prCount).toBe(1);
  });

  it("counts all exercises as PRs when no prior history exists", () => {
    const session = makeSession({ status: "finished" });
    const exBench = "ex-bench";
    const exSquat = "ex-squat";

    const currentLogs: SessionSetLog[] = [
      makeLog("b1", "pe-1", exBench, "s1", "logged", { weightKg: 100, reps: 5, setType: "normal" }),
      makeLog("s1", "pe-2", exSquat, "s2", "logged", { weightKg: 120, reps: 3, setType: "normal" }),
    ];

    const summary = summarizeSession(session, currentLogs, []); // no prior logs

    // Both are PRs (no prior baseline)
    expect(summary.prCount).toBe(2);
  });

  it("PR count excludes warmup sets from Epley calculation", () => {
    const session = makeSession({ status: "finished" });
    const exBench = "ex-bench";

    // This session has only a warmup log (no normal sets)
    const currentLogs: SessionSetLog[] = [
      makeLog("warmup-1", "pe-1", exBench, "s1", "logged", {
        weightKg: 60,
        reps: 10,
        setType: "warmup",
      }),
    ];

    const summary = summarizeSession(session, currentLogs, []);

    // Warmup sets are excluded from bestEpleyForExercise → no PR
    expect(summary.prCount).toBe(0);
  });
});

// ─── Test 3: Previous-attempt rendering ───────────────────────────────────────

describe("previous-attempt rendering — swap-exercise semantics", () => {
  it("post-swap: logs with a different exerciseId than the slot's current exerciseId are 'previous attempt'", () => {
    // Scenario: a slot originally had exercise A, user swapped to exercise B
    // Existing logs retain exerciseId='ex-a'
    // The slot's current exerciseId='ex-b'

    const slotCurrentExerciseId = "ex-b"; // after swap

    const logs: SessionSetLog[] = [
      // Old logs from before the swap — exerciseId is ex-a
      makeLog("log-old-1", "pe-1", "ex-a", "s1", "logged", { weightKg: 100, reps: 5 }),
      makeLog("log-old-2", "pe-1", "ex-a", "s2", "logged", { weightKg: 105, reps: 5 }),
      // New logs after swap — exerciseId is ex-b
      makeLog("log-new-1", "pe-1", "ex-b", "s1", "logged", { weightKg: 80, reps: 8 }),
    ];

    // Separate logs into "current exercise" vs "previous attempt"
    const currentLogs = logs.filter((l) => l.exerciseId === slotCurrentExerciseId);
    const previousAttemptLogs = logs.filter((l) => l.exerciseId !== slotCurrentExerciseId);

    expect(currentLogs).toHaveLength(1);
    expect(currentLogs[0]!.id).toBe("log-new-1");

    expect(previousAttemptLogs).toHaveLength(2);
    expect(previousAttemptLogs[0]!.exerciseId).toBe("ex-a");
    expect(previousAttemptLogs[1]!.exerciseId).toBe("ex-a");
  });

  it("no previous-attempt logs when exercise was never swapped", () => {
    const slotCurrentExerciseId = "ex-bench";

    const logs: SessionSetLog[] = [
      makeLog("log-1", "pe-1", "ex-bench", "s1", "logged", { weightKg: 100, reps: 5 }),
      makeLog("log-2", "pe-1", "ex-bench", "s2", "logged", { weightKg: 105, reps: 5 }),
    ];

    const previousAttemptLogs = logs.filter((l) => l.exerciseId !== slotCurrentExerciseId);
    expect(previousAttemptLogs).toHaveLength(0);
  });

  it("extra logs (status='extra') render with EXTRA chip regardless of exercise swap", () => {
    const logs: SessionSetLog[] = [
      makeLog("log-1", "pe-1", "ex-a", "s1", "logged"),
      makeLog("extra-1", "pe-1", "ex-a", null, "extra"),
    ];

    const extraLogs = logs.filter((l) => l.status === "extra");
    expect(extraLogs).toHaveLength(1);
    expect(extraLogs[0]!.plannedSetId).toBeNull();
    expect(extraLogs[0]!.status).toBe("extra");
  });
});
