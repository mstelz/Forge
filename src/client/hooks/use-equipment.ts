import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import {
  listEquipment,
  getEquipmentById,
  countExercisesReferencingEquipment,
} from "../db/queries";
import { queryKeys } from "../db/query-keys";

export function useEquipment() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.equipment.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.equipment.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.equipment.list(),
    queryFn: listEquipment,
  });
}

export function useEquipmentItem(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const sub = liveQuery(() => forgeDB.equipment.get(id)).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.equipment.byId(id) }),
    });
    return () => sub.unsubscribe();
  }, [id, qc]);

  return useQuery({
    queryKey: id ? queryKeys.equipment.byId(id) : ["equipment", "byId", "_disabled"],
    queryFn: () => (id ? getEquipmentById(id) : undefined),
    enabled: !!id,
  });
}

export function useEquipmentReferenceCount(id: string | undefined) {
  return useQuery({
    queryKey: id
      ? queryKeys.equipment.referenceCount(id)
      : ["equipment", "referenceCount", "_disabled"],
    queryFn: () => (id ? countExercisesReferencingEquipment(id) : 0),
    enabled: !!id,
  });
}
