import type { Routine } from "../../../shared";

type ProgramGuidance = {
  dayNotes?: string | null;
  programDescription?: string | null;
};

export function snapshotWorkoutTemplate(routine: Routine, programGuidance: ProgramGuidance): string {
  return JSON.stringify({ ...routine, programGuidance });
}

export function readWorkoutGuidance(snapshot: string | null) {
  let template: (Pick<Routine, "notes"> & { programGuidance?: ProgramGuidance }) | null = null;
  if (snapshot) {
    try {
      template = JSON.parse(snapshot);
    } catch {
      // A missing or unreadable template should not prevent logging the workout.
    }
  }

  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  return {
    dayNotes: text(template?.programGuidance?.dayNotes),
    routineNotes: text(template?.notes),
    programDescription: text(template?.programGuidance?.programDescription),
  };
}
