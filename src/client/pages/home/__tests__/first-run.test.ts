import { describe, it, expect } from "vitest";
import { isFirstRun } from "../../../home/state";

describe("isFirstRun", () => {
  it("is true on a fresh install with nothing recorded", () => {
    expect(
      isFirstRun({ finishedSessions: 0, routines: 0, programs: 0 }),
    ).toBe(true);
  });

  it("is false once a workout has been finished", () => {
    expect(
      isFirstRun({ finishedSessions: 1, routines: 0, programs: 0 }),
    ).toBe(false);
  });

  it("is false once a routine exists, even before the first workout", () => {
    expect(
      isFirstRun({ finishedSessions: 0, routines: 1, programs: 0 }),
    ).toBe(false);
  });

  it("is false once a program exists", () => {
    expect(
      isFirstRun({ finishedSessions: 0, routines: 0, programs: 1 }),
    ).toBe(false);
  });

  it("stays false for an established user", () => {
    expect(
      isFirstRun({ finishedSessions: 40, routines: 6, programs: 2 }),
    ).toBe(false);
  });
});
