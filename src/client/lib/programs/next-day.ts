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

// ---------------------------------------------------------------------------
// Cascade scheduling
// ---------------------------------------------------------------------------

export type CascadeSchedule = {
  /** "weekIndex:dayIndex" → effective calendar date (unix ms at midnight local) */
  slotToMs: Map<string, number>;
  /** "year-month0-day" → first slot that lands on that date */
  dateToSlot: Map<string, { weekIndex: number; dayIndex: number }>;
};

/**
 * Compute a cascade schedule for a program run.
 *
 * Completed/skipped slots stay on their original calendar dates.
 * Not-started slots are pushed forward so that each one falls at least one day
 * after the previous pending slot, but never before its original scheduled date.
 * This keeps the program sequence intact when the user falls behind.
 *
 * `todayStartMs` — unix ms for 00:00 local today. Past-due pending slots are
 * clamped to no earlier than today.
 */
export function computeCascadeSchedule(
  program: Program,
  run: ProgramRun,
  todayStartMs: number,
): CascadeSchedule {
  const MS_PER_DAY = 86_400_000;
  const startMs = run.weekZeroStartDate ?? run.startedAt;
  const slotToMs = new Map<string, number>();
  const dateToSlot = new Map<string, { weekIndex: number; dayIndex: number }>();

  // Start the cascade "one day before today" so the first pending slot lands today.
  let prevPendingMs = todayStartMs - MS_PER_DAY;

  for (let w = 0; w < program.durationWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const dayEntries = program.days.filter((pd) => pd.weekIndex === w && pd.dayIndex === d);
      if (dayEntries.length === 0) continue;

      const ds = run.dayStates.find((s) => s.weekIndex === w && s.dayIndex === d);
      const originalMs = startMs + (w * 7 + d) * MS_PER_DAY;
      const primary = dayEntries.find((pd) => (pd.order ?? 0) === 0) ?? dayEntries[0];
      const isRestDay = primary?.isRestDay ?? false;

      let effectiveMs: number;
      if (ds?.status === "completed" || ds?.status === "skipped") {
        // Use the midnight of the actual completion date so the cascade timeline
        // reflects when workouts were truly done. This prevents the next pending
        // slot from collapsing onto today after a shifted workout is completed.
        // Falls back to originalMs for legacy records without completedAt.
        const completedDayMs = ds.completedAt
          ? (() => { const c = new Date(ds.completedAt); c.setHours(0, 0, 0, 0); return c.getTime(); })()
          : originalMs;
        effectiveMs = completedDayMs;
        // Advance the chain so subsequent pending slots cascade from this date.
        prevPendingMs = Math.max(prevPendingMs, effectiveMs);
      } else {
        // Pending slots clamp to today at minimum (explicit floor replaces the
        // implicit guarantee that came from initialising prevPendingMs to today-1).
        effectiveMs = Math.max(originalMs, prevPendingMs + MS_PER_DAY, todayStartMs);
        prevPendingMs = effectiveMs;
      }

      const slotKey = `${w}:${d}`;
      slotToMs.set(slotKey, effectiveMs);

      const cal = new Date(effectiveMs);
      const dateKey = `${cal.getFullYear()}-${cal.getMonth()}-${cal.getDate()}`;
      if (!dateToSlot.has(dateKey)) {
        dateToSlot.set(dateKey, { weekIndex: w, dayIndex: d });
      }
    }
  }

  return { slotToMs, dateToSlot };
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
