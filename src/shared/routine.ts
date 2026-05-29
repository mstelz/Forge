import { z } from "zod";

export const SET_TYPE_VALUES = [
  "normal",
  "amrap",
  "to_failure",
  "drop_set",
  "rest_pause",
] as const;
export const SetTypeEnum = z.enum(SET_TYPE_VALUES);
export type SetType = z.infer<typeof SetTypeEnum>;

export const BLOCK_TYPE_VALUES = ["single", "superset"] as const;
export const BlockTypeEnum = z.enum(BLOCK_TYPE_VALUES);
export type BlockType = z.infer<typeof BlockTypeEnum>;

export const MODE_VALUES = ["uniform", "per_set"] as const;
export const ModeEnum = z.enum(MODE_VALUES);
export type Mode = z.infer<typeof ModeEnum>;

const uuid = z.string().uuid();
const orderInt = z.number().int().nonnegative();
const reps = z.number().int().min(1).max(999);

const REP_REQUIRED_TYPES: ReadonlySet<SetType> = new Set([
  "normal",
  "drop_set",
  "rest_pause",
]);
const REP_OPTIONAL_TYPES: ReadonlySet<SetType> = new Set(["amrap", "to_failure"]);

export const SetTargetSchema = z
  .object({
    id: uuid,
    order: orderInt,
    reps: reps.optional(),
    repsMin: reps.optional(),
    repsMax: reps.optional(),
    setType: SetTypeEnum,
    techniqueNotes: z.string().max(500).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const hasSingle = val.reps != null;
    const hasMin = val.repsMin != null;
    const hasMax = val.repsMax != null;
    const hasRange = hasMin && hasMax;
    const hasAnyRep = hasSingle || hasMin || hasMax;

    if (hasSingle && (hasMin || hasMax)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reps"],
        message: "Use either reps or a min/max range, not both",
      });
    }
    if ((hasMin && !hasMax) || (hasMax && !hasMin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasMin ? "repsMax" : "repsMin"],
        message: "Both repsMin and repsMax are required for a range",
      });
    }
    if (hasRange && val.repsMin! > val.repsMax!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repsMin"],
        message: "repsMin must be ≤ repsMax",
      });
    }
  });
export type SetTarget = z.infer<typeof SetTargetSchema>;

export const RoutineItemSchema = z
  .object({
    id: uuid,
    exerciseId: uuid,
    order: orderInt,
    setCount: z.number().int().min(1).max(20),
    repMode: ModeEnum,
    setTypeMode: ModeEnum,
    uniformReps: reps.optional(),
    uniformRepsMin: reps.optional(),
    uniformRepsMax: reps.optional(),
    uniformSetType: SetTypeEnum.optional(),
    setTargets: z.array(SetTargetSchema).optional(),
    durationSec: z.number().int().min(1).max(86_400).optional(),
    durationMinSec: z.number().int().min(1).max(86_400).optional(),
    durationMaxSec: z.number().int().min(1).max(86_400).optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const anyPerSet =
      val.repMode === "per_set" ||
      val.setTypeMode === "per_set";

    // setTargets presence + length + dense order
    if (anyPerSet) {
      if (!val.setTargets) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["setTargets"],
          message: "setTargets required when any mode is per_set",
        });
      } else {
        if (val.setTargets.length !== val.setCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["setTargets"],
            message: `setTargets length must equal setCount (${val.setCount})`,
          });
        }
        const seen = new Set<number>();
        for (let i = 0; i < val.setTargets.length; i++) {
          const o = val.setTargets[i]!.order;
          if (o < 0 || o >= val.setCount || seen.has(o)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["setTargets", i, "order"],
              message: "setTargets order must be dense 0..setCount-1",
            });
          }
          seen.add(o);
        }
      }
    } else if (val.setTargets && val.setTargets.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["setTargets"],
        message: "setTargets must be absent when all modes are uniform",
      });
    }

    // Rep mode gating
    if (val.repMode === "uniform") {
      const hasSingle = val.uniformReps != null;
      const hasMin = val.uniformRepsMin != null;
      const hasMax = val.uniformRepsMax != null;
      const hasRange = hasMin && hasMax;
      const allowAbsent =
        val.setTypeMode === "uniform" &&
        val.uniformSetType != null &&
        REP_OPTIONAL_TYPES.has(val.uniformSetType);

      if (hasSingle && (hasMin || hasMax)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["uniformReps"],
          message: "Use either uniformReps or a min/max range, not both",
        });
      }
      if ((hasMin && !hasMax) || (hasMax && !hasMin)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [hasMin ? "uniformRepsMax" : "uniformRepsMin"],
          message: "Both uniformRepsMin and uniformRepsMax are required for a range",
        });
      }
      if (hasRange && val.uniformRepsMin! > val.uniformRepsMax!) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["uniformRepsMin"],
          message: "uniformRepsMin must be ≤ uniformRepsMax",
        });
      }
      if (!hasSingle && !hasRange && !allowAbsent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["uniformReps"],
          message: "Set uniformReps or a uniformRepsMin/Max range",
        });
      }
    } else {
      if (
        val.uniformReps != null ||
        val.uniformRepsMin != null ||
        val.uniformRepsMax != null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["uniformReps"],
          message: "uniform reps fields must be absent when repMode is per_set",
        });
      }
    }

    // SetType mode gating
    if (val.setTypeMode === "uniform") {
      if (val.uniformSetType == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["uniformSetType"],
          message: "uniformSetType required when setTypeMode is uniform",
        });
      } else if (val.setTargets) {
        for (let i = 0; i < val.setTargets.length; i++) {
          if (val.setTargets[i]!.setType !== val.uniformSetType) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["setTargets", i, "setType"],
              message: `setType must equal uniformSetType (${val.uniformSetType})`,
            });
          }
        }
      }
    } else if (val.uniformSetType != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["uniformSetType"],
        message: "uniformSetType must be absent when setTypeMode is per_set",
      });
    }

    // Per-set rep gating
    if (val.repMode === "uniform" && val.setTargets) {
      for (let i = 0; i < val.setTargets.length; i++) {
        const t = val.setTargets[i]!;
        if (t.reps != null || t.repsMin != null || t.repsMax != null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["setTargets", i, "reps"],
            message: "per-set reps must be absent when repMode is uniform",
          });
        }
      }
    }
    if (val.repMode === "per_set" && val.setTargets) {
      for (let i = 0; i < val.setTargets.length; i++) {
        const t = val.setTargets[i]!;
        const hasAnyRep = t.reps != null || t.repsMin != null || t.repsMax != null;
        if (!hasAnyRep && REP_REQUIRED_TYPES.has(t.setType)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["setTargets", i, "reps"],
            message: `reps required when setType is ${t.setType}`,
          });
        }
      }
    }

    // Duration: range cross-field
    const hasDurSingle = val.durationSec != null;
    const hasDurMin = val.durationMinSec != null;
    const hasDurMax = val.durationMaxSec != null;
    if (hasDurSingle && (hasDurMin || hasDurMax)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationSec"],
        message: "Use either durationSec or a min/max range, not both",
      });
    }
    if ((hasDurMin && !hasDurMax) || (hasDurMax && !hasDurMin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasDurMin ? "durationMaxSec" : "durationMinSec"],
        message: "Both durationMinSec and durationMaxSec are required for a range",
      });
    }
    if (hasDurMin && hasDurMax && val.durationMinSec! > val.durationMaxSec!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationMinSec"],
        message: "durationMinSec must be ≤ durationMaxSec",
      });
    }
  });
export type RoutineItem = z.infer<typeof RoutineItemSchema>;

export const RoutineBlockSchema = z
  .object({
    id: uuid,
    type: BlockTypeEnum,
    order: orderInt,
    roundCount: z.number().int().min(1).max(20).nullable().optional(),
    restSec: z.number().int().min(0).max(3600).nullable().optional(),
    tempo: z.string().max(20).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    items: z.array(RoutineItemSchema),
  })
  .superRefine((val, ctx) => {
    if (val.type === "single") {
      if (val.items.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items"],
          message: "single block must have exactly 1 item",
        });
      }
      if (val.roundCount != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roundCount"],
          message: "single block must not have roundCount",
        });
      }
    } else {
      if (val.items.length < 2 || val.items.length > 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items"],
          message: "superset must have 2–6 items",
        });
      }
    }

    // Item order dense 0..M-1
    const seen = new Set<number>();
    for (let i = 0; i < val.items.length; i++) {
      const o = val.items[i]!.order;
      if (o < 0 || o >= val.items.length || seen.has(o)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", i, "order"],
          message: "item order must be dense 0..items.length-1",
        });
      }
      seen.add(o);
    }
  });
export type RoutineBlock = z.infer<typeof RoutineBlockSchema>;

export const RoutineSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(100),
    notes: z.string().max(2000).nullable().optional(),
    estimatedDurationMin: z.number().int().min(1).max(600).nullable().optional(),
    blocks: z.array(RoutineBlockSchema),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<number>();
    for (let i = 0; i < val.blocks.length; i++) {
      const o = val.blocks[i]!.order;
      if (o < 0 || o >= val.blocks.length || seen.has(o)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocks", i, "order"],
          message: "block order must be dense 0..blocks.length-1",
        });
      }
      seen.add(o);
    }
  });
export type Routine = z.infer<typeof RoutineSchema>;

const RoutineBaseShape = {
  id: uuid,
  name: z.string().trim().min(1).max(100),
  notes: z.string().max(2000).nullable().optional(),
  estimatedDurationMin: z.number().int().min(1).max(600).nullable().optional(),
  blocks: z.array(RoutineBlockSchema),
};

export const RoutineCreateInput = z
  .object({
    ...RoutineBaseShape,
    createdAt: z.number().int().nonnegative().optional(),
    updatedAt: z.number().int().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<number>();
    for (let i = 0; i < val.blocks.length; i++) {
      const o = val.blocks[i]!.order;
      if (o < 0 || o >= val.blocks.length || seen.has(o)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocks", i, "order"],
          message: "block order must be dense 0..blocks.length-1",
        });
      }
      seen.add(o);
    }
  });
export type RoutineCreateInput = z.infer<typeof RoutineCreateInput>;

export const RoutineUpdateInput = RoutineSchema;
export type RoutineUpdateInput = z.infer<typeof RoutineUpdateInput>;
