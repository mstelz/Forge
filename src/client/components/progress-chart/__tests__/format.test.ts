import { describe, it, expect } from "vitest";
import {
  formatMetricValue,
  metricLabel,
  describeTrend,
  formatAxisDate,
  formatPointDate,
} from "../format";
import type { SeriesPoint } from "../series";
import { weightToKg } from "../../../lib/units";

const KG = { weightUnit: "kg", distanceUnit: "km" } as const;
const LB = { weightUnit: "lb", distanceUnit: "mi" } as const;

function pts(...values: number[]): SeriesPoint[] {
  return values.map((value, i) => ({ sessionId: `s${i}`, at: 1_000 + i, value }));
}

describe("formatMetricValue", () => {
  it("shows weight in kg when the setting is kg", () => {
    expect(formatMetricValue("e1rm", 100, KG)).toBe("100 kg");
  });

  it("follows the weight setting to pounds", () => {
    expect(formatMetricValue("topSet", 100, LB)).toBe("220.5 lb");
  });

  it("gives a lifter who typed 225 lb their 225 lb back", () => {
    // enteredWeight/enteredWeightUnit record what was typed; weightKg is what
    // gets stored. The axis must not show 102.1 to someone working in pounds.
    const stored = weightToKg(225, "lb");

    expect(formatMetricValue("topSet", stored, LB)).toBe("225 lb");
    expect(formatMetricValue("topSet", stored, KG)).toBe("102.1 kg");
  });

  it("shows volume in the weight unit too", () => {
    expect(formatMetricValue("volume", 1000, KG)).toBe("1000 kg");
  });

  it("follows the distance setting", () => {
    expect(formatMetricValue("distance", 5000, KG)).toBe("5 km");
    expect(formatMetricValue("distance", 5000, LB)).toBe("3.11 mi");
  });

  it("renders duration as minutes and seconds", () => {
    expect(formatMetricValue("duration", 1500, KG)).toBe("25:00");
  });

  it("renders a duration over an hour with the hours in front", () => {
    expect(formatMetricValue("duration", 3900, KG)).toBe("1:05:00");
  });

  it("renders pace per kilometre", () => {
    // 0.3 s/m is a 5:00 kilometre
    expect(formatMetricValue("pace", 0.3, KG)).toBe("5:00 /km");
  });

  it("renders pace per mile when the distance setting is miles", () => {
    expect(formatMetricValue("pace", 0.3, LB)).toBe("8:03 /mi");
  });

  it("renders pace per kilometre when distances are set to bare metres", () => {
    // Nobody wants a per-metre pace.
    expect(formatMetricValue("pace", 0.3, { weightUnit: "kg", distanceUnit: "m" })).toBe(
      "5:00 /km",
    );
  });
});

describe("metricLabel", () => {
  it("names each series in the units the user has chosen", () => {
    expect(metricLabel("e1rm", KG)).toBe("Est 1RM (kg)");
    expect(metricLabel("e1rm", LB)).toBe("Est 1RM (lb)");
    expect(metricLabel("distance", KG)).toBe("Distance (km)");
    expect(metricLabel("pace", KG)).toBe("Pace (/km)");
    expect(metricLabel("duration", KG)).toBe("Duration");
  });
});

describe("chart dates", () => {
  // 2am UTC on the 6th is still the evening of the 5th in New York.
  const lateNight = Date.UTC(2026, 0, 6, 2, 0);

  it("labels the axis compactly", () => {
    expect(formatAxisDate(lateNight, "UTC")).toBe("Jan 6");
  });

  it("reads the date in the configured timezone, not the device's", () => {
    expect(formatAxisDate(lateNight, "America/New_York")).toBe("Jan 5");
  });

  it("spells the date out with a year in the data table", () => {
    expect(formatPointDate(lateNight, "UTC")).toBe("Jan 6, 2026");
    expect(formatPointDate(lateNight, "America/New_York")).toBe("Jan 5, 2026");
  });

  it("falls back to a readable date when the configured zone is nonsense", () => {
    expect(formatAxisDate(lateNight, "Not/AZone")).toMatch(/Jan \d+/);
  });
});

describe("describeTrend — the chart's text equivalent", () => {
  it("says so when there is nothing to draw", () => {
    expect(describeTrend("e1rm", [], KG)).toBe("No sessions logged yet.");
  });

  it("describes a single session without claiming a trend", () => {
    const text = describeTrend("e1rm", pts(100), KG);

    expect(text).toContain("one session");
    expect(text).toContain("100 kg");
    expect(text).not.toContain("up");
  });

  it("describes a rising series with its start, end and change", () => {
    const text = describeTrend("e1rm", pts(100, 105, 110), KG);

    expect(text).toContain("3 sessions");
    expect(text).toContain("100 kg");
    expect(text).toContain("110 kg");
    expect(text).toContain("up 10 kg");
  });

  it("describes a falling series as down", () => {
    expect(describeTrend("topSet", pts(110, 100), KG)).toContain("down 10 kg");
  });

  it("describes a flat series as unchanged", () => {
    expect(describeTrend("volume", pts(1000, 1000), KG)).toContain("unchanged");
  });

  it("calls a dropping pace faster, not down — lower is better for pace", () => {
    const text = describeTrend("pace", pts(0.3, 0.29), KG);

    expect(text).toContain("faster");
    expect(text).not.toContain("down");
  });

  it("calls a rising pace slower", () => {
    expect(describeTrend("pace", pts(0.29, 0.3), KG)).toContain("slower");
  });

  it("follows the weight setting in the summary as well as the axis", () => {
    expect(describeTrend("e1rm", pts(100, 110), LB)).toContain("lb");
  });
});
