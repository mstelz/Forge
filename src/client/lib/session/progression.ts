import { roundToLoadable } from "../equipment-loading";

/**
 * What to aim for this time, given what happened last time.
 *
 * Deliberately small. This is not a coaching engine and should not become one:
 * if you cleared the prescribed reps on every set, add the smallest increment the
 * equipment allows; if you missed, repeat. That is the whole rule.
 *
 * Two constraints shape it:
 *
 * **A confidently wrong suggestion is worse than none.** Where the increment is
 * unknowable — bodyweight, cardio, unrecognised equipment — this returns null and
 * the form falls back to simply prefilling last time's numbers, as it always did.
 *
 * **It is a suggestion.** The caller prefills it into a field the user can type
 * over. Nothing here blocks, nags, or refuses to be ignored.
 */

export type LastSet = {
  weightKg: number | null;
  reps: number | null;
};

export type RepTarget = {
  reps?: number;
  repsMin?: number;
  repsMax?: number;
};

export type Suggestion = {
  kind: "increase" | "repeat";
  weightKg: number;
  /** Reps to aim for; null when the plan does not prescribe any. */
  reps: number | null;
  /** Shown to the user, so they can disagree with the reasoning rather than the number. */
  reason: string;
};

/** The rep count a set has to reach to count as cleared. */
export function repsToClear(target: RepTarget): number | null {
  if (target.repsMax != null) return target.repsMax;
  if (target.reps != null) return target.reps;
  if (target.repsMin != null) return target.repsMin;
  return null;
}

/**
 * `lastSets` is every working set of the most recent session with this exercise.
 * `incrementKg` comes from the equipment; null means load is not the variable and
 * no suggestion will be made.
 */
export function suggestNextTarget(
  lastSets: LastSet[],
  target: RepTarget,
  incrementKg: number | null,
): Suggestion | null {
  if (incrementKg == null || incrementKg <= 0) return null;

  const loaded = lastSets.filter(
    (s): s is { weightKg: number; reps: number | null } =>
      s.weightKg != null && s.weightKg > 0,
  );
  if (loaded.length === 0) return null;

  // The working weight is the heaviest thing moved; lighter sets are back-offs.
  const workingWeight = Math.max(...loaded.map((s) => s.weightKg));
  const workingSets = loaded.filter((s) => s.weightKg === workingWeight);

  const required = repsToClear(target);

  // With no prescribed rep count there is nothing to have cleared, so repeating
  // is the only honest suggestion — and "same as last time" has to mean the reps
  // too, or a freeform exercise arrives with an empty reps field.
  if (required == null) {
    const lastWorkingSet = workingSets[workingSets.length - 1];
    return {
      kind: "repeat",
      weightKg: workingWeight,
      reps: lastWorkingSet?.reps ?? null,
      reason: "Same as last time",
    };
  }

  const clearedEverySet = workingSets.every((s) => s.reps != null && s.reps >= required);

  if (!clearedEverySet) {
    return {
      kind: "repeat",
      weightKg: workingWeight,
      reps: required,
      reason: `Repeat — last time fell short of ${required} reps`,
    };
  }

  return {
    kind: "increase",
    weightKg: roundToLoadable(workingWeight + incrementKg, incrementKg),
    reps: required,
    reason: `You cleared ${required} reps on every set`,
  };
}
