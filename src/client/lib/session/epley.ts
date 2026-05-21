import type { SessionSetLog } from "../../../shared";

/**
 * Epley 1RM formula: weightKg * (1 + reps / 30)
 */
export function epley(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

/**
 * Returns the best Epley estimate for a given exerciseId across the provided logs.
 * Only considers logs where:
 *   - status = 'logged'
 *   - setType = 'normal'
 *   - reps > 0
 *   - weightKg > 0
 */
export function bestEpleyForExercise(
  logs: SessionSetLog[],
  exerciseId: string,
): { weightKg: number; reps: number; epley1RM: number; logId: string } | null {
  let best: { weightKg: number; reps: number; epley1RM: number; logId: string } | null = null;

  for (const log of logs) {
    if (log.exerciseId !== exerciseId) continue;
    if (log.status !== "logged") continue;
    if (log.setType !== "normal") continue;
    if (!log.reps || log.reps <= 0) continue;
    if (!log.weightKg || log.weightKg <= 0) continue;

    const epley1RM = epley(log.weightKg, log.reps);
    if (best === null || epley1RM > best.epley1RM) {
      best = { weightKg: log.weightKg, reps: log.reps, epley1RM, logId: log.id };
    }
  }

  return best;
}
