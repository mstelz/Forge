import { z } from "zod";

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  avatarDataUrl: z.string().nullable().default(null),
  heightCm: z.number().positive().nullable().default(null),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  sex: z.enum(["male", "female", "other"]).nullable().default(null),
  activityLevel: z
    .enum(["sedentary", "lightly_active", "moderately_active", "very_active", "extra_active"])
    .nullable()
    .default(null),
  goalType: z.enum(["lose", "maintain", "gain"]).nullable().default(null),
  targetWeightKg: z.number().positive().nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const WeightLogSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  weightKg: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().nullable().default(null),
  createdAt: z.number().int().nonnegative(),
});

export type WeightLog = z.infer<typeof WeightLogSchema>;
