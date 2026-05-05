import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import { listRoutines, getRoutineById } from "../db/queries";
import { queryKeys } from "../db/query-keys";

export function useRoutines() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.routines.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.routines.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.routines.list(),
    queryFn: listRoutines,
  });
}

export function useRoutine(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const sub = liveQuery(() => forgeDB.routines.get(id)).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.routines.byId(id) }),
    });
    return () => sub.unsubscribe();
  }, [id, qc]);

  return useQuery({
    queryKey: id ? queryKeys.routines.byId(id) : ["routines", "byId", "_disabled"],
    queryFn: () => (id ? getRoutineById(id) : undefined),
    enabled: !!id,
  });
}
