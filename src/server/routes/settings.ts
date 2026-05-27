import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { settings } from "../../db/schema";
import { SettingsSchema, SettingsUpdateSchema, SETTINGS_ID, type Settings } from "../../shared/settings";
import { notFound, validationError, staleUpdate } from "../lib/errors";

export const settingsRoute = new Hono();

type SettingsRow = typeof settings.$inferSelect;

// ─── Row ↔ domain mappers ────────────────────────────────────────────────────

function rowToSettings(row: SettingsRow): Settings {
  return {
    id: row.id,
    weightUnit: row.weightUnit as Settings["weightUnit"],
    distanceUnit: row.distanceUnit as Settings["distanceUnit"],
    heightUnit: row.heightUnit as Settings["heightUnit"],
    timezone: row.timezone,
    weekStartsOn: row.weekStartsOn as Settings["weekStartsOn"],
    showRpe: row.showRpe,
    showCardio: row.showCardio,
    theme: row.theme as Settings["theme"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function settingsToRow(s: Settings): SettingsRow {
  return {
    id: s.id,
    weightUnit: s.weightUnit,
    distanceUnit: s.distanceUnit,
    heightUnit: s.heightUnit,
    timezone: s.timezone,
    weekStartsOn: s.weekStartsOn,
    showRpe: s.showRpe,
    showCardio: s.showCardio,
    theme: s.theme,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /settings — auto-seeds if absent
settingsRoute.get("/", async (c) => {
  const row = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get();

  if (!row) {
    const now = Date.now();
    const defaults = SettingsSchema.parse({
      id: SETTINGS_ID,
      weightUnit: "kg",
      distanceUnit: "km",
      heightUnit: "cm",
      timezone: "America/Chicago",
      weekStartsOn: "mon",
      showRpe: true,
      showCardio: true,
      theme: "system",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(settings).values(settingsToRow(defaults)).run();
    return c.json(defaults);
  }

  return c.json(rowToSettings(row));
});

// PATCH /settings
settingsRoute.patch("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = SettingsUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const existingRow = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get();
  if (!existingRow) return notFound(c);

  const incoming = parsed.data;

  // Stale-update check
  if (incoming.updatedAt != null && incoming.updatedAt < existingRow.updatedAt) {
    return staleUpdate(c, existingRow.updatedAt);
  }

  // Merge incoming over existing
  const existing = rowToSettings(existingRow);
  const merged = { ...existing, ...incoming };

  // Re-validate merged object
  const revalidated = SettingsSchema.safeParse(merged);
  if (!revalidated.success) return validationError(c, revalidated.error);

  const updated: Settings = {
    ...revalidated.data,
    updatedAt: Math.max(revalidated.data.updatedAt, Date.now()),
  };

  await db.update(settings).set(settingsToRow(updated)).where(eq(settings.id, SETTINGS_ID)).run();
  return c.json(updated);
});
