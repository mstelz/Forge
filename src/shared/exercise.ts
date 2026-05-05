import { z } from "zod";
import { ExerciseTypeEnum, MuscleEnum } from "./enums";

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(100);

const aliases = z
  .array(z.string())
  .default([])
  .transform((arr) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of arr) {
      const v = raw.trim().toLowerCase();
      if (!v) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  });

const dedupedMuscles = z
  .array(MuscleEnum)
  .default([])
  .transform((arr) => Array.from(new Set(arr)));

const dedupedEquipmentIds = z
  .array(uuid)
  .default([])
  .transform((arr) => Array.from(new Set(arr)));

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: "must be http(s) URL" });

export const ExerciseSchema = z.object({
  id: uuid,
  name,
  type: ExerciseTypeEnum,
  primaryMuscles: dedupedMuscles,
  secondaryMuscles: dedupedMuscles,
  equipmentIds: dedupedEquipmentIds,
  aliases,
  description: z.string().max(5000).nullable().optional(),
  instructions: z.string().max(10000).nullable().optional(),
  videoUrls: z.array(httpUrl).default([]),
  notes: z.string().max(2000).nullable().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().nullable(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

export const ExerciseCreateInput = ExerciseSchema.extend({
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
  lastUsedAt: z.number().int().nonnegative().nullable().optional(),
});
export type ExerciseCreateInput = z.infer<typeof ExerciseCreateInput>;

export const ExerciseUpdateInput = ExerciseSchema;
export type ExerciseUpdateInput = z.infer<typeof ExerciseUpdateInput>;
