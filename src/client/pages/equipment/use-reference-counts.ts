import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../../db/forge-db";

const KEY = ["equipment", "referenceCounts"] as const;

async function computeAll(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await forgeDB.exercises.each((e) => {
    for (const id of e.equipmentIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  });
  return counts;
}

export function useEquipmentReferenceCounts() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.exercises.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: KEY }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: KEY,
    queryFn: computeAll,
  });
}
