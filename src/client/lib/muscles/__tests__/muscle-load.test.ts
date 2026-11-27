import { describe, expect, it } from "vitest";
import {
  MAPPED_MUSCLES,
  exerciseIntensities,
  sessionMuscleSets,
  setsToIntensity,
} from "../muscle-load";

const log = (exerciseId: string, over: Partial<{ status: string; setType: string }> = {}) => ({
  exerciseId,
  status: "logged",
  setType: "normal",
  ...over,
});

describe("exerciseIntensities", () => {
  it("shows primary muscles at full strength and secondary at half", () => {
    expect(
      exerciseIntensities({ primaryMuscles: ["quadriceps", "glutes"], secondaryMuscles: ["hamstrings"] }),
    ).toEqual({ quadriceps: 4, glutes: 4, hamstrings: 2 });
  });

  it("lets a primary listing win when a muscle is also secondary", () => {
    expect(exerciseIntensities({ primaryMuscles: ["chest"], secondaryMuscles: ["chest"] })).toEqual({ chest: 4 });
  });

  it("spreads full_body across every drawn muscle without overriding primaries", () => {
    const out = exerciseIntensities({ primaryMuscles: ["full_body", "back"], secondaryMuscles: [] });
    for (const m of MAPPED_MUSCLES) expect(out[m]).toBe(m === "back" ? 4 : 2);
  });

  it("ignores muscles the figure cannot draw", () => {
    expect(exerciseIntensities({ primaryMuscles: ["conditioning", "other"], secondaryMuscles: [] })).toEqual({});
  });
});

describe("sessionMuscleSets", () => {
  const exercises = new Map([
    ["bench", { primaryMuscles: ["chest" as const], secondaryMuscles: ["triceps" as const, "shoulders" as const] }],
    ["dips", { primaryMuscles: ["triceps" as const], secondaryMuscles: ["chest" as const] }],
  ]);

  it("credits a full set to primaries and half a set to secondaries", () => {
    const sets = sessionMuscleSets([log("bench"), log("bench"), log("dips")], exercises);
    expect(Object.fromEntries(sets)).toEqual({ chest: 2.5, triceps: 2, shoulders: 1 });
  });

  it("skips warmups and sets that were not logged", () => {
    const sets = sessionMuscleSets(
      [log("bench", { setType: "warmup" }), log("bench", { status: "skipped" }), log("bench")],
      exercises,
    );
    expect(sets.get("chest")).toBe(1);
  });

  it("skips sets for exercises it cannot find", () => {
    expect(sessionMuscleSets([log("deleted")], exercises).size).toBe(0);
  });
});

describe("setsToIntensity", () => {
  it.each([
    [0, 0],
    [0.5, 1],
    [2.5, 1],
    [3, 2],
    [5.5, 2],
    [6, 3],
    [8.5, 3],
    [9, 4],
    [20, 4],
  ])("%s sets → level %s", (sets, level) => {
    expect(setsToIntensity(sets)).toBe(level);
  });
});
