/**
 * Repro harness for: "homescreen calendar does not display the right next-day
 * workout / does not shift when the program falls behind".
 *
 * Loads the REAL programs + runs from data/forge.db, pins "today", runs the
 * actual computeCascadeSchedule() used by the homepage, and prints the Mon–Sun
 * calendar row exactly as the homepage would derive it.
 *
 * Usage:  bun scripts/debug/calendar-repro.ts [YYYY-MM-DD] [runIdPrefix]
 */

import { Database } from "bun:sqlite";
import {
  computeCascadeSchedule,
  computeNextPlayableDay,
} from "../../src/client/lib/programs/next-day";
import type { Program, ProgramRun } from "../../src/shared";

const DB_PATH = "data/forge.db";
const db = new Database(DB_PATH, { readonly: true });

const pinned = process.argv[2];
const today = pinned
  ? new Date(
      Number(pinned.slice(0, 4)),
      Number(pinned.slice(5, 7)) - 1,
      Number(pinned.slice(8, 10)),
    )
  : new Date();
today.setHours(0, 0, 0, 0);
const todayStartMs = today.getTime();

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(ms: number): string {
  const d = new Date(ms);
  return `${DOW[d.getDay()]} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// --- load real data ---------------------------------------------------------

const allRunRows = db
  .query<any, []>(`select * from program_runs where status = 'active' order by started_at`)
  .all();
if (allRunRows.length === 0) throw new Error("no active run");
const filter = process.argv[3];
const runRows = filter ? allRunRows.filter((r: any) => r.id.startsWith(filter)) : allRunRows;

const dsCols = db
  .query<any, []>(`pragma table_info(program_run_day_states)`)
  .all()
  .map((c: any) => c.name);

const routineNames = new Map<string, string>();
for (const r of db.query<any, []>(`select id, name from routines`).all()) {
  routineNames.set(r.id, r.name);
}

console.log(`TODAY  ${fmt(todayStartMs)}`);
console.log(`program_run_day_states columns: ${dsCols.join(", ")}`);

for (const runRow of runRows) {
  const programRow = db
    .query<any, [string]>(`select * from programs where id = ?`)
    .get(runRow.program_id);
  const dayRows = db
    .query<any, [string]>(
      `select * from program_days where program_id = ? order by week_index, day_index, "order"`,
    )
    .all(runRow.program_id);
  const dsRows = db
    .query<any, [string]>(
      `select * from program_run_day_states where program_run_id = ? order by week_index, day_index`,
    )
    .all(runRow.id);

  const program: Program = {
    id: programRow.id,
    name: programRow.name,
    description: programRow.description ?? null,
    durationWeeks: programRow.duration_weeks,
    days: dayRows.map((d: any) => ({
      id: d.id,
      programId: d.program_id,
      weekIndex: d.week_index,
      dayIndex: d.day_index,
      order: d.order ?? 0,
      routineId: d.routine_id ?? null,
      isRestDay: !!d.is_rest_day,
      notes: d.notes ?? null,
      label: d.label ?? null,
      overrides: null,
    })) as Program["days"],
    createdAt: programRow.created_at,
    updatedAt: programRow.updated_at,
  };

  const run: ProgramRun = {
    id: runRow.id,
    programId: runRow.program_id,
    status: runRow.status,
    startedAt: runRow.started_at,
    endedAt: runRow.ended_at ?? null,
    currentWeekIndex: runRow.current_week_index,
    currentDayIndex: runRow.current_day_index,
    weekZeroStartDate: runRow.week_zero_start_date ?? null,
    dayStates: dsRows.map((s: any) => ({
      id: s.id,
      weekIndex: s.week_index,
      dayIndex: s.day_index,
      status: s.status,
      sessionId: s.session_id ?? null,
      completedAt: s.completed_at ?? undefined,
      updatedAt: s.updated_at,
    })) as ProgramRun["dayStates"],
    createdAt: runRow.created_at,
    updatedAt: runRow.updated_at,
  } as ProgramRun;

  const startMs = run.weekZeroStartDate ?? run.startedAt;

  function slotLabel(w: number, d: number): string {
    const entries = program.days.filter((pd) => pd.weekIndex === w && pd.dayIndex === d);
    const primary = entries.find((pd) => (pd.order ?? 0) === 0) ?? entries[0];
    if (!primary) return "(no entry)";
    if (primary.isRestDay) return "REST";
    if (!primary.routineId) return "(empty)";
    return routineNames.get(primary.routineId) ?? primary.routineId;
  }

  function slotStatus(w: number, d: number): string {
    const ds = run.dayStates.find((s) => s.weekIndex === w && s.dayIndex === d);
    return ds?.status ?? "not_started";
  }

  console.log("\n" + "=".repeat(78));
  console.log(`PROGRAM  ${program.name}  (${program.durationWeeks}w)`);
  console.log(`RUN      ${run.id}`);
  console.log(`START    weekZero=${fmt(startMs)}   (${Math.round((todayStartMs - startMs) / 86_400_000)} days ago)`);
  console.log("=".repeat(78));

  console.log("--- resolved day states (from DB) ---");
  if (run.dayStates.length === 0) console.log("  (none)");
  for (const s of run.dayStates) {
    console.log(
      `  w${s.weekIndex} d${s.dayIndex}  ${slotLabel(s.weekIndex, s.dayIndex).padEnd(20)} ${s.status.padEnd(11)} completedAt=${(s as any).completedAt ?? "MISSING"}`,
    );
  }

  const cascade = computeCascadeSchedule(program, run, todayStartMs);

  // Replicates the homepage's scheduledWorkoutDates derivation (home/state.ts).
  const scheduledWorkoutDates = new Set<string>();
  for (const [slotKey, effectiveMs] of cascade.slotToMs) {
    const [wStr, dStr] = slotKey.split(":");
    const w = parseInt(wStr!, 10);
    const d = parseInt(dStr!, 10);
    const entries = program.days.filter((pd) => pd.weekIndex === w && pd.dayIndex === d);
    const primary = entries.find((pd) => (pd.order ?? 0) === 0) ?? entries[0];
    if (!primary || primary.isRestDay || !primary.routineId) continue;
    const ds = run.dayStates.find((s) => s.weekIndex === w && s.dayIndex === d);
    if (ds?.status === "completed" || ds?.status === "skipped") continue;
    scheduledWorkoutDates.add(dateKey(effectiveMs));
  }

  console.log("\n--- cascade schedule: first 14 slots ---");
  let shown = 0;
  for (const [slotKey, ms] of cascade.slotToMs) {
    if (shown++ >= 14) break;
    const [w, d] = slotKey.split(":").map(Number);
    const orig = startMs + (w! * 7 + d!) * 86_400_000;
    const moved = ms !== orig ? `  <= shifted from ${fmt(orig)}` : "  (NOT shifted)";
    console.log(
      `  w${w} d${d}  ${slotLabel(w!, d!).padEnd(20)} ${slotStatus(w!, d!).padEnd(11)} -> ${fmt(ms)}${moved}`,
    );
  }

  // Mon–Sun calendar row + next 7 days, as the homepage renders it.
  const monday = new Date(todayStartMs);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  console.log("\n--- HOMESCREEN CALENDAR ROW (Mon–Sun of this week) ---");
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const key = dateKey(day.getTime());
    const slot = cascade.dateToSlot.get(key);
    const dot = scheduledWorkoutDates.has(key) ? "●" : "·";
    const isToday = day.getTime() === todayStartMs ? "  <-- TODAY" : "";
    console.log(
      `  ${dot} ${fmt(day.getTime())}  ${(slot ? `w${slot.weekIndex}d${slot.dayIndex}` : "—").padEnd(6)} ${slot ? slotLabel(slot.weekIndex, slot.dayIndex) : "(nothing scheduled)"}${isToday}`,
    );
  }

  console.log("\n--- NEXT 10 DAYS (what the user should see going forward) ---");
  for (let i = 0; i < 10; i++) {
    const day = new Date(todayStartMs);
    day.setDate(day.getDate() + i);
    const key = dateKey(day.getTime());
    const slot = cascade.dateToSlot.get(key);
    const dot = scheduledWorkoutDates.has(key) ? "●" : "·";
    console.log(
      `  ${dot} ${fmt(day.getTime())}  ${(slot ? `w${slot.weekIndex}d${slot.dayIndex}` : "—").padEnd(6)} ${slot ? slotLabel(slot.weekIndex, slot.dayIndex) : "(nothing scheduled)"}`,
    );
  }

  const todaySlot = cascade.dateToSlot.get(dateKey(todayStartMs)) ?? null;
  const npd = computeNextPlayableDay(program, run);
  console.log("\n--- TODAY CARD ---");
  console.log(
    `  cascade today slot     : ${todaySlot ? `w${todaySlot.weekIndex}d${todaySlot.dayIndex} = ${slotLabel(todaySlot.weekIndex, todaySlot.dayIndex)}` : "NONE"}`,
  );
  console.log(
    `  computeNextPlayableDay : ${npd ? `w${npd.weekIndex}d${npd.dayIndex} = ${slotLabel(npd.weekIndex, npd.dayIndex)}` : "NONE"}`,
  );

  const dotWeekIndex = npd?.weekIndex ?? program.durationWeeks - 1;
  console.log(`\n--- WEEK DOTS (buildProgramWeekDots, weekIndex=${dotWeekIndex}) ---`);
  const dots: string[] = [];
  for (let d = 0; d < 7; d++) dots.push(`d${d}:${slotLabel(dotWeekIndex, d)}/${slotStatus(dotWeekIndex, d)}`);
  console.log("  " + dots.join("  "));

  // --- Simulate: user finishes today's workout ------------------------------
  // Models what setProgramRunDayState() actually writes (no completedAt) vs what
  // the cascade needs. Shows whether tomorrow's workout collapses onto today.
  if (todaySlot) {
    for (const withCompletedAt of [false, true]) {
      const simRun: ProgramRun = {
        ...run,
        dayStates: [
          ...run.dayStates.filter(
            (s) => !(s.weekIndex === todaySlot.weekIndex && s.dayIndex === todaySlot.dayIndex),
          ),
          {
            id: "sim",
            weekIndex: todaySlot.weekIndex,
            dayIndex: todaySlot.dayIndex,
            status: "completed",
            sessionId: null,
            ...(withCompletedAt ? { completedAt: todayStartMs + 12 * 3600_000 } : {}),
            updatedAt: todayStartMs,
          } as any,
        ],
      };
      const simCascade = computeCascadeSchedule(program, simRun, todayStartMs);
      const nowSlot = simCascade.dateToSlot.get(dateKey(todayStartMs));
      const tmwSlot = simCascade.dateToSlot.get(dateKey(todayStartMs + 86_400_000));
      console.log(
        `\n--- SIMULATE: complete w${todaySlot.weekIndex}d${todaySlot.dayIndex} today, completedAt ${withCompletedAt ? "PRESENT" : "MISSING (what the app writes)"} ---`,
      );
      console.log(
        `  today    -> ${nowSlot ? `w${nowSlot.weekIndex}d${nowSlot.dayIndex} = ${slotLabel(nowSlot.weekIndex, nowSlot.dayIndex)}` : "NONE"}`,
      );
      console.log(
        `  tomorrow -> ${tmwSlot ? `w${tmwSlot.weekIndex}d${tmwSlot.dayIndex} = ${slotLabel(tmwSlot.weekIndex, tmwSlot.dayIndex)}` : "NONE"}`,
      );
    }
  }
}
