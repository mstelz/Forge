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
    deletedAt: integer("deleted_at"),
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
    deletedAt: integer("deleted_at"),
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
    deletedAt: integer("deleted_at"),
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
    setTypeMode: text("set_type_mode").notNull(),
    uniformReps: integer("uniform_reps"),
    uniformRepsMin: integer("uniform_reps_min"),
    uniformRepsMax: integer("uniform_reps_max"),
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

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull(), // 'in_progress' | 'finished' | 'discarded'
    sourceType: text("source_type").notNull(), // 'routine' | 'program_day' | 'freeform'
    sourceRoutineId: text("source_routine_id"),
    sourceProgramId: text("source_program_id"),
    sourceProgramWeekIndex: integer("source_program_week_index"),
    sourceProgramDayIndex: integer("source_program_day_index"),
    templateSnapshot: text("template_snapshot"), // JSON-encoded routine snapshot at start; null for freeform
    liveStructure: text("live_structure").notNull(), // JSON-encoded mutable structure
    restTimer: text("rest_timer"), // JSON: rest timer state
    title: text("title"),
    notes: text("notes"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    pausedAt: integer("paused_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    archivedAt: integer("archived_at"),
  },
  (t) => ({
    statusIdx: index("idx_sessions_status").on(t.status),
    startedAtIdx: index("idx_sessions_started_at").on(t.startedAt),
    sourceRoutineIdx: index("idx_sessions_source_routine").on(t.sourceRoutineId),
  }),
);

export const sessionSetLogs = sqliteTable(
  "session_set_logs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    performedExerciseId: text("performed_exercise_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    sessionItemId: text("session_item_id").notNull(),
    plannedSetId: text("planned_set_id"),
    order: integer("order").notNull(),
    reps: integer("reps"),
    weightKg: real("weight_kg"),
    rpe: real("rpe"),
    durationSec: integer("duration_sec"),
    distanceM: real("distance_m"),
    notes: text("notes"),
    setType: text("set_type").notNull(), // 'normal' | 'warmup' | 'drop' | 'failure' | 'amrap' | 'rest_pause'
    status: text("status").notNull(), // 'logged' | 'skipped' | 'extra'
    loggedAt: integer("logged_at", { mode: "timestamp_ms" }).notNull(),
    restAfterSec: integer("rest_after_sec"),
    enteredWeight: real("entered_weight"),
    enteredWeightUnit: text("entered_weight_unit"), // 'kg' | 'lb'
    enteredDistance: real("entered_distance"),
    enteredDistanceUnit: text("entered_distance_unit"), // 'm' | 'km' | 'mi'
  },
  (t) => ({
    sessionIdx: index("idx_logs_session").on(t.sessionId),
    exerciseLoggedIdx: index("idx_logs_exercise_logged").on(t.exerciseId, t.loggedAt),
    sessionPerformedIdx: index("idx_logs_session_performed").on(t.sessionId, t.performedExerciseId, t.order),
    plannedSetIdx: index("idx_logs_planned_set").on(t.plannedSetId),
  }),
);

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export const programs = sqliteTable(
  "programs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    durationWeeks: integer("duration_weeks").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => ({
    nameIdx: index("idx_programs_name").on(t.name),
    updatedAtIdx: index("idx_programs_updated_at").on(t.updatedAt),
  }),
);

export const programDays = sqliteTable(
  "program_days",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    weekIndex: integer("week_index").notNull(),
    dayIndex: integer("day_index").notNull(),
    order: integer("order").notNull().default(0),
    label: text("label"),
    routineId: text("routine_id"),
    isRestDay: integer("is_rest_day").notNull().default(0),
    notes: text("notes"),
    overridesJson: text("overrides_json"),
  },
  (t) => ({
    programWeekDayOrderIdx: uniqueIndex("idx_program_days_program_week_day_order").on(
      t.programId,
      t.weekIndex,
      t.dayIndex,
      t.order,
    ),
    routineIdx: index("idx_program_days_routine").on(t.routineId),
  }),
);

export const programRuns = sqliteTable(
  "program_runs",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    currentWeekIndex: integer("current_week_index").notNull().default(0),
    currentDayIndex: integer("current_day_index").notNull().default(0),
    weekZeroStartDate: integer("week_zero_start_date"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    programIdx: index("idx_program_runs_program").on(t.programId),
    statusIdx: index("idx_program_runs_status").on(t.status),
  }),
);

export const programRunDayStates = sqliteTable(
  "program_run_day_states",
  {
    id: text("id").primaryKey(),
    programRunId: text("program_run_id")
      .notNull()
      .references(() => programRuns.id, { onDelete: "cascade" }),
    weekIndex: integer("week_index").notNull(),
    dayIndex: integer("day_index").notNull(),
    status: text("status").notNull(),
    sessionId: text("session_id"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    runWeekDayIdx: uniqueIndex("idx_prds_run_week_day").on(
      t.programRunId,
      t.weekIndex,
      t.dayIndex,
    ),
    sessionIdx: index("idx_prds_session").on(t.sessionId),
  }),
);

// ---------------------------------------------------------------------------
// Profiles + Weight Logs
// ---------------------------------------------------------------------------

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatarDataUrl: text("avatar_data_url"),
  heightCm: real("height_cm"),
  dateOfBirth: text("date_of_birth"),
  sex: text("sex"),
  activityLevel: text("activity_level"),
  goalType: text("goal_type"),
  targetWeightKg: real("target_weight_kg"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const weightLogs = sqliteTable(
  "weight_logs",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    weightKg: real("weight_kg").notNull(),
    date: text("date").notNull(),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    profileDateIdx: index("idx_weight_logs_profile_date").on(t.profileId, t.date),
  }),
);

// ---------------------------------------------------------------------------
// Settings (singleton)
// ---------------------------------------------------------------------------

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  weightUnit: text("weight_unit").notNull().default("kg"),
  distanceUnit: text("distance_unit").notNull().default("km"),
  heightUnit: text("height_unit").notNull().default("cm"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  weekStartsOn: text("week_starts_on").notNull().default("mon"),
  showRpe: integer("show_rpe", { mode: "boolean" }).notNull().default(true),
  showCardio: integer("show_cardio", { mode: "boolean" }).notNull().default(true),
  theme: text("theme").notNull().default("system"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    direction: text("direction").notNull(),
    startValue: real("start_value"),
    targetValue: real("target_value"),
    currentValue: real("current_value"),
    unit: text("unit"),
    linkedExerciseId: text("linked_exercise_id"),
    linkedProgramRunId: text("linked_program_run_id"),
    deadline: integer("deadline"),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    completedAt: integer("completed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => ({
    statusIdx: index("idx_goals_status").on(t.status),
    categoryIdx: index("idx_goals_category").on(t.category),
    deadlineIdx: index("idx_goals_deadline").on(t.deadline),
    updatedAtIdx: index("idx_goals_updated_at").on(t.updatedAt),
    linkedExerciseIdx: index("idx_goals_linked_exercise").on(t.linkedExerciseId),
    linkedProgramRunIdx: index("idx_goals_linked_program_run").on(t.linkedProgramRunId),
  }),
);
