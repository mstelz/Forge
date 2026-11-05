import { describe, expect, it } from "vitest";
import { withSessionCompletionDates, type CompletionSession } from "../program-completion";
import type { ProgramRun } from "../program-run";

const run: ProgramRun = {
  id: "run", programId: "program", status: "active", startedAt: 100, endedAt: null,
  currentWeekIndex: 2, currentDayIndex: 0, createdAt: 100, updatedAt: 500,
  dayStates: [{ id: "state", weekIndex: 1, dayIndex: 4, status: "completed", sessionId: "session", updatedAt: 500 }],
};
const session: CompletionSession = {
  id: "session", status: "finished", sourceType: "program_day", sourceProgramId: "program",
  sourceProgramWeekIndex: 1, sourceProgramDayIndex: 4, startedAt: 200, endedAt: 300,
};

describe("withSessionCompletionDates", () => {
  it("repairs missing completion dates without mutating the stored run", () => {
    expect(withSessionCompletionDates(run, [session]).dayStates[0]?.completedAt).toBe(300);
    expect(run.dayStates[0]?.completedAt).toBeUndefined();
  });

  it("corrects the date of a retroactively completed workout", () => {
    const stale = { ...run, dayStates: [{ ...run.dayStates[0]!, completedAt: 500 }] };
    expect(withSessionCompletionDates(stale, [session]).dayStates[0]?.completedAt).toBe(300);
  });

  it.each([
    { status: "in_progress" }, { sourceProgramId: "other" }, { startedAt: 50 },
    { sourceType: "routine" }, { sourceProgramWeekIndex: 0 }, { sourceProgramDayIndex: 3 },
  ])("does not borrow a finish from an unrelated session: %j", (change) => {
    expect(withSessionCompletionDates(run, [{ ...session, ...change }]).dayStates[0]?.completedAt).toBeUndefined();
  });

  it("preserves rest-day and skipped completion dates", () => {
    const states: ProgramRun["dayStates"] = [
      { ...run.dayStates[0]!, sessionId: null, completedAt: 400 },
      { ...run.dayStates[0]!, id: "skipped", status: "skipped", completedAt: 500 },
    ];
    expect(withSessionCompletionDates({ ...run, dayStates: states }, [session]).dayStates).toEqual(states);
  });
});
