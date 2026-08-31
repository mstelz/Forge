import type { Session, SessionSetLog } from "../../../../shared";
import type { RestTimerData } from "./types";

/**
 * Which metric fields the current exercise type asks for, and whether the user
 * supplied any of them. Extracted from the log-set handler so the rules are
 * visible and testable rather than buried in a submit callback.
 */
export type MetricAvailability = {
  showWeightReps: boolean;
  showDurationDistance: boolean;
  hasStrengthMetric: boolean;
  hasCardioMetric: boolean;
};

/** Null when the entry is loggable, otherwise the message to show the user. */
export function validateMetrics({
  showWeightReps,
  showDurationDistance,
  hasStrengthMetric,
  hasCardioMetric,
}: MetricAvailability): string | null {
  if (showWeightReps && !showDurationDistance && !hasStrengthMetric) {
    return "Enter reps or weight before logging.";
  }
  if (!showWeightReps && showDurationDistance && !hasCardioMetric) {
    return "Enter duration or distance before logging.";
  }
  if (showWeightReps && showDurationDistance && !hasStrengthMetric && !hasCardioMetric) {
    return "Enter at least one metric before logging.";
  }
  return null;
}

/**
 * The rest a lifter actually took is the gap between one set and the next, which
 * is only knowable once the next set lands — so logging a set back-fills
 * `restAfterSec` onto the previous one. Returns null when there is nothing to
 * back-fill (no previous set, or it already carries a value).
 */
export function computeRestBackfill(logs: SessionSetLog[], now: number): SessionSetLog | null {
  const prevLogged = logs
    .filter((l) => l.status === "logged")
    .sort((a, b) => b.loggedAt - a.loggedAt)[0];
  if (!prevLogged || prevLogged.restAfterSec != null) return null;
  return {
    ...prevLogged,
    restAfterSec: Math.min(3600, Math.max(0, Math.round((now - prevLogged.loggedAt) / 1000))),
  };
}

/** The session with its rest clock started — written in the same batch as the log. */
export function startRestTimer(session: Session, restSec: number, now: number): Session {
  return {
    ...session,
    restTimer: JSON.stringify({
      status: "running",
      startedAt: now,
      durationSec: restSec,
      pausedAt: null,
      remainingSec: restSec,
    } satisfies RestTimerData),
    updatedAt: now,
  };
}
