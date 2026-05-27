import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../db/forge-db";
import { queryKeys } from "../db/query-keys";
import { SETTINGS_ID } from "../../shared/settings";

export function useSettings() {
  const qc = useQueryClient();

  useEffect(() => {
    const sub = liveQuery(() => forgeDB.settings.get(SETTINGS_ID)).subscribe({
      next: () => qc.invalidateQueries({ queryKey: queryKeys.settings.all }),
    });
    return () => sub.unsubscribe();
  }, [qc]);

  return useQuery({
    queryKey: queryKeys.settings.singleton(),
    queryFn: () => forgeDB.settings.get(SETTINGS_ID),
  });
}
