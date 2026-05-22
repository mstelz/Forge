import { useMemo } from "react";
import type { Program } from "../../../shared";

export function useFilteredPrograms(
  programs: Program[] | undefined,
  search: string,
): Program[] {
  return useMemo(() => {
    const all = programs ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? all.filter((p) => p.name.toLowerCase().includes(q))
      : all;
    return [...filtered].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [programs, search]);
}
