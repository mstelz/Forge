import type { ProgramRun } from "./program-run";

export type CompletionSession = {
  id: string;
  status: string;
  sourceType: string;
  sourceProgramId: string | null;
  sourceProgramWeekIndex: number | null;
  sourceProgramDayIndex: number | null;
  startedAt: number;
  endedAt: number | null;
};

/** A workout's recorded finish is authoritative, including when it was finished retroactively. */
export function withSessionCompletionDates<T extends Pick<ProgramRun, "programId" | "startedAt" | "dayStates">>(run: T, sessions: CompletionSession[]): T {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  return {
    ...run,
    dayStates: run.dayStates.map((state) => {
      const session = state.sessionId ? byId.get(state.sessionId) : undefined;
      if (state.status !== "completed" || !session || session.status !== "finished" ||
        session.sourceType !== "program_day" || session.sourceProgramId !== run.programId ||
        session.startedAt < run.startedAt || session.sourceProgramWeekIndex !== state.weekIndex ||
        session.sourceProgramDayIndex !== state.dayIndex) return state;
      return { ...state, completedAt: session.endedAt ?? session.startedAt };
    }),
  };
}
