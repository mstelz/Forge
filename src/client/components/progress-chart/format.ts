/**
 * Turning canonical series values into text: axis labels, table cells, and the
 * spoken-word summary that stands in for the chart itself.
 *
 * Weight is stored in kg and distance in metres regardless of what the user
 * typed — `enteredWeightUnit` remembers that — so every display path runs
 * through the settings here rather than trusting the stored number's units.
 */

import { formatWeight, formatDistance } from "../../lib/units";
import { formatHms } from "../../lib/time";
import type { Metric, SeriesPoint } from "./series";

export type UnitPrefs = {
  weightUnit: "kg" | "lb";
  distanceUnit: "m" | "km" | "mi";
};

const WEIGHT_METRICS: Metric[] = ["e1rm", "topSet", "volume"];

/** Nobody reads a pace per metre; per-metre distances still get a per-km pace. */
function paceUnit(prefs: UnitPrefs): { suffix: string; metres: number } {
  return prefs.distanceUnit === "mi"
    ? { suffix: "/mi", metres: 1609.344 }
    : { suffix: "/km", metres: 1000 };
}

/** One series value, in the units the user has asked to see. */
export function formatMetricValue(metric: Metric, value: number, prefs: UnitPrefs): string {
  if (WEIGHT_METRICS.includes(metric)) return formatWeight(value, prefs.weightUnit);
  if (metric === "distance") return formatDistance(value, prefs.distanceUnit);
  if (metric === "duration") return formatHms(value);
  const { suffix, metres } = paceUnit(prefs);
  return `${formatHms(value * metres)} ${suffix}`;
}

function dateInZone(
  at: number,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(new Date(at));
  } catch {
    // An unrecognised zone must not blank the axis; fall back to the device's.
    return new Intl.DateTimeFormat("en-US", options).format(new Date(at));
  }
}

/** Compact axis tick, e.g. "Jan 6". */
export function formatAxisDate(at: number, timeZone: string): string {
  return dateInZone(at, timeZone, { month: "short", day: "numeric" });
}

/** Full date for the data table, e.g. "Jan 6, 2026". */
export function formatPointDate(at: number, timeZone: string): string {
  return dateInZone(at, timeZone, { month: "short", day: "numeric", year: "numeric" });
}

const METRIC_NAMES: Record<Metric, string> = {
  e1rm: "Est 1RM",
  topSet: "Top set",
  volume: "Volume",
  pace: "Pace",
  distance: "Distance",
  duration: "Duration",
};

/** Short chip / axis caption, carrying the unit so the axis is never ambiguous. */
export function metricLabel(metric: Metric, prefs: UnitPrefs): string {
  const name = METRIC_NAMES[metric];
  if (WEIGHT_METRICS.includes(metric)) return `${name} (${prefs.weightUnit})`;
  if (metric === "distance") return `${name} (${prefs.distanceUnit})`;
  if (metric === "pace") return `${name} (${paceUnit(prefs).suffix})`;
  return name;
}

/** The bare name, for table headers and prose where the unit is already stated. */
export function metricName(metric: Metric): string {
  return METRIC_NAMES[metric];
}

/**
 * The chart's text equivalent, used as its `aria-label`. A line drawing conveys
 * start, end and direction; so must this.
 */
export function describeTrend(
  metric: Metric,
  points: SeriesPoint[],
  prefs: UnitPrefs,
): string {
  if (points.length === 0) return "No sessions logged yet.";

  const name = METRIC_NAMES[metric];
  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;

  if (points.length === 1) {
    return `${name}: ${formatMetricValue(metric, first, prefs)} from one session.`;
  }

  const head = `${name} across ${points.length} sessions, from ${formatMetricValue(
    metric,
    first,
    prefs,
  )} to ${formatMetricValue(metric, last, prefs)}`;

  if (last === first) return `${head}, unchanged.`;

  const delta = Math.abs(last - first);
  const amount = formatMetricValue(metric, delta, prefs);

  // Pace runs backwards: a smaller number is a better result, so saying "down"
  // would read as a regression to anyone relying on the label alone.
  if (metric === "pace") {
    return `${head}, ${amount} ${last < first ? "faster" : "slower"}.`;
  }

  return `${head}, ${last > first ? "up" : "down"} ${amount}.`;
}
