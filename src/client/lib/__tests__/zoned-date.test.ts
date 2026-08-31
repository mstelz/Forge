import { describe, it, expect } from "vitest";
import { zonedYMD, startOfDayInZone, deviceTimeZone } from "../zoned-date";

describe("zonedYMD", () => {
  it("reads the calendar date in the given zone, not the device's", () => {
    // 2026-08-27 02:30 UTC is still 2026-08-26 in Chicago.
    const instant = new Date("2026-08-27T02:30:00Z");
    expect(zonedYMD(instant, "UTC")).toEqual({ y: 2026, m: 8, d: 27 });
    expect(zonedYMD(instant, "America/Chicago")).toEqual({ y: 2026, m: 8, d: 26 });
  });

  it("rolls forward for zones ahead of UTC", () => {
    // 2026-08-26 22:00 UTC is already the 27th in Tokyo.
    const instant = new Date("2026-08-26T22:00:00Z");
    expect(zonedYMD(instant, "Asia/Tokyo")).toEqual({ y: 2026, m: 8, d: 27 });
  });

  it("falls back to the device zone when the zone is unusable", () => {
    const instant = new Date("2026-08-26T12:00:00Z");
    expect(zonedYMD(instant, "Not/AZone")).toEqual(zonedYMD(instant, deviceTimeZone()));
  });
});

describe("startOfDayInZone", () => {
  it("returns the instant midnight began in that zone", () => {
    const instant = new Date("2026-08-26T18:00:00Z");
    const chicago = startOfDayInZone(instant, "America/Chicago");
    // Chicago is UTC-5 in August, so midnight local is 05:00 UTC.
    expect(chicago.toISOString()).toBe("2026-08-26T05:00:00.000Z");
  });

  it("is idempotent — the start of a day is its own start of day", () => {
    const instant = new Date("2026-08-26T18:00:00Z");
    const once = startOfDayInZone(instant, "America/Chicago");
    const twice = startOfDayInZone(once, "America/Chicago");
    expect(twice.toISOString()).toBe(once.toISOString());
  });
});

describe("deviceTimeZone", () => {
  it("returns a usable IANA zone name", () => {
    const tz = deviceTimeZone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: tz })).not.toThrow();
  });
});
