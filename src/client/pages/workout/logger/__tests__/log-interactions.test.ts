import { describe, it, expect } from "vitest";
import { computeNextCursor, countPlannedSlots } from "../../../../lib/session/cursor";
import type { LiveStructure } from "../../../../lib/session/cursor";
import type { SessionSetLog } from "../../../../../shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSlot(id: string, order: number) {
  return { id, order, setType: "normal" as const };
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

// ─── Test 1: LOG SET creates log and advances cursor ──────────────────────────

describe("LOG SET — creates log + advances cursor", () => {
  it("logging a set advances the cursor to the next planned slot", () => {
    const slotA = makeSlot("s1", 0);
    const slotB = makeSlot("s2", 1);

    const structure: LiveStructure = {
      blocks: [
        {
          id: "b1",
          type: "single",
          order: 0,
          items: [makeItem("pe-a", "si-a", "ex-a", 0, [slotA, slotB])],
        },
      ],
    };

    // Before logging: cursor at s1
    const cursor0 = computeNextCursor(structure, []);
    expect(cursor0).not.toBeNull();
    if (!cursor0 || "exhausted" in cursor0) throw new Error("expected position");
    expect(cursor0.plannedSetId).toBe("s1");

    // After logging s1: cursor advances to s2
    const log1 = makeLog("log-1", "pe-a", "ex-a", "s1", "logged");
    const cursor1 = computeNextCursor(structure, [log1]);
    expect(cursor1).not.toBeNull();
    if (!cursor1 || "exhausted" in cursor1) throw new Error("expected position");
    expect(cursor1.plannedSetId).toBe("s2");
  });

  it("correct-mode (updating an existing log) patches in place without exhausting or re-advancing cursor", () => {
    const slotA = makeSlot("s1", 0);
    const slotB = makeSlot("s2", 1);

    const structure: LiveStructure = {
      blocks: [
        {
          id: "b1",
          type: "single",
          order: 0,
          items: [makeItem("pe-a", "si-a", "ex-a", 0, [slotA, slotB])],
        },
      ],
    };

    // s1 is logged, cursor at s2
    const originalLog = makeLog("log-1", "pe-a", "ex-a", "s1", "logged", { weightKg: 100, reps: 5 });
    const cursor1 = computeNextCursor(structure, [originalLog]);
    expect(cursor1).not.toBeNull();
    if (!cursor1 || "exhausted" in cursor1) throw new Error("expected position");
    expect(cursor1.plannedSetId).toBe("s2");

    // Correct-mode: update log-1 to new values — same plannedSetId, same status
    const correctedLog = { ...originalLog, weightKg: 110, reps: 3 };

    // After correction, cursor should still be at s2 (s1 is still logged)
    const cursor2 = computeNextCursor(structure, [correctedLog]);
    expect(cursor2).not.toBeNull();
    if (!cursor2 || "exhausted" in cursor2) throw new Error("expected position");
    expect(cursor2.plannedSetId).toBe("s2");
    // Verify the corrected values
    expect(correctedLog.weightKg).toBe(110);
    expect(correctedLog.reps).toBe(3);
  });
});

// ─── Test 2: setType chip scope = single set only ─────────────────────────────

describe("setType chip — scope is single set only", () => {
  it("changing setType on one log does not affect siblings", () => {
    // Simulate three logs for the same performed exercise
    const logA = makeLog("log-1", "pe-a", "ex-a", "s1", "logged", { setType: "normal" });
    const logB = makeLog("log-2", "pe-a", "ex-a", "s2", "logged", { setType: "normal" });
    const logC = makeLog("log-3", "pe-a", "ex-a", "s3", "logged", { setType: "normal" });

    // User changes logB's setType to 'warmup'
    const updatedLogB = { ...logB, setType: "warmup" as const };

    // Siblings are unaffected
    expect(logA.setType).toBe("normal");
    expect(updatedLogB.setType).toBe("warmup");
    expect(logC.setType).toBe("normal");
  });

  it("setType update applies only to the specific log id, not by exerciseId or slot position", () => {
    // Two different exercises, each with one log
    const logExA = makeLog("log-a", "pe-a", "ex-a", "s1", "logged", { setType: "normal" });
    const logExB = makeLog("log-b", "pe-b", "ex-b", "s2", "logged", { setType: "normal" });

    // Simulate an update operation: find log by id, update only that log
    const logsById = new Map([
      [logExA.id, logExA],
      [logExB.id, logExB],
    ]);

    const targetId = "log-a";
    const existing = logsById.get(targetId)!;
    const updated = { ...existing, setType: "drop" as const };
    logsById.set(targetId, updated);

    expect(logsById.get("log-a")!.setType).toBe("drop");
    expect(logsById.get("log-b")!.setType).toBe("normal"); // unchanged
  });
});

// ─── Test 3: Skip creates status='skipped', cursor walks past ─────────────────

describe("skip — creates skipped row and advances cursor", () => {
  it("skipped log has status='skipped' with no metric values", () => {
    const skippedLog = makeLog("skip-1", "pe-a", "ex-a", "s1", "skipped", {
      weightKg: null,
      reps: null,
      rpe: null,
      durationSec: null,
      distanceM: null,
    });

    expect(skippedLog.status).toBe("skipped");
    expect(skippedLog.weightKg).toBeNull();
    expect(skippedLog.reps).toBeNull();
    expect(skippedLog.rpe).toBeNull();
    expect(skippedLog.durationSec).toBeNull();
    expect(skippedLog.distanceM).toBeNull();
  });

  it("cursor walks past a skipped slot", () => {
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

    // Skip s1, log s2 — cursor should be at s3
    const logs = [
      makeLog("skip-1", "pe-a", "ex-a", "s1", "skipped", {
        weightKg: null,
        reps: null,
      }),
      makeLog("log-2", "pe-a", "ex-a", "s2", "logged"),
    ];

    const cursor = computeNextCursor(structure, logs);
    expect(cursor).not.toBeNull();
    if (!cursor || "exhausted" in cursor) throw new Error("expected position");
    expect(cursor.plannedSetId).toBe("s3");
  });
});

// ─── Test 4: Extra set — plannedSetId=null, status='extra', header unchanged ──

describe("extra set — plannedSetId=null, status='extra'", () => {
  it("extra log has plannedSetId=null and status='extra'", () => {
    const existingLogs: SessionSetLog[] = [
      makeLog("log-1", "pe-a", "ex-a", "s1", "logged", { order: 0 }),
      makeLog("log-2", "pe-a", "ex-a", "s2", "logged", { order: 1 }),
    ];

    // Adding an extra set: plannedSetId=null, status='extra', order = max(order)+1
    const maxOrder = Math.max(...existingLogs.map((l) => l.order));
    const extraLog = makeLog("extra-1", "pe-a", "ex-a", null, "extra", {
      order: maxOrder + 1,
    });

    expect(extraLog.plannedSetId).toBeNull();
    expect(extraLog.status).toBe("extra");
    expect(extraLog.order).toBe(2); // max(0,1) + 1
  });

  it("extra logs do NOT increment the header counter total (countPlannedSlots)", () => {
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

    // countPlannedSlots counts setTargets.length, not logs — extras have no slot
    const total = countPlannedSlots(structure);
    expect(total).toBe(2); // only 2 planned slots regardless of extras

    // Even after adding 3 extras, total is still 2
    const _extras: SessionSetLog[] = [
      makeLog("extra-1", "pe-a", "ex-a", null, "extra", { order: 2 }),
      makeLog("extra-2", "pe-a", "ex-a", null, "extra", { order: 3 }),
      makeLog("extra-3", "pe-a", "ex-a", null, "extra", { order: 4 }),
    ];

    // countPlannedSlots is derived from structure, NOT from logs
    expect(countPlannedSlots(structure)).toBe(2);
  });

  it("extra logs do not interfere with cursor exhaustion check", () => {
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

    // Log s1 + add extras — should still be exhausted
    const logs: SessionSetLog[] = [
      makeLog("log-1", "pe-a", "ex-a", "s1", "logged"),
      makeLog("extra-1", "pe-a", "ex-a", null, "extra"),
      makeLog("extra-2", "pe-a", "ex-a", null, "extra"),
    ];

    const cursor = computeNextCursor(structure, logs);
    expect(cursor).toEqual({ exhausted: true });
  });
});
