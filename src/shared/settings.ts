import { z } from "zod";

/**
 * Settings schema — singleton row keyed by a fixed id.
 * The settings table/store may not exist in v1 deployments;
 * it is marked optional in the EXPORT_REGISTRY.
 */

export const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export const SettingsSchema = z.object({
  id: z.string().uuid(),
  weightUnit: z.enum(["kg", "lb"]).default("kg"),
  distanceUnit: z.enum(["m", "km", "mi"]).default("km"),
  heightUnit: z.enum(["cm", "ft"]).default("cm"),
  timezone: z.string().min(1).default("America/Chicago"),
  weekStartsOn: z.enum(["mon", "sun"]).default("mon"),
  showRpe: z.boolean().default(true),
  showCardio: z.boolean().default(true),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsUpdateSchema = SettingsSchema.omit({ id: true, createdAt: true }).partial();
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;
