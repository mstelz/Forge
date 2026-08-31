/**
 * How an exercise is loaded, and therefore what weights it can actually be set to.
 *
 * "Add 2.5kg" is wrong for most of a gym. A barbell moves in pairs of the smallest
 * plate; a dumbbell rack jumps in fixed steps; a stack has pins; a pull-up has no
 * load at all. Getting this wrong is worse than staying quiet — a lifter who
 * trusts a number that cannot be loaded stands at the rack doing arithmetic.
 *
 * Equipment in this app is only `{ id, name }` — there is no increment or category
 * on the record — so this maps by name. That is the honest constraint, not a
 * design preference: putting the increment on the equipment record would be a
 * schema change, and this file is where to delete the guesswork when that happens.
 */

export type LoadStyle =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "bodyweight"
  | "cardio"
  | "unknown";

/** Matched against equipment names, most specific first. */
const NAME_PATTERNS: { pattern: RegExp; style: LoadStyle }[] = [
  { pattern: /\bbarbell\b/i, style: "barbell" },
  { pattern: /\bsmith\b/i, style: "barbell" },
  { pattern: /\bdumbbell/i, style: "dumbbell" },
  { pattern: /\bkettlebell/i, style: "dumbbell" },
  { pattern: /\bcable|machine|stack|press\b/i, style: "machine" },
  { pattern: /\bbodyweight|pull-?up bar|dip bar|bench\b/i, style: "bodyweight" },
  { pattern: /\btreadmill|rower|erg|bike|elliptical\b/i, style: "cardio" },
  { pattern: /^none$/i, style: "bodyweight" },
];

export function loadStyleForEquipment(equipmentNames: string[]): LoadStyle {
  for (const { pattern, style } of NAME_PATTERNS) {
    if (equipmentNames.some((name) => pattern.test(name))) return style;
  }
  return "unknown";
}

/**
 * The smallest change in total load this style can actually make.
 *
 * Null means "do not suggest a load change": bodyweight progresses in reps,
 * cardio in distance or time, and an unrecognised piece of equipment could be
 * anything at all.
 */
export function loadIncrement(style: LoadStyle, unit: "kg" | "lb"): number | null {
  const kg = unit === "kg";
  switch (style) {
    // A pair of the smallest plates most gyms stock.
    case "barbell":
      return kg ? 2.5 : 5;
    // Per hand, and racks jump in fixed steps.
    case "dumbbell":
      return kg ? 2 : 5;
    // Stack pins are coarse and often uneven; this is the common case, not a rule.
    case "machine":
      return kg ? 5 : 10;
    case "bodyweight":
    case "cardio":
    case "unknown":
      return null;
  }
}

/** Only a barbell has plates to work out. */
export function usesPlates(style: LoadStyle): boolean {
  return style === "barbell";
}

/** Rounds to something the equipment can actually be set to. */
export function roundToLoadable(weight: number, increment: number | null): number {
  if (!increment || increment <= 0) return weight;
  return Math.round(weight / increment) * increment;
}
