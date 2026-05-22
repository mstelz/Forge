import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const GoalCategoryEnum = z.enum([
  "strength",
  "cardio",
  "weight",
  "measurement",
  "program",
  "other",
]);
export type GoalCategory = z.infer<typeof GoalCategoryEnum>;

export const GoalStatusEnum = z.enum(["active", "completed", "abandoned"]);
export type GoalStatus = z.infer<typeof GoalStatusEnum>;

export const GoalDirectionEnum = z.enum(["up", "down"]);
export type GoalDirection = z.infer<typeof GoalDirectionEnum>;

// ─── Base schema ─────────────────────────────────────────────────────────────

export const GoalBaseSchema = z.object({
  id: z.string().uuid(),
  category: GoalCategoryEnum,
  title: z.string().trim().min(1).max(120),
  direction: GoalDirectionEnum,
  startValue: z.number().finite().nullable(),
  targetValue: z.number().finite().nullable(),
  currentValue: z.number().finite().nullable(),
  unit: z.string().trim().min(1).max(16).nullable(),
  linkedExerciseId: z.string().uuid().nullable(),
  linkedProgramRunId: z.string().uuid().nullable(),
  deadline: z.number().int().nullable(),
  notes: z.string().max(4000).nullable(),
  status: GoalStatusEnum,
  completedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type GoalBase = z.infer<typeof GoalBaseSchema>;

// ─── Per-category validation ──────────────────────────────────────────────────

/**
 * Category/field requirement matrix:
 *
 * | Category    | Required                                           | Forbidden                        |
 * |-------------|---------------------------------------------------|----------------------------------|
 * | strength    | startValue, targetValue, unit, linkedExerciseId   | linkedProgramRunId               |
 * |             | direction='up'                                    |                                  |
 * | cardio      | startValue, targetValue, unit, linkedExerciseId   | linkedProgramRunId               |
 * |             | direction='down'                                  |                                  |
 * | weight      | startValue, targetValue, unit, direction='down'   | linkedExerciseId, linkedProgramRunId |
 * | measurement | startValue, targetValue, unit, direction='down'   | linkedExerciseId, linkedProgramRunId |
 * | program     | linkedProgramRunId, direction='up'                | startValue, targetValue, unit, linkedExerciseId |
 * | other       | startValue, targetValue, direction (any)          | linkedExerciseId, linkedProgramRunId |
 */
function enforceCategoryShape(
  val: GoalBase,
  ctx: z.RefinementCtx,
): void {
  const { category } = val;

  // Cross-field rules (apply regardless of category)
  if (val.targetValue != null && val.startValue != null && val.targetValue === val.startValue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetValue"],
      message: "targetValue must differ from startValue",
    });
  }

  if (val.deadline != null && val.deadline <= val.createdAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["deadline"],
      message: "deadline must be after createdAt",
    });
  }

  if (val.status === "completed" && val.completedAt == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completedAt"],
      message: "completedAt must be set when status is 'completed'",
    });
  }

  if (val.status !== "completed" && val.completedAt != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completedAt"],
      message: "completedAt must be null when status is not 'completed'",
    });
  }

  if (category === "strength") {
    if (val.startValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startValue"], message: "startValue required for strength goals" });
    if (val.targetValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetValue"], message: "targetValue required for strength goals" });
    if (val.unit == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: "unit required for strength goals" });
    if (val.linkedExerciseId == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedExerciseId"], message: "linkedExerciseId required for strength goals" });
    if (val.direction !== "up") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["direction"], message: "direction must be 'up' for strength goals" });
    if (val.linkedProgramRunId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedProgramRunId"], message: "linkedProgramRunId not allowed for strength goals" });
  }

  if (category === "cardio") {
    if (val.startValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startValue"], message: "startValue required for cardio goals" });
    if (val.targetValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetValue"], message: "targetValue required for cardio goals" });
    if (val.unit == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: "unit required for cardio goals" });
    if (val.linkedExerciseId == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedExerciseId"], message: "linkedExerciseId required for cardio goals" });
    if (val.direction !== "down") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["direction"], message: "direction must be 'down' for cardio goals" });
    if (val.linkedProgramRunId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedProgramRunId"], message: "linkedProgramRunId not allowed for cardio goals" });
  }

  if (category === "weight") {
    if (val.startValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startValue"], message: "startValue required for weight goals" });
    if (val.targetValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetValue"], message: "targetValue required for weight goals" });
    if (val.unit == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: "unit required for weight goals" });
    if (val.direction !== "down") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["direction"], message: "direction must be 'down' for weight goals" });
    if (val.linkedExerciseId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedExerciseId"], message: "linkedExerciseId not allowed for weight goals" });
    if (val.linkedProgramRunId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedProgramRunId"], message: "linkedProgramRunId not allowed for weight goals" });
  }

  if (category === "measurement") {
    if (val.startValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startValue"], message: "startValue required for measurement goals" });
    if (val.targetValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetValue"], message: "targetValue required for measurement goals" });
    if (val.unit == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: "unit required for measurement goals" });
    if (val.direction !== "down") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["direction"], message: "direction must be 'down' for measurement goals" });
    if (val.linkedExerciseId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedExerciseId"], message: "linkedExerciseId not allowed for measurement goals" });
    if (val.linkedProgramRunId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedProgramRunId"], message: "linkedProgramRunId not allowed for measurement goals" });
  }

  if (category === "program") {
    if (val.linkedProgramRunId == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedProgramRunId"], message: "linkedProgramRunId required for program goals" });
    if (val.direction !== "up") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["direction"], message: "direction must be 'up' for program goals" });
    if (val.startValue != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startValue"], message: "startValue not allowed for program goals" });
    if (val.targetValue != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetValue"], message: "targetValue not allowed for program goals" });
    if (val.unit != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unit"], message: "unit not allowed for program goals" });
    if (val.linkedExerciseId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedExerciseId"], message: "linkedExerciseId not allowed for program goals" });
  }

  if (category === "other") {
    if (val.startValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startValue"], message: "startValue required for other goals" });
    if (val.targetValue == null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetValue"], message: "targetValue required for other goals" });
    if (val.linkedExerciseId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedExerciseId"], message: "linkedExerciseId not allowed for other goals" });
    if (val.linkedProgramRunId != null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedProgramRunId"], message: "linkedProgramRunId not allowed for other goals" });
    // direction: any — no constraint
  }
}

// ─── Exported schemas ─────────────────────────────────────────────────────────

export const GoalSchema = GoalBaseSchema.superRefine(enforceCategoryShape);
export type Goal = z.infer<typeof GoalSchema>;

/**
 * Full record on create (client-supplied id + timestamps).
 */
export const GoalCreateSchema = GoalSchema;
export type GoalCreate = z.infer<typeof GoalCreateSchema>;

/**
 * Partial update — server merges then re-validates merged record.
 * The id field is required; all others are optional.
 */
export const GoalUpdateSchema = GoalBaseSchema.partial()
  .extend({ id: z.string().uuid() });
export type GoalUpdate = z.infer<typeof GoalUpdateSchema>;
