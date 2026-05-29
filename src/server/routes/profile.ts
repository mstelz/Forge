import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { profiles, weightLogs } from "../../db/schema";
import { ProfileSchema, ProfileUpdateSchema, WeightLogSchema, type Profile, type WeightLog } from "../../shared/profile";
import { idConflict, notFound, validationError, staleUpdate } from "../lib/errors";

export const profileRoute = new Hono();

type ProfileRow = typeof profiles.$inferSelect;
type WeightLogRow = typeof weightLogs.$inferSelect;

// ─── Row ↔ domain mappers ────────────────────────────────────────────────────

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    avatarDataUrl: row.avatarDataUrl ?? null,
    heightCm: row.heightCm ?? null,
    dateOfBirth: row.dateOfBirth ?? null,
    sex: (row.sex as Profile["sex"]) ?? null,
    activityLevel: (row.activityLevel as Profile["activityLevel"]) ?? null,
    goalType: (row.goalType as Profile["goalType"]) ?? null,
    targetWeightKg: row.targetWeightKg ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function profileToRow(p: Profile): ProfileRow {
  return {
    id: p.id,
    name: p.name,
    avatarDataUrl: p.avatarDataUrl ?? null,
    heightCm: p.heightCm ?? null,
    dateOfBirth: p.dateOfBirth ?? null,
    sex: p.sex ?? null,
    activityLevel: p.activityLevel ?? null,
    goalType: p.goalType ?? null,
    targetWeightKg: p.targetWeightKg ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function rowToWeightLog(row: WeightLogRow): WeightLog {
  return {
    id: row.id,
    profileId: row.profileId,
    weightKg: row.weightKg,
    date: row.date,
    note: row.note ?? null,
    createdAt: row.createdAt,
  };
}

function weightLogToRow(w: WeightLog): WeightLogRow {
  return {
    id: w.id,
    profileId: w.profileId,
    weightKg: w.weightKg,
    date: w.date,
    note: w.note ?? null,
    createdAt: w.createdAt,
  };
}

// ─── Profile routes ───────────────────────────────────────────────────────────

// GET /profile — return all profiles (reconciler uses this)
profileRoute.get("/", async (c) => {
  const rows = await db.select().from(profiles).all();
  return c.json({ profiles: rows.map(rowToProfile) });
});

// POST /profile — create; idempotent on id
profileRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const profile = parsed.data;
  const existing = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, profile.id)).get();
  if (existing) return idConflict(c, profile.id);

  await db.insert(profiles).values(profileToRow(profile)).run();
  return c.json(profile, 201);
});

// PATCH /profile/:id
profileRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ProfileUpdateSchema.safeParse({ ...body, id });
  if (!parsed.success) return validationError(c, parsed.error);

  const existingRow = await db.select().from(profiles).where(eq(profiles.id, id)).get();
  if (!existingRow) return notFound(c);

  if (parsed.data.updatedAt != null && parsed.data.updatedAt < existingRow.updatedAt) {
    return staleUpdate(c, existingRow.updatedAt);
  }

  const existingProfile = rowToProfile(existingRow);
  const merged = {
    ...existingProfile,
    ...Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)),
    id,
  };

  const revalidated = ProfileSchema.safeParse(merged);
  if (!revalidated.success) return validationError(c, revalidated.error);

  const now = Date.now();
  const updated: Profile = { ...revalidated.data, updatedAt: Math.max(revalidated.data.updatedAt, now) };
  await db.update(profiles).set(profileToRow(updated)).where(eq(profiles.id, id)).run();
  return c.json(updated);
});

// DELETE /profile/:id
profileRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, id)).get();
  if (!existing) return notFound(c);
  await db.delete(profiles).where(eq(profiles.id, id)).run();
  return c.body(null, 204);
});

// ─── Weight log routes ────────────────────────────────────────────────────────

// GET /profile/weight-logs — all logs (for reconciler)
profileRoute.get("/weight-logs", async (c) => {
  const rows = await db.select().from(weightLogs).all();
  return c.json({ logs: rows.map(rowToWeightLog) });
});

// GET /profile/:profileId/weight-logs
profileRoute.get("/:profileId/weight-logs", async (c) => {
  const profileId = c.req.param("profileId");
  const rows = await db.select().from(weightLogs).where(eq(weightLogs.profileId, profileId)).all();
  return c.json({ logs: rows.map(rowToWeightLog) });
});

// POST /profile/:profileId/weight-logs
profileRoute.post("/:profileId/weight-logs", async (c) => {
  const profileId = c.req.param("profileId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = WeightLogSchema.safeParse({ ...body, profileId });
  if (!parsed.success) return validationError(c, parsed.error);

  const log = parsed.data;
  const existing = await db.select({ id: weightLogs.id }).from(weightLogs).where(eq(weightLogs.id, log.id)).get();
  if (existing) return idConflict(c, log.id);

  await db.insert(weightLogs).values(weightLogToRow(log)).run();
  return c.json(log, 201);
});

// DELETE /profile/:profileId/weight-logs/:logId
profileRoute.delete("/:profileId/weight-logs/:logId", async (c) => {
  const logId = c.req.param("logId");
  const existing = await db.select({ id: weightLogs.id }).from(weightLogs).where(eq(weightLogs.id, logId)).get();
  if (!existing) return notFound(c);
  await db.delete(weightLogs).where(eq(weightLogs.id, logId)).run();
  return c.body(null, 204);
});
