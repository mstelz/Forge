import { describe, it, expect } from "vitest";
import { selectLastSessionSets } from "../prior-values";
import type { SessionSetLog } from "../../../../shared";

let seq = 0;
function log(overrides: Partial<SessionSetLog> = {}): SessionSetLog {
  seq += 1;
  return {
    id: `log-${seq}`,
    sessionId: "sess-old",
    performedExerciseId: "p1",
    exerciseId: "ex-1",
    sessionItemId: "si-1",
    plannedSetId: `s${seq}`,
    order: seq,
    reps: 5,
    weightKg: 100,
    rpe: null,
    durationSec: null,
    distanceM: null,
    notes: null,
    setType: "normal",
    status: "logged",
    loggedAt: seq * 1000,
    restAfterSec: null,
    enteredWeight: null,
    enteredWeightUnit: null,
    enteredDistance: null,
    enteredDistanceUnit: null,
    ...overrides,
  };
}

describe("selectLastSessionSets", () => {
  it("returns every set of the most recent session, in the order performed", () => {
    const sets = selectLastSessionSets(
      [
        log({ sessionId: "older", weightKg: 90, loggedAt: 100 }),
        log({ sessionId: "recent", weightKg: 100, reps: 5, loggedAt: 300 }),
        log({ sessionId: "recent", weightKg: 100, reps: 4, loggedAt: 400 }),
      ],
      null,
    );
    expect(sets).toEqual([
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 4 },
    ]);
  });

  it("ignores the session currently being logged", () => {
    // Sets logged minutes ago must not become the history judging the next set.
    const sets = selectLastSessionSets(
      [
        log({ sessionId: "previous", weightKg: 90, loggedAt: 100 }),
        log({ sessionId: "current", weightKg: 100, loggedAt: 900 }),
      ],
      "current",
    );
    expect(sets).toEqual([{ weightKg: 90, reps: 5 }]);
  });

  it("excludes warmups, so progression is not judged off a light set", () => {
    const sets = selectLastSessionSets(
      [
        log({ sessionId: "recent", weightKg: 40, setType: "warmup", loggedAt: 100 }),
        log({ sessionId: "recent", weightKg: 100, loggedAt: 200 }),
      ],
      null,
    );
    expect(sets).toEqual([{ weightKg: 100, reps: 5 }]);
  });

  it("includes extra sets — they are real work", () => {
    const sets = selectLastSessionSets(
      [log({ sessionId: "recent", weightKg: 100, status: "extra", loggedAt: 200 })],
      null,
    );
    expect(sets).toHaveLength(1);
  });

  it("ignores skipped sets", () => {
    const sets = selectLastSessionSets(
      [
        log({ sessionId: "recent", weightKg: 100, loggedAt: 200 }),
        log({ sessionId: "recent", weightKg: null, status: "skipped", loggedAt: 300 }),
      ],
      null,
    );
    expect(sets).toEqual([{ weightKg: 100, reps: 5 }]);
  });

  it("has nothing to say with no history", () => {
    expect(selectLastSessionSets([], null)).toEqual([]);
  });

  it("has nothing to say when the only history is the current session", () => {
    expect(selectLastSessionSets([log({ sessionId: "current" })], "current")).toEqual([]);
  });
});
