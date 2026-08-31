import type { SessionSetLog } from "../../../shared/session-log";
import { formatWeight, formatDistance } from "../units";
import { formatHms } from "../time";

type Units = {
  weightUnit: "kg" | "lb";
  distanceUnit: "m" | "km" | "mi";
};

/**
 * One line describing how this exercise went last time.
 *
 * Speaks whichever metrics were actually recorded — weight and reps for a lift,
 * time and distance for a run — so a cardio exercise is no longer summarised as
 * nothing at all. Sets are grouped by the session they belong to; grouping by a
 * time window used to merge two workouts that happened within a few hours.
 */
export function summarizeLastTime(
  logs: SessionSetLog[],
  currentSessionId: string,
  { weightUnit, distanceUnit }: Units,
): string | null {
  const prior = logs.filter(
    (l) => l.sessionId !== currentSessionId && l.status === "logged",
  );
  if (prior.length === 0) return null;

  const mostRecent = prior.reduce((best, l) => (l.loggedAt > best.loggedAt ? l : best));
  const sessionLogs = prior
    .filter((l) => l.sessionId === mostRecent.sessionId)
    .sort((a, b) => a.order - b.order);
  if (sessionLogs.length === 0) return null;

  const parts: string[] = [];

  const weightKg = sessionLogs.find((l) => l.weightKg != null)?.weightKg;
  const repsArr = sessionLogs.map((l) => l.reps).filter((r): r is number => r != null);
  if (weightKg != null && repsArr.length > 0) {
    parts.push(`${formatWeight(weightKg, weightUnit)} × ${repsArr.join(", ")}`);
  } else if (repsArr.length > 0) {
    parts.push(`${repsArr.join(", ")} reps`);
  }

  const totalDuration = sessionLogs.reduce((acc, l) => acc + (l.durationSec ?? 0), 0);
  if (totalDuration > 0) parts.push(formatHms(totalDuration));

  const totalDistance = sessionLogs.reduce((acc, l) => acc + (l.distanceM ?? 0), 0);
  if (totalDistance > 0) parts.push(formatDistance(totalDistance, distanceUnit));

  if (parts.length === 0) return null;
  return parts.join(" · ");
}
