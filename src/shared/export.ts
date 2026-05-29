import { z } from "zod";
import { ExerciseSchema } from "./exercise";
import { EquipmentSchema } from "./equipment";
import { RoutineSchema } from "./routine";
import { SessionSchema } from "./session";
import { SessionSetLogSchema } from "./session-log";
import { ProgramSchema, ProgramDaySchema } from "./program";
import { ProgramRunSchema, ProgramRunDayStateSchema } from "./program-run";
import { GoalSchema } from "./goals";
import { SettingsSchema } from "./settings";
import { ProfileSchema, WeightLogSchema } from "./profile";

// Re-export for convenience
export { ProgramDaySchema, ProgramRunDayStateSchema };

export const ExportEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.number().int(),
  source: z.enum(["server", "client"]),
  appVersion: z.string().min(1),
  entities: z.object({
    exercises: z.array(ExerciseSchema),
    equipment: z.array(EquipmentSchema),
    routines: z.array(RoutineSchema),
    routineExercises: z.array(z.unknown()).optional(),
    programs: z.array(ProgramSchema),
    programDays: z.array(ProgramDaySchema),
    programRuns: z.array(ProgramRunSchema),
    programRunDayStates: z.array(ProgramRunDayStateSchema),
    sessions: z.array(SessionSchema),
    sessionSetLogs: z.array(SessionSetLogSchema),
    goals: z.array(GoalSchema),
    settings: SettingsSchema.optional(),
    profiles: z.array(ProfileSchema).optional().default([]),
    weightLogs: z.array(WeightLogSchema).optional().default([]),
  }),
  _warnings: z.array(z.string()).optional(),
});

export type ExportEnvelope = z.infer<typeof ExportEnvelopeSchema>;
