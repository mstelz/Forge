import { useMemo } from "react";
import type { Routine } from "../../../shared";

export function useFilteredRoutines(
  routines: Routine[] | undefined,
  search: string,
): Routine[] {
  return useMemo(() => {
    if (!routines) return [];
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? routines.filter((r) => r.name.toLowerCase().includes(needle))
      : routines.slice();
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [routines, search]);
}
