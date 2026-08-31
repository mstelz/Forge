import { describe, it, expect } from "vitest";
import { logFormReducer, initialLogFormState, type LogFormState } from "../log-form";

const base = (over: Partial<LogFormState> = {}): LogFormState => ({
  ...initialLogFormState,
  ...over,
});

describe("logFormReducer — durationInput", () => {
  it("takes the field's whole value, so typing over a selection replaces it", () => {
    // The bug: duration was an append-only digit buffer that ignored the
    // input's own value, so select-all + "9" over "45:00" gave "4:50:09".
    const typed = logFormReducer(base(), { type: "durationInput", value: "45:00" });
    expect(typed).toMatchObject({ durationInputStr: "45:00", durationSec: 2700 });

    const replaced = logFormReducer(typed, { type: "durationInput", value: "9" });
    expect(replaced).toMatchObject({ durationInputStr: "9", durationSec: 9 });
  });

  it("keeps the raw string while it is not yet parseable", () => {
    const s = logFormReducer(base(), { type: "durationInput", value: "12:" });
    expect(s.durationInputStr).toBe("12:");
    expect(s.durationSec).toBe(null);
  });

  it("clears the duration when the field is emptied", () => {
    const s = logFormReducer(
      base({ durationInputStr: "5:00", durationSec: 300 }),
      { type: "durationInput", value: "" },
    );
    expect(s).toMatchObject({ durationInputStr: "", durationSec: null });
  });

  it("accepts a run longer than an hour", () => {
    const s = logFormReducer(base(), { type: "durationInput", value: "1:12:30" });
    expect(s.durationSec).toBe(4350);
  });
});

describe("logFormReducer — duration steppers", () => {
  it("keeps the display string in step with the seconds", () => {
    const s = logFormReducer(base(), { type: "incrementDuration" });
    expect(s).toMatchObject({ durationSec: 30, durationInputStr: "0:30" });

    const s2 = logFormReducer(s, { type: "incrementDuration" });
    expect(s2).toMatchObject({ durationSec: 60, durationInputStr: "1:00" });
  });

  it("clears back to empty when decremented to zero", () => {
    const s = logFormReducer(base({ durationSec: 30, durationInputStr: "0:30" }), {
      type: "decrementDuration",
    });
    expect(s).toMatchObject({ durationSec: null, durationInputStr: "" });
  });

  it("steps up from a typed value", () => {
    const typed = logFormReducer(base(), { type: "durationInput", value: "2:00" });
    const stepped = logFormReducer(typed, { type: "incrementDuration" });
    expect(stepped).toMatchObject({ durationSec: 150, durationInputStr: "2:30" });
  });
});

describe("logFormReducer — normalizeDuration", () => {
  it("tidies a bare number into m:ss on blur", () => {
    const typed = logFormReducer(base(), { type: "durationInput", value: "90" });
    const blurred = logFormReducer(typed, { type: "normalizeDuration" });
    expect(blurred).toMatchObject({ durationSec: 90, durationInputStr: "1:30" });
  });

  it("restores the last good value when the field was left unparseable", () => {
    const typed = logFormReducer(base(), { type: "durationInput", value: "5:00" });
    const broken = logFormReducer(typed, { type: "durationInput", value: "5:0x" });
    expect(broken.durationSec).toBe(300);

    const blurred = logFormReducer(broken, { type: "normalizeDuration" });
    expect(blurred).toMatchObject({ durationSec: 300, durationInputStr: "5:00" });
  });

  it("leaves an intentionally emptied field empty", () => {
    const typed = logFormReducer(base(), { type: "durationInput", value: "" });
    const blurred = logFormReducer(typed, { type: "normalizeDuration" });
    expect(blurred).toMatchObject({ durationSec: null, durationInputStr: "" });
  });
});

describe("logFormReducer — duration prefill", () => {
  it("populates both the seconds and the display string", () => {
    const s = logFormReducer(base(), {
      type: "prefill",
      values: { durationSec: 4350 },
    });
    expect(s).toMatchObject({ durationSec: 4350, durationInputStr: "1:12:30" });
  });
});
