import { z } from "zod";

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(100);

export const EquipmentSchema = z.object({
  id: uuid,
  name,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable().optional(),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

export const EquipmentCreateInput = z.object({
  id: uuid,
  name,
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
});
export type EquipmentCreateInput = z.infer<typeof EquipmentCreateInput>;

export const EquipmentUpdateInput = EquipmentSchema;
export type EquipmentUpdateInput = z.infer<typeof EquipmentUpdateInput>;
