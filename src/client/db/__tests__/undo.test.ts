import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Equipment, Exercise, Program, Routine } from "../../../shared";
import type { Goal } from "../../../shared/goals";
import type { FakeForgeDB } from "./fake-forge-db";

// The real mutation / undo / flusher code runs against an in-memory database so
// the test exercises the seam between them rather than re-implementing it.
vi.mock("../forge-db", async () => {
  const { createFakeForgeDB } = await import("./fake-forge-db");
  return { forgeDB: createFakeForgeDB() };
});

const { forgeDB } = (await import("../forge-db")) as unknown as {
  forgeDB: FakeForgeDB;
};

const {
  createExercise,
  deleteExercise,
  createEquipment,
  deleteEquipmentWithFanout,
  createRoutine,
  deleteRoutine,
  createProgram,
  deleteProgram,
  createGoal,
  deleteGoal,
  updateExercise,
} = await import("../mutations");

const {
  restoreExercise,
  restoreEquipment,
  restoreRoutine,
  restoreProgram,
  restoreGoal,
} = await import("../undo");

const { flushNow } = await import("../../sync/flusher");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const T = 1_700_000_000_000;

const anExercise = (over: Partial<Exercise> = {}): Exercise => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Back Squat",
  type: "strength",
  primaryMuscles: ["quadriceps"],
  secondaryMuscles: [],
  equipmentIds: [],
  aliases: [],
  description: null,
  instructions: null,
  videoUrls: [],
  notes: null,
  createdAt: T,
  updatedAt: T,
  lastUsedAt: null,
  ...over,
});

const anEquipment = (over: Partial<Equipment> = {}): Equipment => ({
  id: "22222222-2222-4222-8222-222222222222",
  name: "Barbell",
  createdAt: T,
  updatedAt: T,
  ...over,
});

const aRoutine = (over: Partial<Routine> = {}): Routine => ({
  id: "33333333-3333-4333-8333-333333333333",
  name: "Leg Day",
  notes: null,
  estimatedDurationMin: 45,
  blocks: [
    {
      id: "33333333-3333-4333-8333-3333333333b1",
      type: "single",
      order: 0,
      roundCount: null,
      restSec: 90,
      tempo: null,
      notes: null,
      items: [
        {
          id: "33333333-3333-4333-8333-3333333333i1",
          exerciseId: "11111111-1111-4111-8111-111111111111",
          order: 0,
          setCount: 3,
          repMode: "uniform",
          setTypeMode: "uniform",
          uniformReps: 5,
          notes: null,
        },
      ],
    },
  ],
  createdAt: T,
  updatedAt: T,
  ...over,
});

const aProgram = (over: Partial<Program> = {}): Program => ({
  id: "44444444-4444-4444-8444-444444444444",
  name: "Starting Strength",
  description: null,
  durationWeeks: 4,
  days: [
    {
      id: "44444444-4444-4444-8444-4444444444d1",
      weekIndex: 0,
      dayIndex: 0,
      order: 0,
      label: "A",
      routineId: "33333333-3333-4333-8333-333333333333",
      isRestDay: false,
      notes: null,
    },
  ],
  createdAt: T,
  updatedAt: T,
  ...over,
});

const aGoal = (over: Partial<Goal> = {}): Goal => ({
  id: "55555555-5555-4555-8555-555555555555",
  category: "weight",
  title: "Cut to 80kg",
  direction: "down",
  startValue: 90,
  targetValue: 80,
  currentValue: 88,
  unit: "kg",
  linkedExerciseId: null,
  linkedProgramRunId: null,
  deadline: null,
  notes: null,
  status: "active",
  completedAt: null,
  createdAt: T,
  updatedAt: T,
  ...over,
});

// ─── Harness ──────────────────────────────────────────────────────────────────

type Call = { method: string; url: string; body: unknown };

let calls: Call[] = [];
/** Optional per-test hook; awaited before the canned response is returned. */
let beforeRespond: (call: Call) => Promise<void> = async () => {};

function goOnline() {
  vi.stubGlobal("navigator", { onLine: true });
}

function goOffline() {
  vi.stubGlobal("navigator", { onLine: false });
}

/** URLs of every request the flusher actually put on the wire. */
const wire = () => calls.map((c) => `${c.method} ${c.url}`);

/**
 * The batch endpoint answers 404 so every write takes its per-entity REST
 * route — that is the path routines and programs always use, and it makes the
 * assertions about which URL was hit meaningful rather than opaque.
 */
function cannedResponse(call: Call): Response {
  if (call.url.endsWith("/sync")) return new Response(null, { status: 404 });
  if (call.method === "POST") return new Response("{}", { status: 201 });
  if (call.method === "PATCH") return new Response("{}", { status: 200 });
  return new Response(null, { status: 204 });
}

/** Resolve once the flusher has actually put a matching request on the wire. */
async function waitForCall(match: (c: Call) => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (calls.some(match)) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(`timed out waiting for request; saw ${wire().join(", ")}`);
}

beforeEach(() => {
  forgeDB.__reset();
  calls = [];
  beforeRespond = async () => {};
  goOnline();
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      method: init.method ?? "GET",
      url,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    await beforeRespond(call);
    return cannedResponse(call);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Restoring each entity locally ────────────────────────────────────────────

describe("undo restores the deleted record", () => {
  it("brings an exercise back exactly as it was", async () => {
    const ex = anExercise();
    await createExercise(ex);
    await deleteExercise(ex.id);
    expect(await forgeDB.exercises.get(ex.id)).toBeUndefined();

    await restoreExercise(ex);

    // updatedAt is deliberately restamped; everything else must come back as-is.
    expect(await forgeDB.exercises.get(ex.id)).toEqual({
      ...ex,
      updatedAt: expect.any(Number),
    });
  });

  it("brings a routine back with its blocks and items intact", async () => {
    const routine = aRoutine();
    await createRoutine(routine);
    await deleteRoutine(routine.id);

    await restoreRoutine(routine);

    const back = (await forgeDB.routines.get(routine.id)) as unknown as Routine;
    expect(back.blocks[0]!.items[0]!.exerciseId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(back).toEqual({ ...routine, updatedAt: expect.any(Number) });
  });

  it("brings a program back with its days intact", async () => {
    const program = aProgram();
    await createProgram(program);
    await deleteProgram(program.id);

    await restoreProgram(program);

    const back = (await forgeDB.programs.get(program.id)) as unknown as Program;
    expect(back.days).toHaveLength(1);
    expect(back).toEqual({ ...program, updatedAt: expect.any(Number) });
  });

  it("brings a goal back", async () => {
    const goal = aGoal();
    await createGoal(goal);
    await deleteGoal(goal.id);

    await restoreGoal(goal);

    expect(await forgeDB.goals.get(goal.id)).toMatchObject({
      id: goal.id,
      title: goal.title,
      targetValue: goal.targetValue,
      status: "active",
    });
  });

  it("stamps a fresh updatedAt so the server cannot reject the restore as stale", async () => {
    // A server-side delete bumps the row's updatedAt. Re-sending the record
    // with its original, older timestamp reads as a stale update — the goals
    // endpoint answers 409 and the flusher poisons the write.
    const goal = aGoal();
    await createGoal(goal);
    await deleteGoal(goal.id);
    await flushNow(); // the delete reaches the server, so the undo must be a real update

    await restoreGoal(goal);

    const back = (await forgeDB.goals.get(goal.id)) as unknown as Goal;
    expect(back.updatedAt).toBeGreaterThan(goal.updatedAt);

    const queued = await forgeDB.pendingWrites.toArray();
    const update = queued.find((w) => w.entity === "goal" && w.op === "update");
    expect((update!.payload as Goal).updatedAt).toBeGreaterThan(goal.updatedAt);
  });

  it("re-attaches the equipment to every exercise the delete stripped it from", async () => {
    const eq = anEquipment();
    const ex = anExercise({ equipmentIds: [eq.id] });
    await createEquipment(eq);
    await createExercise(ex);

    const { touchedExercises } = await deleteEquipmentWithFanout(eq.id);
    const stripped = (await forgeDB.exercises.get(ex.id)) as unknown as Exercise;
    expect(stripped.equipmentIds).toEqual([]);

    await restoreEquipment(eq, touchedExercises);

    expect(await forgeDB.equipment.get(eq.id)).toEqual({
      ...eq,
      updatedAt: expect.any(Number),
    });
    const rejoined = (await forgeDB.exercises.get(ex.id)) as unknown as Exercise;
    expect(rejoined.equipmentIds).toEqual([eq.id]);
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe("undo is safe to invoke twice", () => {
  it("leaves one record and one outbox entry after a double tap", async () => {
    const ex = anExercise();
    await createExercise(ex);
    await deleteExercise(ex.id);
    await forgeDB.pendingWrites.where("entity").equals("exercise").delete();

    await restoreExercise(ex);
    await restoreExercise(ex);

    expect(await forgeDB.exercises.count()).toBe(1);
    expect(await forgeDB.pendingWrites.count()).toBe(1);
  });

  it("does not clobber a newer edit made after the first undo", async () => {
    const ex = anExercise();
    await createExercise(ex);
    await deleteExercise(ex.id);
    await restoreExercise(ex);
    await updateExercise({ ...ex, name: "Front Squat", updatedAt: T + 1 });

    await restoreExercise(ex);

    const back = (await forgeDB.exercises.get(ex.id)) as unknown as Exercise;
    expect(back.name).toBe("Front Squat");
  });
});

// ─── The offline / outbox race ────────────────────────────────────────────────

describe("undo and the offline outbox", () => {
  it("sends nothing at all when the delete never left the device", async () => {
    const ex = anExercise();
    await createExercise(ex);
    await flushNow();
    calls = [];

    goOffline();
    await deleteExercise(ex.id);
    await restoreExercise(ex);

    goOnline();
    await flushNow();

    expect(wire()).not.toContain(`DELETE /api/v1/exercises/${ex.id}`);
    expect(calls.filter((c) => c.url.includes("/exercises"))).toEqual([]);
    expect(await forgeDB.pendingWrites.count()).toBe(0);
  });

  it("never leaves a queued delete that could fire after the undo", async () => {
    const ex = anExercise();
    await createExercise(ex);
    goOffline();
    await deleteExercise(ex.id);

    await restoreExercise(ex);

    const queued = await forgeDB.pendingWrites.toArray();
    expect(queued.filter((w) => w.op === "delete")).toEqual([]);
  });

  it("resurrects on the server when the delete was already flushed", async () => {
    const ex = anExercise();
    await createExercise(ex);
    await deleteExercise(ex.id);
    await flushNow();
    expect(wire()).toContain(`DELETE /api/v1/exercises/${ex.id}`);
    calls = [];

    await restoreExercise(ex);
    await flushNow();

    expect(wire().filter((w) => w.includes("/exercises"))).toEqual([
      `PATCH /api/v1/exercises/${ex.id}`,
    ]);
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toMatchObject({ id: ex.id, name: "Back Squat" });
  });

  it("queues the resurrect behind a delete that is already in flight", async () => {
    const ex = anExercise();
    await createExercise(ex);
    await flushNow();
    calls = [];

    // Hold the DELETE open so the undo lands while the flusher is mid-request —
    // the one window where cancelling the outbox entry cannot recall the wire.
    let releaseDelete: () => void = () => {};
    const deleteInFlight = new Promise<void>((r) => {
      releaseDelete = r;
    });
    beforeRespond = async (call) => {
      if (call.method === "DELETE") await deleteInFlight;
    };

    await deleteExercise(ex.id);
    const flushing = flushNow();
    await waitForCall((c) => c.method === "DELETE");

    await restoreExercise(ex);
    releaseDelete();
    await flushing;

    beforeRespond = async () => {};
    await flushNow();

    expect(wire().filter((w) => w.includes("/exercises"))).toEqual([
      `DELETE /api/v1/exercises/${ex.id}`,
      `PATCH /api/v1/exercises/${ex.id}`,
    ]);
  });

  it("cancels the queued delete for every undoable entity, not just exercises", async () => {
    goOffline();
    const routine = aRoutine();
    const program = aProgram();
    const goal = aGoal();
    const eq = anEquipment();
    await createRoutine(routine);
    await createProgram(program);
    await createGoal(goal);
    await createEquipment(eq);

    await deleteRoutine(routine.id);
    await deleteProgram(program.id);
    await deleteGoal(goal.id);
    const { touchedExercises } = await deleteEquipmentWithFanout(eq.id);

    await restoreRoutine(routine);
    await restoreProgram(program);
    await restoreGoal(goal);
    await restoreEquipment(eq, touchedExercises);

    const queued = await forgeDB.pendingWrites.toArray();
    expect(queued.filter((w) => w.op === "delete")).toEqual([]);
  });
});
