import { z } from "zod";

const uuid = z.string().uuid();
const timestampMs = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// RoutineItemOverrideSchema
// ---------------------------------------------------------------------------

export const RoutineItemOverrideSchema = z.object({
  routineItemId: uuid,
  setCount: z.number().int().min(1).max(20).optional(),
  uniformReps: z.number().int().min(1).max(999).optional(),
  uniformRepsMin: z.number().int().min(1).max(999).optional(),
  uniformRepsMax: z.number().int().min(1).max(999).optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type RoutineItemOverride = z.infer<typeof RoutineItemOverrideSchema>;

// ---------------------------------------------------------------------------
// ProgramDaySchema
// ---------------------------------------------------------------------------

export const ProgramDaySchema = z.object({
  id: uuid,
  weekIndex: z.number().int().min(0),
  dayIndex: z.number().int().min(0).max(6),
  order: z.number().int().min(0).default(0),
  label: z.string().max(50).nullable().optional(),
  routineId: uuid.nullable(),
  isRestDay: z.boolean(),
  notes: z.string().max(1000).nullable().optional(),
  overrides: z.array(RoutineItemOverrideSchema).nullable().optional(),
});
export type ProgramDay = z.infer<typeof ProgramDaySchema>;

// ---------------------------------------------------------------------------
// ProgramSchema + input types
// ---------------------------------------------------------------------------

const programBase = {
  id: uuid,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).nullable().optional(),
  durationWeeks: z.number().int().min(1).max(52),
  days: z.array(ProgramDaySchema),
};

function refineProgramDays(
  val: { durationWeeks: number; days: { weekIndex: number; dayIndex: number; order?: number; routineId?: string | null; isRestDay: boolean }[] },
  ctx: z.RefinementCtx,
) {
  // (weekIndex, dayIndex, order) uniqueness
  const seen = new Set<string>();
  for (let i = 0; i < val.days.length; i++) {
    const d = val.days[i]!;
    const order = d.order ?? 0;
    const key = `${d.weekIndex}:${d.dayIndex}:${order}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days", i, "weekIndex"],
        message: `Duplicate (weekIndex, dayIndex, order) tuple: (${d.weekIndex}, ${d.dayIndex}, ${order})`,
      });
    }
    seen.add(key);

    // weekIndex bounds
    if (d.weekIndex >= val.durationWeeks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days", i, "weekIndex"],
        message: `weekIndex ${d.weekIndex} is out of range [0, ${val.durationWeeks - 1}]`,
      });
    }

    // isRestDay only valid on order === 0
    if (d.isRestDay && order !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days", i, "isRestDay"],
        message: "isRestDay=true is only valid on the primary workout slot (order 0)",
      });
    }

    // routineId + isRestDay mutually exclusive
    if (d.routineId && d.isRestDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["days", i, "isRestDay"],
        message: "routineId and isRestDay=true are mutually exclusive",
      });
    }
  }
}

export const ProgramSchema = z
  .object({
    ...programBase,
    createdAt: timestampMs,
    updatedAt: timestampMs,
  })
  .superRefine(refineProgramDays);
export type Program = z.infer<typeof ProgramSchema>;

export const ProgramCreateInput = z
  .object({
    ...programBase,
    createdAt: timestampMs.optional(),
    updatedAt: timestampMs.optional(),
  })
  .superRefine(refineProgramDays);
export type ProgramCreateInput = z.infer<typeof ProgramCreateInput>;

export const ProgramUpdateInput = ProgramSchema;
export type ProgramUpdateInput = z.infer<typeof ProgramUpdateInput>;
