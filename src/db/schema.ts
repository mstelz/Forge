import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const exercises = sqliteTable(
  "exercises",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    primaryMuscles: text("primary_muscles").notNull().default("[]"),
    secondaryMuscles: text("secondary_muscles").notNull().default("[]"),
    equipmentIds: text("equipment_ids").notNull().default("[]"),
    aliases: text("aliases").notNull().default("[]"),
    description: text("description"),
    instructions: text("instructions"),
    videoUrls: text("video_urls").notNull().default("[]"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastUsedAt: integer("last_used_at"),
  },
  (t) => ({
    nameIdx: index("idx_exercises_name").on(t.name),
    typeIdx: index("idx_exercises_type").on(t.type),
    updatedAtIdx: index("idx_exercises_updated_at").on(t.updatedAt),
  }),
);

export const equipment = sqliteTable(
  "equipment",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    nameLowerIdx: uniqueIndex("idx_equipment_name_lower").on(sql`lower(${t.name})`),
  }),
);

export const routines = sqliteTable(
  "routines",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    notes: text("notes"),
    estimatedDurationMin: integer("estimated_duration_min"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    nameIdx: index("idx_routines_name").on(t.name),
    updatedAtIdx: index("idx_routines_updated_at").on(t.updatedAt),
  }),
);

export const routineBlocks = sqliteTable(
  "routine_blocks",
  {
    id: text("id").primaryKey(),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    type: text("type").notNull(),
    roundCount: integer("round_count"),
    restSec: integer("rest_sec"),
    tempo: text("tempo"),
    notes: text("notes"),
  },
  (t) => ({
    routineOrderIdx: index("idx_routine_blocks_routine_order").on(t.routineId, t.order),
  }),
);

export const routineItems = sqliteTable(
  "routine_items",
  {
    id: text("id").primaryKey(),
    blockId: text("block_id")
      .notNull()
      .references(() => routineBlocks.id, { onDelete: "cascade" }),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    exerciseId: text("exercise_id").notNull(),
    setCount: integer("set_count").notNull(),
    repMode: text("rep_mode").notNull(),
    rpeMode: text("rpe_mode").notNull(),
    setTypeMode: text("set_type_mode").notNull(),
    uniformReps: integer("uniform_reps"),
    uniformRepsMin: integer("uniform_reps_min"),
    uniformRepsMax: integer("uniform_reps_max"),
    uniformRpe: real("uniform_rpe"),
    uniformSetType: text("uniform_set_type"),
    durationSec: integer("duration_sec"),
    durationMinSec: integer("duration_min_sec"),
    durationMaxSec: integer("duration_max_sec"),
    notes: text("notes"),
  },
  (t) => ({
    blockOrderIdx: index("idx_routine_items_block_order").on(t.blockId, t.order),
    routineIdx: index("idx_routine_items_routine").on(t.routineId),
    exerciseIdx: index("idx_routine_items_exercise").on(t.exerciseId),
  }),
);

export const routineSetTargets = sqliteTable(
  "routine_set_targets",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => routineItems.id, { onDelete: "cascade" }),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    reps: integer("reps"),
    repsMin: integer("reps_min"),
    repsMax: integer("reps_max"),
    rpe: real("rpe"),
    setType: text("set_type").notNull(),
    techniqueNotes: text("technique_notes"),
  },
  (t) => ({
    itemOrderIdx: index("idx_routine_set_targets_item_order").on(t.itemId, t.order),
  }),
);

/**
 * Mirror of the client outbox so the schema is reviewable in one place.
 * Server routes never write to this table in v1.
 */
export const pendingWrites = sqliteTable(
  "pending_writes",
  {
    id: text("id").primaryKey(),
    entity: text("entity").notNull(),
    op: text("op").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
    retries: integer("retries").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => ({
    createdAtIdx: index("idx_pending_writes_created_at").on(t.createdAt),
    entityOpIdx: index("idx_pending_writes_entity_op").on(t.entity, t.op),
  }),
);
