/**
 * Geometry for the progress chart: choosing a y-axis range that survives a typo,
 * and projecting points into the SVG viewBox. Kept apart from the SVG itself so
 * the arithmetic — which is where the bugs live — can be tested directly.
 */

import type { SeriesPoint } from "./series";

export type Axis = {
  min: number;
  max: number;
  /** How many real values sit outside [min, max] and had to be pinned to an edge. */
  clampedCount: number;
};

export type PlotBox = { width: number; height: number; pad: number };

export type PlottedPoint = {
  x: number;
  y: number;
  clamped: boolean;
  point: SeriesPoint;
};

/** Symmetric breathing room for a range that would otherwise be zero-width. */
function padFlat(value: number): { min: number; max: number } {
  const p = Math.max(Math.abs(value) * 0.05, 0.5);
  return { min: value - p, max: value + p };
}

/**
 * Decides whether the single most extreme value is a data-entry error rather
 * than a result.
 *
 * Tukey's 1.5×IQR fence is far too eager on gym data — a genuine PR after a
 * plateau trips it, and clamping a PR hides the most interesting session on the
 * chart. So the test is deliberately blunt: a value only counts as a typo when
 * it sits further from the rest of the data than the rest of the data spans,
 * several times over. A 1000kg squat among 100kg squats qualifies; 110kg after
 * 103kg does not.
 */
function findOutlier(sorted: number[]): number | null {
  if (sorted.length < 3) return null;

  const lowest = sorted[0]!;
  const highest = sorted[sorted.length - 1]!;
  const lowGap = sorted[1]! - lowest;
  const highGap = highest - sorted[sorted.length - 2]!;

  const candidateIsHigh = highGap >= lowGap;
  const rest = candidateIsHigh ? sorted.slice(0, -1) : sorted.slice(1);
  const gap = candidateIsHigh ? highGap : lowGap;

  const restSpan = rest[rest.length - 1]! - rest[0]!;
  // With an entirely flat history restSpan is 0, which would make any gap
  // infinitely large; floor it at a few percent of the typical value so a small
  // genuine gain is not mistaken for a typo.
  const median = rest[Math.floor(rest.length / 2)]!;
  const threshold = 3 * Math.max(restSpan, Math.abs(median) * 0.02);

  if (threshold > 0 && gap > threshold) return candidateIsHigh ? highest : lowest;
  return null;
}

/** The y-axis window for a set of values. */
export function axisRange(values: number[]): Axis {
  if (values.length === 0) return { min: 0, max: 1, clampedCount: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const outlier = findOutlier(sorted);
  const kept = outlier === null ? sorted : sorted.filter((v) => v !== outlier);
  const clampedCount = values.length - kept.length;

  let min = kept[0]!;
  let max = kept[kept.length - 1]!;
  if (min === max) ({ min, max } = padFlat(min));

  return { min, max, clampedCount };
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The `points` attribute for the trend line, or null when there is no line to
 * draw. One session is a dot, not a stroke — a one-point polyline renders as
 * nothing at all and looks like a bug.
 */
export function linePoints(plotted: PlottedPoint[]): string | null {
  if (plotted.length < 2) return null;
  return plotted.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
}

/**
 * Projects a series into the viewBox. Points are spaced by index, not by
 * elapsed time: training is irregular, and evenly spaced points keep two
 * sessions on the same day legible as two sessions instead of one smudge.
 */
export function plotPoints(
  points: SeriesPoint[],
  axis: Axis,
  box: PlotBox,
): PlottedPoint[] {
  const { width, height, pad } = box;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const span = axis.max - axis.min || 1;

  return points.map((point, i) => {
    // A lone point has no gap to divide by; centre it rather than emit NaN.
    const x = points.length === 1 ? width / 2 : pad + (i / (points.length - 1)) * innerW;
    const clampedValue = Math.min(axis.max, Math.max(axis.min, point.value));
    const y = height - pad - ((clampedValue - axis.min) / span) * innerH;
    return { x, y, clamped: clampedValue !== point.value, point };
  });
}
