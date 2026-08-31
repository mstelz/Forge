import { describe, it, expect } from "vitest";
import { buildSeries, availableMetrics } from "../series";
import type { SessionSetLog } from "../../../../shared/session-log";

const S1 = "11111111-1111-4111-8111-000000000001";
const S2 = "11111111-1111-4111-8111-000000000002";
const S3 = "11111111-1111-4111-8111-000000000003";

let logCounter = 0;
function log(over: Partial<SessionSetLog> = {}): SessionSetLog {
  logCounter += 1;
  return {
    id: `22222222-2222-4222-8222-${String(logCounter).padStart(12, "0")}`,
    sessionId: S1,
    performedExerciseId: "33333333-3333-4333-8333-333333333333",
    exerciseId: "44444444-4444-4444-8444-444444444444",
    sessionItemId: "55555555-5555-4555-8555-555555555555",
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

describe("buildSeries — estimated 1RM", () => {
  it("gives one point per session, taking the best Epley estimate in that session", () => {
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: 100, weightKg: 100, reps: 5 }),
        log({ sessionId: S1, loggedAt: 200, weightKg: 90, reps: 5 }),
      ],
      "e1rm",
    );

    expect(points).toHaveLength(1);
    // Epley: 100 * (1 + 5/30) = 116.66…
    expect(points[0]!.value).toBeCloseTo(116.667, 2);
  });

  it("treats a heavy single as its own 1RM, agreeing with the Est 1RM tile beside it", () => {
    // The shared lib/session/epley helper has no reps===1 guard, so it would
    // report 103.3 for a 100kg single. The stat tile on this very screen says
    // 100. A chart that disagrees with the number printed above it is a bug.
    const points = buildSeries(
      [log({ sessionId: S1, loggedAt: 100, weightKg: 100, reps: 1 })],
      "e1rm",
    );

    expect(points[0]!.value).toBe(100);
  });

  it("orders points by when the session started, oldest first", () => {
    const points = buildSeries(
      [
        log({ sessionId: S2, loggedAt: 5_000, weightKg: 110, reps: 1 }),
        log({ sessionId: S1, loggedAt: 1_000, weightKg: 100, reps: 1 }),
        log({ sessionId: S1, loggedAt: 1_500, weightKg: 105, reps: 1 }),
      ],
      "e1rm",
    );

    expect(points.map((p) => p.value)).toEqual([105, 110]);
    expect(points[0]!.at).toBe(1_000);
  });

  it("keeps two sessions on the same day as two separate points", () => {
    const morning = Date.UTC(2026, 0, 5, 7, 0, 0);
    const evening = Date.UTC(2026, 0, 5, 19, 0, 0);
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: morning, weightKg: 100, reps: 1 }),
        log({ sessionId: S2, loggedAt: evening, weightKg: 105, reps: 1 }),
      ],
      "e1rm",
    );

    expect(points).toHaveLength(2);
    expect(points.map((p) => p.value)).toEqual([100, 105]);
  });

  it("ignores skipped sets and warm-ups", () => {
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: 100, weightKg: 200, reps: 1, status: "skipped" }),
        log({ sessionId: S1, loggedAt: 200, weightKg: 180, reps: 1, setType: "warmup" }),
        log({ sessionId: S1, loggedAt: 300, weightKg: 100, reps: 1 }),
      ],
      "e1rm",
    );

    expect(points.map((p) => p.value)).toEqual([100]);
  });

  it("drops sessions with no usable strength sets rather than plotting a zero", () => {
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: 100, durationSec: 600 }),
        log({ sessionId: S2, loggedAt: 200, weightKg: 100, reps: 1 }),
      ],
      "e1rm",
    );

    expect(points).toHaveLength(1);
    expect(points[0]!.sessionId).toBe(S2);
  });

  it("counts unplanned extra sets — the logger leaves those at status 'extra'", () => {
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: 100, weightKg: 100, reps: 1 }),
        log({ sessionId: S1, loggedAt: 200, weightKg: 120, reps: 1, status: "extra" }),
      ],
      "e1rm",
    );

    expect(points.map((p) => p.value)).toEqual([120]);
  });

  it("returns nothing for an exercise that has never been logged", () => {
    expect(buildSeries([], "e1rm")).toEqual([]);
  });
});

describe("buildSeries — top set and volume", () => {
  it("takes the heaviest working weight in the session for topSet", () => {
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: 100, weightKg: 100, reps: 5 }),
        log({ sessionId: S1, loggedAt: 200, weightKg: 120, reps: 1 }),
      ],
      "topSet",
    );

    expect(points.map((p) => p.value)).toEqual([120]);
  });

  it("sums weight times reps across the session for volume", () => {
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: 100, weightKg: 100, reps: 5 }),
        log({ sessionId: S1, loggedAt: 200, weightKg: 50, reps: 10 }),
      ],
      "volume",
    );

    expect(points.map((p) => p.value)).toEqual([1000]);
  });
});

describe("buildSeries — cardio", () => {
  it("sums distance across the session", () => {
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: 100, distanceM: 3000, durationSec: 900 }),
        log({ sessionId: S1, loggedAt: 200, distanceM: 2000, durationSec: 600 }),
      ],
      "distance",
    );

    expect(points.map((p) => p.value)).toEqual([5000]);
  });

  it("expresses pace as seconds per metre over the whole session", () => {
    const points = buildSeries(
      [log({ sessionId: S1, loggedAt: 100, distanceM: 5000, durationSec: 1500 })],
      "pace",
    );

    // 1500s over 5000m = 0.3 s/m = 5:00 per km
    expect(points[0]!.value).toBeCloseTo(0.3, 6);
  });

  it("skips a session for pace when it has distance but no duration", () => {
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: 100, distanceM: 5000 }),
        log({ sessionId: S2, loggedAt: 200, distanceM: 5000, durationSec: 1500 }),
      ],
      "pace",
    );

    expect(points).toHaveLength(1);
    expect(points[0]!.sessionId).toBe(S2);
  });

  it("sums duration across the session", () => {
    const points = buildSeries(
      [
        log({ sessionId: S1, loggedAt: 100, durationSec: 600 }),
        log({ sessionId: S1, loggedAt: 200, durationSec: 300 }),
      ],
      "duration",
    );

    expect(points.map((p) => p.value)).toEqual([900]);
  });

  it("counts cardio sets logged as extra, which are still work that happened", () => {
    const points = buildSeries(
      [log({ sessionId: S3, loggedAt: 100, distanceM: 1000, status: "extra" })],
      "distance",
    );

    expect(points.map((p) => p.value)).toEqual([1000]);
  });
});

describe("availableMetrics", () => {
  const barbellSets = [
    log({ sessionId: S1, loggedAt: 100, weightKg: 100, reps: 5 }),
    log({ sessionId: S2, loggedAt: 200, weightKg: 105, reps: 5 }),
  ];
  const run = [
    log({ sessionId: S1, loggedAt: 100, distanceM: 5000, durationSec: 1500 }),
    log({ sessionId: S2, loggedAt: 200, distanceM: 5000, durationSec: 1450 }),
  ];

  it("leads a strength exercise with estimated 1RM", () => {
    expect(availableMetrics(barbellSets, "strength")).toEqual(["e1rm", "topSet", "volume"]);
  });

  it("leads a cardio exercise with pace, never a strength series", () => {
    const metrics = availableMetrics(run, "cardio");

    expect(metrics[0]).toBe("pace");
    expect(metrics).not.toContain("e1rm");
    expect(metrics).not.toContain("topSet");
  });

  it("offers distance alone for a run that was never timed", () => {
    const untimed = [
      log({ sessionId: S1, loggedAt: 100, distanceM: 5000 }),
      log({ sessionId: S2, loggedAt: 200, distanceM: 6000 }),
    ];

    expect(availableMetrics(untimed, "cardio")).toEqual(["distance"]);
  });

  it("falls through to cardio series for a mixed exercise only ever logged as a run", () => {
    expect(availableMetrics(run, "mixed")).toEqual(["pace", "distance", "duration"]);
  });

  it("offers nothing at all when the exercise has never been logged", () => {
    expect(availableMetrics([], "strength")).toEqual([]);
  });

  it("offers nothing when every set was skipped", () => {
    const skipped = [
      log({ sessionId: S1, loggedAt: 100, weightKg: 100, reps: 5, status: "skipped" }),
    ];

    expect(availableMetrics(skipped, "strength")).toEqual([]);
  });
});
