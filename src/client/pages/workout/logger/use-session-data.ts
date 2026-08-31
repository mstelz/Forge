import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../../../db/forge-db";
import { getActiveSession, listSessionLogs } from "../../../db/queries";
import { queryKeys } from "../../../db/query-keys";
import { parseLiveStructure } from "./structure";
import type { ExerciseType, SessionSetLog } from "../../../../shared";
import type { LiveStructure } from "./types";

/**
 * The active session, its logs, and the parsed live structure — all kept in sync
 * with Dexie by liveQuery subscriptions that invalidate the react-query caches.
 * Redirects to the start screen when there is no active session.
 */
export function useSessionData() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const sub = liveQuery(() => forgeDB.sessions.count()).subscribe({
      next: () => {
        qc.invalidateQueries({ queryKey: queryKeys.sessions.active() });
      },
    });
    return () => sub.unsubscribe();
  }, [qc]);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: queryKeys.sessions.active(),
    queryFn: getActiveSession,
  });

  useEffect(() => {
    if (!sessionLoading && !session) {
      navigate("/workout/start", { replace: true });
    }
  }, [session, sessionLoading, navigate]);

  const sessionId = session?.id;

  useEffect(() => {
    if (!sessionId) return;
    const sub = liveQuery(() => forgeDB.sessionSetLogs.count()).subscribe({
      next: () => {
        qc.invalidateQueries({ queryKey: queryKeys.sessions.logs(sessionId) });
      },
    });
    return () => sub.unsubscribe();
  }, [sessionId, qc]);

  const { data: rawLogs } = useQuery({
    queryKey: sessionId
      ? queryKeys.sessions.logs(sessionId)
      : ["sessions", "logs", "_disabled"],
    queryFn: () => (sessionId ? listSessionLogs(sessionId) : undefined),
    enabled: !!sessionId,
  });
  const logs: SessionSetLog[] = rawLogs ?? [];

  const liveStructure = useMemo<LiveStructure>(() => {
    if (!session) return { blocks: [] };
    return parseLiveStructure(session.liveStructure);
  }, [session]);

  return { session, sessionLoading, logs, liveStructure };
}

/**
 * Exercise names and types for everything in the structure, lazily pulled from
 * IndexedDB. They live in refs rather than state because the maps are read during
 * render by many rows and only ever grow — a re-render is forced once per batch.
 */
export function useExerciseMeta(liveStructure: LiveStructure) {
  const exerciseNamesRef = useRef<Map<string, string>>(new Map());
  const exerciseTypesRef = useRef<Map<string, ExerciseType>>(new Map());
  const [, forceRender] = useState(0);

  useEffect(() => {
    const ids = new Set<string>();
    for (const block of liveStructure.blocks) {
      for (const item of block.items) {
        ids.add(item.exerciseId);
      }
    }
    const toFetch = [...ids].filter((id) => !exerciseNamesRef.current.has(id));
    if (toFetch.length === 0) return;

    Promise.all(
      toFetch.map((id) =>
        forgeDB.exercises
          .get(id)
          .then((ex) => [id, ex?.name ?? "Exercise", ex?.type ?? "strength"] as const),
      ),
    ).then((pairs) => {
      for (const [id, name, type] of pairs) {
        exerciseNamesRef.current.set(id, name);
        exerciseTypesRef.current.set(id, type as ExerciseType);
      }
      forceRender((n) => n + 1);
    });
  }, [liveStructure]);

  return { exerciseNamesRef, exerciseTypesRef };
}
