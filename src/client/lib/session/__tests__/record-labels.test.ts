import { describe, it, expect } from "vitest";
import { describeRecord, headlineRecord, recordBadge } from "../record-labels";
import type { ExerciseRecord } from "../records";

function record(overrides: Partial<ExerciseRecord> = {}): ExerciseRecord {
  return {
    kind: "heaviestWeight",
    exerciseId: "ex-1",
    logId: "log-1",
    value: 110,
    previous: 100,
    ...overrides,
  };
}

const kg = { weightUnit: "kg", distanceUnit: "km" } as const;
const lb = { weightUnit: "lb", distanceUnit: "mi" } as const;

describe("describeRecord", () => {
  it("names the record and what it beat", () => {
    expect(describeRecord(record(), kg)).toBe("Heaviest set: 110 kg, up from 100 kg");
  });

  it("renders in the user's weight unit", () => {
    // The record is stored in kg; a lb user must not be shown kilos.
    const described = describeRecord(record(), lb);
    expect(described).toContain("lb");
    expect(described).not.toContain("kg");
  });

  it("names an estimated 1RM as an estimate", () => {
    expect(describeRecord(record({ kind: "estimated1RM", value: 128, previous: 116 }), kg))
      .toContain("Best estimated 1RM");
  });

  it("says a pace came down rather than up", () => {
    // 5:00/km beating 5:30/km is an improvement, and "up from" would read as a loss.
    const described = describeRecord(
      record({ kind: "fastestPace", value: 0.3, previous: 0.33 }),
      kg,
    );
    expect(described).toContain("down from");
    expect(described).not.toContain("up from");
  });

  it("renders pace per kilometre, not per metre", () => {
    // 0.3 s/m is 5:00/km — per-metre would be an unreadable 0:00.
    expect(describeRecord(record({ kind: "fastestPace", value: 0.3, previous: 0.33 }), kg))
      .toContain("5:00/km");
  });

  it("renders pace per mile for a miles user", () => {
    expect(describeRecord(record({ kind: "fastestPace", value: 0.3, previous: 0.33 }), lb))
      .toContain("/mi");
  });

  it("renders a duration record as a clock time", () => {
    expect(describeRecord(record({ kind: "longestDuration", value: 3600, previous: 1800 }), kg))
      .toBe("Longest time: 1:00:00, up from 30:00");
  });
});

describe("recordBadge", () => {
  it("is short enough to sit on a set row", () => {
    for (const kind of ["estimated1RM", "heaviestWeight", "longestDistance", "longestDuration", "fastestPace"] as const) {
      expect(recordBadge(record({ kind })).length).toBeLessThanOrEqual(12);
    }
  });
});

describe("headlineRecord", () => {
  it("leads with the heaviest set when a set beats several records at once", () => {
    const both = [record({ kind: "estimated1RM" }), record({ kind: "heaviestWeight" })];
    expect(headlineRecord(both)?.kind).toBe("heaviestWeight");
  });

  it("prefers pace over the cardio distance and duration records", () => {
    const all = [
      record({ kind: "longestDuration" }),
      record({ kind: "longestDistance" }),
      record({ kind: "fastestPace" }),
    ];
    expect(headlineRecord(all)?.kind).toBe("fastestPace");
  });

  it("has nothing to announce for an empty list", () => {
    expect(headlineRecord([])).toBeNull();
  });
});
