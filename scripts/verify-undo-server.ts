/**
 * Throwaway verification for the server half of undo: does an update lift the
 * soft-delete tombstone on every entity, and does a soft-deleted routine now
 * reach the client with its deletedAt so the deletion actually propagates?
 *
 * vitest runs on node here, so it cannot import bun:sqlite — this is run by
 * hand with `bun scripts/verify-undo-server.ts`.
 */
import { Hono } from "hono";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, sqlite } from "../src/db/client";
import { api } from "../src/server/routes/api";

migrate(db, { migrationsFolder: "./src/db/migrations" });

// Migration 0008 has the same missing-separator defect this change repairs in
// 0011, so `program_days.label` is absent on a fresh database and every program
// insert fails. That is a separate pre-existing bug and deliberately out of
// scope; patch it here so the program undo path can still be verified.
try {
  sqlite.exec(`ALTER TABLE program_days ADD COLUMN "label" text`);
  console.log("(harness) worked around the unrelated 0008 defect: added program_days.label\n");
} catch {
  // already present
}

const app = new Hono();
app.route("/api/v1", api);

const T = Date.now();
let failures = 0;

function check(label: string, ok: boolean, detail: unknown = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function json(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status >= 400) {
    console.log(`  <- ${method} ${path} ${res.status}: ${(await res.clone().text()).slice(0, 400)}`);
  }
  return res;
}

const uuid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

// ─── Exercise ────────────────────────────────────────────────────────────────
{
  const id = uuid(1);
  const doc = {
    id, name: "Verify Squat", type: "strength",
    primaryMuscles: ["quadriceps"], secondaryMuscles: [], equipmentIds: [],
    aliases: [], description: null, instructions: null, videoUrls: [],
    notes: null, createdAt: T, updatedAt: T, lastUsedAt: null,
  };
  check("exercise POST", (await json("POST", "/api/v1/exercises", doc)).status === 201);
  check("exercise DELETE", (await json("DELETE", `/api/v1/exercises/${id}`)).status === 204);
  const gone = await (await json("GET", "/api/v1/exercises")).json();
  check("exercise hidden after delete", !gone.exercises.some((e: { id: string }) => e.id === id));

  // Undo path A: batch sync endpoint (the path the flusher tries first).
  const batch = await json("POST", "/api/v1/sync", {
    writes: [{ id: uuid(101), entity: "exercise", op: "update", payload: doc, createdAt: T, retries: 0, lastError: null, status: "pending" }],
  });
  check("exercise batch update accepted", (await batch.json()).results[0].status === "ok");
  const back = await (await json("GET", "/api/v1/exercises")).json();
  check("exercise resurrected by batch update", back.exercises.some((e: { id: string }) => e.id === id));
}

// ─── Equipment ───────────────────────────────────────────────────────────────
{
  const id = uuid(2);
  const doc = { id, name: "Verify Barbell", createdAt: T, updatedAt: T };
  check("equipment POST", (await json("POST", "/api/v1/equipment", doc)).status === 201);
  check("equipment DELETE", (await json("DELETE", `/api/v1/equipment/${id}`)).status === 204);
  check("equipment PATCH", (await json("PATCH", `/api/v1/equipment/${id}`, doc)).status === 200);
  const back = await (await json("GET", "/api/v1/equipment")).json();
  check("equipment resurrected by PATCH", back.equipment.some((e: { id: string }) => e.id === id));
}

// ─── Routine ─────────────────────────────────────────────────────────────────
{
  const id = uuid(3);
  const doc = {
    id, name: "Verify Leg Day", notes: null, estimatedDurationMin: 45,
    blocks: [{
      id: uuid(31), type: "single", order: 0, roundCount: null, restSec: 90,
      tempo: null, notes: null,
      items: [{ id: uuid(32), exerciseId: uuid(1), order: 0, setCount: 3, repMode: "uniform", setTypeMode: "uniform", uniformReps: 5, uniformSetType: "normal", notes: null }],
    }],
    createdAt: T, updatedAt: T,
  };
  check("routine POST", (await json("POST", "/api/v1/routines", doc)).status === 201);
  check("routine DELETE", (await json("DELETE", `/api/v1/routines/${id}`)).status === 204);

  // The tombstone must now reach the client, or the deletion never propagates.
  const since = await (await json("GET", `/api/v1/routines?since=${T - 1000}`)).json();
  const tombstoned = since.routines.find((r: { id: string }) => r.id === id);
  check("routine tombstone visible to sync", tombstoned?.deletedAt != null, tombstoned);

  check("routine PATCH", (await json("PATCH", `/api/v1/routines/${id}`, doc)).status === 200);
  const back = await (await json("GET", "/api/v1/routines")).json();
  const revived = back.routines.find((r: { id: string }) => r.id === id);
  check("routine resurrected by PATCH", !!revived);
  check("routine blocks intact after undo", revived?.blocks?.[0]?.items?.[0]?.exerciseId === uuid(1), revived?.blocks);
}

// ─── Program ─────────────────────────────────────────────────────────────────
{
  const id = uuid(4);
  const doc = {
    id, name: "Verify Program", description: null, durationWeeks: 4,
    // label is omitted: migration 0008 has the same missing-separator defect as
    // 0011, so program_days.label does not exist on a fresh database. That is a
    // separate pre-existing bug, out of scope for this change.
    days: [{ id: uuid(41), weekIndex: 0, dayIndex: 0, order: 0, label: null, routineId: uuid(3), isRestDay: false, notes: null }],
    createdAt: T, updatedAt: T,
  };
  check("program POST", (await json("POST", "/api/v1/programs", doc)).status === 201);
  check("program DELETE", (await json("DELETE", `/api/v1/programs/${id}`)).status === 204);
  check("program PATCH", (await json("PATCH", `/api/v1/programs/${id}`, doc)).status === 200);
  const back = await (await json("GET", "/api/v1/programs")).json();
  const revived = back.programs.find((p: { id: string }) => p.id === id);
  check("program resurrected by PATCH", !!revived);
  check("program days intact after undo", revived?.days?.length === 1, revived?.days);
}

// ─── Goal ────────────────────────────────────────────────────────────────────
{
  const id = uuid(5);
  const doc = {
    id, category: "weight", title: "Verify Cut", direction: "down",
    startValue: 90, targetValue: 80, currentValue: 88, unit: "kg",
    linkedExerciseId: null, linkedProgramRunId: null, deadline: null,
    notes: null, status: "active", completedAt: null, createdAt: T, updatedAt: T,
  };
  check("goal POST", (await json("POST", "/api/v1/goals", doc)).status === 201);
  check("goal DELETE", (await json("DELETE", `/api/v1/goals/${id}`)).status === 204);
  // The undo restamps updatedAt (see restoreDeleted) precisely so this PATCH is
  // not rejected as a stale update after the delete bumped the stored row.
  check("goal PATCH", (await json("PATCH", `/api/v1/goals/${id}`, { ...doc, updatedAt: Date.now() + 5000 })).status === 200);
  const back = await (await json("GET", "/api/v1/goals")).json();
  check("goal resurrected by PATCH", back.goals.some((g: { id: string }) => g.id === id));
}

sqlite.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
