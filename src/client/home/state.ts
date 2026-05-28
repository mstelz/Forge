/**
 * useHomepageState — composed read-only hook for the Today / Homepage surface.
 *
 * Reads from existing Dexie stores only. No server calls, no mutations.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import type { Session, SessionSetLog, Routine, Program, ProgramRun } from "../../shared";
import { isVolumeLog } from "../hooks/use-history";
import { computeNextPlayableDay } from "../lib/programs/next-day";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WeekDotState =
  | "done"
  | "today_active"
  | "today_idle"
  | "planned"
  | "rest"
  | "skipped"
  | "empty";

export type HomepageWeekDot = {
  index: number; // 0–6 in the program week
  state: WeekDotState;
};

export type HomepageCalendarDot = {
  y: number;
  m: number; // 1-based
  d: number;
  hasFinishedSession: boolean;
  hasScheduledWorkout: boolean;
  isToday: boolean;
};

export type ActiveRunState = {
  run: ProgramRun;
  program: Program;
  routine: Routine | null;
  exerciseNames: Record<string, string>;
  /** Status of the current program day (the next not_started day in sequence). */
  dayStatus: "not_started" | "active" | "completed" | "skipped" | null;
  /** Session ID linked to the current day's state, if any. */
  daySessionId: string | null;
  /** The week dots for this program run (7 dots for the current week in the run). */
  weekDots: HomepageWeekDot[];
};

export type HomepageState = {
  todayLocal: { y: number; m: number; d: number; weekday: number };
  weekStart: number; // unix ms, Monday 00:00 local
  /** All currently active program runs with their computed state. */
  activeRunStates: ActiveRunState[];
  /** Convenience: first active run, or null. For backward compat with weekDots. */
  activeProgramRun: ProgramRun | null;
  inProgressSession: Session | null;
  calendarDots: HomepageCalendarDot[];
  weeklyStats: { workouts: number; volumeKg: number; streakWeeks: number };
  topGoals: Goal[];
};

/** Minimal goal shape. */
export type Goal = {
  id: string;
  title: string;
  category: string;
  currentValue: number;
  targetValue: number;
  unit: string | null;
  deadline: number | null;
  status: string;
  updatedAt: number;
};

export type DayDetail = {
  date: { y: number; m: number; d: number };
  plannedRoutine: Routine | null;
  plannedDayState: null;
  session: Session | null;
  sessionStats: { exerciseCount: number; setCount: number; durationMs: number } | null;
  isRestDay: boolean;
  isFutureDay: boolean;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Monday 00:00 local of the week containing `date` (defaults to today). */
export function getMondayWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = (dow + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  d.setDate(d.getDate() - daysToMonday);
  return d;
}

export function toYMD(date: Date): { y: number; m: number; d: number } {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

/** Return the 7 calendar days (Mon–Sun) of the week containing `date`. */
export function calendarWeekDays(date: Date = new Date()): Date[] {
  const monday = getMondayWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day;
  });
}

/** Compute streakWeeks: consecutive weeks with ≥1 finished session. */
export function computeStreakWeeks(
  sessions: Session[],
  now: Date = new Date(),
): number {
  const finishedWithEnd = sessions.filter(
    (s) => s.status === "finished" && s.endedAt != null,
  );

  const weekStartsWithSessions = new Set<number>();
  for (const s of finishedWithEnd) {
    const weekStart = getMondayWeekStart(new Date(s.endedAt!));
    weekStartsWithSessions.add(weekStart.getTime());
  }

  const thisWeekStart = getMondayWeekStart(now);
  const thisWeekHasSessions = weekStartsWithSessions.has(thisWeekStart.getTime());

  let streak = 0;
  let currentWeekStart = new Date(thisWeekStart);

  if (!thisWeekHasSessions) {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  }

  while (weekStartsWithSessions.has(currentWeekStart.getTime())) {
    streak++;
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  }

  return streak;
}

// ---------------------------------------------------------------------------
// Weekly volume helper
// ---------------------------------------------------------------------------

export function computeWeeklyVolumeKg(logs: SessionSetLog[]): number {
  return logs.filter(isVolumeLog).reduce((acc, l) => acc + (l.weightKg ?? 0) * (l.reps ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Program calendar helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// weekDots: build from active program run position
// ---------------------------------------------------------------------------

function buildProgramWeekDots(
  program: Program,
  run: ProgramRun,
): HomepageWeekDot[] {
  const nextDay = computeNextPlayableDay(program, run);
  const weekIndex = nextDay?.weekIndex ?? (program.durationWeeks - 1);

  return Array.from({ length: 7 }, (_, dayIndex): HomepageWeekDot => {
    const dayEntries = program.days.filter(
      (d) => d.weekIndex === weekIndex && d.dayIndex === dayIndex,
    );
    const primary = dayEntries.find((d) => d.order === 0) ?? dayEntries[0] ?? null;
    const ds = run.dayStates.find(
      (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
    );
    const isCurrent =
      nextDay !== null &&
      dayIndex === nextDay.dayIndex &&
      weekIndex === nextDay.weekIndex;

    if (!primary) {
      return { index: dayIndex, state: "empty" };
    }

    if (primary.isRestDay) {
      return { index: dayIndex, state: "rest" };
    }

    const hasWorkout = dayEntries.some((d) => d.routineId != null);
    if (!hasWorkout) {
      return { index: dayIndex, state: "empty" };
    }

    const status = ds?.status ?? "not_started";

    if (status === "completed") return { index: dayIndex, state: "done" };
    if (status === "skipped") return { index: dayIndex, state: "skipped" };
    if (isCurrent && status === "active") return { index: dayIndex, state: "today_active" };
    if (isCurrent) return { index: dayIndex, state: "today_idle" };
    return { index: dayIndex, state: "planned" };
  });
}

// ---------------------------------------------------------------------------
// calendarDots derivation
// ---------------------------------------------------------------------------

function buildCalendarDots(
  today: Date,
  finishedSessionsByDate: Map<string, boolean>,
  scheduledWorkoutDates: Set<string>,
): HomepageCalendarDot[] {
  const days = calendarWeekDays(today);
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  return days.map((d) => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const ymd = toYMD(d);
    return {
      ...ymd,
      hasFinishedSession: finishedSessionsByDate.has(key),
      hasScheduledWorkout: scheduledWorkoutDates.has(key),
      isToday: key === todayKey,
    };
  });
}

// ---------------------------------------------------------------------------
// getDayDetail helper — pure read from Dexie
// ---------------------------------------------------------------------------

export async function getDayDetail(date: { y: number; m: number; d: number }): Promise<DayDetail> {
  const start = new Date(date.y, date.m - 1, date.d, 0, 0, 0, 0).getTime();
  const end = new Date(date.y, date.m - 1, date.d, 23, 59, 59, 999).getTime();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime();
  const isFutureDay = start > todayStart;

  let session: Session | null = null;
  try {
    const sessions = await forgeDB.sessions
      .where("startedAt")
      .between(start, end, true, true)
      .toArray();
    if (sessions.length > 0) {
      const inProg = sessions.find((s) => s.status === "in_progress");
      session = inProg ?? sessions.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
    }
  } catch {
    // sessions table may not exist yet
  }

  let sessionStats: DayDetail["sessionStats"] = null;
  if (session) {
    const logs = await forgeDB.sessionSetLogs
      .where("sessionId")
      .equals(session.id)
      .toArray()
      .catch(() => []);
    const loggedLogs = logs.filter((l) => l.status === "logged");
    const exerciseIds = new Set(loggedLogs.map((l) => l.exerciseId));
    const endedAt = session.endedAt ?? Date.now();
    sessionStats = {
      exerciseCount: exerciseIds.size,
      setCount: loggedLogs.length,
      durationMs: Math.max(0, endedAt - session.startedAt),
    };
  }

  let plannedRoutine: Routine | null = null;
  let isRestDay = false;

  try {
    const MS_PER_DAY = 86_400_000;
    const activeRuns = await forgeDB.programRuns
      .where("status")
      .equals("active")
      .toArray();

    for (const run of activeRuns) {
      const startMs = run.weekZeroStartDate ?? run.startedAt;
      const dayOffset = Math.round((start - startMs) / MS_PER_DAY);
      if (dayOffset < 0) continue;

      const weekIndex = Math.floor(dayOffset / 7);
      const dayIndex = dayOffset % 7;

      const program = await forgeDB.programs.get(run.programId) ?? null;
      if (!program) continue;

      const dayEntries = program.days.filter(
        (d) => d.weekIndex === weekIndex && d.dayIndex === dayIndex,
      );
      if (dayEntries.length === 0) continue;

      const primary = dayEntries.find((d) => (d.order ?? 0) === 0) ?? dayEntries[0];
      if (!primary) continue;

      if (primary.isRestDay) {
        isRestDay = true;
        break;
      }

      if (primary.routineId) {
        plannedRoutine = await forgeDB.routines.get(primary.routineId).catch(() => null) ?? null;
      }
      break;
    }
  } catch {
    // ok
  }

  return {
    date,
    plannedRoutine,
    plannedDayState: null,
    session,
    sessionStats,
    isRestDay,
    isFutureDay,
  };
}

// ---------------------------------------------------------------------------
// useHomepageState hook
// ---------------------------------------------------------------------------

const HOMEPAGE_KEY = ["homepage", "state"] as const;

export function useHomepageState(): { data: HomepageState | undefined; isLoading: boolean } {
  const qc = useQueryClient();

  useEffect(() => {
    const subs = [
      liveQuery(() => forgeDB.sessions.count()).subscribe({
        next: () => qc.invalidateQueries({ queryKey: HOMEPAGE_KEY }),
      }),
      liveQuery(() => forgeDB.sessionSetLogs.count()).subscribe({
        next: () => qc.invalidateQueries({ queryKey: HOMEPAGE_KEY }),
      }),
      liveQuery(() => forgeDB.programRuns.count()).subscribe({
        next: () => qc.invalidateQueries({ queryKey: HOMEPAGE_KEY }),
      }),
    ];
    return () => subs.forEach((s) => s.unsubscribe());
  }, [qc]);

  const query = useQuery({
    queryKey: HOMEPAGE_KEY,
    queryFn: async (): Promise<HomepageState> => {
      const now = new Date();
      const todayLocal = toYMD(now);

      const weekStartDate = getMondayWeekStart(now);
      const weekStart = weekStartDate.getTime();

      // In-progress session
      let inProgressSession: Session | null = null;
      try {
        const inProgSessions = await forgeDB.sessions
          .where("status")
          .equals("in_progress")
          .toArray();
        if (inProgSessions.length > 0) {
          inProgressSession =
            inProgSessions.reduce((best, s) => (s.updatedAt > best.updatedAt ? s : best));
        }
      } catch {
        // ok
      }

      // Weekly stats
      let sessions: Session[] = [];
      try {
        sessions = await forgeDB.sessions.where("status").equals("finished").toArray();
      } catch {
        // ok
      }

      const weekSessions = sessions.filter((s) => (s.endedAt ?? 0) >= weekStart);
      const weekSessionIds = new Set(weekSessions.map((s) => s.id));

      let weekLogs: SessionSetLog[] = [];
      try {
        const allLogs = await forgeDB.sessionSetLogs.toArray();
        weekLogs = allLogs.filter((l) => weekSessionIds.has(l.sessionId));
      } catch {
        // ok
      }

      const weeklyWorkouts = weekSessions.length;
      const weeklyVolumeKg = Math.round(computeWeeklyVolumeKg(weekLogs) * 10) / 10;
      const streakWeeks = computeStreakWeeks(sessions, now);

      // Calendar dots — finished sessions by date
      const finishedByDate = new Map<string, boolean>();
      for (const s of sessions) {
        if (s.endedAt == null) continue;
        const d = new Date(s.endedAt);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        finishedByDate.set(key, true);
      }

      // All active program runs — position-based, not calendar-based
      const activeRunStates: ActiveRunState[] = [];
      const scheduledWorkoutDates = new Set<string>();
      const MS_PER_DAY = 86_400_000;

      try {
        const activeRuns = await forgeDB.programRuns
          .where("status")
          .equals("active")
          .toArray();
        activeRuns.sort((a, b) => a.startedAt - b.startedAt);

        for (const run of activeRuns) {
          const startMs = run.weekZeroStartDate ?? run.startedAt;
          if (startMs > Date.now()) continue;

          const program = await forgeDB.programs.get(run.programId) ?? null;
          if (!program) continue;

          // Compute scheduled workout calendar dates for this run (for calendar dots)
          const seenSlots = new Set<string>();
          for (const pd of program.days) {
            if (pd.isRestDay || !pd.routineId) continue;
            const slotKey = `${pd.weekIndex}:${pd.dayIndex}`;
            if (seenSlots.has(slotKey)) continue;
            seenSlots.add(slotKey);

            const ds = run.dayStates.find(
              (s) => s.weekIndex === pd.weekIndex && s.dayIndex === pd.dayIndex,
            );
            if (ds?.status === "completed" || ds?.status === "skipped") continue;

            const calMs = startMs + (pd.weekIndex * 7 + pd.dayIndex) * MS_PER_DAY;
            const cal = new Date(calMs);
            const key = `${cal.getFullYear()}-${cal.getMonth()}-${cal.getDate()}`;
            scheduledWorkoutDates.add(key);
          }

          const nextDay = computeNextPlayableDay(program, run);
          let routine: Routine | null = null;
          const exerciseNames: Record<string, string> = {};
          let dayStatus: ActiveRunState["dayStatus"] = null;
          let daySessionId: string | null = null;

          if (nextDay) {
            // Use the primary workout (order=0) for the homepage routine display
            const primaryEntry = program.days.find(
              (d) => d.weekIndex === nextDay.weekIndex && d.dayIndex === nextDay.dayIndex && (d.order ?? 0) === 0,
            ) ?? program.days.find(
              (d) => d.weekIndex === nextDay.weekIndex && d.dayIndex === nextDay.dayIndex,
            );
            if (primaryEntry?.routineId) {
              routine = await forgeDB.routines.get(primaryEntry.routineId).catch(() => null) ?? null;
              if (routine) {
                const exerciseIds = routine.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
                const unique = [...new Set(exerciseIds)];
                const exercises = await forgeDB.exercises.bulkGet(unique).catch(() => []);
                for (const ex of exercises) {
                  if (ex) exerciseNames[ex.id] = ex.name;
                }
              }
            }
            const ds = run.dayStates.find(
              (s) => s.weekIndex === nextDay.weekIndex && s.dayIndex === nextDay.dayIndex,
            );
            dayStatus = ds?.status ?? "not_started";
            daySessionId = ds?.sessionId ?? null;
          }

          activeRunStates.push({
            run,
            program,
            routine,
            exerciseNames,
            dayStatus,
            daySessionId,
            weekDots: buildProgramWeekDots(program, run),
          });
        }
      } catch {
        // ok
      }

      const calendarDots = buildCalendarDots(now, finishedByDate, scheduledWorkoutDates);

      // Top goals
      let topGoals: Goal[] = [];
      try {
        const goals = await forgeDB.goals
          .where("status")
          .equals("active")
          .toArray() as Goal[];
        goals.sort((a, b) => {
          if (a.deadline == null && b.deadline == null) return b.updatedAt - a.updatedAt;
          if (a.deadline == null) return 1;
          if (b.deadline == null) return -1;
          return a.deadline - b.deadline || b.updatedAt - a.updatedAt;
        });
        topGoals = goals.slice(0, 2);
      } catch {
        // goals table not present yet
      }

      return {
        todayLocal: { ...toYMD(now), weekday: now.getDay() },
        weekStart,
        activeRunStates,
        activeProgramRun: activeRunStates[0]?.run ?? null,
        inProgressSession,
        calendarDots,
        weeklyStats: {
          workouts: weeklyWorkouts,
          volumeKg: weeklyVolumeKg,
          streakWeeks,
        },
        topGoals,
      };
    },
    staleTime: 10_000,
  });

  return { data: query.data, isLoading: query.isLoading };
}
