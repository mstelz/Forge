import type { Program, ProgramRun, ProgramRunDayState } from "../../../../shared";

// Pure schedule helpers for the program detail page, extracted from detail.tsx
// (issue 09 follow-up) so the week/day-state logic is unit-testable on its own.

export const DAY_LABELS = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"];

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function getDayState(
  run: ProgramRun | null | undefined,
  weekIndex: number,
  dayIndex: number,
): ProgramRunDayState | undefined {
  return run?.dayStates.find(
    (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
  );
}

/** Returns the week index containing the first not_started non-rest day */
export function computeCurrentWeekIndex(
  program: Program,
  run: ProgramRun | null | undefined,
): number {
  if (!run || run.status !== "active") return -1;
  for (let w = 0; w < program.durationWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const dayEntries = program.days.filter(
        (pd) => pd.weekIndex === w && pd.dayIndex === d,
      );
      const primary = dayEntries.find((pd) => (pd.order ?? 0) === 0) ?? dayEntries[0];
      if (primary?.isRestDay) continue;
      if (!dayEntries.some((pd) => pd.routineId)) continue;
      const ds = getDayState(run, w, d);
      if (!ds || ds.status === "not_started") return w;
    }
  }
  return program.durationWeeks - 1;
}
