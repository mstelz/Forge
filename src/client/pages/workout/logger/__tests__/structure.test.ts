import { describe, it, expect } from "vitest";
import {
  countDoneSlots,
  deriveCursor,
  doneSlotKeys,
  parseLiveStructure,
  parseRestTimer,
  supersetRoundCount,
  totalSlotCount,
} from "../structure";
import type { LiveBlock, LiveStructure } from "../types";
import type { SessionSetLog } from "../../../../../shared";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function slot(id: string) {
  return { id };
}

function item(performedExerciseId: string, slotIds: string[]) {
  return {
    performedExerciseId,
    sessionItemId: `si-${performedExerciseId}`,
    exerciseId: `ex-${performedExerciseId}`,
    setCount: slotIds.length,
    setTargets: slotIds.map(slot),
  };
}

function single(id: string, performedExerciseId: string, slotIds: string[]): LiveBlock {
  return { id, type: "single", items: [item(performedExerciseId, slotIds)] };
}

function superset(id: string, items: ReturnType<typeof item>[]): LiveBlock {
  return { id, type: "superset", items };
}

function log(
  performedExerciseId: string,
  plannedSetId: string | null,
  status: SessionSetLog["status"],
): SessionSetLog {
  return {
    id: `log-${performedExerciseId}-${plannedSetId}`,
    sessionId: "sess-1",
    performedExerciseId,
    exerciseId: `ex-${performedExerciseId}`,
    sessionItemId: `si-${performedExerciseId}`,
    plannedSetId,
    order: 0,
    reps: null,
    weightKg: null,
    rpe: null,
    durationSec: null,
    distanceM: null,
    notes: null,
    setType: "normal",
    status,
    loggedAt: 1_000,
    restAfterSec: null,
    enteredWeight: null,
    enteredWeightUnit: null,
    enteredDistance: null,
    enteredDistanceUnit: null,
  };
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

describe("parseLiveStructure", () => {
  it("parses a stored structure", () => {
    const parsed = parseLiveStructure(JSON.stringify({ blocks: [single("b1", "p1", ["s1"])] }));
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]!.items[0]!.setTargets[0]!.id).toBe("s1");
  });

  it("degrades to an empty structure rather than throwing on corrupt JSON", () => {
    expect(parseLiveStructure("{not json")).toEqual({ blocks: [] });
  });
});

describe("parseRestTimer", () => {
  it("returns an idle 90s timer when the session has none", () => {
    expect(parseRestTimer(null)).toEqual({
      status: "idle",
      startedAt: null,
      durationSec: 90,
      pausedAt: null,
      remainingSec: null,
    });
    expect(parseRestTimer(undefined).status).toBe("idle");
    expect(parseRestTimer("").status).toBe("idle");
  });

  it("returns an idle timer rather than throwing on corrupt JSON", () => {
    expect(parseRestTimer("{nope").status).toBe("idle");
  });

  it("round-trips a running timer", () => {
    const running = { status: "running", startedAt: 5, durationSec: 120, pausedAt: null, remainingSec: 120 };
    expect(parseRestTimer(JSON.stringify(running))).toEqual(running);
  });

  it("hands back a fresh default each call, so callers cannot mutate it for everyone", () => {
    const first = parseRestTimer(null);
    first.durationSec = 15;
    expect(parseRestTimer(null).durationSec).toBe(90);
  });
});

// ─── Done-slot bookkeeping ────────────────────────────────────────────────────

describe("doneSlotKeys", () => {
  it("counts logged and skipped sets as done, but not extras", () => {
    const keys = doneSlotKeys([
      log("p1", "s1", "logged"),
      log("p1", "s2", "skipped"),
      log("p1", null, "extra"),
    ]);
    expect(keys.has("p1:s1")).toBe(true);
    expect(keys.has("p1:s2")).toBe(true);
    expect(keys.size).toBe(2);
  });

  it("keys by exercise as well as slot, so two exercises sharing a slot id do not collide", () => {
    const keys = doneSlotKeys([log("p1", "s1", "logged")]);
    expect(keys.has("p1:s1")).toBe(true);
    expect(keys.has("p2:s1")).toBe(false);
  });
});

// ─── Cursor ───────────────────────────────────────────────────────────────────

describe("deriveCursor", () => {
  it("starts on the first slot of the first block", () => {
    const structure: LiveStructure = { blocks: [single("b1", "p1", ["s1", "s2"])] };
    expect(deriveCursor(structure, [])).toEqual({ blockIdx: 0, itemIdx: 0, slotIdx: 0 });
  });

  it("advances past logged sets", () => {
    const structure: LiveStructure = { blocks: [single("b1", "p1", ["s1", "s2"])] };
    expect(deriveCursor(structure, [log("p1", "s1", "logged")])).toEqual({
      blockIdx: 0, itemIdx: 0, slotIdx: 1,
    });
  });

  it("treats a skipped set as resolved and moves on", () => {
    const structure: LiveStructure = { blocks: [single("b1", "p1", ["s1", "s2"])] };
    expect(deriveCursor(structure, [log("p1", "s1", "skipped")])).toEqual({
      blockIdx: 0, itemIdx: 0, slotIdx: 1,
    });
  });

  it("moves to the next block once one is finished", () => {
    const structure: LiveStructure = {
      blocks: [single("b1", "p1", ["s1"]), single("b2", "p2", ["s2"])],
    };
    expect(deriveCursor(structure, [log("p1", "s1", "logged")])).toEqual({
      blockIdx: 1, itemIdx: 0, slotIdx: 0,
    });
  });

  it("walks a superset round-major — A1, A2, then back to A1", () => {
    const structure: LiveStructure = {
      blocks: [superset("b1", [item("p1", ["a1", "a2"]), item("p2", ["b1", "b2"])])],
    };

    // Nothing done yet → first exercise, round 1
    expect(deriveCursor(structure, [])).toEqual({ blockIdx: 0, itemIdx: 0, slotIdx: 0 });

    // A1 done → partner exercise, still round 1
    expect(deriveCursor(structure, [log("p1", "a1", "logged")])).toEqual({
      blockIdx: 0, itemIdx: 1, slotIdx: 0,
    });

    // Round 1 complete → back to the first exercise for round 2
    expect(
      deriveCursor(structure, [log("p1", "a1", "logged"), log("p2", "b1", "logged")]),
    ).toEqual({ blockIdx: 0, itemIdx: 0, slotIdx: 1 });
  });

  it("skips an exhausted exercise in a ragged superset and keeps going with the other", () => {
    // p1 has 1 set, p2 has 2 — round 2 exists only for p2.
    const structure: LiveStructure = {
      blocks: [superset("b1", [item("p1", ["a1"]), item("p2", ["b1", "b2"])])],
    };
    const done = [log("p1", "a1", "logged"), log("p2", "b1", "logged")];
    expect(deriveCursor(structure, done)).toEqual({ blockIdx: 0, itemIdx: 1, slotIdx: 1 });
  });

  it("returns null when every planned slot is resolved", () => {
    const structure: LiveStructure = { blocks: [single("b1", "p1", ["s1"])] };
    expect(deriveCursor(structure, [log("p1", "s1", "logged")])).toBeNull();
  });

  it("ignores extra sets when deciding what is next", () => {
    const structure: LiveStructure = { blocks: [single("b1", "p1", ["s1"])] };
    // An extra set is logged, but the planned slot is still outstanding.
    expect(deriveCursor(structure, [log("p1", null, "extra")])).toEqual({
      blockIdx: 0, itemIdx: 0, slotIdx: 0,
    });
  });
});

// ─── Counting ─────────────────────────────────────────────────────────────────

describe("supersetRoundCount", () => {
  it("is the longest exercise in the block, so ragged supersets still finish", () => {
    expect(supersetRoundCount(superset("b1", [item("p1", ["a1"]), item("p2", ["b1", "b2"])]))).toBe(2);
  });

  it("is 0 for a block with no items", () => {
    expect(supersetRoundCount({ id: "b1", type: "superset", items: [] })).toBe(0);
  });
});

describe("totalSlotCount", () => {
  it("sums planned slots across every block and item", () => {
    const structure: LiveStructure = {
      blocks: [
        single("b1", "p1", ["s1", "s2"]),
        superset("b2", [item("p2", ["a1", "a2"]), item("p3", ["b1"])]),
      ],
    };
    expect(totalSlotCount(structure)).toBe(5);
  });

  it("is 0 for an empty structure", () => {
    expect(totalSlotCount({ blocks: [] })).toBe(0);
  });
});

describe("countDoneSlots", () => {
  it("counts only slots that exist in the structure", () => {
    const structure: LiveStructure = { blocks: [single("b1", "p1", ["s1", "s2"])] };
    const logs = [
      log("p1", "s1", "logged"),
      log("p1", "s2", "skipped"),
      // A log for a slot that has since been deleted from the plan.
      log("p1", "gone", "logged"),
    ];
    expect(countDoneSlots(structure, logs)).toBe(2);
  });

  it("does not count extra sets towards planned progress", () => {
    const structure: LiveStructure = { blocks: [single("b1", "p1", ["s1"])] };
    expect(countDoneSlots(structure, [log("p1", null, "extra")])).toBe(0);
  });
});
