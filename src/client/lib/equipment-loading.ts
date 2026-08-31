/**
 * How an exercise is loaded — currently used to decide whether a plate breakdown
 * makes sense, since only a barbell has plates to work out.
 *
 * Equipment in this app is only `{ id, name }` — no category on the record — so
 * this maps by name. That is the honest constraint, not a design preference:
 * categorising equipment properly would be a schema change, and this file is
 * where to delete the guesswork when that happens.
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

/** Only a barbell has plates to work out. */
export function usesPlates(style: LoadStyle): boolean {
  return style === "barbell";
}
