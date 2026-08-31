import { useMemo } from "react";
import { recordsByLogId, type ExerciseRecord } from "../../../lib/session/records";
import { useLastTimeForExercise } from "./last-time";

/**
 * Which of this exercise's sets set a record, keyed by log id.
 *
 * Rides on the same cached query the "Last time" hint already uses, so showing
 * records costs no extra reads — and one call per exercise, not per set row.
 */
export function useExerciseRecords(exerciseId: string): Map<string, ExerciseRecord[]> {
  const { data: allLogs } = useLastTimeForExercise(exerciseId);

  return useMemo(
    () => (allLogs ? recordsByLogId(allLogs) : new Map<string, ExerciseRecord[]>()),
    [allLogs],
  );
}
