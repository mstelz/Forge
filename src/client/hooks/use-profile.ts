import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import { listProfiles, getProfileById, listWeightLogs } from "../db/queries";
import { queryKeys } from "../db/query-keys";

export function useProfiles() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.profiles.count()).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.profiles.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.profiles.list(),
    queryFn: listProfiles,
  });
}

export function useProfile(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const sub = liveQuery(() => forgeDB.profiles.get(id)).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.profiles.byId(id) }),
    });
    return () => sub.unsubscribe();
  }, [id, qc]);

  return useQuery({
    queryKey: id ? queryKeys.profiles.byId(id) : ["profiles", "byId", "_disabled"],
    queryFn: () => (id ? getProfileById(id) : undefined),
    enabled: !!id,
  });
}

export function useWeightLogs(profileId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!profileId) return;
    const sub = liveQuery(() =>
      forgeDB.weightLogs.where("profileId").equals(profileId).count(),
    ).subscribe({
      next: () =>
        qc.invalidateQueries({ queryKey: queryKeys.weightLogs.byProfileId(profileId) }),
    });
    return () => sub.unsubscribe();
  }, [profileId, qc]);

  return useQuery({
    queryKey: profileId
      ? queryKeys.weightLogs.byProfileId(profileId)
      : ["weightLogs", "_disabled"],
    queryFn: () => (profileId ? listWeightLogs(profileId) : []),
    enabled: !!profileId,
  });
}
