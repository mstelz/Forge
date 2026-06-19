import { describe, it, expect } from "vitest";
import { formatMmSs, formatHms, parseMmSs, formatDurationMs } from "../time";

describe("formatMmSs", () => {
  it("formats seconds as m:ss with zero-padded seconds", () => {
    expect(formatMmSs(150)).toBe("2:30");
    expect(formatMmSs(5)).toBe("0:05");
    expect(formatMmSs(0)).toBe("0:00");
    expect(formatMmSs(3599)).toBe("59:59");
  });

  it("clamps negatives to 0 and rounds fractional seconds", () => {
    expect(formatMmSs(-10)).toBe("0:00");
    expect(formatMmSs(90.4)).toBe("1:30");
    expect(formatMmSs(89.6)).toBe("1:30");
  });
});

describe("formatHms", () => {
  it("uses m:ss under an hour and h:mm:ss at or above", () => {
    expect(formatHms(90)).toBe("1:30");
    expect(formatHms(3600)).toBe("1:00:00");
    expect(formatHms(3661)).toBe("1:01:01");
  });

  it("clamps and rounds", () => {
    expect(formatHms(-5)).toBe("0:00");
    expect(formatHms(3600.6)).toBe("1:00:01");
  });
});

describe("parseMmSs", () => {
  it("parses m:ss and plain seconds within bounds", () => {
    expect(parseMmSs("2:30")).toBe(150);
    expect(parseMmSs("90")).toBe(90);
    expect(parseMmSs(" 1:05 ")).toBe(65);
  });

  it("rejects invalid input and out-of-range values", () => {
    expect(parseMmSs("2:99")).toBeNull();
    expect(parseMmSs("abc")).toBeNull();
    expect(parseMmSs("3601")).toBeNull();
  });
});

describe("formatDurationMs", () => {
  it("formats milliseconds as compact human duration", () => {
    expect(formatDurationMs(45 * 60_000)).toBe("45m");
    expect(formatDurationMs(90 * 60_000)).toBe("1h 30m");
    expect(formatDurationMs(0)).toBe("0m");
  });
});
