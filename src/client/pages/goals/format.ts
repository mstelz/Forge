/**
 * Formats a numeric value for display on a goal card.
 * - For 'program' goals, handled separately via program display.
 * - For time-based units (containing ':'), format as mm:ss.
 * - Otherwise, format with up to 2 decimal places but strip trailing zeros.
 */
export function formatGoalValue(value: number | null, unit: string | null): string {
  if (value == null) return "—";

  // Time-based (unit contains ':' or is 'sec', 'min', etc.)
  if (unit && unit.includes(":")) {
    return formatSeconds(value);
  }

  // Numeric
  const n = parseFloat(value.toFixed(2));
  return String(n);
}

/**
 * Formats seconds as mm:ss.
 */
export function formatSeconds(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Returns a display label for the unit.
 */
export function unitLabel(unit: string | null): string {
  if (!unit) return "";
  return unit;
}
