// Zod schemas for workout sessions
import { z } from "zod";

// ─── LiveStructure schemas ────────────────────────────────────────────────────

export const LiveStructureSlotSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int(),
  setType: z.string(),
}).passthrough();

export const LiveStructureItemSchema = z.object({
  performedExerciseId: z.string().uuid(),
  sessionItemId: z.string().uuid(),
  exerciseId: z.string(),
  setCount: z.number().int(),
  setTargets: z.array(LiveStructureSlotSchema),
}).passthrough().superRefine((val, ctx) => {
  if (val.setTargets.length !== val.setCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['setTargets'],
      message: `setTargets.length (${val.setTargets.length}) must equal setCount (${val.setCount})`,
    });
  }
});

export const LiveStructureBlockSchema = z.object({
  type: z.enum(['single', 'superset']),
  items: z.array(LiveStructureItemSchema),
  roundCount: z.number().int().nullable().optional(),
}).passthrough();

export const LiveStructureSchema = z.object({
  blocks: z.array(LiveStructureBlockSchema),
});
export type LiveStructureZod = z.infer<typeof LiveStructureSchema>;

// ─── Session enums ────────────────────────────────────────────────────────────

export const SessionSourceTypeEnum = z.enum(['routine', 'program_day', 'freeform']);
export type SessionSourceType = z.infer<typeof SessionSourceTypeEnum>;

export const SessionStatusEnum = z.enum(['in_progress', 'finished', 'discarded']);
export type SessionStatus = z.infer<typeof SessionStatusEnum>;

export const RestTimerStatusEnum = z.enum(['idle', 'running', 'paused']);
export type RestTimerStatus = z.infer<typeof RestTimerStatusEnum>;

export const RestTimerSchema = z.object({
  status: RestTimerStatusEnum,
  startedAt: z.number().int().nullable(),
  durationSec: z.number().int().positive(),
  pausedAt: z.number().int().nullable(),
  remainingSec: z.number().nullable(),
});
export type RestTimer = z.infer<typeof RestTimerSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  status: SessionStatusEnum,
  sourceType: SessionSourceTypeEnum,
  sourceRoutineId: z.string().nullable(),
  sourceProgramId: z.string().nullable(),
  sourceProgramWeekIndex: z.number().int().nullable(),
  sourceProgramDayIndex: z.number().int().nullable(),
  templateSnapshot: z.string().nullable(),
  liveStructure: z.string(),
  restTimer: z.string().nullable(),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  pausedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionCreateInput = z.object({
  id: z.string().uuid(),
  sourceType: SessionSourceTypeEnum,
  sourceRoutineId: z.string().nullable().optional(),
  sourceProgramId: z.string().nullable().optional(),
  sourceProgramWeekIndex: z.number().int().nullable().optional(),
  sourceProgramDayIndex: z.number().int().nullable().optional(),
  templateSnapshot: z.string().nullable(),
  liveStructure: z.string(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  startedAt: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
}).superRefine((val, ctx) => {
  if (val.sourceType === 'routine' && !val.sourceRoutineId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRoutineId'], message: "sourceRoutineId required for sourceType='routine'" });
  }
  if (val.sourceType === 'program_day' && (!val.sourceProgramId || val.sourceProgramWeekIndex == null || val.sourceProgramDayIndex == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceProgramId'], message: "sourceProgramId + week/day indices required for sourceType='program_day'" });
  }
  if (val.sourceType === 'freeform' && val.sourceRoutineId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRoutineId'], message: "sourceRoutineId must be null for sourceType='freeform'" });
  }
});
export type SessionCreateInput = z.infer<typeof SessionCreateInput>;

export const SessionUpdateInput = SessionSchema;
export type SessionUpdateInput = z.infer<typeof SessionUpdateInput>;

export const SessionFinishInput = z.object({
  endedAt: z.number().int(),
});
export type SessionFinishInput = z.infer<typeof SessionFinishInput>;
