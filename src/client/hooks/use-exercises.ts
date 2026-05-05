import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import { listExercises, getExerciseById } from "../db/queries";
import { queryKeys } from "../db/query-keys";

export function useExercises() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.exercises.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.exercises.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.exercises.list(),
    queryFn: listExercises,
  });
}

export function useExercise(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const sub = liveQuery(() => forgeDB.exercises.get(id)).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.exercises.byId(id) }),
    });
    return () => sub.unsubscribe();
  }, [id, qc]);

  return useQuery({
    queryKey: id ? queryKeys.exercises.byId(id) : ["exercises", "byId", "_disabled"],
    queryFn: () => (id ? getExerciseById(id) : undefined),
    enabled: !!id,
  });
}
