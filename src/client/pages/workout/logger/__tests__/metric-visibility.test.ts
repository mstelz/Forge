import { describe, it, expect } from "vitest";
import { metricFieldsFor } from "../metric-visibility";
import type { ExerciseType } from "../../../../../shared";

describe("metricFieldsFor", () => {
  it("gives a strength exercise weight and reps only", () => {
    expect(metricFieldsFor("strength")).toEqual({
      showWeightReps: true,
      showDurationDistance: false,
    });
  });

  it("gives a cardio exercise duration and distance only", () => {
    expect(metricFieldsFor("cardio")).toEqual({
      showWeightReps: false,
      showDurationDistance: true,
    });
  });

  it("gives a mixed exercise both", () => {
    expect(metricFieldsFor("mixed")).toEqual({
      showWeightReps: true,
      showDurationDistance: true,
    });
  });

  it("falls back to strength fields for an unrecognised type", () => {
    expect(metricFieldsFor(undefined)).toEqual({
      showWeightReps: true,
      showDurationDistance: false,
    });
  });

  // The point of retiring the "Show cardio" setting: no configuration could put
  // the logger in a state where a cardio exercise has no field to record it in.
  it("always offers a way to log every exercise type", () => {
    const types: ExerciseType[] = ["strength", "cardio", "mixed"];
    for (const type of types) {
      const { showWeightReps, showDurationDistance } = metricFieldsFor(type);
      expect(showWeightReps || showDurationDistance).toBe(true);
    }
  });

  it("never hides duration and distance from a cardio exercise", () => {
    expect(metricFieldsFor("cardio").showDurationDistance).toBe(true);
    expect(metricFieldsFor("mixed").showDurationDistance).toBe(true);
  });
});
