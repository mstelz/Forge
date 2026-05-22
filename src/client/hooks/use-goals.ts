import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import { listGoals, getGoal } from "../db/queries";
import { queryKeys } from "../db/query-keys";

export function useGoals() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.goals.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.goals.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.goals.list(),
    queryFn: listGoals,
  });
}

export function useGoal(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const sub = liveQuery(() => forgeDB.goals.get(id)).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.goals.byId(id) }),
    });
    return () => sub.unsubscribe();
  }, [id, qc]);

  return useQuery({
    queryKey: id ? queryKeys.goals.byId(id) : ["goals", "byId", "_disabled"],
    queryFn: () => (id ? getGoal(id) : undefined),
    enabled: !!id,
  });
}
