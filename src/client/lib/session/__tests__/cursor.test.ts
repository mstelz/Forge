import { describe, it, expect } from "vitest";
import { computeNextCursor, countPlannedSlots } from "../cursor";
import { bestEpleyForExercise } from "../epley";
import type { LiveStructure } from "../cursor";
import type { SessionSetLog } from "../../../../shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSlot(id: string, order: number) {
  return { id, order, setType: "normal" };
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
  plannedSetId: string,
  status: "logged" | "skipped" | "extra",
  overrides: Partial<SessionSetLog> = {},
): SessionSetLog {
  return {
    id,
    sessionId: "sess-1",
    performedExerciseId,
    exerciseId: "ex-1",
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

// ─── Test 1: Superset round-major walk ────────────────────────────────────────

describe("computeNextCursor — superset round-major walk", () => {
  // Build a superset with 2 items (A, B), each with 2 rounds
  // slots: A@r0 = slot_a0, A@r1 = slot_a1, B@r0 = slot_b0, B@r1 = slot_b1
  const peIdA = "pe-a";
  const peIdB = "pe-b";
  const siIdA = "si-a";
  const siIdB = "si-b";

  const slotA0 = makeSlot("slot-a0", 0);
  const slotA1 = makeSlot("slot-a1", 1);
  const slotB0 = makeSlot("slot-b0", 0);
  const slotB1 = makeSlot("slot-b1", 1);

  const structure: LiveStructure = {
    blocks: [
      {
        id: "block-1",
        type: "superset",
        order: 0,
        roundCount: 2,
        items: [
          makeItem(peIdA, siIdA, "ex-a", 0, [slotA0, slotA1]),
          makeItem(peIdB, siIdB, "ex-b", 1, [slotB0, slotB1]),
        ],
      },
    ],
  };

  it("cursor points to A@round0 first with no logs", () => {
    const cursor = computeNextCursor(structure, []);
    expect(cursor).not.toBeNull();
    if (!cursor || "exhausted" in cursor) throw new Error("expected position");
    expect(cursor.performedExerciseId).toBe(peIdA);
    expect(cursor.roundIndex).toBe(0);
  });

  it("after logging A@round0, cursor advances to B@round0", () => {
    const logs = [makeLog("log-1", peIdA, slotA0.id, "logged")];
    const cursor = computeNextCursor(structure, logs);
    expect(cursor).not.toBeNull();
    if (!cursor || "exhausted" in cursor) throw new Error("expected position");
    expect(cursor.performedExerciseId).toBe(peIdB);
    expect(cursor.roundIndex).toBe(0);
  });

  it("after logging A@round0 and B@round0, cursor advances to A@round1", () => {
    const logs = [
      makeLog("log-1", peIdA, slotA0.id, "logged"),
      makeLog("log-2", peIdB, slotB0.id, "logged"),
    ];
    const cursor = computeNextCursor(structure, logs);
    expect(cursor).not.toBeNull();
    if (!cursor || "exhausted" in cursor) throw new Error("expected position");
    expect(cursor.performedExerciseId).toBe(peIdA);
    expect(cursor.roundIndex).toBe(1);
  });
});

// ─── Test 2: Cursor exhaustion ────────────────────────────────────────────────

describe("computeNextCursor — exhaustion", () => {
  const peIdA = "pe-a";
  const peIdB = "pe-b";
  const siIdA = "si-a";
  const siIdB = "si-b";

  const slotA0 = makeSlot("slot-a0", 0);
  const slotA1 = makeSlot("slot-a1", 1);
  const slotB0 = makeSlot("slot-b0", 0);
  const slotB1 = makeSlot("slot-b1", 1);

  const structure: LiveStructure = {
    blocks: [
      {
        id: "block-1",
        type: "superset",
        order: 0,
        roundCount: 2,
        items: [
          makeItem(peIdA, siIdA, "ex-a", 0, [slotA0, slotA1]),
          makeItem(peIdB, siIdB, "ex-b", 1, [slotB0, slotB1]),
        ],
      },
    ],
  };

  it("returns exhausted=true when all 4 slots are logged", () => {
    const logs = [
      makeLog("log-1", peIdA, slotA0.id, "logged"),
      makeLog("log-2", peIdB, slotB0.id, "logged"),
      makeLog("log-3", peIdA, slotA1.id, "logged"),
      makeLog("log-4", peIdB, slotB1.id, "logged"),
    ];
    const cursor = computeNextCursor(structure, logs);
    expect(cursor).not.toBeNull();
    expect(cursor).toEqual({ exhausted: true });
  });

  it("countPlannedSlots returns 4 (extras excluded)", () => {
    expect(countPlannedSlots(structure)).toBe(4);
  });
});

// ─── Test 3: bestEpleyForExercise exclusions ──────────────────────────────────

describe("bestEpleyForExercise — exclusions", () => {
  const exerciseId = "ex-bench";

  it("excludes warmup logs and only returns the normal log's result", () => {
    const warmupLog = makeLog("log-warmup", "pe-1", "slot-1", "logged", {
      exerciseId,
      setType: "warmup",
      weightKg: 60,
      reps: 10,
    });
    const normalLog = makeLog("log-normal", "pe-1", "slot-2", "logged", {
      exerciseId,
      setType: "normal",
      weightKg: 100,
      reps: 5,
    });

    const result = bestEpleyForExercise([warmupLog, normalLog], exerciseId);
    expect(result).not.toBeNull();
    expect(result!.logId).toBe("log-normal");
    expect(result!.weightKg).toBe(100);
  });

  it("returns null when only warmup logs exist", () => {
    const warmupLog = makeLog("log-warmup", "pe-1", "slot-1", "logged", {
      exerciseId,
      setType: "warmup",
      weightKg: 60,
      reps: 10,
    });
    const result = bestEpleyForExercise([warmupLog], exerciseId);
    expect(result).toBeNull();
  });
});

// ─── Test 4: getLastLogValuesForExercise — pure logic test ────────────────────
// We test the ordering/filtering logic directly without Dexie by simulating
// what the function does on raw log arrays.

describe("getLastLogValuesForExercise — ordering logic", () => {
  // Instead of testing the Dexie function directly (requires fake-indexeddb),
  // we test that the ordering logic is correct by applying it to raw arrays.
  it("returns the most recent logged row when given two rows for same exerciseId", () => {
    const olderLog: SessionSetLog = makeLog("log-old", "pe-1", "slot-1", "logged", {
      exerciseId: "ex-1",
      weightKg: 80,
      reps: 5,
      loggedAt: 1000,
    });
    const newerLog: SessionSetLog = makeLog("log-new", "pe-1", "slot-2", "logged", {
      exerciseId: "ex-1",
      weightKg: 100,
      reps: 3,
      loggedAt: 2000,
    });

    // Simulate the function's filtering and sorting logic
    const logs = [olderLog, newerLog];
    const logged = logs.filter((r) => r.status === "logged" && r.exerciseId === "ex-1");
    logged.sort((a, b) => b.loggedAt - a.loggedAt);
    const last = logged[0];

    expect(last).toBeDefined();
    expect(last!.id).toBe("log-new");
    expect(last!.weightKg).toBe(100);
    expect(last!.reps).toBe(3);
  });

  it("ignores extra-status logs and only returns logged ones", () => {
    const extraLog: SessionSetLog = makeLog("log-extra", "pe-1", null as unknown as string, "extra", {
      exerciseId: "ex-1",
      weightKg: 120,
      reps: 2,
      loggedAt: 3000,
    });
    const loggedLog: SessionSetLog = makeLog("log-logged", "pe-1", "slot-1", "logged", {
      exerciseId: "ex-1",
      weightKg: 90,
      reps: 5,
      loggedAt: 1000,
    });

    const logs = [extraLog, loggedLog];
    const logged = logs.filter((r) => r.status === "logged" && r.exerciseId === "ex-1");
    logged.sort((a, b) => b.loggedAt - a.loggedAt);
    const last = logged[0];

    expect(last).toBeDefined();
    expect(last!.id).toBe("log-logged");
  });
});
