import { describe, it, expect } from "vitest";
import { repsToClear, suggestNextTarget } from "../progression";

const BARBELL = 2.5;

describe("repsToClear", () => {
  it("uses the top of a rep range — clearing means clearing the range", () => {
    expect(repsToClear({ repsMin: 8, repsMax: 12 })).toBe(12);
  });

  it("uses a fixed prescription", () => {
    expect(repsToClear({ reps: 5 })).toBe(5);
  });

  it("falls back to the bottom of an open-ended range", () => {
    expect(repsToClear({ repsMin: 8 })).toBe(8);
  });

  it("has no answer when nothing is prescribed", () => {
    expect(repsToClear({})).toBeNull();
  });
});

describe("suggestNextTarget — progressing", () => {
  it("adds one increment when every working set cleared the reps", () => {
    const suggestion = suggestNextTarget(
      [{ weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 }],
      { reps: 5 },
      BARBELL,
    );
    expect(suggestion).toMatchObject({ kind: "increase", weightKg: 102.5, reps: 5 });
    expect(suggestion?.reason).toContain("cleared");
  });

  it("counts exceeding the target as clearing it", () => {
    const suggestion = suggestNextTarget([{ weightKg: 100, reps: 7 }], { reps: 5 }, BARBELL);
    expect(suggestion?.kind).toBe("increase");
  });

  it("requires the top of a rep range, not the bottom", () => {
    // 10 reps of an 8–12 range is not done with 8–12.
    const suggestion = suggestNextTarget(
      [{ weightKg: 60, reps: 10 }],
      { repsMin: 8, repsMax: 12 },
      BARBELL,
    );
    expect(suggestion?.kind).toBe("repeat");
  });

  it("progresses once the top of the range is reached", () => {
    const suggestion = suggestNextTarget(
      [{ weightKg: 60, reps: 12 }],
      { repsMin: 8, repsMax: 12 },
      BARBELL,
    );
    expect(suggestion).toMatchObject({ kind: "increase", weightKg: 62.5 });
  });

  it("suggests a weight the equipment can actually be set to", () => {
    // A machine stack moving in 5s must not be told to load 102.5.
    const suggestion = suggestNextTarget([{ weightKg: 100, reps: 10 }], { reps: 10 }, 5);
    expect(suggestion?.weightKg).toBe(105);
  });
});

describe("suggestNextTarget — holding", () => {
  it("repeats when any working set fell short", () => {
    const suggestion = suggestNextTarget(
      [{ weightKg: 100, reps: 5 }, { weightKg: 100, reps: 4 }],
      { reps: 5 },
      BARBELL,
    );
    expect(suggestion).toMatchObject({ kind: "repeat", weightKg: 100 });
    expect(suggestion?.reason).toContain("fell short");
  });

  it("judges the working weight, ignoring lighter back-off sets", () => {
    // The back-off set is not a failed attempt at the top weight.
    const suggestion = suggestNextTarget(
      [{ weightKg: 100, reps: 5 }, { weightKg: 70, reps: 3 }],
      { reps: 5 },
      BARBELL,
    );
    expect(suggestion).toMatchObject({ kind: "increase", weightKg: 102.5 });
  });

  it("repeats last time's weight and reps when the plan prescribes no reps", () => {
    // A freeform exercise has no prescription, and "same as last time" has to
    // carry the reps too or the field arrives empty.
    const suggestion = suggestNextTarget([{ weightKg: 100, reps: 8 }], {}, BARBELL);
    expect(suggestion).toMatchObject({ kind: "repeat", weightKg: 100, reps: 8 });
  });

  it("treats a set logged with no reps as not cleared", () => {
    const suggestion = suggestNextTarget([{ weightKg: 100, reps: null }], { reps: 5 }, BARBELL);
    expect(suggestion?.kind).toBe("repeat");
  });
});

describe("suggestNextTarget — staying quiet", () => {
  it("says nothing where load is not the variable", () => {
    // Bodyweight and cardio arrive here with a null increment.
    expect(suggestNextTarget([{ weightKg: 100, reps: 5 }], { reps: 5 }, null)).toBeNull();
  });

  it("says nothing without history to reason from", () => {
    expect(suggestNextTarget([], { reps: 5 }, BARBELL)).toBeNull();
  });

  it("says nothing when last time carried no load", () => {
    expect(suggestNextTarget([{ weightKg: null, reps: 10 }], { reps: 10 }, BARBELL)).toBeNull();
    expect(suggestNextTarget([{ weightKg: 0, reps: 10 }], { reps: 10 }, BARBELL)).toBeNull();
  });
});
