import { z } from "zod";

/**
 * Settings schema — singleton row keyed by a fixed id.
 * The settings table/store may not exist in v1 deployments;
 * it is marked optional in the EXPORT_REGISTRY.
 */
export const SettingsSchema = z.object({
  id: z.string().uuid(),
  weightUnit: z.enum(["kg", "lb"]).default("kg"),
  distanceUnit: z.enum(["m", "km", "mi"]).default("km"),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Settings = z.infer<typeof SettingsSchema>;
