import { describe, it, expect } from "vitest";
import { computeRestBackfill, startRestTimer, validateMetrics } from "../log-set-builders";
import type { Session, SessionSetLog } from "../../../../../shared";

function log(overrides: Partial<SessionSetLog> = {}): SessionSetLog {
  return {
    id: "log-1",
    sessionId: "sess-1",
    performedExerciseId: "p1",
    exerciseId: "ex-1",
    sessionItemId: "si-1",
    plannedSetId: "s1",
    order: 0,
    reps: 5,
    weightKg: 100,
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
    ...overrides,
  };
}

const session = {
  id: "sess-1",
  restTimer: null,
  updatedAt: 1,
} as unknown as Session;

describe("validateMetrics", () => {
  it("asks a strength exercise for reps or weight", () => {
    expect(
      validateMetrics({
        showWeightReps: true,
        showDurationDistance: false,
        hasStrengthMetric: false,
        hasCardioMetric: false,
      }),
    ).toBe("Enter reps or weight before logging.");
  });

  it("accepts a strength set once either reps or weight is present", () => {
    expect(
      validateMetrics({
        showWeightReps: true,
        showDurationDistance: false,
        hasStrengthMetric: true,
        hasCardioMetric: false,
      }),
    ).toBeNull();
  });

  it("asks a cardio exercise for duration or distance", () => {
    expect(
      validateMetrics({
        showWeightReps: false,
        showDurationDistance: true,
        hasStrengthMetric: false,
        hasCardioMetric: false,
      }),
    ).toBe("Enter duration or distance before logging.");
  });

  it("lets a mixed exercise satisfy either side", () => {
    const mixed = { showWeightReps: true, showDurationDistance: true };
    expect(validateMetrics({ ...mixed, hasStrengthMetric: true, hasCardioMetric: false })).toBeNull();
    expect(validateMetrics({ ...mixed, hasStrengthMetric: false, hasCardioMetric: true })).toBeNull();
    expect(validateMetrics({ ...mixed, hasStrengthMetric: false, hasCardioMetric: false })).toBe(
      "Enter at least one metric before logging.",
    );
  });

  it("does not block when the exercise shows no metric fields at all", () => {
    expect(
      validateMetrics({
        showWeightReps: false,
        showDurationDistance: false,
        hasStrengthMetric: false,
        hasCardioMetric: false,
      }),
    ).toBeNull();
  });
});

describe("computeRestBackfill", () => {
  it("records the gap since the previous set", () => {
    const prev = log({ loggedAt: 1_000_000 });
    const result = computeRestBackfill([prev], 1_000_000 + 90_000);
    expect(result?.restAfterSec).toBe(90);
    expect(result?.id).toBe(prev.id);
  });

  it("uses the most recent logged set, not the first in the list", () => {
    const older = log({ id: "older", loggedAt: 1_000_000 });
    const newer = log({ id: "newer", loggedAt: 1_100_000 });
    const result = computeRestBackfill([older, newer], 1_100_000 + 30_000);
    expect(result?.id).toBe("newer");
    expect(result?.restAfterSec).toBe(30);
  });

  it("returns null when there is no previous set to back-fill", () => {
    expect(computeRestBackfill([], 1_000)).toBeNull();
  });

  it("leaves an already-recorded rest alone", () => {
    expect(computeRestBackfill([log({ restAfterSec: 60 })], 2_000_000)).toBeNull();
  });

  it("ignores skipped and extra sets when finding the previous set", () => {
    const skipped = log({ id: "skipped", status: "skipped", loggedAt: 2_000_000 });
    const extra = log({ id: "extra", status: "extra", loggedAt: 2_000_000 });
    const logged = log({ id: "logged", loggedAt: 1_000_000 });
    const result = computeRestBackfill([skipped, extra, logged], 1_000_000 + 45_000);
    expect(result?.id).toBe("logged");
    expect(result?.restAfterSec).toBe(45);
  });

  it("caps a walked-away-from set at an hour rather than recording days of rest", () => {
    const result = computeRestBackfill([log({ loggedAt: 0 })], 86_400_000);
    expect(result?.restAfterSec).toBe(3600);
  });

  it("never records negative rest if clocks disagree", () => {
    const result = computeRestBackfill([log({ loggedAt: 5_000 })], 1_000);
    expect(result?.restAfterSec).toBe(0);
  });

  it("does not mutate the set it back-fills", () => {
    const prev = log({ loggedAt: 1_000_000 });
    computeRestBackfill([prev], 1_030_000);
    expect(prev.restAfterSec).toBeNull();
  });
});

describe("startRestTimer", () => {
  it("writes a running timer of the given length onto the session", () => {
    const updated = startRestTimer(session, 120, 5_000);
    expect(JSON.parse(updated.restTimer as string)).toEqual({
      status: "running",
      startedAt: 5_000,
      durationSec: 120,
      pausedAt: null,
      remainingSec: 120,
    });
    expect(updated.updatedAt).toBe(5_000);
  });

  it("does not mutate the session it was given", () => {
    startRestTimer(session, 120, 5_000);
    expect(session.restTimer).toBeNull();
  });
});
