/**
 * useHomepageState — composed read-only hook for the Today / Homepage surface.
 *
 * Reads from existing Dexie stores only. No server calls, no mutations.
 */

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import type { Session, SessionSetLog, Routine, Program, ProgramRun } from "../../shared";
import { isVolumeLog } from "../hooks/use-history";

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

export type HomepageState = {
  todayLocal: { y: number; m: number; d: number; weekday: number };
  weekStart: number; // unix ms, Monday 00:00 local
  activeProgramRun: ProgramRun | null;
  todayPlannedDay: null;
  todayRoutine: Routine | null;
  /** Status of today's program day, null if no program day is scheduled for today. */
  todayProgramDayStatus: "not_started" | "active" | "completed" | "skipped" | null;
  /** Session ID linked to today's completed/active program day, if any. */
  todayProgramDaySessionId: string | null;
  inProgressSession: Session | null;
  weekDots: HomepageWeekDot[];
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

/**
 * Get the week-zero Monday ms for a run.
 * Falls back to startedAt-aligned Monday for old runs without weekZeroStartDate.
 */
function getWeekZeroMs(run: ProgramRun): number {
  return run.weekZeroStartDate ?? getMondayWeekStart(new Date(run.startedAt)).getTime();
}

/**
 * Given a calendar date, compute (weekIndex, dayIndex) in the program.
 * Returns null if outside the program's range.
 * dayIndex: 0=Mon, 1=Tue, ..., 6=Sun
 */
function calendarDateToProgramDay(
  date: Date,
  program: Program,
  run: ProgramRun,
): { weekIndex: number; dayIndex: number } | null {
  const weekZeroMs = getWeekZeroMs(run);
  const dateMonday = getMondayWeekStart(date);
  const weekIndex = Math.round((dateMonday.getTime() - weekZeroMs) / (7 * 86400000));
  if (weekIndex < 0 || weekIndex >= program.durationWeeks) return null;
  const dow = date.getDay(); // 0=Sun
  const dayIndex = (dow + 6) % 7; // 0=Mon
  return { weekIndex, dayIndex };
}

// ---------------------------------------------------------------------------
// weekDots: build from active program, or emit 7 "empty" dots
// ---------------------------------------------------------------------------

function buildEmptyWeekDots(): HomepageWeekDot[] {
  return Array.from({ length: 7 }, (_, i) => ({ index: i, state: "empty" as WeekDotState }));
}

function buildProgramWeekDots(
  program: Program,
  run: ProgramRun,
  today: Date,
): HomepageWeekDot[] {
  const thisWeekMonday = getMondayWeekStart(today);
  const weekZeroMs = getWeekZeroMs(run);
  const weekIndex = Math.round((thisWeekMonday.getTime() - weekZeroMs) / (7 * 86400000));

  if (weekIndex < 0 || weekIndex >= program.durationWeeks) {
    return buildEmptyWeekDots();
  }

  const todayDow = today.getDay();
  const todayDayIndex = (todayDow + 6) % 7; // 0=Mon

  return Array.from({ length: 7 }, (_, dayIndex): HomepageWeekDot => {
    const programDay = program.days.find(
      (d) => d.weekIndex === weekIndex && d.dayIndex === dayIndex,
    );
    const ds = run.dayStates.find(
      (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
    );
    const isToday = dayIndex === todayDayIndex;

    if (!programDay) {
      return { index: dayIndex, state: "empty" };
    }

    if (programDay.isRestDay) {
      return { index: dayIndex, state: "rest" };
    }

    if (!programDay.routineId) {
      return { index: dayIndex, state: "empty" };
    }

    const status = ds?.status ?? "not_started";

    if (status === "completed") return { index: dayIndex, state: "done" };
    if (status === "skipped") return { index: dayIndex, state: "skipped" };
    if (isToday && status === "active") return { index: dayIndex, state: "today_active" };
    if (isToday) return { index: dayIndex, state: "today_idle" };
    return { index: dayIndex, state: "planned" };
  });
}

// ---------------------------------------------------------------------------
// calendarDots derivation
// ---------------------------------------------------------------------------

function buildCalendarDots(
  today: Date,
  finishedSessionsByDate: Map<string, boolean>,
  program: Program | null,
  run: ProgramRun | null,
): HomepageCalendarDot[] {
  const days = calendarWeekDays(today);
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  return days.map((d) => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const ymd = toYMD(d);

    let hasScheduledWorkout = false;
    if (program && run) {
      const slot = calendarDateToProgramDay(d, program, run);
      if (slot) {
        const pd = program.days.find(
          (p) => p.weekIndex === slot.weekIndex && p.dayIndex === slot.dayIndex,
        );
        hasScheduledWorkout = !!(pd?.routineId && !pd.isRestDay);
      }
    }

    return {
      ...ymd,
      hasFinishedSession: finishedSessionsByDate.has(key),
      hasScheduledWorkout,
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

  // Load planned routine from active program run
  let plannedRoutine: Routine | null = null;
  let isRestDay = false;
  try {
    const activeRun = await forgeDB.programRuns
      .where("status")
      .equals("active")
      .first();
    if (activeRun) {
      const program = await forgeDB.programs.get(activeRun.programId);
      if (program) {
        const dayDate = new Date(date.y, date.m - 1, date.d, 0, 0, 0, 0);
        const slot = calendarDateToProgramDay(dayDate, program, activeRun);
        if (slot) {
          const pd = program.days.find(
            (d) => d.weekIndex === slot.weekIndex && d.dayIndex === slot.dayIndex,
          );
          if (pd?.isRestDay) {
            isRestDay = true;
          } else if (pd?.routineId) {
            plannedRoutine = await forgeDB.routines.get(pd.routineId).catch(() => null) ?? null;
          }
        }
      }
    }
  } catch {
    // programRuns or programs table may not exist yet
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

      // Active program run
      let activeProgramRun: ProgramRun | null = null;
      let activeProgram: Program | null = null;
      let todayRoutine: Routine | null = null;
      let todayProgramDayStatus: HomepageState["todayProgramDayStatus"] = null;
      let todayProgramDaySessionId: string | null = null;

      try {
        activeProgramRun = await forgeDB.programRuns
          .where("status")
          .equals("active")
          .first() ?? null;

        if (activeProgramRun) {
          activeProgram = await forgeDB.programs.get(activeProgramRun.programId) ?? null;

          if (activeProgram) {
            const slot = calendarDateToProgramDay(now, activeProgram, activeProgramRun);
            if (slot) {
              const pd = activeProgram.days.find(
                (d) => d.weekIndex === slot.weekIndex && d.dayIndex === slot.dayIndex,
              );
              if (pd?.routineId && !pd.isRestDay) {
                todayRoutine = await forgeDB.routines.get(pd.routineId).catch(() => null) ?? null;
                const ds = activeProgramRun.dayStates.find(
                  (s) => s.weekIndex === slot.weekIndex && s.dayIndex === slot.dayIndex,
                );
                todayProgramDayStatus = ds?.status ?? "not_started";
                todayProgramDaySessionId = ds?.sessionId ?? null;
              } else if (pd?.isRestDay) {
                todayProgramDayStatus = null; // rest day, not a workout day
              }
            }
          }
        }
      } catch {
        // ok
      }

      const weekDots = activeProgram && activeProgramRun
        ? buildProgramWeekDots(activeProgram, activeProgramRun, now)
        : buildEmptyWeekDots();

      const calendarDots = buildCalendarDots(now, finishedByDate, activeProgram, activeProgramRun);

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
        activeProgramRun,
        todayPlannedDay: null,
        todayRoutine,
        todayProgramDayStatus,
        todayProgramDaySessionId,
        inProgressSession,
        weekDots,
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
