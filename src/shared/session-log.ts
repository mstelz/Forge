import { z } from "zod";

export const LogSetTypeEnum = z.enum(['normal', 'warmup', 'drop', 'failure', 'amrap', 'rest_pause']);
export type LogSetType = z.infer<typeof LogSetTypeEnum>;

export const SessionLogStatusEnum = z.enum(['logged', 'skipped', 'extra']);
export type SessionLogStatus = z.infer<typeof SessionLogStatusEnum>;

const WEIGHT_REQUIRED_TYPES = new Set(['normal', 'drop', 'amrap', 'failure']);

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
    const hasWeight = val.weightKg != null && val.reps != null && val.reps > 0;
    const hasDuration = val.durationSec != null && val.durationSec > 0;
    const hasDistance = val.distanceM != null && val.distanceM > 0;
    if (!hasWeight && !hasDuration && !hasDistance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reps'],
        message: 'logged set must have at least one metric (weight+reps, durationSec, or distanceM)',
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
