import { Hono } from "hono";
import { eq, gte, isNull, and } from "drizzle-orm";
import { db } from "../../db/client";
import { exercises } from "../../db/schema";
import {
  ExerciseCreateInput,
  ExerciseUpdateInput,
  type Exercise,
} from "../../shared";
import { idConflict, notFound, validationError } from "../lib/errors";

export const exercisesRoute = new Hono();

type ExerciseRow = typeof exercises.$inferSelect;

const parseArray = (s: string): unknown[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const rowToExercise = (row: ExerciseRow): Exercise => ({
  id: row.id,
  name: row.name,
  type: row.type as Exercise["type"],
  primaryMuscles: parseArray(row.primaryMuscles) as Exercise["primaryMuscles"],
  secondaryMuscles: parseArray(row.secondaryMuscles) as Exercise["secondaryMuscles"],
  equipmentIds: parseArray(row.equipmentIds) as string[],
  aliases: parseArray(row.aliases) as string[],
  description: row.description ?? null,
  instructions: row.instructions ?? null,
  videoUrls: parseArray(row.videoUrls) as string[],
  notes: row.notes ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lastUsedAt: (row.lastUsedAt ?? null) as number | null,
  deletedAt: row.deletedAt ?? null,
});

const exerciseToRow = (e: Exercise): ExerciseRow => ({
  id: e.id,
  name: e.name,
  type: e.type,
  primaryMuscles: JSON.stringify(e.primaryMuscles),
  secondaryMuscles: JSON.stringify(e.secondaryMuscles),
  equipmentIds: JSON.stringify(e.equipmentIds),
  aliases: JSON.stringify(e.aliases),
  description: e.description ?? null,
  instructions: e.instructions ?? null,
  videoUrls: JSON.stringify(e.videoUrls),
  notes: e.notes ?? null,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
  lastUsedAt: e.lastUsedAt ?? null,
  deletedAt: e.deletedAt ?? null,
});

exercisesRoute.get("/", async (c) => {
  const since = Number(c.req.query("since") ?? 0);
  // With since: include tombstoned rows so clients can apply deletions.
  // Without since: filter out deleted rows for a clean full list.
  const rows = since > 0
    ? await db.select().from(exercises).where(gte(exercises.updatedAt, since)).all()
    : await db.select().from(exercises).where(isNull(exercises.deletedAt)).all();
  return c.json({ exercises: rows.map(rowToExercise) });
});

exercisesRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await db.select().from(exercises).where(eq(exercises.id, id)).get();
  if (!row) return notFound(c);
  return c.json(rowToExercise(row));
});

exercisesRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = ExerciseCreateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const now = Date.now();
  const input = parsed.data;
  const exercise: Exercise = {
    id: input.id,
    name: input.name,
    type: input.type,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    equipmentIds: input.equipmentIds,
    aliases: input.aliases,
    description: input.description ?? null,
    instructions: input.instructions ?? null,
    videoUrls: input.videoUrls,
    notes: input.notes ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    lastUsedAt: input.lastUsedAt ?? null,
  };

  const existing = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.id, exercise.id))
    .get();
  if (existing) return idConflict(c, exercise.id);

  await db.insert(exercises).values(exerciseToRow(exercise)).run();
  return c.json(exercise, 201);
});

exercisesRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ExerciseUpdateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const existing = await db.select().from(exercises).where(eq(exercises.id, id)).get();
  if (!existing) return notFound(c);

  const incoming = parsed.data;
  const updated: Exercise = {
    ...incoming,
    id,
    updatedAt: Math.max(incoming.updatedAt, Date.now()),
  };

  await db.update(exercises).set(exerciseToRow(updated)).where(eq(exercises.id, id)).run();
  return c.json(updated);
});

exercisesRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const now = Date.now();
  await db.update(exercises).set({ deletedAt: now, updatedAt: now }).where(eq(exercises.id, id)).run();
  return c.body(null, 204);
});
