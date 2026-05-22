/**
 * useHomepageState — composed read-only hook for the Today / Homepage surface.
 *
 * Reads from existing Dexie stores only. No server calls, no mutations.
 * Programs and Goals tables are accessed defensively; if they don't exist yet
 * the hook returns safe null/empty defaults.
 */

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import type { Session, SessionSetLog, Routine } from "../../shared";
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
  isToday: boolean;
};

export type HomepageState = {
  todayLocal: { y: number; m: number; d: number; weekday: number };
  weekStart: number; // unix ms, Monday 00:00 local
  activeProgramRun: null; // programs spec not yet implemented; always null
  todayPlannedDay: null;
  todayRoutine: Routine | null;
  inProgressSession: Session | null;
  weekDots: HomepageWeekDot[];
  calendarDots: HomepageCalendarDot[];
  weeklyStats: { workouts: number; volumeKg: number; streakWeeks: number };
  topGoals: Goal[];
};

/** Minimal goal shape (goals spec not yet implemented). */
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
  plannedDayState: null; // programs spec not yet implemented
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
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const dow = d.getDay(); // 0–6
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

  // Get the Monday start for each finished session's endedAt week
  const weekStartsWithSessions = new Set<number>();
  for (const s of finishedWithEnd) {
    const weekStart = getMondayWeekStart(new Date(s.endedAt!));
    weekStartsWithSessions.add(weekStart.getTime());
  }

  const thisWeekStart = getMondayWeekStart(now);
  const thisWeekHasSessions = weekStartsWithSessions.has(thisWeekStart.getTime());

  // Walk backwards from this week (if it has sessions) or last week
  let streak = 0;
  let currentWeekStart = new Date(thisWeekStart);

  if (!thisWeekHasSessions) {
    // Start counting from previous week
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  }

  while (weekStartsWithSessions.has(currentWeekStart.getTime())) {
    streak++;
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  }

  return streak;
}

// ---------------------------------------------------------------------------
// Weekly volume helper — identical predicate to workout-history spec
// (delegated to isVolumeLog from use-history.ts — single source of truth)
// ---------------------------------------------------------------------------

export function computeWeeklyVolumeKg(logs: SessionSetLog[]): number {
  return logs.filter(isVolumeLog).reduce((acc, l) => acc + (l.weightKg ?? 0) * (l.reps ?? 0), 0);
}

// ---------------------------------------------------------------------------
// weekDots: when no program is active, emit 7 "empty" dots
// ---------------------------------------------------------------------------

function buildEmptyWeekDots(): HomepageWeekDot[] {
  return Array.from({ length: 7 }, (_, i) => ({ index: i, state: "empty" as WeekDotState }));
}

// ---------------------------------------------------------------------------
// calendarDots derivation
// ---------------------------------------------------------------------------

function buildCalendarDots(
  today: Date,
  finishedSessionsByDate: Map<string, boolean>,
): HomepageCalendarDot[] {
  const days = calendarWeekDays(today);
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  return days.map((d) => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const ymd = toYMD(d);
    return {
      ...ymd,
      hasFinishedSession: finishedSessionsByDate.has(key),
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

  // Find session for this day (startedAt within the day)
  let session: Session | null = null;
  try {
    const sessions = await forgeDB.sessions
      .where("startedAt")
      .between(start, end, true, true)
      .toArray();
    if (sessions.length > 0) {
      // Prefer in-progress, then most recent
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

  return {
    date,
    plannedRoutine: null, // programs not yet implemented
    plannedDayState: null,
    session,
    sessionStats,
    isRestDay: false,
    isFutureDay,
  };
}

// ---------------------------------------------------------------------------
// useHomepageState hook
// ---------------------------------------------------------------------------

const HOMEPAGE_KEY = ["homepage", "state"] as const;

export function useHomepageState(): { data: HomepageState | undefined; isLoading: boolean } {
  const qc = useQueryClient();

  // Invalidate on any session or session-log change
  useEffect(() => {
    const subs = [
      liveQuery(() => forgeDB.sessions.count()).subscribe({
        next: () => qc.invalidateQueries({ queryKey: HOMEPAGE_KEY }),
      }),
      liveQuery(() => forgeDB.sessionSetLogs.count()).subscribe({
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
      todayLocal; // used below

      const weekStartDate = getMondayWeekStart(now);
      const weekStart = weekStartDate.getTime();

      // 1.3 — in-progress session (pick MAX updatedAt if > 1)
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
        // sessions table may not be populated
      }

      // 1.4 — weekly stats
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

      // 1.5 — calendarDots
      const finishedByDate = new Map<string, boolean>();
      for (const s of sessions) {
        if (s.endedAt == null) continue;
        const d = new Date(s.endedAt);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        finishedByDate.set(key, true);
      }
      const calendarDots = buildCalendarDots(now, finishedByDate);

      // 1.5 — weekDots (no active program = 7 empty dots)
      const weekDots = buildEmptyWeekDots();

      // 1.6 — topGoals (goals spec not yet implemented; read defensively)
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
        activeProgramRun: null,
        todayPlannedDay: null,
        todayRoutine: null,
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
