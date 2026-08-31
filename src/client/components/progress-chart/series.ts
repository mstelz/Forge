/**
 * Pure data-shaping for the per-exercise progress chart.
 *
 * Every value here stays in the app's storage units — weight in kg, distance in
 * metres, pace in seconds per metre — because converting to the user's display
 * unit is a linear scale that changes the labels, never the shape of the line.
 * Formatting is therefore a separate, later step (see `format.ts`).
 */

import type { SessionSetLog } from "../../../shared/session-log";
import type { ExerciseType } from "../../../shared/enums";
import { epley } from "../../lib/session/epley";

export const METRICS = ["e1rm", "topSet", "volume", "pace", "distance", "duration"] as const;
export type Metric = (typeof METRICS)[number];

export type SeriesPoint = {
  sessionId: string;
  /** The instant the session's first counted set was logged. */
  at: number;
  value: number;
};

/**
 * A set counts if the user actually performed it. `logged` is the planned case;
 * `extra` is an unplanned set the logger appends and never flips back to
 * `logged`, so ignoring it would quietly drop real work off the chart.
 */
function performed(log: SessionSetLog): boolean {
  return log.status === "logged" || log.status === "extra";
}

/** Warm-ups don't belong in a strength trend; every other set type does. */
function isWorkingSet(log: SessionSetLog): boolean {
  return performed(log) && log.setType !== "warmup";
}

/**
 * `lib/session/epley` applies the formula unguarded, so a 100kg single comes
 * back as 103.3kg. The Est 1RM tile rendered directly above this chart guards
 * `reps === 1` and says 100kg. The chart follows the tile: a top single is
 * already a measured 1RM, not an estimate off it.
 */
function estimate1RM(weightKg: number, reps: number): number {
  return reps === 1 ? weightKg : epley(weightKg, reps);
}

function hasLoad(log: SessionSetLog): boolean {
  return log.weightKg != null && log.weightKg > 0 && log.reps != null && log.reps > 0;
}

/** Reduces one session's sets to a single value, or null if it has nothing to say. */
function sessionValue(metric: Metric, logs: SessionSetLog[]): number | null {
  switch (metric) {
    case "e1rm": {
      let best: number | null = null;
      for (const l of logs) {
        if (!isWorkingSet(l) || !hasLoad(l)) continue;
        const e = estimate1RM(l.weightKg!, l.reps!);
        if (best === null || e > best) best = e;
      }
      return best;
    }
    case "topSet": {
      let best: number | null = null;
      for (const l of logs) {
        if (!isWorkingSet(l) || !hasLoad(l)) continue;
        if (best === null || l.weightKg! > best) best = l.weightKg!;
      }
      return best;
    }
    case "volume": {
      let total = 0;
      let any = false;
      for (const l of logs) {
        if (!isWorkingSet(l) || !hasLoad(l)) continue;
        total += l.weightKg! * l.reps!;
        any = true;
      }
      return any ? total : null;
    }
    case "distance": {
      let total = 0;
      let any = false;
      for (const l of logs) {
        if (!performed(l) || l.distanceM == null || l.distanceM <= 0) continue;
        total += l.distanceM;
        any = true;
      }
      return any ? total : null;
    }
    case "duration": {
      let total = 0;
      let any = false;
      for (const l of logs) {
        if (!performed(l) || l.durationSec == null || l.durationSec <= 0) continue;
        total += l.durationSec;
        any = true;
      }
      return any ? total : null;
    }
    case "pace": {
      let metres = 0;
      let seconds = 0;
      for (const l of logs) {
        if (!performed(l)) continue;
        if (l.distanceM == null || l.distanceM <= 0) continue;
        if (l.durationSec == null || l.durationSec <= 0) continue;
        metres += l.distanceM;
        seconds += l.durationSec;
      }
      if (metres <= 0 || seconds <= 0) return null;
      return seconds / metres;
    }
  }
}

/**
 * One point per session, oldest first. Two sessions on the same calendar day
 * stay two points — sessions are the bucket, not days.
 */
export function buildSeries(logs: SessionSetLog[], metric: Metric): SeriesPoint[] {
  const bySession = new Map<string, SessionSetLog[]>();
  for (const log of logs) {
    const bucket = bySession.get(log.sessionId);
    if (bucket) bucket.push(log);
    else bySession.set(log.sessionId, [log]);
  }

  const points: SeriesPoint[] = [];
  for (const [sessionId, sessionLogs] of bySession) {
    const value = sessionValue(metric, sessionLogs);
    if (value === null) continue;
    const at = Math.min(...sessionLogs.filter(performed).map((l) => l.loggedAt));
    points.push({ sessionId, at, value });
  }

  points.sort((a, b) => a.at - b.at || a.sessionId.localeCompare(b.sessionId));
  return points;
}

const STRENGTH_METRICS: Metric[] = ["e1rm", "topSet", "volume"];
const CARDIO_METRICS: Metric[] = ["pace", "distance", "duration"];

/**
 * The metrics worth offering for this exercise, most useful first, filtered to
 * those that actually have data. Cardio leads with pace; everything else leads
 * with estimated 1RM. Each falls through to the other family so a `mixed`
 * exercise only ever logged as a run still gets a chart instead of an empty
 * strength axis.
 */
export function availableMetrics(
  logs: SessionSetLog[],
  exerciseType: ExerciseType,
): Metric[] {
  const order =
    exerciseType === "cardio"
      ? [...CARDIO_METRICS, ...STRENGTH_METRICS]
      : [...STRENGTH_METRICS, ...CARDIO_METRICS];
  return order.filter((m) => buildSeries(logs, m).length > 0);
}
