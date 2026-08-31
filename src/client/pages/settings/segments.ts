import type { Settings } from "../../../shared/settings";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export const WEIGHT_UNIT_SEGMENTS: SegmentOption<Settings["weightUnit"]>[] = [
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
];

/**
 * `m` is a real display choice, not just the storage unit: `formatDistance` renders
 * "400 m" for it and the logger steps distance by 100 m instead of 0.25 (see
 * lib/units.ts and pages/workout/active.tsx). It gets its own segment so the
 * control can never show a unit the user did not pick.
 */
export const DISTANCE_UNIT_SEGMENTS: SegmentOption<Settings["distanceUnit"]>[] = [
  { value: "m", label: "m" },
  { value: "km", label: "km" },
  { value: "mi", label: "mi" },
];

export const HEIGHT_UNIT_SEGMENTS: SegmentOption<Settings["heightUnit"]>[] = [
  { value: "cm", label: "cm" },
  { value: "ft", label: "ft" },
];

export const WEEK_START_SEGMENTS: SegmentOption<Settings["weekStartsOn"]>[] = [
  { value: "mon", label: "Mon" },
  { value: "sun", label: "Sun" },
];

export const THEME_SEGMENTS: SegmentOption<Settings["theme"]>[] = [
  { value: "system", label: "SYSTEM" },
  { value: "light", label: "LIGHT" },
  { value: "dark", label: "DARK" },
];
