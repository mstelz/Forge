import { describe, it, expect } from "vitest";
import { defaultItem } from "../state";
import { RoutineItemSchema } from "../../../../../shared/routine";

const EX = "22222222-2222-4222-8222-222222222222";

describe("defaultItem", () => {
  it("gives a cardio exercise one set and no rep target", () => {
    // The bug: an outdoor run arrived prescribed as 3 sets of 10 reps because
    // defaultItem only ever received an exercise id, never its type.
    const item = defaultItem(EX, "cardio");
    expect(item.setCount).toBe(1);
    expect(item.uniformReps).toBeUndefined();
  });

  it("prescribes a duration for cardio so the item is valid without reps", () => {
    const item = defaultItem(EX, "cardio");
    expect(item.durationSec).toBeGreaterThan(0);
    const result = RoutineItemSchema.safeParse({ ...item, order: 0 });
    expect(result.success).toBe(true);
  });

  it("keeps 3 x 10 for a strength exercise", () => {
    const item = defaultItem(EX, "strength");
    expect(item.setCount).toBe(3);
    expect(item.uniformReps).toBe(10);
  });

  it("treats a mixed exercise as strength-shaped", () => {
    const item = defaultItem(EX, "mixed");
    expect(item.setCount).toBe(3);
    expect(item.uniformReps).toBe(10);
  });

  it("defaults to strength when no type is given", () => {
    const item = defaultItem(EX);
    expect(item.setCount).toBe(3);
    expect(item.uniformReps).toBe(10);
  });
});
