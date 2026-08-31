import type { SessionSetLog } from "../../../shared";
import { epley } from "./epley";

/**
 * Personal records, decided at the moment a set is logged.
 *
 * ── What counts as a record ──────────────────────────────────────────────────
 *
 * **A record needs a baseline.** The first time you ever do an exercise, every
 * number is technically a best. Announcing that cheapens the word, so an exercise
 * has to have history before anything it does can be a record.
 *
 * **Warmups never count**, and neither does anything not actually performed. A
 * warmup does not set a record and does not raise the bar for the sets after it.
 *
 * **Beating requires beating.** Equalling a previous best is not a record.
 *
 * ── Why these kinds ──────────────────────────────────────────────────────────
 *
 * Two strength records, not four. `heaviestWeight` is what a lifter means when
 * they add a plate; `estimated1RM` catches getting more reps at the same load.
 * Reps-at-a-given-weight and per-rep-count bests were considered and dropped —
 * with enough definitions every session sets a record, which is the same as none
 * of them doing so.
 *
 * `estimated1RM` ignores sets past `MAX_EPLEY_REPS`. Epley scales linearly with
 * reps and drifts badly at high ones: 75kg × 20 computes to 125kg, beating a
 * genuine 100kg × 5 at 116.7kg. Uncapped, a back-off set announces a strength
 * record. Capping is a judgement call about where the formula stops being useful,
 * not a claim that 12 is special.
 *
 * Cardio gets its own three. `fastestPace` only counts over a comparable
 * distance — a 400m sprint has a better pace per metre than any 5k and is not a
 * 5k record.
 */

/** Beyond this, Epley's linear extrapolation is not worth trusting. */
export const MAX_EPLEY_REPS = 12;

/** A pace record must cover at least this fraction of the previous best's distance. */
const COMPARABLE_DISTANCE_RATIO = 0.9;

export type RecordKind =
  | "estimated1RM"
  | "heaviestWeight"
  | "longestDistance"
  | "longestDuration"
  | "fastestPace";

export type ExerciseRecord = {
  kind: RecordKind;
  exerciseId: string;
  logId: string;
  /** kg for load, metres for distance, seconds for duration, sec/metre for pace. */
  value: number;
  /** What it beat. Records always have a baseline, so this is never null. */
  previous: number;
};

/** Running bests for one exercise as we walk its history forward. */
type Bests = {
  epley1RM: number | null;
  weightKg: number | null;
  distanceM: number | null;
  durationSec: number | null;
  pace: { secPerM: number; distanceM: number } | null;
};

function emptyBests(): Bests {
  return { epley1RM: null, weightKg: null, distanceM: null, durationSec: null, pace: null };
}

/** Performed, and not a warmup. Everything else is invisible to records. */
function canSetRecord(log: SessionSetLog): boolean {
  return log.status === "logged" && log.setType !== "warmup";
}

function positive(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null;
}

/**
 * Which records each set beat at the moment it was logged.
 *
 * One chronological pass per exercise carrying running bests, so this stays linear
 * in the number of logs — it runs on every render of the set list and on every set
 * logged.
 *
 * Pass every log for the exercises you care about; ordering of the input does not
 * matter, `loggedAt` decides.
 */
export function recordsByLogId(logs: SessionSetLog[]): Map<string, ExerciseRecord[]> {
  const found = new Map<string, ExerciseRecord[]>();
  const bestsByExercise = new Map<string, Bests>();

  const ordered = [...logs]
    .filter(canSetRecord)
    .sort((a, b) => a.loggedAt - b.loggedAt);

  for (const log of ordered) {
    const bests = bestsByExercise.get(log.exerciseId) ?? emptyBests();
    bestsByExercise.set(log.exerciseId, bests);

    const weightKg = positive(log.weightKg);
    const reps = positive(log.reps);
    const distanceM = positive(log.distanceM);
    const durationSec = positive(log.durationSec);

    const records: ExerciseRecord[] = [];
    const claim = (kind: RecordKind, value: number, previous: number | null) => {
      // No baseline means no record — see the note at the top of this file.
      if (previous != null && value > previous) {
        records.push({ kind, exerciseId: log.exerciseId, logId: log.id, value, previous });
      }
    };

    // ── Strength ───────────────────────────────────────────────────────────
    if (weightKg != null) {
      claim("heaviestWeight", weightKg, bests.weightKg);
      bests.weightKg = Math.max(weightKg, bests.weightKg ?? weightKg);
    }

    if (weightKg != null && reps != null && reps <= MAX_EPLEY_REPS) {
      const estimate = epley(weightKg, reps);
      claim("estimated1RM", estimate, bests.epley1RM);
      bests.epley1RM = Math.max(estimate, bests.epley1RM ?? estimate);
    }

    // ── Cardio ─────────────────────────────────────────────────────────────
    if (distanceM != null) {
      claim("longestDistance", distanceM, bests.distanceM);
      bests.distanceM = Math.max(distanceM, bests.distanceM ?? distanceM);
    }

    if (durationSec != null) {
      claim("longestDuration", durationSec, bests.durationSec);
      bests.durationSec = Math.max(durationSec, bests.durationSec ?? durationSec);
    }

    if (distanceM != null && durationSec != null) {
      const secPerM = durationSec / distanceM;
      const prior = bests.pace;
      const comparable =
        prior != null && distanceM >= prior.distanceM * COMPARABLE_DISTANCE_RATIO;
      // Faster is a smaller number, so this one compares the other way round.
      if (comparable && secPerM < prior.secPerM) {
        records.push({
          kind: "fastestPace",
          exerciseId: log.exerciseId,
          logId: log.id,
          value: secPerM,
          previous: prior.secPerM,
        });
      }
      if (prior == null || secPerM < prior.secPerM) {
        bests.pace = { secPerM, distanceM };
      }
    }

    if (records.length > 0) found.set(log.id, records);
  }

  return found;
}

/**
 * How many distinct exercises set at least one record this session.
 *
 * `priorLogs` is everything logged before this session; the two are walked
 * together so a set is judged against real history rather than the session alone.
 */
export function countSessionRecords(
  sessionLogs: SessionSetLog[],
  priorLogs: SessionSetLog[],
): number {
  const sessionLogIds = new Set(sessionLogs.map((l) => l.id));
  const records = recordsByLogId([...priorLogs, ...sessionLogs]);

  const exercisesWithRecords = new Set<string>();
  for (const [logId, forLog] of records) {
    if (!sessionLogIds.has(logId)) continue;
    for (const record of forLog) exercisesWithRecords.add(record.exerciseId);
  }
  return exercisesWithRecords.size;
}
