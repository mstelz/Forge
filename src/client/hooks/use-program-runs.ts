import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import {
  listProgramRuns,
  getProgramRunById,
  getActiveRunForProgram,
  getGloballyActiveRun,
  listActiveRuns,
  listFinishedRunsForProgram,
} from "../db/queries";
import { queryKeys } from "../db/query-keys";

export function useProgramRuns() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.programRuns.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.programRuns.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.programRuns.list(),
    queryFn: listProgramRuns,
  });
}

export function useProgramRun(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const sub = liveQuery(() => forgeDB.programRuns.get(id)).subscribe({
      next: () =>
        qc.invalidateQueries({ queryKey: queryKeys.programRuns.byId(id) }),
    });
    return () => sub.unsubscribe();
  }, [id, qc]);

  return useQuery({
    queryKey: id
      ? queryKeys.programRuns.byId(id)
      : ["programRuns", "byId", "_disabled"],
    queryFn: () => (id ? getProgramRunById(id) : undefined),
    enabled: !!id,
  });
}

export function useActiveRunForProgram(programId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!programId) return;
    const sub = liveQuery(() =>
      forgeDB.programRuns
        .where("programId")
        .equals(programId)
        .toArray(),
    ).subscribe({
      next: () =>
        qc.invalidateQueries({
          queryKey: queryKeys.programRuns.activeForProgram(programId),
        }),
    });
    return () => sub.unsubscribe();
  }, [programId, qc]);

  return useQuery({
    queryKey: programId
      ? queryKeys.programRuns.activeForProgram(programId)
      : ["programRuns", "activeForProgram", "_disabled"],
    queryFn: () => (programId ? getActiveRunForProgram(programId) : null),
    enabled: !!programId,
  });
}

export function useActiveRuns() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() =>
      forgeDB.programRuns.where("status").equals("active").toArray(),
    ).subscribe({
      next: () =>
        qc.invalidateQueries({ queryKey: queryKeys.programRuns.activeList() }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.programRuns.activeList(),
    queryFn: listActiveRuns,
  });
}

export function useGloballyActiveRun() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() =>
      forgeDB.programRuns.where("status").equals("active").toArray(),
    ).subscribe({
      next: () =>
        qc.invalidateQueries({
          queryKey: queryKeys.programRuns.globallyActive(),
        }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.programRuns.globallyActive(),
    queryFn: getGloballyActiveRun,
  });
}

export function useFinishedRunsForProgram(programId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!programId) return;
    const sub = liveQuery(() =>
      forgeDB.programRuns
        .where("programId")
        .equals(programId)
        .toArray(),
    ).subscribe({
      next: () =>
        qc.invalidateQueries({
          queryKey: queryKeys.programRuns.finishedForProgram(programId),
        }),
    });
    return () => sub.unsubscribe();
  }, [programId, qc]);

  return useQuery({
    queryKey: programId
      ? queryKeys.programRuns.finishedForProgram(programId)
      : ["programRuns", "finishedForProgram", "_disabled"],
    queryFn: () =>
      programId ? listFinishedRunsForProgram(programId) : [],
    enabled: !!programId,
  });
}
