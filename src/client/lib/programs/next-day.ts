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
 * Return the program day that maps to today's calendar date, if it is a
 * not_started workout day.  Returns null if today is a rest day, has no
 * workout, or has already been started/completed.
 */
export function computeTodayProgramDay(
  program: Program,
  run: ProgramRun,
  now: Date = new Date(),
): NextPlayableDay | null {
  if (run.status !== "active") return null;

  const startMs = run.weekZeroStartDate ?? run.startedAt;
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const dayOffset = Math.round((todayMs - startMs) / 86_400_000);
  if (dayOffset < 0) return null;

  const weekIndex = Math.floor(dayOffset / 7);
  const dayIndex = dayOffset % 7;
  if (weekIndex >= program.durationWeeks) return null;

  const dayEntries = program.days.filter(
    (pd) => pd.weekIndex === weekIndex && pd.dayIndex === dayIndex,
  );
  if (dayEntries.length === 0) return null;

  const primary = dayEntries.find((pd) => (pd.order ?? 0) === 0) ?? dayEntries[0]!;
  if (primary.isRestDay) return null;

  const hasWorkout = dayEntries.some((pd) => pd.routineId != null);
  if (!hasWorkout) return null;

  const ds = run.dayStates.find(
    (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
  );
  if (!ds || ds.status === "not_started") {
    return { weekIndex, dayIndex, routineId: primary.routineId };
  }

  return null;
}

/**
 * Returns today's program day if it is a rest day (any status).
 * Used so the homepage can show the rest day card instead of jumping to the next workout.
 */
export function computeTodayRestDay(
  program: Program,
  run: ProgramRun,
  now: Date = new Date(),
): NextPlayableDay | null {
  if (run.status !== "active") return null;

  const startMs = run.weekZeroStartDate ?? run.startedAt;
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const dayOffset = Math.round((todayMs - startMs) / 86_400_000);
  if (dayOffset < 0) return null;

  const weekIndex = Math.floor(dayOffset / 7);
  const dayIndex = dayOffset % 7;
  if (weekIndex >= program.durationWeeks) return null;

  const dayEntries = program.days.filter(
    (pd) => pd.weekIndex === weekIndex && pd.dayIndex === dayIndex,
  );
  if (dayEntries.length === 0) return null;

  const primary = dayEntries.find((pd) => (pd.order ?? 0) === 0) ?? dayEntries[0]!;
  if (!primary.isRestDay) return null;

  return { weekIndex, dayIndex, routineId: null };
}

/**
 * Returns today's program day if it is already completed or active.
 * This lets the homepage show "Completed Today" instead of jumping ahead
 * to the next not_started day.
 */
export function computeTodayCompletedDay(
  program: Program,
  run: ProgramRun,
  now: Date = new Date(),
): NextPlayableDay | null {
  if (run.status !== "active") return null;

  const startMs = run.weekZeroStartDate ?? run.startedAt;
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const dayOffset = Math.round((todayMs - startMs) / 86_400_000);
  if (dayOffset < 0) return null;

  const weekIndex = Math.floor(dayOffset / 7);
  const dayIndex = dayOffset % 7;
  if (weekIndex >= program.durationWeeks) return null;

  const dayEntries = program.days.filter(
    (pd) => pd.weekIndex === weekIndex && pd.dayIndex === dayIndex,
  );
  if (dayEntries.length === 0) return null;

  const primary = dayEntries.find((pd) => (pd.order ?? 0) === 0) ?? dayEntries[0]!;
  if (primary.isRestDay) return null;

  const hasWorkout = dayEntries.some((pd) => pd.routineId != null);
  if (!hasWorkout) return null;

  const ds = run.dayStates.find(
    (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
  );
  if (ds?.status === "completed" || ds?.status === "active") {
    return { weekIndex, dayIndex, routineId: primary.routineId };
  }

  return null;
}

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
