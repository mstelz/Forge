import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import { listPrograms, getProgramById } from "../db/queries";
import { queryKeys } from "../db/query-keys";

export function usePrograms() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.programs.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.programs.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.programs.list(),
    queryFn: listPrograms,
  });
}

export function useProgram(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const sub = liveQuery(() => forgeDB.programs.get(id)).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.programs.byId(id) }),
    });
    return () => sub.unsubscribe();
  }, [id, qc]);

  return useQuery({
    queryKey: id ? queryKeys.programs.byId(id) : ["programs", "byId", "_disabled"],
    queryFn: () => (id ? getProgramById(id) : undefined),
    enabled: !!id,
  });
}
