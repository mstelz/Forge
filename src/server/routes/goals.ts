import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { goals } from "../../db/schema";
import { GoalCreateSchema, GoalUpdateSchema, GoalSchema, type Goal } from "../../shared/goals";
import { idConflict, notFound, validationError, staleUpdate } from "../lib/errors";

export const goalsRoute = new Hono();

type GoalRow = typeof goals.$inferSelect;

// ─── Row ↔ domain mappers ────────────────────────────────────────────────────

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    category: row.category as Goal["category"],
    title: row.title,
    direction: row.direction as Goal["direction"],
    startValue: row.startValue ?? null,
    targetValue: row.targetValue ?? null,
    currentValue: row.currentValue ?? null,
    unit: row.unit ?? null,
    linkedExerciseId: row.linkedExerciseId ?? null,
    linkedProgramRunId: row.linkedProgramRunId ?? null,
    deadline: row.deadline ?? null,
    notes: row.notes ?? null,
    status: row.status as Goal["status"],
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function goalToRow(g: Goal): GoalRow {
  return {
    id: g.id,
    category: g.category,
    title: g.title,
    direction: g.direction,
    startValue: g.startValue ?? null,
    targetValue: g.targetValue ?? null,
    currentValue: g.currentValue ?? null,
    unit: g.unit ?? null,
    linkedExerciseId: g.linkedExerciseId ?? null,
    linkedProgramRunId: g.linkedProgramRunId ?? null,
    deadline: g.deadline ?? null,
    notes: g.notes ?? null,
    status: g.status,
    completedAt: g.completedAt ?? null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /goals
goalsRoute.get("/", async (c) => {
  const rows = await db.select().from(goals).all();
  return c.json({ goals: rows.map(rowToGoal) });
});

// GET /goals/:id
goalsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await db.select().from(goals).where(eq(goals.id, id)).get();
  if (!row) return notFound(c);
  return c.json(rowToGoal(row));
});

// POST /goals
goalsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = GoalCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const goal = parsed.data;
  const existing = await db
    .select({ id: goals.id })
    .from(goals)
    .where(eq(goals.id, goal.id))
    .get();
  if (existing) return idConflict(c, goal.id);

  await db.insert(goals).values(goalToRow(goal)).run();
  return c.json(goal, 201);
});

// PATCH /goals/:id
goalsRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = GoalUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const existingRow = await db.select().from(goals).where(eq(goals.id, id)).get();
  if (!existingRow) return notFound(c);

  const incoming = parsed.data;

  // Stale-update check: reject if the incoming updatedAt is older than stored
  if (incoming.updatedAt != null && incoming.updatedAt < existingRow.updatedAt) {
    return staleUpdate(c, existingRow.updatedAt);
  }

  // Merge incoming over existing row
  const existingGoal = rowToGoal(existingRow);
  const merged = {
    ...existingGoal,
    ...Object.fromEntries(
      Object.entries(incoming).filter(([, v]) => v !== undefined),
    ),
    id, // enforce id from URL
  };

  // Re-validate merged record against GoalSchema
  const revalidated = GoalSchema.safeParse(merged);
  if (!revalidated.success) return validationError(c, revalidated.error);

  const now = Date.now();
  const updated: Goal = {
    ...revalidated.data,
    updatedAt: Math.max(revalidated.data.updatedAt, now),
  };

  await db.update(goals).set(goalToRow(updated)).where(eq(goals.id, id)).run();
  return c.json(updated);
});

// DELETE /goals/:id
goalsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await db
    .select({ id: goals.id })
    .from(goals)
    .where(eq(goals.id, id))
    .get();
  if (!existing) return notFound(c);
  await db.delete(goals).where(eq(goals.id, id)).run();
  return c.body(null, 204);
});

// 405 for unrecognized sub-paths
goalsRoute.on(["POST", "PATCH", "DELETE"], "/:id/*", (c) => {
  return c.json({ error: "method_not_allowed" }, 405);
});
