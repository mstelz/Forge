import { useMemo } from "react";
import { useExercise } from "../../../hooks/use-exercises";
import { useEquipment } from "../../../hooks/use-equipment";
import { loadStyleForEquipment, usesPlates, type LoadStyle } from "../../../lib/equipment-loading";

export type ExerciseLoading = {
  style: LoadStyle;
  /** Whether a plate breakdown is worth offering. */
  hasPlates: boolean;
};

/**
 * How the exercise at the cursor is loaded.
 *
 * Both queries are already cached app-wide — the exercise list and equipment are
 * loaded once and reused — so this costs a lookup, not a read. While they are
 * still resolving the style reads as "unknown", which only means the plate
 * breakdown appears a moment late rather than wrongly.
 */
export function useLoadStyle(exerciseId: string | undefined): ExerciseLoading {
  const { data: exercise } = useExercise(exerciseId);
  const { data: equipment } = useEquipment();

  return useMemo(() => {
    const names = (exercise?.equipmentIds ?? [])
      .map((id) => equipment?.find((e) => e.id === id)?.name)
      .filter((name): name is string => !!name);

    const style = loadStyleForEquipment(names);
    return { style, hasPlates: usesPlates(style) };
  }, [exercise, equipment]);
}
