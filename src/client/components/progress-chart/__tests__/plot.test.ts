import { describe, it, expect } from "vitest";
import { axisRange, plotPoints, linePoints } from "../plot";
import type { SeriesPoint } from "../series";

function pts(...values: number[]): SeriesPoint[] {
  return values.map((value, i) => ({
    sessionId: `s${i}`,
    at: 1_000 + i * 86_400_000,
    value,
  }));
}

const BOX = { width: 300, height: 100, pad: 10 };

describe("axisRange", () => {
  it("spans exactly the data when the data is well behaved", () => {
    expect(axisRange([100, 105, 110, 115, 120])).toMatchObject({ min: 100, max: 120 });
  });

  it("gives a single value room on both sides so it renders mid-chart, not on the floor", () => {
    const axis = axisRange([100]);

    expect(axis.min).toBeLessThan(100);
    expect(axis.max).toBeGreaterThan(100);
    expect(100 - axis.min).toBeCloseTo(axis.max - 100, 6);
  });

  it("never returns a zero-width range, even when every session was identical", () => {
    const axis = axisRange([80, 80, 80, 80]);

    expect(axis.max).toBeGreaterThan(axis.min);
  });

  it("excludes one wild value so the real sessions do not flatten against the floor", () => {
    // A 1000kg squat is a typo. Without this the other four sit on one flat line.
    const axis = axisRange([100, 101, 102, 103, 1000]);

    expect(axis.min).toBe(100);
    expect(axis.max).toBe(103);
    expect(axis.clampedCount).toBe(1);
  });

  it("excludes a wild low value too", () => {
    const axis = axisRange([1, 100, 101, 102, 103]);

    expect(axis.min).toBe(100);
    expect(axis.clampedCount).toBe(1);
  });

  it("keeps a genuine personal best rather than mistaking progress for an outlier", () => {
    // 110 after a 100-103 plateau is a PR, not a typo. Clamping it would hide
    // the single most interesting session on the chart.
    const axis = axisRange([100, 101, 102, 103, 110]);

    expect(axis.max).toBe(110);
    expect(axis.clampedCount).toBe(0);
  });

  it("keeps steady linear progress intact", () => {
    const axis = axisRange([60, 80, 100, 120, 140]);

    expect(axis).toMatchObject({ min: 60, max: 140, clampedCount: 0 });
  });

  it("will not call a value an outlier when there are only two sessions", () => {
    const axis = axisRange([100, 5000]);

    expect(axis).toMatchObject({ min: 100, max: 5000, clampedCount: 0 });
  });

  it("still catches a typo among otherwise identical sessions", () => {
    const axis = axisRange([100, 100, 100, 1000]);

    // The three real sessions are identical, so the axis has to open up around
    // them — but it must stay near 100 rather than stretching to the typo.
    expect(axis.clampedCount).toBe(1);
    expect(axis.max).toBeLessThan(110);
    expect(axis.min).toBeLessThan(100);
  });

  it("does not clamp a small real gain above identical sessions", () => {
    const axis = axisRange([100, 100, 100, 105]);

    expect(axis.max).toBe(105);
    expect(axis.clampedCount).toBe(0);
  });
});

describe("plotPoints", () => {
  it("centres a lone point instead of dividing by zero", () => {
    const [only] = plotPoints(pts(100), axisRange([100]), BOX);

    expect(Number.isFinite(only!.x)).toBe(true);
    expect(only!.x).toBeCloseTo(150, 6);
    expect(Number.isFinite(only!.y)).toBe(true);
  });

  it("spreads points from the left edge to the right edge of the padded box", () => {
    const plotted = plotPoints(pts(100, 110, 120), axisRange([100, 110, 120]), BOX);

    expect(plotted[0]!.x).toBeCloseTo(10, 6);
    expect(plotted[2]!.x).toBeCloseTo(290, 6);
  });

  it("puts a bigger number higher up the chart", () => {
    const plotted = plotPoints(pts(100, 120), axisRange([100, 120]), BOX);

    expect(plotted[1]!.y).toBeLessThan(plotted[0]!.y);
    expect(plotted[0]!.y).toBeCloseTo(90, 6);
    expect(plotted[1]!.y).toBeCloseTo(10, 6);
  });

  it("gives two sessions on the same day two separate x positions", () => {
    const sameDay: SeriesPoint[] = [
      { sessionId: "a", at: Date.UTC(2026, 0, 5, 7), value: 100 },
      { sessionId: "b", at: Date.UTC(2026, 0, 5, 19), value: 105 },
    ];
    const plotted = plotPoints(sameDay, axisRange([100, 105]), BOX);

    expect(plotted[0]!.x).not.toBeCloseTo(plotted[1]!.x, 1);
  });

  it("pins an out-of-range value to the axis edge and flags it rather than drawing off-canvas", () => {
    const values = [100, 101, 102, 103, 1000];
    const plotted = plotPoints(pts(...values), axisRange(values), BOX);

    expect(plotted[4]!.y).toBeCloseTo(10, 6);
    expect(plotted[4]!.clamped).toBe(true);
    expect(plotted[0]!.clamped).toBe(false);
  });

  it("keeps the true value on a clamped point so the data table can still tell the truth", () => {
    const values = [100, 101, 102, 103, 1000];
    const plotted = plotPoints(pts(...values), axisRange(values), BOX);

    expect(plotted[4]!.point.value).toBe(1000);
  });

  it("returns nothing for an empty series", () => {
    expect(plotPoints([], axisRange([]), BOX)).toEqual([]);
  });
});

describe("linePoints", () => {
  it("draws no line through a single session — a line needs two points", () => {
    expect(linePoints(plotPoints(pts(100), axisRange([100]), BOX))).toBeNull();
  });

  it("draws no line when there is nothing at all", () => {
    expect(linePoints([])).toBeNull();
  });

  it("joins two or more points into an SVG points attribute", () => {
    const line = linePoints(plotPoints(pts(100, 120), axisRange([100, 120]), BOX));

    expect(line).toBe("10,90 290,10");
  });

  it("emits no NaN coordinates", () => {
    const line = linePoints(plotPoints(pts(80, 80, 80), axisRange([80, 80, 80]), BOX));

    expect(line).not.toContain("NaN");
  });
});
