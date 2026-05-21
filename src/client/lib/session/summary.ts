import type { Session, SessionSetLog } from "../../../shared";
import { bestEpleyForExercise } from "./epley";

export function summarizeSession(
  _session: Session,
  logs: SessionSetLog[],
  allPriorLogs: SessionSetLog[],
): {
  totalVolumeKg: number;
  totalLoggedSets: number;
  prCount: number;
} {
  // totalVolumeKg: sum of weightKg * reps for all status='logged', setType='normal' logs
  const loggedNormal = logs.filter(
    (l) => l.status === "logged" && l.setType === "normal",
  );
  const totalVolumeKg = loggedNormal.reduce((sum, l) => {
    if (l.weightKg != null && l.reps != null) {
      return sum + l.weightKg * l.reps;
    }
    return sum;
  }, 0);

  // totalLoggedSets: count of status='logged' logs
  const totalLoggedSets = logs.filter((l) => l.status === "logged").length;

  // prCount: count of distinct exerciseIds where this session's best Epley
  // strictly exceeds the best Epley across allPriorLogs for that exerciseId
  const exerciseIds = new Set(logs.map((l) => l.exerciseId));
  let prCount = 0;

  for (const exerciseId of exerciseIds) {
    const sessionBest = bestEpleyForExercise(logs, exerciseId);
    if (!sessionBest) continue;

    const priorBest = bestEpleyForExercise(allPriorLogs, exerciseId);

    if (priorBest === null || sessionBest.epley1RM > priorBest.epley1RM) {
      prCount++;
    }
  }

  return { totalVolumeKg, totalLoggedSets, prCount };
}
