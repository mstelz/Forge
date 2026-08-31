import { describe, it, expect } from "vitest";
import {
  getWeekStart,
  calendarWeekDays,
  dayOfWeekHeaders,
} from "../../../home/state";

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"] as const;

describe("dayOfWeekHeaders", () => {
  it("labels every column with the weekday that column actually holds", () => {
    // The bug: headers were Sunday-first while the cells were Monday-first,
    // so every column was labelled one day early.
    const wednesday = new Date(2026, 7, 26);

    for (const weekStartsOn of ["mon", "sun"] as const) {
      const headers = dayOfWeekHeaders(weekStartsOn);
      const days = calendarWeekDays(wednesday, weekStartsOn);

      expect(headers).toHaveLength(7);
      expect(days).toHaveLength(7);

      for (let i = 0; i < 7; i++) {
        expect(headers[i]).toBe(WEEKDAY_INITIAL[days[i]!.getDay()]);
      }
    }
  });
});

describe("getWeekStart", () => {
  it("starts the week on Monday when weekStartsOn is 'mon'", () => {
    // Wednesday 2026-08-26 → Monday 2026-08-24
    const result = getWeekStart(new Date(2026, 7, 26), "mon");
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(24);
  });

  it("starts the week on Sunday when weekStartsOn is 'sun'", () => {
    // Wednesday 2026-08-26 → Sunday 2026-08-23
    const result = getWeekStart(new Date(2026, 7, 26), "sun");
    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(23);
  });

  it("treats Sunday as the start of its own week when weekStartsOn is 'sun'", () => {
    const sunday = new Date(2026, 7, 23);
    const result = getWeekStart(sunday, "sun");
    expect(result.getDate()).toBe(23);
  });

  it("treats Sunday as the end of the previous week when weekStartsOn is 'mon'", () => {
    const sunday = new Date(2026, 7, 23);
    const result = getWeekStart(sunday, "mon");
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(17);
  });

  it("zeroes the time component", () => {
    const result = getWeekStart(new Date(2026, 7, 26, 13, 45, 30, 123), "mon");
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

describe("calendarWeekDays", () => {
  it("returns 7 consecutive days beginning at the configured week start", () => {
    const days = calendarWeekDays(new Date(2026, 7, 26), "sun");
    expect(days.map((d) => d.getDate())).toEqual([23, 24, 25, 26, 27, 28, 29]);
  });
});
