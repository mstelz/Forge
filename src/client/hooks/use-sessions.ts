import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import {
  listSessions,
  getSessionById,
  getActiveSession,
  listSessionLogs,
  listLogsForExercise,
  getLastLogForExercise,
  listAllSessionLogs,
} from "../db/queries";
import { queryKeys } from "../db/query-keys";

export function useSessions() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.sessions.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.sessions.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.sessions.list(),
    queryFn: listSessions,
  });
}

export function useSession(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const sub = liveQuery(() => forgeDB.sessions.get(id)).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.sessions.byId(id) }),
    });
    return () => sub.unsubscribe();
  }, [id, qc]);

  return useQuery({
    queryKey: id ? queryKeys.sessions.byId(id) : ["sessions", "byId", "_disabled"],
    queryFn: () => (id ? getSessionById(id) : undefined),
    enabled: !!id,
  });
}

export function useActiveSession() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.sessions.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.sessions.active() }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.sessions.active(),
    queryFn: getActiveSession,
  });
}

export function useSessionLogs(sessionId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!sessionId) return;
    const sub = liveQuery(() => forgeDB.sessionSetLogs.count()).subscribe({
      next: () =>
        qc.invalidateQueries({ queryKey: queryKeys.sessions.logs(sessionId) }),
    });
    return () => sub.unsubscribe();
  }, [sessionId, qc]);

  return useQuery({
    queryKey: sessionId
      ? queryKeys.sessions.logs(sessionId)
      : ["sessions", "logs", "_disabled"],
    queryFn: () => (sessionId ? listSessionLogs(sessionId) : undefined),
    enabled: !!sessionId,
  });
}

export function useExerciseLogs(exerciseId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!exerciseId) return;
    const sub = liveQuery(() => forgeDB.sessionSetLogs.count()).subscribe({
      next: () =>
        qc.invalidateQueries({
          queryKey: queryKeys.exerciseHistory.byExerciseId(exerciseId),
        }),
    });
    return () => sub.unsubscribe();
  }, [exerciseId, qc]);

  return useQuery({
    queryKey: exerciseId
      ? queryKeys.exerciseHistory.byExerciseId(exerciseId)
      : ["exerciseHistory", "_disabled"],
    queryFn: () => (exerciseId ? listLogsForExercise(exerciseId) : undefined),
    enabled: !!exerciseId,
  });
}

export function useLastLogForExercise(exerciseId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!exerciseId) return;
    const sub = liveQuery(() => forgeDB.sessionSetLogs.count()).subscribe({
      next: () =>
        qc.invalidateQueries({
          queryKey: queryKeys.exerciseHistory.lastLog(exerciseId),
        }),
    });
    return () => sub.unsubscribe();
  }, [exerciseId, qc]);

  return useQuery({
    queryKey: exerciseId
      ? queryKeys.exerciseHistory.lastLog(exerciseId)
      : ["exerciseHistory", "lastLog", "_disabled"],
    queryFn: () => (exerciseId ? getLastLogForExercise(exerciseId) : undefined),
    enabled: !!exerciseId,
  });
}

export function useAllSessionLogs() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.sessionSetLogs.toArray()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.sessions.allLogs() }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.sessions.allLogs(),
    queryFn: listAllSessionLogs,
  });
}
