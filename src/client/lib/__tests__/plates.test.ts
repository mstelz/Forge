import { describe, it, expect } from "vitest";
import {
  DEFAULT_BAR_KG,
  describeLoading,
  platesForTarget,
} from "../plates";

describe("platesForTarget — exact loadings", () => {
  it("loads a 100kg squat", () => {
    const loading = platesForTarget(100, "kg")!;
    // 100 - 20 bar = 80, so 40 a side: 25 + 15
    expect(loading.perSide).toEqual([
      { plate: 25, count: 1 },
      { plate: 15, count: 1 },
    ]);
    expect(loading.achievedWeight).toBe(100);
    expect(loading.approximate).toBe(false);
  });

  it("stacks multiples of the same plate", () => {
    const loading = platesForTarget(160, "kg")!;
    // 140 to load, 70 a side: 25 + 25 + 20
    expect(loading.perSide).toEqual([
      { plate: 25, count: 2 },
      { plate: 20, count: 1 },
    ]);
    expect(loading.approximate).toBe(false);
  });

  it("uses the small change for a 2.5kg jump", () => {
    const loading = platesForTarget(102.5, "kg")!;
    expect(loading.achievedWeight).toBe(102.5);
    expect(loading.approximate).toBe(false);
    expect(loading.perSide).toContainEqual({ plate: 1.25, count: 1 });
  });

  it("reports an empty bar as an empty loading, not as nothing", () => {
    const loading = platesForTarget(DEFAULT_BAR_KG, "kg")!;
    expect(loading.perSide).toEqual([]);
    expect(loading.achievedWeight).toBe(DEFAULT_BAR_KG);
    expect(loading.approximate).toBe(false);
  });
});

describe("platesForTarget — targets it cannot make", () => {
  it("says so rather than silently rounding", () => {
    // 101kg needs 40.5 a side; the smallest plate is 1.25.
    const loading = platesForTarget(101, "kg")!;
    expect(loading.approximate).toBe(true);
  });

  it("comes in at or under the target, never over", () => {
    // Handing a lifter more weight than they asked for is the dangerous error.
    for (const target of [101, 103.1, 87.3, 149.9]) {
      const loading = platesForTarget(target, "kg")!;
      expect(loading.achievedWeight).toBeLessThanOrEqual(target);
    }
  });

  it("has nothing to say about a target lighter than the bar", () => {
    expect(platesForTarget(15, "kg")).toBeNull();
    expect(platesForTarget(0, "kg")).toBeNull();
  });

  it("loads nothing when there are no plates to load", () => {
    const loading = platesForTarget(100, "kg", { plates: [] })!;
    expect(loading.perSide).toEqual([]);
    expect(loading.achievedWeight).toBe(20);
    expect(loading.approximate).toBe(true);
  });

  it("survives a nonsense target", () => {
    expect(platesForTarget(NaN, "kg")).toBeNull();
  });
});

describe("platesForTarget — units and bars", () => {
  it("uses pound plates for pounds, not converted kilos", () => {
    const loading = platesForTarget(225, "lb")!;
    // 225 - 45 bar = 180, so 90 a side: two 45s
    expect(loading.perSide).toEqual([{ plate: 45, count: 2 }]);
    expect(loading.approximate).toBe(false);
  });

  it("honours a lighter bar", () => {
    // A 15kg women's bar changes every number after it.
    const loading = platesForTarget(55, "kg", { barWeight: 15 })!;
    expect(loading.barWeight).toBe(15);
    expect(loading.achievedWeight).toBe(55);
    expect(loading.perSide).toEqual([{ plate: 20, count: 1 }]);
  });

  it("honours a limited home-gym plate set", () => {
    const loading = platesForTarget(100, "kg", { plates: [10, 5] })!;
    expect(loading.perSide).toEqual([{ plate: 10, count: 4 }]);
    expect(loading.achievedWeight).toBe(100);
  });
});

describe("describeLoading", () => {
  it("reads the way a lifter would say it", () => {
    expect(describeLoading(platesForTarget(100, "kg")!, "kg")).toBe("1×25, 1×15 per side");
  });

  it("says what an empty bar is instead of listing nothing", () => {
    expect(describeLoading(platesForTarget(20, "kg")!, "kg")).toBe("Just the 20kg bar");
  });
});
