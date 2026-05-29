/**
 * Unit conversion and formatting utilities.
 * All storage is in SI units: weight in kg, distance in meters.
 */

// ─── Weight ──────────────────────────────────────────────────────────────────

export function convertWeight(kg: number, unit: "kg" | "lb"): number {
  return unit === "lb" ? kg * 2.20462 : kg;
}

export function formatWeight(kg: number, unit: "kg" | "lb"): string {
  const converted = convertWeight(kg, unit);
  const val = Math.round(converted * 10) / 10;
  const display = val % 1 === 0 ? String(val | 0) : val.toFixed(1);
  return `${display} ${unit}`;
}

export function weightToKg(display: number, unit: "kg" | "lb"): number {
  return unit === "lb" ? display / 2.20462 : display;
}

// ─── Distance ────────────────────────────────────────────────────────────────

export function distanceToMeters(display: number, unit: "m" | "km" | "mi"): number {
  if (unit === "km") return display * 1000;
  if (unit === "mi") return display * 1609.344;
  return display;
}

export function convertDistance(m: number, unit: "m" | "km" | "mi"): number {
  if (unit === "km") return m / 1000;
  if (unit === "mi") return m / 1609.344;
  return m;
}

export function formatDistance(m: number, unit: "m" | "km" | "mi"): string {
  if (unit === "m") {
    return `${Math.round(m)} m`;
  }
  const converted = convertDistance(m, unit);
  const val = Math.round(converted * 100) / 100;
  const display = val % 1 === 0 ? String(val | 0) : val.toFixed(2);
  return `${display} ${unit}`;
}
