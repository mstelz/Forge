import type { Program, ProgramRun } from "../../../shared";

/** Returns unique non-rest (weekIndex, dayIndex) pairs that have at least one scheduled workout. */
function getPlayableDaySlots(program: Program): Array<{ weekIndex: number; dayIndex: number }> {
  const seen = new Set<string>();
  const slots: Array<{ weekIndex: number; dayIndex: number }> = [];
  for (const d of program.days) {
    // A slot is playable if it has a routine (order 0 rest day records don't count)
    if (d.isRestDay || !d.routineId) continue;
    const key = `${d.weekIndex}:${d.dayIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ weekIndex: d.weekIndex, dayIndex: d.dayIndex });
  }
  return slots;
}

/**
 * Returns completion % (0–100) for a program run.
 * completed_or_skipped_non_rest_days / total_non_rest_days
 */
export function computeRunProgress(program: Program, run: ProgramRun): number {
  const slots = getPlayableDaySlots(program);
  if (slots.length === 0) return 0;

  const resolvedCount = slots.filter(({ weekIndex, dayIndex }) => {
    const ds = run.dayStates.find(
      (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
    );
    return ds?.status === "completed" || ds?.status === "skipped";
  }).length;

  return Math.round((resolvedCount / slots.length) * 100);
}

/**
 * Returns an array of N "dot" values (0.0–1.0) summarizing the run progress
 * across the program duration. Used for the 8-dot row on the active card.
 */
export function computeWeekDots(
  program: Program,
  run: ProgramRun,
  dotCount = 8,
): number[] {
  const { durationWeeks } = program;
  const dots: number[] = [];

  for (let i = 0; i < dotCount; i++) {
    const weekStart = Math.floor((i * durationWeeks) / dotCount);
    const weekEnd = Math.floor(((i + 1) * durationWeeks) / dotCount);

    if (weekStart >= durationWeeks) {
      dots.push(0);
      continue;
    }

    const slotsInRange: Array<{ weekIndex: number; dayIndex: number }> = [];
    const seen = new Set<string>();
    for (let w = weekStart; w < Math.min(weekEnd, durationWeeks); w++) {
      for (const d of program.days) {
        if (d.weekIndex !== w || d.isRestDay || !d.routineId) continue;
        const key = `${d.weekIndex}:${d.dayIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        slotsInRange.push({ weekIndex: d.weekIndex, dayIndex: d.dayIndex });
      }
    }

    const totalDays = slotsInRange.length;
    const resolvedDays = slotsInRange.filter(({ weekIndex, dayIndex }) => {
      const ds = run.dayStates.find(
        (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
      );
      return ds?.status === "completed" || ds?.status === "skipped";
    }).length;

    if (totalDays === 0) {
      dots.push(0);
    } else if (resolvedDays === totalDays) {
      dots.push(1.0);
    } else if (resolvedDays > 0) {
      dots.push(0.5);
    } else {
      dots.push(0);
    }
  }

  return dots;
}

/**
 * Returns a display subtitle for a program based on its run history.
 */
export function programSubtitle(
  program: Program,
  latestRun?: ProgramRun | null,
): string {
  if (!latestRun) {
    return `${program.durationWeeks} weeks · draft`;
  }

  if (latestRun.status === "active") {
    const desc = program.description?.split("\n")[0]?.trim();
    return desc
      ? `${program.durationWeeks} weeks · ${desc}`
      : `${program.durationWeeks} weeks`;
  }

  if (latestRun.status === "completed" || latestRun.status === "abandoned") {
    if (latestRun.endedAt) {
      const monthsAgo = Math.floor(
        (Date.now() - latestRun.endedAt) / (1000 * 60 * 60 * 24 * 30),
      );
      if (monthsAgo < 1) {
        return `${program.durationWeeks} weeks · completed recently`;
      }
      return `${program.durationWeeks} weeks · completed ${monthsAgo} month${monthsAgo === 1 ? "" : "s"} ago`;
    }
    return `${program.durationWeeks} weeks · completed`;
  }

  return `${program.durationWeeks} weeks · never started`;
}
