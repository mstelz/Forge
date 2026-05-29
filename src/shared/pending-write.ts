import { z } from "zod";

export const PendingEntityEnum = z.enum(["exercise", "equipment", "routine", "session", "session_log", "session_times", "program", "program_run", "goal", "settings", "profile", "weight_log"]);
export type PendingEntity = z.infer<typeof PendingEntityEnum>;

export const PendingOpEnum = z.enum(["create", "update", "delete"]);
export type PendingOp = z.infer<typeof PendingOpEnum>;

export const PendingStatusEnum = z.enum(["pending", "poisoned"]);
export type PendingStatus = z.infer<typeof PendingStatusEnum>;

export const PendingWriteSchema = z.object({
  id: z.string().uuid(),
  entity: PendingEntityEnum,
  op: PendingOpEnum,
  payload: z.unknown(),
  createdAt: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative().default(0),
  lastError: z.string().nullable().optional(),
  lastAttemptAt: z.number().int().nonnegative().optional(),
  status: PendingStatusEnum.default("pending"),
});
export type PendingWrite = z.infer<typeof PendingWriteSchema>;
