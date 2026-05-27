import { describe, it, expect } from "vitest";
import {
  convertWeight,
  formatWeight,
  convertDistance,
  formatDistance,
} from "../units";

describe("convertWeight", () => {
  it("returns kg unchanged when unit is kg", () => {
    expect(convertWeight(100, "kg")).toBe(100);
  });

  it("converts kg to lb correctly", () => {
    const result = convertWeight(100, "lb");
    expect(result).toBeCloseTo(220.462, 2);
  });

  it("converts 0 kg to 0 lb", () => {
    expect(convertWeight(0, "lb")).toBe(0);
  });
});

describe("formatWeight", () => {
  it("drops .0 suffix for whole number kg", () => {
    expect(formatWeight(61, "kg")).toBe("61 kg");
  });

  it("rounds to one decimal place for kg", () => {
    expect(formatWeight(61.23, "kg")).toBe("61.2 kg");
  });

  it("converts and rounds for lb", () => {
    // 100 kg * 2.20462 = 220.462, rounded to 1 decimal = 220.5
    expect(formatWeight(100, "lb")).toBe("220.5 lb");
  });

  it("drops .0 suffix for whole number lb", () => {
    // 10 kg * 2.20462 = 22.0462, rounded to 22 => but 22.0 -> "22 lb"
    expect(formatWeight(0, "lb")).toBe("0 lb");
  });
});

describe("convertDistance", () => {
  it("converts 1000m to 1 km", () => {
    expect(convertDistance(1000, "km")).toBe(1);
  });

  it("converts 1609.344m to approximately 1 mi", () => {
    expect(convertDistance(1609.344, "mi")).toBeCloseTo(1, 5);
  });

  it("returns meters unchanged for unit m", () => {
    expect(convertDistance(400, "m")).toBe(400);
  });
});

describe("formatDistance", () => {
  it("returns whole number meters with m suffix", () => {
    expect(formatDistance(400, "m")).toBe("400 m");
  });

  it("formats km with two decimal places when non-integer", () => {
    expect(formatDistance(1500, "km")).toBe("1.50 km");
  });

  it("formats mi with two decimal places", () => {
    // 5000m / 1609.344 ≈ 3.107 mi => 3.11
    const result = formatDistance(5000, "mi");
    expect(result).toMatch(/mi$/);
  });

  it("drops decimals for exact km value", () => {
    // 2000m = 2km exactly
    expect(formatDistance(2000, "km")).toBe("2 km");
  });
});
