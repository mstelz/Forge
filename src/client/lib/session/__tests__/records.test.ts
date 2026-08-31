import { describe, it, expect } from "vitest";
import {
  MAX_EPLEY_REPS,
  countSessionRecords,
  recordsByLogId,
} from "../records";
import type { SessionSetLog } from "../../../../shared";

let seq = 0;
function log(overrides: Partial<SessionSetLog> = {}): SessionSetLog {
  seq += 1;
  return {
    id: `log-${seq}`,
    sessionId: "sess-1",
    performedExerciseId: "p1",
    exerciseId: "ex-1",
    sessionItemId: "si-1",
    plannedSetId: `s${seq}`,
    order: seq,
    reps: null,
    weightKg: null,
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

/** Every record kind set by a chronological run of logs, flattened. */
function kindsFor(logs: SessionSetLog[], logId: string): string[] {
  return (recordsByLogId(logs).get(logId) ?? []).map((r) => r.kind).sort();
}

describe("recordsByLogId — a baseline is required", () => {
  it("does not call the first-ever set of an exercise a record", () => {
    const first = log({ weightKg: 100, reps: 5 });
    expect(recordsByLogId([first]).size).toBe(0);
  });

  it("starts recognising records from the second set onward", () => {
    const first = log({ weightKg: 100, reps: 5 });
    const better = log({ weightKg: 110, reps: 5 });
    const records = recordsByLogId([first, better]);
    expect(records.has(first.id)).toBe(false);
    expect(kindsFor([first, better], better.id)).toEqual(["estimated1RM", "heaviestWeight"]);
  });

  it("does not award a record for merely equalling the previous best", () => {
    const first = log({ weightKg: 100, reps: 5 });
    const same = log({ weightKg: 100, reps: 5 });
    expect(recordsByLogId([first, same]).has(same.id)).toBe(false);
  });
});

describe("recordsByLogId — warmups", () => {
  it("never lets a warmup set a record", () => {
    const first = log({ weightKg: 100, reps: 5 });
    const heavyWarmup = log({ weightKg: 200, reps: 5, setType: "warmup" });
    expect(recordsByLogId([first, heavyWarmup]).has(heavyWarmup.id)).toBe(false);
  });

  it("does not let a warmup raise the bar for later real sets", () => {
    const warmup = log({ weightKg: 500, reps: 5, setType: "warmup" });
    const first = log({ weightKg: 100, reps: 5 });
    const better = log({ weightKg: 110, reps: 5 });
    // The absurd warmup must not become the baseline that hides a genuine record.
    expect(kindsFor([warmup, first, better], better.id)).toContain("heaviestWeight");
  });

  it("finds nothing for an exercise that has only ever been warmed up", () => {
    const warmupOnly = [
      log({ weightKg: 60, reps: 10, setType: "warmup" }),
      log({ weightKg: 70, reps: 10, setType: "warmup" }),
    ];
    expect(recordsByLogId(warmupOnly).size).toBe(0);
  });

  it("ignores sets that were skipped rather than performed", () => {
    const first = log({ weightKg: 100, reps: 5 });
    const skipped = log({ weightKg: 300, reps: 5, status: "skipped" });
    expect(recordsByLogId([first, skipped]).has(skipped.id)).toBe(false);
  });

  it("counts an extra set added mid-workout — it is real work", () => {
    // ADD SET stores status "extra", but a bonus heavy single is exactly the
    // kind of set that sets a record.
    const first = log({ weightKg: 100, reps: 5 });
    const bonus = log({ weightKg: 120, reps: 5, status: "extra" });
    expect(kindsFor([first, bonus], bonus.id)).toContain("heaviestWeight");
  });

  it("lets an extra set become the baseline for later sets", () => {
    const bonus = log({ weightKg: 120, reps: 5, status: "extra" });
    const notBetter = log({ weightKg: 110, reps: 5 });
    expect(recordsByLogId([bonus, notBetter]).has(notBetter.id)).toBe(false);
  });
});

describe("recordsByLogId — the Epley high-rep trap", () => {
  it(`ignores sets past ${MAX_EPLEY_REPS} reps when estimating 1RM`, () => {
    // 75kg x 20 computes to 125kg — higher than a genuine 100kg x 5 (116.7kg).
    // Counting it would announce a strength record for a back-off set.
    const heavySingle = log({ weightKg: 100, reps: 5 });
    const highRepBackOff = log({ weightKg: 75, reps: 20 });
    expect(kindsFor([heavySingle, highRepBackOff], highRepBackOff.id)).not.toContain("estimated1RM");
  });

  it("still counts a high-rep set as a weight record if it really is heavier", () => {
    const first = log({ weightKg: 60, reps: 5 });
    const heavierHighRep = log({ weightKg: 80, reps: 20 });
    expect(kindsFor([first, heavierHighRep], heavierHighRep.id)).toEqual(["heaviestWeight"]);
  });

  it("counts a 1RM record at exactly the rep cap", () => {
    const first = log({ weightKg: 100, reps: 5 });
    const atCap = log({ weightKg: 95, reps: MAX_EPLEY_REPS });
    expect(kindsFor([first, atCap], atCap.id)).toContain("estimated1RM");
  });
});

describe("recordsByLogId — cardio", () => {
  it("recognises a longer distance", () => {
    const first = log({ distanceM: 5000, durationSec: 1800 });
    const longer = log({ distanceM: 6000, durationSec: 2400 });
    expect(kindsFor([first, longer], longer.id)).toContain("longestDistance");
  });

  it("recognises a longer duration", () => {
    const first = log({ distanceM: 5000, durationSec: 1800 });
    const longer = log({ distanceM: 5000, durationSec: 2000 });
    expect(kindsFor([first, longer], longer.id)).toContain("longestDuration");
  });

  it("recognises a faster pace over a comparable distance", () => {
    const first = log({ distanceM: 5000, durationSec: 1800 });
    const faster = log({ distanceM: 5000, durationSec: 1700 });
    expect(kindsFor([first, faster], faster.id)).toContain("fastestPace");
  });

  it("refuses a pace record set over a much shorter distance", () => {
    // A 400m sprint is faster per metre than a 5k and is not a 5k record.
    const fiveK = log({ distanceM: 5000, durationSec: 1800 });
    const sprint = log({ distanceM: 400, durationSec: 80 });
    expect(kindsFor([fiveK, sprint], sprint.id)).not.toContain("fastestPace");
  });

  it("needs both distance and duration to judge pace", () => {
    const first = log({ distanceM: 5000, durationSec: 1800 });
    const distanceOnly = log({ distanceM: 6000 });
    expect(kindsFor([first, distanceOnly], distanceOnly.id)).not.toContain("fastestPace");
  });

  it("does not mix strength and cardio records on the same set", () => {
    const first = log({ distanceM: 5000, durationSec: 1800 });
    const longer = log({ distanceM: 6000, durationSec: 1900 });
    expect(kindsFor([first, longer], longer.id)).not.toContain("heaviestWeight");
  });
});

describe("recordsByLogId — bookkeeping", () => {
  it("keeps exercises apart", () => {
    const benchFirst = log({ exerciseId: "bench", weightKg: 100, reps: 5 });
    const squatHeavier = log({ exerciseId: "squat", weightKg: 140, reps: 5 });
    // The squat set is that exercise's first — no baseline, so no record.
    expect(recordsByLogId([benchFirst, squatHeavier]).has(squatHeavier.id)).toBe(false);
  });

  it("judges each set against what came before it, not the final state", () => {
    const a = log({ weightKg: 100, reps: 5 });
    const b = log({ weightKg: 110, reps: 5 });
    const c = log({ weightKg: 105, reps: 5 });
    const records = recordsByLogId([a, b, c]);
    expect(records.has(b.id)).toBe(true);
    // c beats a but not b, and b already happened.
    expect(records.has(c.id)).toBe(false);
  });

  it("orders by when the set was logged, not by array position", () => {
    const later = log({ weightKg: 110, reps: 5, loggedAt: 9_000 });
    const earlier = log({ weightKg: 100, reps: 5, loggedAt: 1_000 });
    const records = recordsByLogId([later, earlier]);
    expect(records.has(later.id)).toBe(true);
    expect(records.has(earlier.id)).toBe(false);
  });

  it("reports what the record beat, so it can be named", () => {
    const first = log({ weightKg: 100, reps: 5 });
    const better = log({ weightKg: 110, reps: 5 });
    const record = (recordsByLogId([first, better]).get(better.id) ?? [])
      .find((r) => r.kind === "heaviestWeight");
    expect(record).toMatchObject({ value: 110, previous: 100, exerciseId: "ex-1" });
  });

  it("ignores sets with no usable numbers", () => {
    const first = log({ weightKg: 100, reps: 5 });
    const empty = log({});
    expect(recordsByLogId([first, empty]).has(empty.id)).toBe(false);
  });

  it("does not treat zero or negative load as a record", () => {
    const first = log({ weightKg: 100, reps: 5 });
    const zero = log({ weightKg: 0, reps: 5 });
    expect(recordsByLogId([first, zero]).has(zero.id)).toBe(false);
  });
});

describe("countSessionRecords", () => {
  it("counts each exercise once however many records it set", () => {
    const prior = [log({ exerciseId: "bench", weightKg: 100, reps: 5 })];
    // Beats both weight and estimated 1RM, but it is still one exercise.
    const session = [log({ exerciseId: "bench", weightKg: 110, reps: 5 })];
    expect(countSessionRecords(session, prior)).toBe(1);
  });

  it("counts two exercises separately", () => {
    const prior = [
      log({ exerciseId: "bench", weightKg: 100, reps: 5 }),
      log({ exerciseId: "squat", weightKg: 140, reps: 5 }),
    ];
    const session = [
      log({ exerciseId: "bench", weightKg: 110, reps: 5 }),
      log({ exerciseId: "squat", weightKg: 150, reps: 5 }),
    ];
    expect(countSessionRecords(session, prior)).toBe(2);
  });

  it("does not count an exercise with no prior history", () => {
    const session = [log({ exerciseId: "bench", weightKg: 110, reps: 5 })];
    expect(countSessionRecords(session, [])).toBe(0);
  });

  it("does not count a session that beat nothing", () => {
    const prior = [log({ exerciseId: "bench", weightKg: 120, reps: 5 })];
    const session = [log({ exerciseId: "bench", weightKg: 100, reps: 5 })];
    expect(countSessionRecords(session, prior)).toBe(0);
  });
});
