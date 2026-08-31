/**
 * What to load on a barbell to reach a target weight.
 *
 * Bar weight and plate denominations are defaults, not truths: women's bars are
 * 15kg, a trap bar is its own thing, and a home gym does not stock what a
 * commercial one does. They are stated here in one place so a plate inventory in
 * Settings can replace them without touching the arithmetic.
 *
 * kg and lb are genuinely different sets of plates. Converting one into the other
 * and rounding produces weights nobody can load, so each unit keeps its own.
 */

export const DEFAULT_BAR_KG = 20;
export const DEFAULT_BAR_LB = 45;

/** Heaviest first — the greedy walk below depends on it. */
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_PLATES_LB = [45, 35, 25, 10, 5, 2.5];

export type PlateCount = { plate: number; count: number };

export type PlateLoading = {
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: PlateCount[];
  /** What the bar actually weighs once loaded — may differ from the target. */
  achievedWeight: number;
  barWeight: number;
  /** True when the target could not be made exactly from the available plates. */
  approximate: boolean;
};

export type PlateOptions = {
  barWeight?: number;
  plates?: number[];
};

export function defaultPlateOptions(unit: "kg" | "lb"): Required<PlateOptions> {
  return unit === "kg"
    ? { barWeight: DEFAULT_BAR_KG, plates: DEFAULT_PLATES_KG }
    : { barWeight: DEFAULT_BAR_LB, plates: DEFAULT_PLATES_LB };
}

/**
 * Plates per side for a target, or null when the target does not reach the bar.
 *
 * Plates go on in pairs, so this works in per-side halves and reports what it
 * actually achieved. A target that cannot be made exactly comes back with
 * `approximate: true` and the closest loading *at or below* the target rather
 * than silently rounding — being handed more weight than you asked for is worse
 * than being told the bar cannot make it.
 */
export function platesForTarget(
  targetWeight: number,
  unit: "kg" | "lb",
  options: PlateOptions = {},
): PlateLoading | null {
  const defaults = defaultPlateOptions(unit);
  const barWeight = options.barWeight ?? defaults.barWeight;
  const plates = [...(options.plates ?? defaults.plates)].sort((a, b) => b - a);

  // Below the bar there is nothing to work out, and an empty bar is not a loading.
  if (!Number.isFinite(targetWeight) || targetWeight < barWeight) return null;

  const perSideTarget = (targetWeight - barWeight) / 2;

  const perSide: PlateCount[] = [];
  let remaining = perSideTarget;

  for (const plate of plates) {
    if (plate <= 0) continue;
    // Floating point: 2.5 * 3 is not exactly 7.5 in binary.
    const count = Math.floor((remaining + 1e-9) / plate);
    if (count > 0) {
      perSide.push({ plate, count });
      remaining -= plate * count;
    }
  }

  const loadedPerSide = perSideTarget - remaining;
  const achievedWeight = barWeight + loadedPerSide * 2;

  return {
    perSide,
    achievedWeight: round(achievedWeight),
    barWeight,
    approximate: Math.abs(achievedWeight - targetWeight) > 1e-9,
  };
}

/** Trims binary noise like 82.49999999999999. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** "2×20, 1×5 per side" — or an explanation when there is nothing to load. */
export function describeLoading(loading: PlateLoading, unit: "kg" | "lb"): string {
  if (loading.perSide.length === 0) {
    return `Just the ${loading.barWeight}${unit} bar`;
  }
  const parts = loading.perSide.map(({ plate, count }) => `${count}×${plate}`);
  return `${parts.join(", ")} per side`;
}
