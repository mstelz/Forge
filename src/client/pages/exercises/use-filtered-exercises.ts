import { useMemo } from "react";
import type { Exercise } from "../../../shared";
import type { TypeFilter, MuscleFilter } from "./filter-chips";

export type ExerciseFilters = {
  search: string;
  type: TypeFilter;
  muscle: MuscleFilter;
  equipmentIds: Set<string>;
};

type Ranked = { exercise: Exercise; primaryRank: number };

const matchesSearch = (e: Exercise, q: string): boolean => {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (e.name.toLowerCase().includes(needle)) return true;
  return e.aliases.some((a) => a.includes(needle));
};

const matchesType = (e: Exercise, t: TypeFilter) => t === "all" || e.type === t;

const muscleRank = (e: Exercise, m: MuscleFilter): number => {
  if (m === "all") return 0;
  if (e.primaryMuscles.includes(m)) return 2;
  if (e.secondaryMuscles.includes(m)) return 1;
  return -1;
};

const matchesEquipment = (e: Exercise, ids: Set<string>) => {
  if (ids.size === 0) return true;
  return e.equipmentIds.some((id) => ids.has(id));
};

export function useFilteredExercises(
  exercises: Exercise[] | undefined,
  filters: ExerciseFilters,
): Exercise[] {
  return useMemo(() => {
    if (!exercises) return [];
    const ranked: Ranked[] = [];
    for (const e of exercises) {
      if (!matchesSearch(e, filters.search)) continue;
      if (!matchesType(e, filters.type)) continue;
      const rank = muscleRank(e, filters.muscle);
      if (rank < 0) continue;
      if (!matchesEquipment(e, filters.equipmentIds)) continue;
      ranked.push({ exercise: e, primaryRank: rank });
    }
    ranked.sort((a, b) => {
      if (a.primaryRank !== b.primaryRank) return b.primaryRank - a.primaryRank;
      const al = a.exercise.lastUsedAt;
      const bl = b.exercise.lastUsedAt;
      if (al !== bl) {
        if (al == null) return 1;
        if (bl == null) return -1;
        return bl - al;
      }
      return a.exercise.name.localeCompare(b.exercise.name);
    });
    return ranked.map((r) => r.exercise);
  }, [exercises, filters.search, filters.type, filters.muscle, filters.equipmentIds]);
}
