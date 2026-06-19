/**
 * Seed script for README demo — creates a realistic fake user "Alex Rivera"
 * with programs, routines, workout history, goals, and weight logs.
 *
 * Usage: FORGE_DB_PATH=./data/forge.db bun scripts/seed-demo.ts
 * To wipe demo data: FORGE_DB_PATH=./data/forge.db bun scripts/seed-demo.ts --clean
 */

import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";

const DB_PATH = process.env.FORGE_DB_PATH ?? "./data/forge.db";
const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

const CLEAN = process.argv.includes("--clean");

// ─── Exercise IDs (from the default seeded exercises) ────────────────────────
const EX = {
  backSquat: "28751e13-6d8b-4a1a-b461-ccd34df7f80e",
  frontSquat: "3bb200f1-ecce-4339-b428-16a81d83545d",
  deadlift: "7fcf602b-b5f9-4f92-92fb-5278f8e1f2db",
  rdl: "61dbba66-d02f-44fe-a1fd-be1339a4a3cc",
  benchPress: "c00a8748-a7d4-4d7b-a822-0ceb9e1d211e",
  inclineBench: "9526d81f-61db-4e3c-9a8b-27a42c1cc95d",
  ohp: "30da1f3c-cd13-4bff-b940-0e88e360fe4b",
  barbellRow: "ba30e215-5f46-4402-a745-c450c3172a19",
  pullUp: "743cd32f-e548-4c73-94c1-5f0912b76d65",
  chinUp: "bee8405f-9ac9-4791-bd19-769fd0174337",
  dbBench: "aa2a6392-93ee-4920-91c0-e67e0b784616",
  dbRow: "105e176a-d4d4-47fe-b9d5-0f823042811a",
  dbCurl: "4200e0f1-e729-4a1f-8854-17f199c9565a",
  hammerCurl: "88892fd5-b37b-4c5c-8c4d-9c8114db577c",
  lateralRaise: "0c3b963d-3412-4aba-880a-644fe409be5f",
  tricepPushdown: "8d938696-f779-4efb-807c-e80a0905d3b7",
  cableRow: "826c4b27-687c-499a-9928-e8ad86c36c70",
  latPulldown: "86d9d0d9-1f6f-4c3a-b4cb-447101de016e",
  legPress: "fbf8e402-aa8b-4081-9b78-5018d7d8315d",
  legCurl: "8d8f5d9d-4535-4d70-aa1d-e5e5d5c0f45c",
  legExtension: "5ce717b4-6a0c-4d92-8184-08f86c26ad5c",
  calfRaise: "bcb5eb66-f8ef-4212-a38f-da99b6de4d53",
  hipThrust: "70bcd837-f150-45fb-8327-6ce7b53281f5",
  gobletSquat: "7a464def-7de8-4f46-9f4a-18a26ee0e190",
  lunge: "9630e727-62fa-4e8f-b970-7355797f0265",
  bulgarianSplitSquat: "6e210d7b-04f9-4b13-a584-a717796a0e76",
  plank: "61ef9ddc-3efe-4b40-ba7e-5bb1d517beb8",
  outdoorRun: "ef4f3ea8-ad78-43ba-b90c-40b18450a95e",
} as const;

// ─── IDs for demo data (stable so re-running is idempotent) ──────────────────
const DEMO_PROFILE_ID = "demo-profile-alex-rivera";
const DEMO_ROUTINE_PUSH = "demo-routine-push";
const DEMO_ROUTINE_PULL = "demo-routine-pull";
const DEMO_ROUTINE_LEGS = "demo-routine-legs";
const DEMO_PROGRAM = "demo-program-ppl";

// ─── Clean mode ──────────────────────────────────────────────────────────────
if (CLEAN) {
  console.log("Cleaning demo data…");
  db.exec(`DELETE FROM weight_logs WHERE profile_id = '${DEMO_PROFILE_ID}'`);
  db.exec(`DELETE FROM profiles WHERE id = '${DEMO_PROFILE_ID}'`);
  // cascade deletes handle routine_blocks/items/set_targets
  db.exec(`DELETE FROM routines WHERE id IN ('${DEMO_ROUTINE_PUSH}','${DEMO_ROUTINE_PULL}','${DEMO_ROUTINE_LEGS}')`);
  db.exec(`DELETE FROM programs WHERE id = '${DEMO_PROGRAM}'`);
  // goals and sessions tagged with demo prefix
  db.exec(`DELETE FROM goals WHERE id LIKE 'demo-%'`);
  db.exec(`DELETE FROM sessions WHERE id LIKE 'demo-session-%'`);
  console.log("Done.");
  db.close();
  process.exit(0);
}

const now = Date.now();

// Helper
function ts(daysAgo: number, hour = 10, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d.getTime();
}

// ─── 1. Profile ───────────────────────────────────────────────────────────────
db.run(
  `INSERT OR REPLACE INTO profiles
     (id, name, height_cm, date_of_birth, sex, activity_level, goal_type,
      target_weight_kg, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)`,
  [
    DEMO_PROFILE_ID,
    "Alex Rivera",
    178,
    "1996-08-14",
    "male",
    "moderately_active",
    "lose_weight",
    78,
    ts(60),
    now,
  ],
);
console.log("✓ Profile: Alex Rivera");

// ─── 2. Weight logs (10 weeks, gradual cut from 84 → 81 kg) ──────────────────
const weightEntries: [string, string, number, string, number][] = [];
for (let i = 70; i >= 0; i -= 7) {
  const kg = 84 - ((70 - i) / 70) * 3; // 84 kg (10 weeks ago) → 81 kg (today)
  const date = new Date();
  date.setDate(date.getDate() - i);
  weightEntries.push([
    `demo-weight-${i}`,
    DEMO_PROFILE_ID,
    parseFloat(kg.toFixed(1)),
    date.toISOString().slice(0, 10),
    ts(i),
  ]);
}
for (const [id, profileId, weightKg, date, createdAt] of weightEntries) {
  db.run(
    `INSERT OR REPLACE INTO weight_logs (id, profile_id, weight_kg, date, created_at)
     VALUES (?,?,?,?,?)`,
    [id, profileId, weightKg, date, createdAt],
  );
}
console.log(`✓ Weight logs: ${weightEntries.length} entries`);

// ─── 3. Routines ──────────────────────────────────────────────────────────────
type RoutineBlock = {
  blockId: string;
  type: "straight" | "superset";
  roundCount: number;
  restSec: number;
  items: {
    itemId: string;
    exerciseId: string;
    setCount: number;
    repsMin: number;
    repsMax: number;
  }[];
};

function insertRoutine(
  id: string,
  name: string,
  blocks: RoutineBlock[],
) {
  db.run(
    `INSERT OR REPLACE INTO routines (id, name, estimated_duration_min, created_at, updated_at)
     VALUES (?,?,?,?,?)`,
    [id, name, 55, ts(60), now],
  );
  let blockOrder = 0;
  for (const block of blocks) {
    db.run(
      `INSERT OR REPLACE INTO routine_blocks (id, routine_id, "order", type, round_count, rest_sec)
       VALUES (?,?,?,?,?,?)`,
      [block.blockId, id, blockOrder++, block.type, block.roundCount, block.restSec],
    );
    let itemOrder = 0;
    for (const item of block.items) {
      db.run(
        `INSERT OR REPLACE INTO routine_items
           (id, block_id, routine_id, "order", exercise_id, set_count, rep_mode, rpe_mode, set_type_mode,
            uniform_reps_min, uniform_reps_max, uniform_set_type)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          item.itemId,
          block.blockId,
          id,
          itemOrder++,
          item.exerciseId,
          item.setCount,
          "range",
          "none",
          "uniform",
          item.repsMin,
          item.repsMax,
          "normal",
        ],
      );
      for (let s = 0; s < item.setCount; s++) {
        db.run(
          `INSERT OR REPLACE INTO routine_set_targets
             (id, item_id, routine_id, "order", reps_min, reps_max, set_type)
           VALUES (?,?,?,?,?,?,?)`,
          [
            `${item.itemId}-set-${s}`,
            item.itemId,
            id,
            s,
            item.repsMin,
            item.repsMax,
            "normal",
          ],
        );
      }
    }
  }
}

// Push Day
insertRoutine(DEMO_ROUTINE_PUSH, "Push Day", [
  {
    blockId: "demo-push-b1",
    type: "straight",
    roundCount: 4,
    restSec: 180,
    items: [{ itemId: "demo-push-b1-i1", exerciseId: EX.benchPress, setCount: 4, repsMin: 4, repsMax: 6 }],
  },
  {
    blockId: "demo-push-b2",
    type: "straight",
    roundCount: 3,
    restSec: 120,
    items: [{ itemId: "demo-push-b2-i1", exerciseId: EX.ohp, setCount: 3, repsMin: 6, repsMax: 8 }],
  },
  {
    blockId: "demo-push-b3",
    type: "superset",
    roundCount: 3,
    restSec: 60,
    items: [
      { itemId: "demo-push-b3-i1", exerciseId: EX.inclineBench, setCount: 3, repsMin: 8, repsMax: 12 },
      { itemId: "demo-push-b3-i2", exerciseId: EX.lateralRaise, setCount: 3, repsMin: 12, repsMax: 15 },
    ],
  },
  {
    blockId: "demo-push-b4",
    type: "straight",
    roundCount: 3,
    restSec: 60,
    items: [{ itemId: "demo-push-b4-i1", exerciseId: EX.tricepPushdown, setCount: 3, repsMin: 10, repsMax: 15 }],
  },
]);

// Pull Day
insertRoutine(DEMO_ROUTINE_PULL, "Pull Day", [
  {
    blockId: "demo-pull-b1",
    type: "straight",
    roundCount: 4,
    restSec: 180,
    items: [{ itemId: "demo-pull-b1-i1", exerciseId: EX.barbellRow, setCount: 4, repsMin: 4, repsMax: 6 }],
  },
  {
    blockId: "demo-pull-b2",
    type: "straight",
    roundCount: 3,
    restSec: 120,
    items: [{ itemId: "demo-pull-b2-i1", exerciseId: EX.pullUp, setCount: 3, repsMin: 5, repsMax: 8 }],
  },
  {
    blockId: "demo-pull-b3",
    type: "superset",
    roundCount: 3,
    restSec: 60,
    items: [
      { itemId: "demo-pull-b3-i1", exerciseId: EX.latPulldown, setCount: 3, repsMin: 8, repsMax: 12 },
      { itemId: "demo-pull-b3-i2", exerciseId: EX.dbCurl, setCount: 3, repsMin: 10, repsMax: 12 },
    ],
  },
  {
    blockId: "demo-pull-b4",
    type: "straight",
    roundCount: 3,
    restSec: 60,
    items: [{ itemId: "demo-pull-b4-i1", exerciseId: EX.cableRow, setCount: 3, repsMin: 10, repsMax: 12 }],
  },
]);

// Leg Day
insertRoutine(DEMO_ROUTINE_LEGS, "Leg Day", [
  {
    blockId: "demo-legs-b1",
    type: "straight",
    roundCount: 4,
    restSec: 210,
    items: [{ itemId: "demo-legs-b1-i1", exerciseId: EX.backSquat, setCount: 4, repsMin: 4, repsMax: 6 }],
  },
  {
    blockId: "demo-legs-b2",
    type: "straight",
    roundCount: 3,
    restSec: 150,
    items: [{ itemId: "demo-legs-b2-i1", exerciseId: EX.rdl, setCount: 3, repsMin: 6, repsMax: 8 }],
  },
  {
    blockId: "demo-legs-b3",
    type: "superset",
    roundCount: 3,
    restSec: 90,
    items: [
      { itemId: "demo-legs-b3-i1", exerciseId: EX.legPress, setCount: 3, repsMin: 10, repsMax: 12 },
      { itemId: "demo-legs-b3-i2", exerciseId: EX.legCurl, setCount: 3, repsMin: 10, repsMax: 12 },
    ],
  },
  {
    blockId: "demo-legs-b4",
    type: "straight",
    roundCount: 3,
    restSec: 60,
    items: [{ itemId: "demo-legs-b4-i1", exerciseId: EX.calfRaise, setCount: 3, repsMin: 15, repsMax: 20 }],
  },
]);

console.log("✓ Routines: Push Day, Pull Day, Leg Day");

// ─── 4. Program ───────────────────────────────────────────────────────────────
db.run(
  `INSERT OR REPLACE INTO programs (id, name, description, duration_weeks, created_at, updated_at)
   VALUES (?,?,?,?,?,?)`,
  [
    DEMO_PROGRAM,
    "PPL Strength Block",
    "6-week push/pull/legs program focused on building strength in the main lifts.",
    6,
    ts(60),
    now,
  ],
);

// PPL pattern per week: Push(0), Pull(1), Legs(2), rest(3), Push(4), Pull(5), Legs(6)
const pplDayMap: { dayIndex: number; routineId: string | null; isRest: boolean; label: string }[] = [
  { dayIndex: 0, routineId: DEMO_ROUTINE_PUSH, isRest: false, label: "Push" },
  { dayIndex: 1, routineId: DEMO_ROUTINE_PULL, isRest: false, label: "Pull" },
  { dayIndex: 2, routineId: DEMO_ROUTINE_LEGS, isRest: false, label: "Legs" },
  { dayIndex: 3, routineId: null, isRest: true, label: "Rest" },
  { dayIndex: 4, routineId: DEMO_ROUTINE_PUSH, isRest: false, label: "Push" },
  { dayIndex: 5, routineId: DEMO_ROUTINE_PULL, isRest: false, label: "Pull" },
  { dayIndex: 6, routineId: DEMO_ROUTINE_LEGS, isRest: false, label: "Legs" },
];

for (let week = 0; week < 6; week++) {
  for (const day of pplDayMap) {
    db.run(
      `INSERT OR REPLACE INTO program_days
         (id, program_id, week_index, day_index, "order", label, routine_id, is_rest_day)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        `demo-pd-w${week}-d${day.dayIndex}`,
        DEMO_PROGRAM,
        week,
        day.dayIndex,
        0,
        day.label,
        day.routineId,
        day.isRest ? 1 : 0,
      ],
    );
  }
}

// Active program run (started 5 weeks ago, currently in week 4)
const DEMO_RUN = "demo-program-run-1";
db.run(
  `INSERT OR REPLACE INTO program_runs
     (id, program_id, status, started_at, current_week_index, current_day_index, week_zero_start_date, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?,?)`,
  [DEMO_RUN, DEMO_PROGRAM, "active", ts(35), 4, 1, ts(35), ts(35), now],
);
console.log("✓ Program: PPL Strength Block (active, week 5)");

// ─── 5. Sessions + Set Logs ───────────────────────────────────────────────────
type SetLog = {
  exerciseId: string;
  weightKg: number;
  reps: number;
  rpe?: number;
  setType?: string;
};

function buildLiveStructure(
  blockId: string,
  sessionItemId: string,
  exerciseId: string,
  setCount: number,
  repsMin: number,
  repsMax: number,
) {
  const setTargets = Array.from({ length: setCount }, (_, i) => ({
    id: randomUUID(),
    order: i,
    repsMin,
    repsMax,
    setType: "normal",
  }));
  return {
    blocks: [
      {
        id: blockId,
        type: "straight",
        roundCount: setCount,
        restSec: 120,
        items: [
          {
            performedExerciseId: randomUUID(),
            sessionItemId,
            exerciseId,
            setCount,
            setTargets,
          },
        ],
      },
    ],
  };
}

function insertSession(
  sessionId: string,
  daysAgo: number,
  routineId: string,
  durationMin: number,
  sets: SetLog[],
  title: string,
) {
  const startedAt = ts(daysAgo, 7, 30);
  const endedAt = startedAt + durationMin * 60 * 1000;

  const firstSet = sets[0];
  if (!firstSet) throw new Error(`insertSession: ${sessionId} has no sets`);

  const sessionItemId = randomUUID();
  const blockId = randomUUID();
  const liveStructure = buildLiveStructure(
    blockId,
    sessionItemId,
    firstSet.exerciseId,
    sets.filter((s) => s.exerciseId === firstSet.exerciseId).length,
    4,
    8,
  );

  db.run(
    `INSERT OR REPLACE INTO sessions
       (id, status, source_type, source_routine_id, title, live_structure,
        started_at, ended_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      sessionId,
      "finished",
      "routine",
      routineId,
      title,
      JSON.stringify(liveStructure),
      startedAt,
      endedAt,
      startedAt,
      endedAt,
    ],
  );

  sets.forEach((set, i) => {
    db.run(
      `INSERT OR REPLACE INTO session_set_logs
         (id, session_id, performed_exercise_id, exercise_id, session_item_id,
          "order", reps, weight_kg, rpe, set_type, status, logged_at,
          entered_weight, entered_weight_unit)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        `${sessionId}-set-${i}`,
        sessionId,
        randomUUID(),
        set.exerciseId,
        sessionItemId,
        i,
        set.reps,
        set.weightKg,
        set.rpe ?? null,
        set.setType ?? "normal",
        "logged",
        startedAt + i * 180000,
        set.weightKg * 2.20462,
        "lb",
      ],
    );
  });
}

// ─── Build realistic progressive sessions over 5 weeks (35 days)
// Push sessions — bench progresses from 77.5 → 90 kg over 10 sessions
const pushSessions: [number, SetLog[]][] = [
  [35, [
    { exerciseId: EX.benchPress, weightKg: 77.5, reps: 5, rpe: 7 },
    { exerciseId: EX.benchPress, weightKg: 77.5, reps: 5, rpe: 7.5 },
    { exerciseId: EX.benchPress, weightKg: 77.5, reps: 4, rpe: 8 },
    { exerciseId: EX.benchPress, weightKg: 77.5, reps: 4, rpe: 8.5 },
    { exerciseId: EX.ohp, weightKg: 52.5, reps: 7, rpe: 7 },
    { exerciseId: EX.ohp, weightKg: 52.5, reps: 6, rpe: 7.5 },
    { exerciseId: EX.ohp, weightKg: 52.5, reps: 6, rpe: 8 },
    { exerciseId: EX.inclineBench, weightKg: 60, reps: 10, rpe: 7 },
    { exerciseId: EX.inclineBench, weightKg: 60, reps: 9, rpe: 7.5 },
    { exerciseId: EX.inclineBench, weightKg: 60, reps: 9, rpe: 8 },
    { exerciseId: EX.lateralRaise, weightKg: 12, reps: 15 },
    { exerciseId: EX.lateralRaise, weightKg: 12, reps: 14 },
    { exerciseId: EX.lateralRaise, weightKg: 12, reps: 13 },
  ]],
  [28, [
    { exerciseId: EX.benchPress, weightKg: 80, reps: 5, rpe: 7.5 },
    { exerciseId: EX.benchPress, weightKg: 80, reps: 5, rpe: 8 },
    { exerciseId: EX.benchPress, weightKg: 80, reps: 4, rpe: 8.5 },
    { exerciseId: EX.benchPress, weightKg: 80, reps: 4, rpe: 9 },
    { exerciseId: EX.ohp, weightKg: 55, reps: 7, rpe: 7.5 },
    { exerciseId: EX.ohp, weightKg: 55, reps: 6, rpe: 8 },
    { exerciseId: EX.ohp, weightKg: 55, reps: 6, rpe: 8 },
    { exerciseId: EX.inclineBench, weightKg: 62.5, reps: 10, rpe: 7.5 },
    { exerciseId: EX.inclineBench, weightKg: 62.5, reps: 10, rpe: 8 },
    { exerciseId: EX.inclineBench, weightKg: 62.5, reps: 8, rpe: 8.5 },
    { exerciseId: EX.lateralRaise, weightKg: 12, reps: 15 },
    { exerciseId: EX.lateralRaise, weightKg: 12, reps: 15 },
    { exerciseId: EX.lateralRaise, weightKg: 12, reps: 14 },
  ]],
  [21, [
    { exerciseId: EX.benchPress, weightKg: 82.5, reps: 5, rpe: 7.5 },
    { exerciseId: EX.benchPress, weightKg: 82.5, reps: 5, rpe: 8 },
    { exerciseId: EX.benchPress, weightKg: 82.5, reps: 5, rpe: 8 },
    { exerciseId: EX.benchPress, weightKg: 82.5, reps: 4, rpe: 8.5 },
    { exerciseId: EX.ohp, weightKg: 55, reps: 8, rpe: 7.5 },
    { exerciseId: EX.ohp, weightKg: 55, reps: 7, rpe: 8 },
    { exerciseId: EX.ohp, weightKg: 55, reps: 7, rpe: 8 },
    { exerciseId: EX.inclineBench, weightKg: 62.5, reps: 11, rpe: 7.5 },
    { exerciseId: EX.inclineBench, weightKg: 62.5, reps: 10, rpe: 7.5 },
    { exerciseId: EX.inclineBench, weightKg: 62.5, reps: 10, rpe: 8 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 14 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 13 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 13 },
  ]],
  [14, [
    { exerciseId: EX.benchPress, weightKg: 85, reps: 5, rpe: 8 },
    { exerciseId: EX.benchPress, weightKg: 85, reps: 5, rpe: 8 },
    { exerciseId: EX.benchPress, weightKg: 85, reps: 4, rpe: 8.5 },
    { exerciseId: EX.benchPress, weightKg: 85, reps: 4, rpe: 9 },
    { exerciseId: EX.ohp, weightKg: 57.5, reps: 7, rpe: 8 },
    { exerciseId: EX.ohp, weightKg: 57.5, reps: 6, rpe: 8.5 },
    { exerciseId: EX.ohp, weightKg: 57.5, reps: 6, rpe: 8.5 },
    { exerciseId: EX.inclineBench, weightKg: 65, reps: 10, rpe: 8 },
    { exerciseId: EX.inclineBench, weightKg: 65, reps: 9, rpe: 8 },
    { exerciseId: EX.inclineBench, weightKg: 65, reps: 9, rpe: 8.5 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 15 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 15 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 14 },
  ]],
  [7, [
    { exerciseId: EX.benchPress, weightKg: 87.5, reps: 5, rpe: 8 },
    { exerciseId: EX.benchPress, weightKg: 87.5, reps: 5, rpe: 8.5 },
    { exerciseId: EX.benchPress, weightKg: 87.5, reps: 4, rpe: 9 },
    { exerciseId: EX.benchPress, weightKg: 87.5, reps: 4, rpe: 9 },
    { exerciseId: EX.ohp, weightKg: 57.5, reps: 8, rpe: 8 },
    { exerciseId: EX.ohp, weightKg: 57.5, reps: 7, rpe: 8 },
    { exerciseId: EX.ohp, weightKg: 57.5, reps: 7, rpe: 8.5 },
    { exerciseId: EX.inclineBench, weightKg: 65, reps: 11, rpe: 7.5 },
    { exerciseId: EX.inclineBench, weightKg: 65, reps: 10, rpe: 8 },
    { exerciseId: EX.inclineBench, weightKg: 65, reps: 10, rpe: 8 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 15 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 15 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 15 },
  ]],
  [1, [
    { exerciseId: EX.benchPress, weightKg: 90, reps: 5, rpe: 8 },
    { exerciseId: EX.benchPress, weightKg: 90, reps: 5, rpe: 8.5 },
    { exerciseId: EX.benchPress, weightKg: 90, reps: 4, rpe: 9 },
    { exerciseId: EX.benchPress, weightKg: 90, reps: 4, rpe: 9.5 },
    { exerciseId: EX.ohp, weightKg: 60, reps: 7, rpe: 8.5 },
    { exerciseId: EX.ohp, weightKg: 60, reps: 6, rpe: 9 },
    { exerciseId: EX.ohp, weightKg: 60, reps: 5, rpe: 9 },
    { exerciseId: EX.inclineBench, weightKg: 67.5, reps: 10, rpe: 8 },
    { exerciseId: EX.inclineBench, weightKg: 67.5, reps: 9, rpe: 8.5 },
    { exerciseId: EX.inclineBench, weightKg: 67.5, reps: 9, rpe: 8.5 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 15 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 15 },
    { exerciseId: EX.lateralRaise, weightKg: 14, reps: 15 },
  ]],
];

// Pull sessions
const pullSessions: [number, SetLog[]][] = [
  [34, [
    { exerciseId: EX.barbellRow, weightKg: 70, reps: 5, rpe: 7.5 },
    { exerciseId: EX.barbellRow, weightKg: 70, reps: 5, rpe: 8 },
    { exerciseId: EX.barbellRow, weightKg: 70, reps: 4, rpe: 8 },
    { exerciseId: EX.barbellRow, weightKg: 70, reps: 4, rpe: 8.5 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 6, rpe: 8 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 5, rpe: 8.5 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 5, rpe: 8.5 },
    { exerciseId: EX.latPulldown, weightKg: 55, reps: 10, rpe: 7 },
    { exerciseId: EX.latPulldown, weightKg: 55, reps: 10, rpe: 7.5 },
    { exerciseId: EX.latPulldown, weightKg: 55, reps: 9, rpe: 8 },
    { exerciseId: EX.dbCurl, weightKg: 14, reps: 12 },
    { exerciseId: EX.dbCurl, weightKg: 14, reps: 11 },
    { exerciseId: EX.dbCurl, weightKg: 14, reps: 10 },
  ]],
  [27, [
    { exerciseId: EX.barbellRow, weightKg: 72.5, reps: 5, rpe: 7.5 },
    { exerciseId: EX.barbellRow, weightKg: 72.5, reps: 5, rpe: 8 },
    { exerciseId: EX.barbellRow, weightKg: 72.5, reps: 5, rpe: 8 },
    { exerciseId: EX.barbellRow, weightKg: 72.5, reps: 4, rpe: 8.5 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 7, rpe: 8 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 6, rpe: 8.5 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 5, rpe: 8.5 },
    { exerciseId: EX.latPulldown, weightKg: 57.5, reps: 10, rpe: 7.5 },
    { exerciseId: EX.latPulldown, weightKg: 57.5, reps: 10, rpe: 8 },
    { exerciseId: EX.latPulldown, weightKg: 57.5, reps: 9, rpe: 8 },
    { exerciseId: EX.dbCurl, weightKg: 14, reps: 12 },
    { exerciseId: EX.dbCurl, weightKg: 14, reps: 12 },
    { exerciseId: EX.dbCurl, weightKg: 14, reps: 11 },
  ]],
  [20, [
    { exerciseId: EX.barbellRow, weightKg: 75, reps: 5, rpe: 8 },
    { exerciseId: EX.barbellRow, weightKg: 75, reps: 5, rpe: 8 },
    { exerciseId: EX.barbellRow, weightKg: 75, reps: 5, rpe: 8 },
    { exerciseId: EX.barbellRow, weightKg: 75, reps: 4, rpe: 9 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 7, rpe: 8 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 7, rpe: 8.5 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 6, rpe: 8.5 },
    { exerciseId: EX.latPulldown, weightKg: 60, reps: 10, rpe: 7.5 },
    { exerciseId: EX.latPulldown, weightKg: 60, reps: 10, rpe: 8 },
    { exerciseId: EX.latPulldown, weightKg: 60, reps: 9, rpe: 8.5 },
    { exerciseId: EX.dbCurl, weightKg: 16, reps: 11 },
    { exerciseId: EX.dbCurl, weightKg: 16, reps: 10 },
    { exerciseId: EX.dbCurl, weightKg: 16, reps: 10 },
  ]],
  [13, [
    { exerciseId: EX.barbellRow, weightKg: 77.5, reps: 5, rpe: 8 },
    { exerciseId: EX.barbellRow, weightKg: 77.5, reps: 5, rpe: 8.5 },
    { exerciseId: EX.barbellRow, weightKg: 77.5, reps: 4, rpe: 8.5 },
    { exerciseId: EX.barbellRow, weightKg: 77.5, reps: 4, rpe: 9 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 8, rpe: 8 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 7, rpe: 8.5 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 6, rpe: 9 },
    { exerciseId: EX.latPulldown, weightKg: 62.5, reps: 10, rpe: 8 },
    { exerciseId: EX.latPulldown, weightKg: 62.5, reps: 9, rpe: 8 },
    { exerciseId: EX.latPulldown, weightKg: 62.5, reps: 9, rpe: 8.5 },
    { exerciseId: EX.dbCurl, weightKg: 16, reps: 12 },
    { exerciseId: EX.dbCurl, weightKg: 16, reps: 11 },
    { exerciseId: EX.dbCurl, weightKg: 16, reps: 11 },
  ]],
  [6, [
    { exerciseId: EX.barbellRow, weightKg: 80, reps: 5, rpe: 8 },
    { exerciseId: EX.barbellRow, weightKg: 80, reps: 5, rpe: 8.5 },
    { exerciseId: EX.barbellRow, weightKg: 80, reps: 5, rpe: 8.5 },
    { exerciseId: EX.barbellRow, weightKg: 80, reps: 4, rpe: 9 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 8, rpe: 8 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 8, rpe: 8.5 },
    { exerciseId: EX.pullUp, weightKg: 0, reps: 7, rpe: 9 },
    { exerciseId: EX.latPulldown, weightKg: 65, reps: 10, rpe: 8 },
    { exerciseId: EX.latPulldown, weightKg: 65, reps: 10, rpe: 8.5 },
    { exerciseId: EX.latPulldown, weightKg: 65, reps: 9, rpe: 8.5 },
    { exerciseId: EX.dbCurl, weightKg: 16, reps: 12 },
    { exerciseId: EX.dbCurl, weightKg: 16, reps: 12 },
    { exerciseId: EX.dbCurl, weightKg: 16, reps: 12 },
  ]],
];

// Leg sessions
const legSessions: [number, SetLog[]][] = [
  [33, [
    { exerciseId: EX.backSquat, weightKg: 90, reps: 5, rpe: 7.5 },
    { exerciseId: EX.backSquat, weightKg: 90, reps: 5, rpe: 8 },
    { exerciseId: EX.backSquat, weightKg: 90, reps: 4, rpe: 8 },
    { exerciseId: EX.backSquat, weightKg: 90, reps: 4, rpe: 8.5 },
    { exerciseId: EX.rdl, weightKg: 80, reps: 8, rpe: 7.5 },
    { exerciseId: EX.rdl, weightKg: 80, reps: 7, rpe: 8 },
    { exerciseId: EX.rdl, weightKg: 80, reps: 7, rpe: 8 },
    { exerciseId: EX.legPress, weightKg: 120, reps: 12 },
    { exerciseId: EX.legPress, weightKg: 120, reps: 11 },
    { exerciseId: EX.legPress, weightKg: 120, reps: 11 },
    { exerciseId: EX.legCurl, weightKg: 40, reps: 12 },
    { exerciseId: EX.legCurl, weightKg: 40, reps: 11 },
    { exerciseId: EX.legCurl, weightKg: 40, reps: 10 },
    { exerciseId: EX.calfRaise, weightKg: 60, reps: 18 },
    { exerciseId: EX.calfRaise, weightKg: 60, reps: 17 },
    { exerciseId: EX.calfRaise, weightKg: 60, reps: 16 },
  ]],
  [26, [
    { exerciseId: EX.backSquat, weightKg: 95, reps: 5, rpe: 8 },
    { exerciseId: EX.backSquat, weightKg: 95, reps: 5, rpe: 8 },
    { exerciseId: EX.backSquat, weightKg: 95, reps: 4, rpe: 8.5 },
    { exerciseId: EX.backSquat, weightKg: 95, reps: 4, rpe: 9 },
    { exerciseId: EX.rdl, weightKg: 82.5, reps: 8, rpe: 8 },
    { exerciseId: EX.rdl, weightKg: 82.5, reps: 7, rpe: 8 },
    { exerciseId: EX.rdl, weightKg: 82.5, reps: 7, rpe: 8.5 },
    { exerciseId: EX.legPress, weightKg: 125, reps: 12 },
    { exerciseId: EX.legPress, weightKg: 125, reps: 12 },
    { exerciseId: EX.legPress, weightKg: 125, reps: 11 },
    { exerciseId: EX.legCurl, weightKg: 42.5, reps: 12 },
    { exerciseId: EX.legCurl, weightKg: 42.5, reps: 11 },
    { exerciseId: EX.legCurl, weightKg: 42.5, reps: 11 },
    { exerciseId: EX.calfRaise, weightKg: 65, reps: 18 },
    { exerciseId: EX.calfRaise, weightKg: 65, reps: 17 },
    { exerciseId: EX.calfRaise, weightKg: 65, reps: 16 },
  ]],
  [19, [
    { exerciseId: EX.backSquat, weightKg: 97.5, reps: 5, rpe: 8 },
    { exerciseId: EX.backSquat, weightKg: 97.5, reps: 5, rpe: 8 },
    { exerciseId: EX.backSquat, weightKg: 97.5, reps: 5, rpe: 8.5 },
    { exerciseId: EX.backSquat, weightKg: 97.5, reps: 4, rpe: 9 },
    { exerciseId: EX.rdl, weightKg: 85, reps: 8, rpe: 8 },
    { exerciseId: EX.rdl, weightKg: 85, reps: 8, rpe: 8 },
    { exerciseId: EX.rdl, weightKg: 85, reps: 7, rpe: 8.5 },
    { exerciseId: EX.legPress, weightKg: 130, reps: 12 },
    { exerciseId: EX.legPress, weightKg: 130, reps: 11 },
    { exerciseId: EX.legPress, weightKg: 130, reps: 11 },
    { exerciseId: EX.legCurl, weightKg: 42.5, reps: 12 },
    { exerciseId: EX.legCurl, weightKg: 42.5, reps: 12 },
    { exerciseId: EX.legCurl, weightKg: 42.5, reps: 11 },
    { exerciseId: EX.calfRaise, weightKg: 65, reps: 19 },
    { exerciseId: EX.calfRaise, weightKg: 65, reps: 18 },
    { exerciseId: EX.calfRaise, weightKg: 65, reps: 17 },
  ]],
  [12, [
    { exerciseId: EX.backSquat, weightKg: 100, reps: 5, rpe: 8.5 },
    { exerciseId: EX.backSquat, weightKg: 100, reps: 5, rpe: 8.5 },
    { exerciseId: EX.backSquat, weightKg: 100, reps: 4, rpe: 9 },
    { exerciseId: EX.backSquat, weightKg: 100, reps: 4, rpe: 9 },
    { exerciseId: EX.rdl, weightKg: 87.5, reps: 7, rpe: 8 },
    { exerciseId: EX.rdl, weightKg: 87.5, reps: 7, rpe: 8.5 },
    { exerciseId: EX.rdl, weightKg: 87.5, reps: 6, rpe: 9 },
    { exerciseId: EX.legPress, weightKg: 135, reps: 12 },
    { exerciseId: EX.legPress, weightKg: 135, reps: 11 },
    { exerciseId: EX.legPress, weightKg: 135, reps: 10 },
    { exerciseId: EX.legCurl, weightKg: 45, reps: 12 },
    { exerciseId: EX.legCurl, weightKg: 45, reps: 11 },
    { exerciseId: EX.legCurl, weightKg: 45, reps: 11 },
    { exerciseId: EX.calfRaise, weightKg: 70, reps: 18 },
    { exerciseId: EX.calfRaise, weightKg: 70, reps: 17 },
    { exerciseId: EX.calfRaise, weightKg: 70, reps: 16 },
  ]],
  [5, [
    { exerciseId: EX.backSquat, weightKg: 102.5, reps: 5, rpe: 8.5 },
    { exerciseId: EX.backSquat, weightKg: 102.5, reps: 5, rpe: 9 },
    { exerciseId: EX.backSquat, weightKg: 102.5, reps: 4, rpe: 9 },
    { exerciseId: EX.backSquat, weightKg: 102.5, reps: 4, rpe: 9.5 },
    { exerciseId: EX.rdl, weightKg: 90, reps: 8, rpe: 8 },
    { exerciseId: EX.rdl, weightKg: 90, reps: 7, rpe: 8.5 },
    { exerciseId: EX.rdl, weightKg: 90, reps: 7, rpe: 8.5 },
    { exerciseId: EX.legPress, weightKg: 140, reps: 12 },
    { exerciseId: EX.legPress, weightKg: 140, reps: 12 },
    { exerciseId: EX.legPress, weightKg: 140, reps: 11 },
    { exerciseId: EX.legCurl, weightKg: 45, reps: 12 },
    { exerciseId: EX.legCurl, weightKg: 45, reps: 12 },
    { exerciseId: EX.legCurl, weightKg: 45, reps: 12 },
    { exerciseId: EX.calfRaise, weightKg: 70, reps: 20 },
    { exerciseId: EX.calfRaise, weightKg: 70, reps: 19 },
    { exerciseId: EX.calfRaise, weightKg: 70, reps: 18 },
  ]],
];

pushSessions.forEach(([daysAgo, sets], i) => {
  insertSession(`demo-session-push-${i}`, daysAgo, DEMO_ROUTINE_PUSH, 60, sets, "Push Day");
});
pullSessions.forEach(([daysAgo, sets], i) => {
  insertSession(`demo-session-pull-${i}`, daysAgo, DEMO_ROUTINE_PULL, 55, sets, "Pull Day");
});
legSessions.forEach(([daysAgo, sets], i) => {
  insertSession(`demo-session-legs-${i}`, daysAgo, DEMO_ROUTINE_LEGS, 65, sets, "Leg Day");
});

console.log(`✓ Sessions: ${pushSessions.length} push, ${pullSessions.length} pull, ${legSessions.length} leg`);

// ─── 6. Goals ─────────────────────────────────────────────────────────────────
const goalsData = [
  {
    id: "demo-goal-bench",
    category: "strength",
    title: "Bench Press 100 kg",
    direction: "increase",
    startValue: 77.5,
    targetValue: 100,
    currentValue: 90,
    unit: "kg",
    linkedExerciseId: EX.benchPress,
    deadline: ts(-30), // 30 days from now
    status: "active",
  },
  {
    id: "demo-goal-squat",
    category: "strength",
    title: "Back Squat 120 kg",
    direction: "increase",
    startValue: 90,
    targetValue: 120,
    currentValue: 102.5,
    unit: "kg",
    linkedExerciseId: EX.backSquat,
    deadline: ts(-45),
    status: "active",
  },
  {
    id: "demo-goal-weight",
    category: "body_weight",
    title: "Cut to 78 kg",
    direction: "decrease",
    startValue: 84,
    targetValue: 78,
    currentValue: 81.2,
    unit: "kg",
    linkedExerciseId: null,
    deadline: ts(-60),
    status: "active",
  },
  {
    id: "demo-goal-pullups",
    category: "strength",
    title: "10 Consecutive Pull-ups",
    direction: "increase",
    startValue: 5,
    targetValue: 10,
    currentValue: 8,
    unit: "reps",
    linkedExerciseId: EX.pullUp,
    deadline: ts(-20),
    status: "active",
  },
];

for (const goal of goalsData) {
  db.run(
    `INSERT OR REPLACE INTO goals
       (id, category, title, direction, start_value, target_value, current_value,
        unit, linked_exercise_id, deadline, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      goal.id,
      goal.category,
      goal.title,
      goal.direction,
      goal.startValue,
      goal.targetValue,
      goal.currentValue,
      goal.unit,
      goal.linkedExerciseId,
      goal.deadline,
      goal.status,
      ts(60),
      now,
    ],
  );
}
console.log(`✓ Goals: ${goalsData.length} active goals`);

// ─── 7. Settings ──────────────────────────────────────────────────────────────
const existingSettings = db.query("SELECT id FROM settings LIMIT 1").get() as { id: string } | null;
if (!existingSettings) {
  db.run(
    `INSERT INTO settings (id, weight_unit, distance_unit, height_unit, timezone, week_starts_on, show_rpe, show_cardio, theme, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ["settings-singleton", "lb", "mi", "in", "America/Chicago", "mon", 1, 1, "dark", now, now],
  );
  console.log("✓ Settings: lb/mi, dark theme");
} else {
  console.log("✓ Settings: already exist, skipping");
}

db.close();
console.log("\n🎉 Demo data seeded! Profile: Alex Rivera");
