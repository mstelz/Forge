/**
 * next-day.ts
 *
 * Pure helper that computes the next playable day in a program run.
 * Walks (weekIndex, dayIndex) in ascending order and returns the first
 * slot that is:
 *   - Not a rest day
 *   - Has a day-state of 'not_started' (or no day-state row at all)
 *
 * Returns null when the run is exhausted (all non-rest days resolved).
 */

import type { Program, ProgramRun } from "../../../shared";

export type NextPlayableDay = {
  weekIndex: number;
  dayIndex: number;
  /** routineId of the day, if assigned */
  routineId: string | null;
};

/**
 * Compute the next playable day for a program run.
 *
 * @param program - The full program document (includes sparse days[]).
 * @param run     - The active program run (includes dayStates[]).
 * @returns       The first non-rest, not_started day, or null if exhausted.
 */
export function computeNextPlayableDay(
  program: Program,
  run: ProgramRun,
): NextPlayableDay | null {
  if (run.status !== "active") return null;

  for (let w = 0; w < program.durationWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const programDay = program.days.find(
        (pd) => pd.weekIndex === w && pd.dayIndex === d,
      );

      // Skip rest days
      if (programDay?.isRestDay) continue;

      // Skip days with no routine (unfilled sparse days are not playable)
      if (!programDay?.routineId) continue;

      // Check day-state: not_started (missing row = not_started) qualifies
      const ds = run.dayStates.find(
        (s) => s.weekIndex === w && s.dayIndex === d,
      );

      if (!ds || ds.status === "not_started") {
        return {
          weekIndex: w,
          dayIndex: d,
          routineId: programDay.routineId,
        };
      }
    }
  }

  // All non-rest days have been resolved (completed or skipped)
  return null;
}
