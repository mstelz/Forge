/**
 * next-day.ts
 *
 * Pure helper that computes the next playable day in a program run.
 * Walks (weekIndex, dayIndex) in ascending order and returns the first
 * slot that is:
 *   - Not a rest day
 *   - Has at least one workout with a routineId
 *   - Has a day-state of 'not_started' (or no day-state row at all)
 *
 * Returns null when the run is exhausted (all non-rest days resolved).
 */

import type { Program, ProgramRun } from "../../../shared";

export type NextPlayableDay = {
  weekIndex: number;
  dayIndex: number;
  /** routineId of the primary (order=0) workout for this day, if assigned */
  routineId: string | null;
};

/**
 * Compute the next playable day for a program run.
 */
export function computeNextPlayableDay(
  program: Program,
  run: ProgramRun,
): NextPlayableDay | null {
  if (run.status !== "active") return null;

  for (let w = 0; w < program.durationWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const dayEntries = program.days.filter(
        (pd) => pd.weekIndex === w && pd.dayIndex === d,
      );

      // No entries for this slot — skip
      if (dayEntries.length === 0) continue;

      // The primary entry (order=0) determines rest status
      const primary = dayEntries.find((pd) => pd.order === 0) ?? dayEntries[0]!;
      if (primary.isRestDay) continue;

      // Must have at least one entry with a routineId
      const hasWorkout = dayEntries.some((pd) => pd.routineId != null);
      if (!hasWorkout) continue;

      // Check day-state: not_started (missing row = not_started) qualifies
      const ds = run.dayStates.find(
        (s) => s.weekIndex === w && s.dayIndex === d,
      );

      if (!ds || ds.status === "not_started") {
        return {
          weekIndex: w,
          dayIndex: d,
          routineId: primary.routineId,
        };
      }
    }
  }

  return null;
}
