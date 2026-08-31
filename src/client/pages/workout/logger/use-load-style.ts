import { useMemo } from "react";
import { useExercise } from "../../../hooks/use-exercises";
import { useEquipment } from "../../../hooks/use-equipment";
import { loadIncrement, loadStyleForEquipment, usesPlates, type LoadStyle } from "../../../lib/equipment-loading";

export type ExerciseLoading = {
  style: LoadStyle;
  /** Smallest load change this equipment can make, or null if load is not the variable. */
  incrementKg: number | null;
  /** Whether a plate breakdown is worth offering. */
  hasPlates: boolean;
  /**
   * Both lookups have settled, so `style` is an answer rather than a not-yet.
   *
   * Callers that decide something once — like prefilling a suggested target — must
   * wait for this. Without it every exercise looks like unknown equipment on the
   * first render and the decision is made against nothing.
   *
   * Settled, not successful: an exercise missing from the catalogue resolves to
   * "no equipment" and is still an answer.
   */
  ready: boolean;
};

/**
 * How the exercise at the cursor is loaded.
 *
 * Both queries are already cached app-wide — the exercise list and equipment are
 * loaded once and reused — so this costs a lookup, not a read.
 */
export function useLoadStyle(exerciseId: string | undefined, weightUnit: "kg" | "lb"): ExerciseLoading {
  const { data: exercise, isFetched: exerciseFetched } = useExercise(exerciseId);
  const { data: equipment, isFetched: equipmentFetched } = useEquipment();
  const ready = !!exerciseId && exerciseFetched && equipmentFetched;

  return useMemo(() => {
    const names = (exercise?.equipmentIds ?? [])
      .map((id) => equipment?.find((e) => e.id === id)?.name)
      .filter((name): name is string => !!name);

    const style = loadStyleForEquipment(names);
    return {
      style,
      // Suggestions are made in the user's unit and stored in kg, so an lb user's
      // 5lb step must not become 5kg.
      incrementKg: toKg(loadIncrement(style, weightUnit), weightUnit),
      hasPlates: usesPlates(style),
      ready,
    };
  }, [exercise, equipment, weightUnit, ready]);
}

const LB_PER_KG = 2.2046226218;

function toKg(value: number | null, unit: "kg" | "lb"): number | null {
  if (value == null) return null;
  return unit === "kg" ? value : value / LB_PER_KG;
}
