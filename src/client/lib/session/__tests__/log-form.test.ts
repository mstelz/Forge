import { describe, it, expect } from "vitest";
import {
  logFormReducer,
  initialLogFormState,
  type LogFormState,
} from "../log-form";

const base = (overrides: Partial<LogFormState> = {}): LogFormState => ({
  ...initialLogFormState,
  ...overrides,
});

describe("logFormReducer — weight", () => {
  it("parses input, clamping negatives to 0 and keeping the raw string", () => {
    expect(logFormReducer(base(), { type: "weightInput", value: "60" })).toMatchObject({ weightDisplay: 60, weightInputStr: "60" });
    expect(logFormReducer(base(), { type: "weightInput", value: "abc" })).toMatchObject({ weightDisplay: null, weightInputStr: "abc" });
    expect(logFormReducer(base(), { type: "weightInput", value: "-5" })).toMatchObject({ weightDisplay: 0, weightInputStr: "-5" });
  });

  it("adjusts by delta from null and clamps the decrease at 0, keeping display/str paired", () => {
    expect(logFormReducer(base(), { type: "adjustWeight", delta: 2.5 })).toMatchObject({ weightDisplay: 2.5, weightInputStr: "2.5" });
    expect(logFormReducer(base({ weightDisplay: 60 }), { type: "adjustWeight", delta: 2.5 })).toMatchObject({ weightDisplay: 62.5 });
    expect(logFormReducer(base({ weightDisplay: 1 }), { type: "adjustWeight", delta: -2.5 })).toMatchObject({ weightDisplay: 0, weightInputStr: "0" });
  });
});

describe("logFormReducer — reps", () => {
  it("parses input, clamping negatives to 0", () => {
    expect(logFormReducer(base(), { type: "repsInput", value: "5" })).toMatchObject({ reps: 5, repsInputStr: "5" });
    expect(logFormReducer(base(), { type: "repsInput", value: "x" })).toMatchObject({ reps: null, repsInputStr: "x" });
    expect(logFormReducer(base(), { type: "repsInput", value: "-3" })).toMatchObject({ reps: 0, repsInputStr: "-3" });
  });

  it("increments from null to 1 and decrements with a floor of 1", () => {
    expect(logFormReducer(base(), { type: "incrementReps" })).toMatchObject({ reps: 1, repsInputStr: "1" });
    expect(logFormReducer(base({ reps: 5 }), { type: "incrementReps" })).toMatchObject({ reps: 6 });
    expect(logFormReducer(base(), { type: "decrementReps" })).toMatchObject({ reps: 1 });
    expect(logFormReducer(base({ reps: 1 }), { type: "decrementReps" })).toMatchObject({ reps: 1 });
    expect(logFormReducer(base({ reps: 5 }), { type: "decrementReps" })).toMatchObject({ reps: 4 });
  });
});

describe("logFormReducer — rpe", () => {
  it("increments toward a ceiling of 10, defaulting from 5", () => {
    expect(logFormReducer(base(), { type: "incrementRpe" })).toMatchObject({ rpe: 5.5 });
    expect(logFormReducer(base({ rpe: 9.5 }), { type: "incrementRpe" })).toMatchObject({ rpe: 10 });
    expect(logFormReducer(base({ rpe: 10 }), { type: "incrementRpe" })).toMatchObject({ rpe: 10 });
  });

  it("decrements only when set, with a floor of 0", () => {
    expect(logFormReducer(base(), { type: "decrementRpe" })).toMatchObject({ rpe: null });
    expect(logFormReducer(base({ rpe: 5 }), { type: "decrementRpe" })).toMatchObject({ rpe: 4.5 });
    expect(logFormReducer(base({ rpe: 0.5 }), { type: "decrementRpe" })).toMatchObject({ rpe: 0 });
  });
});

// Duration is no longer a digit buffer; see duration-input.test.ts.

describe("logFormReducer — distance", () => {
  it("parses input and steps with 3-decimal rounding, clamped at 0", () => {
    expect(logFormReducer(base(), { type: "distanceInput", value: "5.5" })).toMatchObject({ distanceDisplay: 5.5, distanceInputStr: "5.5" });
    expect(logFormReducer(base(), { type: "distanceInput", value: "x" })).toMatchObject({ distanceDisplay: null });
    expect(logFormReducer(base(), { type: "adjustDistance", delta: 100 })).toMatchObject({ distanceDisplay: 100, distanceInputStr: "100" });
    expect(logFormReducer(base({ distanceDisplay: 1 }), { type: "adjustDistance", delta: 0.25 })).toMatchObject({ distanceDisplay: 1.25 });
    expect(logFormReducer(base({ distanceDisplay: 50 }), { type: "adjustDistance", delta: -100 })).toMatchObject({ distanceDisplay: 0 });
  });
});

describe("logFormReducer — setType / note", () => {
  it("sets type and note", () => {
    expect(logFormReducer(base(), { type: "setSetType", setType: "amrap" })).toMatchObject({ setType: "amrap" });
    expect(logFormReducer(base(), { type: "setNote", note: "felt heavy" })).toMatchObject({ note: "felt heavy" });
  });
});

describe("logFormReducer — prefill", () => {
  it("applies only provided keys and sets their paired companions", () => {
    const s = logFormReducer(base(), {
      type: "prefill",
      values: { weightDisplay: 62.5, reps: 5, durationSec: 90, distanceDisplay: 2.5, setType: "drop", note: "x" },
    });
    expect(s).toMatchObject({
      weightDisplay: 62.5, weightInputStr: "62.5",
      reps: 5, repsInputStr: "5",
      durationSec: 90, durationInputStr: "1:30",
      distanceDisplay: 2.5, distanceInputStr: "2.5",
      setType: "drop", note: "x",
    });
  });

  it("leaves unprovided fields untouched", () => {
    const start = base({ weightDisplay: 100, weightInputStr: "100" });
    const s = logFormReducer(start, { type: "prefill", values: { reps: 8 } });
    expect(s).toMatchObject({ weightDisplay: 100, weightInputStr: "100", reps: 8 });
  });
});

describe("logFormReducer — resetAfterLog", () => {
  it("clears note and rpe but keeps the carried metrics", () => {
    const start = base({ weightDisplay: 60, weightInputStr: "60", reps: 5, repsInputStr: "5", rpe: 8, note: "x" });
    const s = logFormReducer(start, { type: "resetAfterLog" });
    expect(s).toMatchObject({ weightDisplay: 60, reps: 5, rpe: null, note: "" });
  });
});
