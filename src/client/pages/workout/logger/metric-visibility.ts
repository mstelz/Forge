import type { ExerciseType } from "../../../../shared";

export type MetricFields = {
  showWeightReps: boolean;
  showDurationDistance: boolean;
};

/**
 * Which metric fields an exercise gets, decided by its own type and nothing else.
 *
 * This used to be gated by a "Show cardio" setting, which could leave a run with
 * no field capable of recording it — the exercise was loggable in principle and
 * impossible to log in practice. The exercise's `type` already carries this
 * information, so the setting could only ever contradict it.
 *
 * Whether cardio is *interesting* to a given user is a library-filtering question,
 * and the exercise picker already answers it with its type filter.
 */
export function metricFieldsFor(type: ExerciseType | undefined): MetricFields {
  return {
    showWeightReps: type !== "cardio",
    showDurationDistance: type === "cardio" || type === "mixed",
  };
}
