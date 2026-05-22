import { useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import { queryKeys } from "../db/query-keys";
import type { HistoryFilter } from "../../shared/history";
import type { SessionSummary, HistorySummary } from "../../shared/history";

// ---------------------------------------------------------------------------
// Range helpers
// ---------------------------------------------------------------------------

function rangeMs(range: HistoryFilter["range"]): { from: number; to: number } | null {
  if (range === "all") return null;
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (range === "week") {
    const day = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - day);
    return { from: weekStart.getTime(), to: now };
  }
  if (range === "month") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: monthStart.getTime(), to: now };
  }
  if (range === "year") {
    const yearStart = new Date(today.getFullYear(), 0, 1);
    return { from: yearStart.getTime(), to: now };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Base data fetcher — fetches all finished sessions + all logs
// ---------------------------------------------------------------------------

async function fetchFinishedSessions() {
  const sessions = await forgeDB.sessions
    .where("status")
    .equals("finished")
    .toArray();
  const logs = await forgeDB.sessionSetLogs.toArray();
  return { sessions, logs };
}

// ---------------------------------------------------------------------------
// Compute SessionSummary objects
// ---------------------------------------------------------------------------

function computeSummaries(
  sessions: Awaited<ReturnType<typeof fetchFinishedSessions>>["sessions"],
  logs: Awaited<ReturnType<typeof fetchFinishedSessions>>["logs"],
  filters: Partial<HistoryFilter>,
): SessionSummary[] {
  const range = filters.range ?? "all";
  const span = range === "custom"
    ? filters.from != null && filters.to != null
      ? { from: filters.from, to: filters.to }
      : null
    : rangeMs(range);

  const logsBySession = new Map<string, typeof logs>();
  for (const log of logs) {
    if (!logsBySession.has(log.sessionId)) logsBySession.set(log.sessionId, []);
    logsBySession.get(log.sessionId)!.push(log);
  }

  const results: SessionSummary[] = [];

  for (const session of sessions) {
    if (session.endedAt == null) continue;

    // Range filter
    if (span && (session.endedAt < span.from || session.endedAt > span.to)) continue;

    // Routine filter
    if (filters.routine && session.sourceRoutineId !== filters.routine) continue;

    // Exercise filter
    if (filters.exercise) {
      const sessionLogs = logsBySession.get(session.id) ?? [];
      if (!sessionLogs.some((l) => l.exerciseId === filters.exercise)) continue;
    }

    // Text search filter
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const matchTitle = session.title?.toLowerCase().includes(q) ?? false;
      const matchNotes = session.notes?.toLowerCase().includes(q) ?? false;
      if (!matchTitle && !matchNotes) continue;
    }

    const sessionLogs = logsBySession.get(session.id) ?? [];
    const loggedLogs = sessionLogs.filter((l) => l.status === "logged");

    const exerciseIds = new Set(loggedLogs.map((l) => l.exerciseId));
    const setCount = loggedLogs.length;
    const volumeKg = loggedLogs.reduce((sum, l) => {
      const type = l.setType;
      if (
        (type === "normal" || type === "drop" || type === "amrap" || type === "failure") &&
        l.weightKg != null &&
        l.reps != null
      ) {
        return sum + l.weightKg * l.reps;
      }
      return sum;
    }, 0);
    const durationMs = session.endedAt - session.startedAt;

    results.push({
      id: session.id,
      title: session.title ?? null,
      sourceType: session.sourceType,
      sourceRoutineId: session.sourceRoutineId ?? null,
      sourceRoutineName: null,
      sourceProgramId: session.sourceProgramId ?? null,
      sourceProgramName: null,
      sourceProgramWeekIndex: session.sourceProgramWeekIndex ?? null,
      sourceProgramDayIndex: session.sourceProgramDayIndex ?? null,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      exerciseCount: exerciseIds.size,
      setCount,
      volumeKg,
      durationMs,
      hasPr: false,
    });
  }

  // Sort newest first
  results.sort((a, b) => b.endedAt - a.endedAt);
  return results;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useHistorySessions(filters?: Partial<HistoryFilter>) {
  const qc = useQueryClient();
  const filtersJson = JSON.stringify(filters ?? {});

  useEffect(() => {
    const sub = liveQuery(async () => {
      const s = await forgeDB.sessions.count();
      const l = await forgeDB.sessionSetLogs.count();
      return { s, l };
    }).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.history.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.history.sessions(filtersJson),
    queryFn: async () => {
      const { sessions, logs } = await fetchFinishedSessions();
      return computeSummaries(sessions, logs, filters ?? {});
    },
  });
}

export function useHistorySummary(filters?: Partial<HistoryFilter>) {
  const qc = useQueryClient();
  const filtersJson = JSON.stringify(filters ?? {});

  useEffect(() => {
    const sub = liveQuery(async () => {
      const s = await forgeDB.sessions.count();
      const l = await forgeDB.sessionSetLogs.count();
      return { s, l };
    }).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.history.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.history.summary(filtersJson),
    queryFn: async (): Promise<HistorySummary> => {
      const { sessions, logs } = await fetchFinishedSessions();
      const summaries = computeSummaries(sessions, logs, filters ?? {});
      const totalSessions = summaries.length;
      const totalVolumeKg = summaries.reduce((s, x) => s + x.volumeKg, 0);
      const totalSets = summaries.reduce((s, x) => s + x.setCount, 0);
      const totalExercises = summaries.reduce((s, x) => s + x.exerciseCount, 0);
      const totalDurationMs = summaries.reduce((s, x) => s + x.durationMs, 0);
      return { totalSessions, totalVolumeKg, totalSets, totalExercises, totalDurationMs };
    },
  });
}
