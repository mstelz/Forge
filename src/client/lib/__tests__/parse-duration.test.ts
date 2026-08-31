import { describe, it, expect } from "vitest";
import { parseDuration } from "../time";

describe("parseDuration", () => {
  it("parses m:ss", () => {
    expect(parseDuration("2:30")).toBe(150);
    expect(parseDuration("45:00")).toBe(2700);
  });

  it("parses h:mm:ss", () => {
    expect(parseDuration("1:05:30")).toBe(3930);
    expect(parseDuration("2:00:00")).toBe(7200);
  });

  it("parses a bare integer as seconds, matching the old digit buffer", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("45")).toBe(45);
  });

  it("accepts runs longer than an hour, which parseMmSs rejected", () => {
    expect(parseDuration("61:00")).toBe(3660);
    expect(parseDuration("90:00")).toBe(5400);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseDuration(" 1:05 ")).toBe(65);
  });

  it("treats an empty string as cleared", () => {
    expect(parseDuration("")).toBe(null);
    expect(parseDuration("   ")).toBe(null);
  });

  it("rejects malformed input", () => {
    expect(parseDuration("abc")).toBe(undefined);
    expect(parseDuration("2:99")).toBe(undefined);
    expect(parseDuration("1:2:3:4")).toBe(undefined);
    expect(parseDuration("-5")).toBe(undefined);
  });

  it("rejects durations beyond 24 hours", () => {
    expect(parseDuration("86401")).toBe(undefined);
  });
});
