import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../../db/client";
import { routines, routineBlocks, routineItems, routineSetTargets } from "../../db/schema";
import {
  RoutineCreateInput,
  RoutineUpdateInput,
  type Routine,
  type RoutineBlock,
  type RoutineItem,
  type SetTarget,
} from "../../shared/routine";
import { idConflict, notFound, validationError } from "../lib/errors";

export const routinesRoute = new Hono();

// ---------------------------------------------------------------------------
// Types inferred from schema rows
// ---------------------------------------------------------------------------
type RoutineRow = typeof routines.$inferSelect;
type RoutineBlockRow = typeof routineBlocks.$inferSelect;
type RoutineItemRow = typeof routineItems.$inferSelect;
type RoutineSetTargetRow = typeof routineSetTargets.$inferSelect;

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------
function rowToSetTarget(row: RoutineSetTargetRow): SetTarget {
  return {
    id: row.id,
    order: row.order,
    reps: row.reps ?? undefined,
    repsMin: row.repsMin ?? undefined,
    repsMax: row.repsMax ?? undefined,
    setType: row.setType as SetTarget["setType"],
    techniqueNotes: row.techniqueNotes ?? null,
  };
}

function rowToItem(row: RoutineItemRow, targets: SetTarget[]): RoutineItem {
  const item: RoutineItem = {
    id: row.id,
    exerciseId: row.exerciseId,
    order: row.order,
    setCount: row.setCount,
    repMode: row.repMode as RoutineItem["repMode"],
    setTypeMode: row.setTypeMode as RoutineItem["setTypeMode"],
    uniformReps: row.uniformReps ?? undefined,
    uniformRepsMin: row.uniformRepsMin ?? undefined,
    uniformRepsMax: row.uniformRepsMax ?? undefined,
    uniformSetType: row.uniformSetType != null
      ? (row.uniformSetType as RoutineItem["uniformSetType"])
      : undefined,
    durationSec: row.durationSec ?? undefined,
    durationMinSec: row.durationMinSec ?? undefined,
    durationMaxSec: row.durationMaxSec ?? undefined,
    notes: row.notes ?? null,
  };
  if (targets.length > 0) {
    item.setTargets = targets;
  }
  return item;
}

function rowToBlock(row: RoutineBlockRow, items: RoutineItem[]): RoutineBlock {
  return {
    id: row.id,
    type: row.type as RoutineBlock["type"],
    order: row.order,
    roundCount: row.roundCount ?? null,
    restSec: row.restSec ?? null,
    tempo: row.tempo ?? null,
    notes: row.notes ?? null,
    items,
  };
}

// ---------------------------------------------------------------------------
// loadRoutine: fetch all nested data then assemble
// ---------------------------------------------------------------------------
async function loadRoutine(id: string): Promise<Routine | null> {
  const routine = await db
    .select()
    .from(routines)
    .where(eq(routines.id, id))
    .get();
  if (!routine) return null;

  const blocks = await db
    .select()
    .from(routineBlocks)
    .where(eq(routineBlocks.routineId, id))
    .orderBy(routineBlocks.order)
    .all();

  const items = await db
    .select()
    .from(routineItems)
    .where(eq(routineItems.routineId, id))
    .orderBy(routineItems.order)
    .all();

  const setTargets = await db
    .select()
    .from(routineSetTargets)
    .where(eq(routineSetTargets.routineId, id))
    .orderBy(routineSetTargets.order)
    .all();

  // Group setTargets by itemId
  const setTargetsByItem = new Map<string, SetTarget[]>();
  for (const st of setTargets) {
    const arr = setTargetsByItem.get(st.itemId) ?? [];
    arr.push(rowToSetTarget(st));
    setTargetsByItem.set(st.itemId, arr);
  }

  // Group items by blockId
  const itemsByBlock = new Map<string, RoutineItem[]>();
  for (const item of items) {
    const targets = setTargetsByItem.get(item.id) ?? [];
    const arr = itemsByBlock.get(item.blockId) ?? [];
    arr.push(rowToItem(item, targets));
    itemsByBlock.set(item.blockId, arr);
  }

  const assembledBlocks: RoutineBlock[] = blocks.map((b) =>
    rowToBlock(b, itemsByBlock.get(b.id) ?? [])
  );

  return {
    id: routine.id,
    name: routine.name,
    notes: routine.notes ?? null,
    estimatedDurationMin: routine.estimatedDurationMin ?? null,
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
    blocks: assembledBlocks,
  };
}

// ---------------------------------------------------------------------------
// Helper: insert blocks + items + setTargets inside an existing transaction
// ---------------------------------------------------------------------------
function insertChildren(
  routineId: string,
  blocks: RoutineCreateInput["blocks"],
): void {
  for (const block of blocks) {
    db.insert(routineBlocks)
      .values({
        id: block.id,
        routineId,
        order: block.order,
        type: block.type,
        roundCount: block.roundCount ?? null,
        restSec: block.restSec ?? null,
        tempo: block.tempo ?? null,
        notes: block.notes ?? null,
      })
      .run();

    for (const item of block.items) {
      db.insert(routineItems)
        .values({
          id: item.id,
          blockId: block.id,
          routineId,
          order: item.order,
          exerciseId: item.exerciseId,
          setCount: item.setCount,
          repMode: item.repMode,
          setTypeMode: item.setTypeMode,
          uniformReps: item.uniformReps ?? null,
          uniformRepsMin: item.uniformRepsMin ?? null,
          uniformRepsMax: item.uniformRepsMax ?? null,
          uniformSetType: item.uniformSetType ?? null,
          durationSec: item.durationSec ?? null,
          durationMinSec: item.durationMinSec ?? null,
          durationMaxSec: item.durationMaxSec ?? null,
          notes: item.notes ?? null,
        })
        .run();

      if (item.setTargets) {
        for (const st of item.setTargets) {
          db.insert(routineSetTargets)
            .values({
              id: st.id,
              itemId: item.id,
              routineId,
              order: st.order,
              reps: st.reps ?? null,
              repsMin: st.repsMin ?? null,
              repsMax: st.repsMax ?? null,
              setType: st.setType,
              techniqueNotes: st.techniqueNotes ?? null,
            })
            .run();
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /routines
routinesRoute.get("/", async (c) => {
  const rows = await db.select().from(routines).all();
  const result: Routine[] = [];
  for (const row of rows) {
    const full = await loadRoutine(row.id);
    if (full) result.push(full);
  }
  return c.json({ routines: result });
});

// GET /routines/:id
routinesRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  const routine = await loadRoutine(id);
  if (!routine) return notFound(c);
  return c.json(routine);
});

// POST /routines
routinesRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = RoutineCreateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;
  const now = Date.now();

  const existing = await db
    .select({ id: routines.id })
    .from(routines)
    .where(eq(routines.id, input.id))
    .get();
  if (existing) return idConflict(c, input.id);

  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;

  const tx = sqlite.transaction(() => {
    db.insert(routines)
      .values({
        id: input.id,
        name: input.name,
        notes: input.notes ?? null,
        estimatedDurationMin: input.estimatedDurationMin ?? null,
        createdAt,
        updatedAt,
      })
      .run();

    insertChildren(input.id, input.blocks);
  });

  tx();

  const routine = await loadRoutine(input.id);
  return c.json(routine!, 201);
});

// PATCH /routines/:id
routinesRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = RoutineUpdateInput.safeParse(body);
  if (!parsed.success) return validationError(c, parsed.error);

  const input = parsed.data;

  const existing = await db
    .select({ id: routines.id })
    .from(routines)
    .where(eq(routines.id, id))
    .get();
  if (!existing) return notFound(c);

  const now = Date.now();
  const updatedAt = Math.max(input.updatedAt, now);

  const tx = sqlite.transaction(() => {
    // Delete all blocks (cascade handles items + setTargets)
    db.delete(routineBlocks).where(eq(routineBlocks.routineId, id)).run();

    // Re-insert children
    insertChildren(id, input.blocks);

    // Update routine row
    db.update(routines)
      .set({
        name: input.name,
        notes: input.notes ?? null,
        estimatedDurationMin: input.estimatedDurationMin ?? null,
        updatedAt,
      })
      .where(eq(routines.id, id))
      .run();
  });

  tx();

  const routine = await loadRoutine(id);
  return c.json(routine!);
});

// DELETE /routines/:id
routinesRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(routines).where(eq(routines.id, id)).run();
  return c.body(null, 204);
});
