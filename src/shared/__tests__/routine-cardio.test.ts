import { describe, it, expect } from "vitest";
import { RoutineItemSchema } from "../routine";

const ID = "11111111-1111-4111-8111-111111111111";
const EX = "22222222-2222-4222-8222-222222222222";

const baseItem = {
  id: ID,
  exerciseId: EX,
  order: 0,
  setCount: 1,
  repMode: "uniform" as const,
  setTypeMode: "uniform" as const,
  uniformSetType: "normal" as const,
};

describe("RoutineItemSchema — planning cardio", () => {
  it("accepts a distance prescription with no reps", () => {
    const result = RoutineItemSchema.safeParse({ ...baseItem, distanceM: 5000 });
    expect(result.success).toBe(true);
  });

  it("accepts a duration prescription with no reps", () => {
    const result = RoutineItemSchema.safeParse({ ...baseItem, durationSec: 1800 });
    expect(result.success).toBe(true);
  });

  it("accepts a duration range with no reps", () => {
    const result = RoutineItemSchema.safeParse({
      ...baseItem,
      durationMinSec: 1200,
      durationMaxSec: 1800,
    });
    expect(result.success).toBe(true);
  });

  it("still requires reps when nothing else is prescribed", () => {
    const result = RoutineItemSchema.safeParse(baseItem);
    expect(result.success).toBe(false);
  });

  it("keeps accepting an ordinary strength prescription", () => {
    const result = RoutineItemSchema.safeParse({ ...baseItem, setCount: 3, uniformReps: 10 });
    expect(result.success).toBe(true);
  });

  it("rejects a negative distance", () => {
    const result = RoutineItemSchema.safeParse({ ...baseItem, distanceM: -1 });
    expect(result.success).toBe(false);
  });

  it("allows reps and distance together for a mixed exercise", () => {
    const result = RoutineItemSchema.safeParse({
      ...baseItem,
      uniformReps: 10,
      distanceM: 400,
    });
    expect(result.success).toBe(true);
  });
});
