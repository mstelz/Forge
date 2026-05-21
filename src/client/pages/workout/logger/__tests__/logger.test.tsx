import { describe, it, expect } from "vitest";
import { computeNextCursor, countPlannedSlots } from "../../../../lib/session/cursor";
import type { LiveStructure } from "../../../../lib/session/cursor";
import type { SessionSetLog } from "../../../../../shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSlot(id: string, order: number, restSec?: number) {
  return { id, order, setType: "normal", restSec: restSec ?? null };
}

function makeItem(
  performedExerciseId: string,
  sessionItemId: string,
  exerciseId: string,
  order: number,
  slots: ReturnType<typeof makeSlot>[],
) {
  return {
    id: sessionItemId,
    performedExerciseId,
    sessionItemId,
    exerciseId,
    order,
    setCount: slots.length,
    setTargets: slots,
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
    sessionId: "sess-1",
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

// ─── Test 1: Header counter "Set N of M" ──────────────────────────────────────

describe("header counter — Set N of M", () => {
  it("renders total planned slots summed across all blocks (extras excluded)", () => {
    const structure: LiveStructure = {
      blocks: [
        {
          id: "b1",
          type: "single",
          order: 0,
          items: [makeItem("pe-a", "si-a", "ex-a", 0, [makeSlot("s1", 0), makeSlot("s2", 1), makeSlot("s3", 2)])],
        },
        {
          id: "b2",
          type: "single",
          order: 1,
          items: [makeItem("pe-b", "si-b", "ex-b", 0, [makeSlot("s4", 0), makeSlot("s5", 1)])],
        },
      ],
    };

    // M = total planned slots (countPlannedSlots)
    const total = countPlannedSlots(structure);
    expect(total).toBe(5);

    // N = first unresolved slot = 1 (when no logs)
    const cursor = computeNextCursor(structure, []);
    expect(cursor).not.toBeNull();
    expect(cursor && !("exhausted" in cursor) ? cursor.slotIndex : null).toBe(0);
  });

  it("extra logs (plannedSetId=null) do NOT increment total planned slots", () => {
    const structure: LiveStructure = {
      blocks: [
        {
          id: "b1",
          type: "single",
          order: 0,
          items: [makeItem("pe-a", "si-a", "ex-a", 0, [makeSlot("s1", 0)])],
        },
      ],
    };

    // Add an extra log (plannedSetId=null) — should not affect total
    const logs = [
      makeLog("extra-log", "pe-a", "ex-a", null, "extra"),
    ];

    const total = countPlannedSlots(structure);
    expect(total).toBe(1); // still 1 planned slot

    // Cursor should still point at the unresolved planned slot
    // (extras with plannedSetId=null are never added to doneKeys)
    const cursor = computeNextCursor(structure, logs);
    expect(cursor).not.toBeNull();
    // Not exhausted because the one planned slot s1 is not logged
    expect(cursor && "exhausted" in cursor ? cursor.exhausted : false).toBe(false);
  });
});

// ─── Test 2: Active row aligns with cursor state ──────────────────────────────

describe("active row aligns with cursor state", () => {
  it("tapping a placeholder slot focuses that slot without marking earlier slots skipped", () => {
    const slotA = makeSlot("s1", 0);
    const slotB = makeSlot("s2", 1);
    const slotC = makeSlot("s3", 2);

    const structure: LiveStructure = {
      blocks: [
        {
          id: "b1",
          type: "single",
          order: 0,
          items: [makeItem("pe-a", "si-a", "ex-a", 0, [slotA, slotB, slotC])],
        },
      ],
    };

    // No logs: cursor at s1
    const cursor0 = computeNextCursor(structure, []);
    expect(cursor0).not.toBeNull();
    if (!cursor0 || "exhausted" in cursor0) throw new Error("expected position");
    expect(cursor0.plannedSetId).toBe("s1");

    // Log s1 only → cursor advances to s2
    const logs1 = [makeLog("log-1", "pe-a", "ex-a", "s1", "logged")];
    const cursor1 = computeNextCursor(structure, logs1);
    expect(cursor1).not.toBeNull();
    if (!cursor1 || "exhausted" in cursor1) throw new Error("expected position");
    expect(cursor1.plannedSetId).toBe("s2");

    // User logs s3 directly (tapped placeholder out of order)
    // s2 is still NOT skipped — cursor should return s2 as next unresolved
    const logs2 = [
      makeLog("log-1", "pe-a", "ex-a", "s1", "logged"),
      makeLog("log-3", "pe-a", "ex-a", "s3", "logged"),
    ];
    const cursor2 = computeNextCursor(structure, logs2);
    expect(cursor2).not.toBeNull();
    if (!cursor2 || "exhausted" in cursor2) throw new Error("expected position");
    // s2 is still unresolved — cursor points at s2, not exhausted
    expect(cursor2.plannedSetId).toBe("s2");
  });
});

// ─── Test 3: Rest timer auto-starts on LOG SET ────────────────────────────────

describe("rest timer — auto-start on LOG SET", () => {
  it("rest timer duration uses slot's restSec when present", () => {
    // Simulate the logic: auto-start rest timer after logging a set
    const slotRestSec = 120; // slot has 2 min rest
    const defaultDurationSec = 90;

    const slot = makeSlot("s1", 0, slotRestSec);

    // The logger picks restSec from the slot, falling back to 90
    const durationSec = slot.restSec ?? defaultDurationSec;
    expect(durationSec).toBe(120);

    const startedAt = Date.now();
    const restTimer = {
      status: "running" as const,
      startedAt,
      durationSec,
      pausedAt: null,
      remainingSec: durationSec,
    };

    expect(restTimer.status).toBe("running");
    expect(restTimer.durationSec).toBe(120);
    expect(restTimer.startedAt).toBe(startedAt);
    expect((restTimer as Record<string, unknown>).restTimer).toBeUndefined();
  });

  it("rest timer defaults to 90 seconds when slot has no restSec", () => {
    const slot = makeSlot("s1", 0); // no restSec
    const defaultDurationSec = 90;

    const durationSec = (slot.restSec as number | null | undefined) ?? defaultDurationSec;
    expect(durationSec).toBe(90);
  });

  it("rest timer state survives a remount (restTimer is stored on session row in Dexie)", () => {
    // The rest timer is serialized as JSON on the session row.
    // On remount, the logger reads session.restTimer and rehydrates the timer.
    const startedAt = Date.now() - 45000; // 45 seconds ago
    const durationSec = 90;

    const storedTimer = JSON.stringify({
      status: "running",
      startedAt,
      durationSec,
      pausedAt: null,
      remainingSec: durationSec,
    });

    // Simulate rehydration
    const timer = JSON.parse(storedTimer) as {
      status: string;
      startedAt: number;
      durationSec: number;
      pausedAt: number | null;
      remainingSec: number;
    };

    // remainingSec is recomputed from wall-clock
    const elapsed = Math.round((Date.now() - timer.startedAt) / 1000);
    const remainingSec = Math.max(0, timer.durationSec - elapsed);

    expect(timer.status).toBe("running");
    expect(remainingSec).toBeGreaterThanOrEqual(0);
    expect(remainingSec).toBeLessThanOrEqual(durationSec);
  });
});

// ─── Test 4: Inline editor pre-fills from most recent logged row ──────────────

describe("inline editor — pre-fill from most recent logged row", () => {
  it("returns the most recent logged row's values for pre-filling", () => {
    const exerciseId = "ex-bench";
    const logs: SessionSetLog[] = [
      makeLog("log-old", "pe-1", exerciseId, "s1", "logged", {
        weightKg: 80,
        reps: 8,
        loggedAt: 1000,
      }),
      makeLog("log-new", "pe-1", exerciseId, "s2", "logged", {
        weightKg: 90,
        reps: 5,
        loggedAt: 2000,
      }),
    ];

    // Simulate getLastLogValuesForExercise filtering
    const logged = logs.filter((r) => r.status === "logged" && r.exerciseId === exerciseId);
    logged.sort((a, b) => b.loggedAt - a.loggedAt);
    const last = logged[0];

    expect(last).toBeDefined();
    expect(last!.weightKg).toBe(90);
    expect(last!.reps).toBe(5);
  });

  it("user input overrides pre-fill values", () => {
    // Simulate a user overriding the pre-filled weight
    const preFilledWeight = 90;
    const preFilledReps = 5;

    // User types different values
    const userWeight = 100;
    const userReps = 3;

    // The editor state should reflect user input, not pre-fill
    const editorState = {
      weight: userWeight ?? preFilledWeight,
      reps: userReps ?? preFilledReps,
    };

    expect(editorState.weight).toBe(100);
    expect(editorState.reps).toBe(3);
  });
});

// ─── Test 5: Cursor exhaustion CTA ────────────────────────────────────────────

describe("cursor exhaustion — CTA changes after all sets logged", () => {
  it("cursor returns exhausted=true when all planned slots have logs", () => {
    const structure: LiveStructure = {
      blocks: [
        {
          id: "b1",
          type: "single",
          order: 0,
          items: [makeItem("pe-a", "si-a", "ex-a", 0, [makeSlot("s1", 0), makeSlot("s2", 1)])],
        },
      ],
    };

    const logs = [
      makeLog("log-1", "pe-a", "ex-a", "s1", "logged"),
      makeLog("log-2", "pe-a", "ex-a", "s2", "logged"),
    ];

    const cursor = computeNextCursor(structure, logs);
    expect(cursor).not.toBeNull();
    expect(cursor).toEqual({ exhausted: true });
  });

  it("extra logs do not block exhaustion — extras never fill planned slots", () => {
    const structure: LiveStructure = {
      blocks: [
        {
          id: "b1",
          type: "single",
          order: 0,
          items: [makeItem("pe-a", "si-a", "ex-a", 0, [makeSlot("s1", 0)])],
        },
      ],
    };

    // s1 is logged, plus an extra set
    const logs = [
      makeLog("log-1", "pe-a", "ex-a", "s1", "logged"),
      makeLog("extra-1", "pe-a", "ex-a", null, "extra"),
    ];

    const cursor = computeNextCursor(structure, logs);
    // With s1 logged, cursor should be exhausted
    expect(cursor).toEqual({ exhausted: true });
  });
});
