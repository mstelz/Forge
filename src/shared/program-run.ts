import { z } from "zod";

const uuid = z.string().uuid();
const timestampMs = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ProgramRunStatusEnum = z.enum(["active", "completed", "abandoned"]);
export type ProgramRunStatus = z.infer<typeof ProgramRunStatusEnum>;

export const ProgramRunDayStatusEnum = z.enum([
  "not_started",
  "active",
  "completed",
  "skipped",
]);
export type ProgramRunDayStatus = z.infer<typeof ProgramRunDayStatusEnum>;

// ---------------------------------------------------------------------------
// ProgramRunDayStateSchema
// ---------------------------------------------------------------------------

export const ProgramRunDayStateSchema = z.object({
  id: uuid,
  weekIndex: z.number().int().min(0),
  dayIndex: z.number().int().min(0).max(6),
  status: ProgramRunDayStatusEnum,
  sessionId: uuid.nullable(),
  updatedAt: timestampMs,
});
export type ProgramRunDayState = z.infer<typeof ProgramRunDayStateSchema>;

// ---------------------------------------------------------------------------
// ProgramRunSchema + input types
// ---------------------------------------------------------------------------

function refineDayStates(
  val: { dayStates: { weekIndex: number; dayIndex: number }[] },
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  for (let i = 0; i < val.dayStates.length; i++) {
    const d = val.dayStates[i]!;
    const key = `${d.weekIndex}:${d.dayIndex}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dayStates", i, "weekIndex"],
        message: `Duplicate (weekIndex, dayIndex) pair: (${d.weekIndex}, ${d.dayIndex})`,
      });
    }
    seen.add(key);
  }
}

export const ProgramRunSchema = z
  .object({
    id: uuid,
    programId: uuid,
    status: ProgramRunStatusEnum,
    startedAt: timestampMs,
    endedAt: z.number().int().nullable(),
    currentWeekIndex: z.number().int().min(0),
    currentDayIndex: z.number().int().min(0).max(6),
    /** Unix ms of 00:00 local on the chosen start date (day 0 of week 0). Used to map program days to calendar dates. */
    weekZeroStartDate: timestampMs.optional(),
    dayStates: z.array(ProgramRunDayStateSchema),
    createdAt: timestampMs,
    updatedAt: timestampMs,
  })
  .superRefine(refineDayStates);
export type ProgramRun = z.infer<typeof ProgramRunSchema>;

export const ProgramRunCreateInput = z.object({
  id: uuid,
  programId: uuid,
  startedAt: timestampMs,
  weekZeroStartDate: timestampMs.optional(),
});
export type ProgramRunCreateInput = z.infer<typeof ProgramRunCreateInput>;

export const ProgramRunUpdateInput = ProgramRunSchema;
export type ProgramRunUpdateInput = z.infer<typeof ProgramRunUpdateInput>;
