import { z } from "zod";

export const LogSetTypeEnum = z.enum(['normal', 'warmup', 'drop', 'failure', 'amrap', 'rest_pause']);
export type LogSetType = z.infer<typeof LogSetTypeEnum>;

export const SessionLogStatusEnum = z.enum(['logged', 'skipped', 'extra']);
export type SessionLogStatus = z.infer<typeof SessionLogStatusEnum>;

const WEIGHT_REQUIRED_TYPES = new Set(['normal', 'drop', 'amrap', 'failure', 'rest_pause']);

/** Additional efforts after the main weight/reps pair; one log still represents one set. */
export const SetSegmentSchema = z.object({
  weightKg: z.number().finite().nonnegative().nullable(),
  reps: z.number().int().positive(),
  pauseSec: z.number().int().min(0).max(3600),
});
export type SetSegment = z.infer<typeof SetSegmentSchema>;
const SegmentsSchema = z.array(SetSegmentSchema).max(20).nullable().optional();

export function setVolumeKg(log: { weightKg: number | null; reps: number | null; segments?: SetSegment[] | null }): number {
  return (log.weightKg ?? 0) * (log.reps ?? 0) +
    (log.segments ?? []).reduce((sum, part) => sum + (part.weightKg ?? 0) * part.reps, 0);
}

export const SessionSetLogSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  performedExerciseId: z.string().uuid(),
  exerciseId: z.string(),
  sessionItemId: z.string().uuid(),
  plannedSetId: z.string().uuid().nullable(),
  order: z.number().int(),
  reps: z.number().int().nullable(),
  weightKg: z.number().nullable(),
  rpe: z.number().min(1).max(10).multipleOf(0.5).nullable(),
  durationSec: z.number().int().nullable(),
  distanceM: z.number().nullable(),
  notes: z.string().max(500).nullable(),
  setType: LogSetTypeEnum,
  segments: SegmentsSchema,
  status: SessionLogStatusEnum,
  loggedAt: z.number().int(),
  restAfterSec: z.number().int().nullable(),
  enteredWeight: z.number().nullable(),
  enteredWeightUnit: z.enum(['kg', 'lb']).nullable(),
  enteredDistance: z.number().nullable(),
  enteredDistanceUnit: z.enum(['m', 'km', 'mi']).nullable(),
}).refine(
  (val) => (val.enteredWeight == null) === (val.enteredWeightUnit == null),
  { message: "enteredWeight and enteredWeightUnit must both be set or both null", path: ["enteredWeightUnit"] }
).refine(
  (val) => (val.enteredDistance == null) === (val.enteredDistanceUnit == null),
  { message: "enteredDistance and enteredDistanceUnit must both be set or both null", path: ["enteredDistanceUnit"] }
).superRefine((val, ctx) => {
  if (val.status === 'logged') {
    if (
      val.weightKg != null &&
      WEIGHT_REQUIRED_TYPES.has(val.setType) &&
      (val.reps == null || val.reps <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reps'],
        message: 'reps must be > 0 when weightKg is present for this set type',
      });
    }
    const hasWeight = val.reps != null && val.reps > 0;
    const hasDuration = val.durationSec != null && val.durationSec > 0;
    const hasDistance = val.distanceM != null && val.distanceM > 0;
    if (!hasWeight && !hasDuration && !hasDistance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reps'],
        message: 'logged set must have at least one metric (reps, durationSec, or distanceM)',
      });
    }
  }
});
export type SessionSetLog = z.infer<typeof SessionSetLogSchema>;

export const SessionSetLogCreateInput = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  performedExerciseId: z.string().uuid(),
  exerciseId: z.string(),
  sessionItemId: z.string().uuid(),
  plannedSetId: z.string().uuid().nullable().optional(),
  order: z.number().int(),
  reps: z.number().int().nullable().optional(),
  weightKg: z.number().nullable().optional(),
  rpe: z.number().min(1).max(10).multipleOf(0.5).nullable().optional(),
  durationSec: z.number().int().nullable().optional(),
  distanceM: z.number().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  setType: LogSetTypeEnum,
  segments: SegmentsSchema,
  status: SessionLogStatusEnum,
  loggedAt: z.number().int(),
  restAfterSec: z.number().int().nullable().optional(),
  enteredWeight: z.number().nullable().optional(),
  enteredWeightUnit: z.enum(['kg', 'lb']).nullable().optional(),
  enteredDistance: z.number().nullable().optional(),
  enteredDistanceUnit: z.enum(['m', 'km', 'mi']).nullable().optional(),
}).refine(
  (val) => (val.enteredWeight == null) === (val.enteredWeightUnit == null),
  { message: "enteredWeight and enteredWeightUnit must both be set or both null", path: ["enteredWeightUnit"] }
).refine(
  (val) => (val.enteredDistance == null) === (val.enteredDistanceUnit == null),
  { message: "enteredDistance and enteredDistanceUnit must both be set or both null", path: ["enteredDistanceUnit"] }
);
export type SessionSetLogCreateInput = z.infer<typeof SessionSetLogCreateInput>;

export const SessionSetLogUpdateInput = SessionSetLogSchema;
export type SessionSetLogUpdateInput = z.infer<typeof SessionSetLogUpdateInput>;
