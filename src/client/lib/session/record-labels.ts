import { formatWeight, formatDistance } from "../units";
import { formatHms } from "../time";
import type { ExerciseRecord, RecordKind } from "./records";

/**
 * Naming a record. "PR" on its own says nothing — the point is which record and
 * by how much, in the units the user actually thinks in.
 *
 * Kept apart from `records.ts` so detection stays pure and unit-agnostic: the
 * detector deals in kg, metres and seconds, and only this layer knows what the
 * user has their settings set to.
 */

export type RecordUnits = {
  weightUnit: "kg" | "lb";
  distanceUnit: "m" | "km" | "mi";
};

const KIND_LABELS: Record<RecordKind, string> = {
  estimated1RM: "Best estimated 1RM",
  heaviestWeight: "Heaviest set",
  longestDistance: "Longest distance",
  longestDuration: "Longest time",
  fastestPace: "Fastest pace",
};

/** Short label for a badge, where there is no room to say more. */
const KIND_BADGES: Record<RecordKind, string> = {
  estimated1RM: "1RM PR",
  heaviestWeight: "Weight PR",
  longestDistance: "Distance PR",
  longestDuration: "Time PR",
  fastestPace: "Pace PR",
};

export function recordBadge(record: ExerciseRecord): string {
  return KIND_BADGES[record.kind];
}

/** Pace is stored as seconds per metre; lifters read it per km or per mile. */
function formatPace(secPerM: number, distanceUnit: RecordUnits["distanceUnit"]): string {
  // Metres are too small a denominator to read a pace over.
  const perUnit = distanceUnit === "mi" ? 1609.344 : 1000;
  const suffix = distanceUnit === "mi" ? "/mi" : "/km";
  return `${formatHms(Math.round(secPerM * perUnit))}${suffix}`;
}

function formatValue(kind: RecordKind, value: number, units: RecordUnits): string {
  switch (kind) {
    case "estimated1RM":
    case "heaviestWeight":
      return formatWeight(value, units.weightUnit);
    case "longestDistance":
      return formatDistance(value, units.distanceUnit);
    case "longestDuration":
      return formatHms(Math.round(value));
    case "fastestPace":
      return formatPace(value, units.distanceUnit);
  }
}

/**
 * e.g. "Heaviest set: 110 kg, up from 100 kg".
 *
 * A colon rather than a dash, because callers prefix the exercise name with one —
 * "Bench Press — Heaviest set — 110 kg" reads like a list of three things.
 */
export function describeRecord(record: ExerciseRecord, units: RecordUnits): string {
  const value = formatValue(record.kind, record.value, units);
  const previous = formatValue(record.kind, record.previous, units);
  // A faster pace is a smaller number, so "up from" would read as a slowdown.
  const direction = record.kind === "fastestPace" ? "down from" : "up from";
  return `${KIND_LABELS[record.kind]}: ${value}, ${direction} ${previous}`;
}

/**
 * The one record worth announcing when a set beats several at once. Beating your
 * heaviest set is the more visceral achievement, so it leads; pace beats the two
 * cardio "longest" records for the same reason.
 */
const ANNOUNCEMENT_PRIORITY: RecordKind[] = [
  "heaviestWeight",
  "estimated1RM",
  "fastestPace",
  "longestDistance",
  "longestDuration",
];

export function headlineRecord(records: ExerciseRecord[]): ExerciseRecord | null {
  for (const kind of ANNOUNCEMENT_PRIORITY) {
    const match = records.find((r) => r.kind === kind);
    if (match) return match;
  }
  return records[0] ?? null;
}
