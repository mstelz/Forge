import { describe, it, expect } from "vitest";
import { summarizeLastTime } from "../last-time";
import type { SessionSetLog } from "../../../../shared/session-log";

const CURRENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRIOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function log(over: Partial<SessionSetLog> = {}): SessionSetLog {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sessionId: PRIOR,
    performedExerciseId: "22222222-2222-4222-8222-222222222222",
    exerciseId: "33333333-3333-4333-8333-333333333333",
    sessionItemId: "44444444-4444-4444-8444-444444444444",
    plannedSetId: null,
    order: 0,
    reps: null,
    weightKg: null,
    rpe: null,
    durationSec: null,
    distanceM: null,
    notes: null,
    setType: "normal",
    status: "logged",
    loggedAt: 1_000_000,
    restAfterSec: null,
    enteredWeight: null,
    enteredWeightUnit: null,
    enteredDistance: null,
    enteredDistanceUnit: null,
    ...over,
  };
}

const opts = { weightUnit: "kg" as const, distanceUnit: "km" as const };

describe("summarizeLastTime", () => {
  it("summarizes a strength set as weight x reps", () => {
    const result = summarizeLastTime(
      [log({ weightKg: 60, reps: 5 })],
      CURRENT,
      opts,
    );
    expect(result).toContain("60");
    expect(result).toContain("5");
  });

  it("summarizes a duration-only set, which used to return nothing", () => {
    // The bug: the summary only spoke weight and reps, so logging a run never
    // showed the previous run.
    const result = summarizeLastTime(
      [log({ durationSec: 1830 })],
      CURRENT,
      opts,
    );
    expect(result).toContain("30:30");
  });

  it("summarizes a distance-only set", () => {
    const result = summarizeLastTime([log({ distanceM: 5000 })], CURRENT, opts);
    expect(result).toContain("5");
    expect(result).toContain("km");
  });

  it("summarizes duration and distance together", () => {
    const result = summarizeLastTime(
      [log({ durationSec: 1830, distanceM: 5000 })],
      CURRENT,
      opts,
    );
    expect(result).toContain("30:30");
    expect(result).toContain("km");
  });

  it("ignores logs from the session being edited", () => {
    const result = summarizeLastTime(
      [log({ sessionId: CURRENT, weightKg: 60, reps: 5 })],
      CURRENT,
      opts,
    );
    expect(result).toBe(null);
  });

  it("ignores skipped sets", () => {
    const result = summarizeLastTime(
      [log({ status: "skipped", weightKg: 60, reps: 5 })],
      CURRENT,
      opts,
    );
    expect(result).toBe(null);
  });

  it("groups by session rather than by a time window", () => {
    // Two different sessions logged within four hours must not be merged.
    const result = summarizeLastTime(
      [
        log({ id: "1", sessionId: OTHER, reps: 3, weightKg: 100, loggedAt: 1_000 }),
        log({ id: "2", sessionId: PRIOR, reps: 8, weightKg: 50, loggedAt: 2_000 }),
      ],
      CURRENT,
      opts,
    );
    expect(result).toContain("8");
    expect(result).not.toContain("3,");
  });

  it("lists every set from the most recent session", () => {
    const result = summarizeLastTime(
      [
        log({ id: "1", order: 0, reps: 8, weightKg: 50, loggedAt: 1_000 }),
        log({ id: "2", order: 1, reps: 6, weightKg: 50, loggedAt: 2_000 }),
      ],
      CURRENT,
      opts,
    );
    expect(result).toContain("8, 6");
  });

  it("returns null when there is no prior log at all", () => {
    expect(summarizeLastTime([], CURRENT, opts)).toBe(null);
  });
});
