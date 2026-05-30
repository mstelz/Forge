import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, sqlite } from "../../db/client";
import {
  exercises, equipment, routines, routineBlocks, routineItems, routineSetTargets,
  sessions, sessionSetLogs, programs, programDays, programRuns, programRunDayStates, goals, settings,
  profiles, weightLogs,
} from "../../db/schema";
import { PendingWriteSchema } from "../../shared/pending-write";
import { z } from "zod";

export const syncRoute = new Hono();

type ItemResult = { id: string; status: "ok" | "conflict" | "error"; code?: number; detail?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = Record<string, any>;

function applyExercise(entry: { id: string; op: string; payload: Payload }): ItemResult {
  const id = String(entry.payload.id ?? entry.id);
  const now = Date.now();
  if (entry.op === "create") {
    const existing = db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, id)).get();
    if (existing) return { id: entry.id, status: "conflict", code: 409 };
    db.insert(exercises).values({
      id,
      name: entry.payload.name,
      type: entry.payload.type,
      primaryMuscles: JSON.stringify(entry.payload.primaryMuscles ?? []),
      secondaryMuscles: JSON.stringify(entry.payload.secondaryMuscles ?? []),
      equipmentIds: JSON.stringify(entry.payload.equipmentIds ?? []),
      aliases: JSON.stringify(entry.payload.aliases ?? []),
      description: entry.payload.description ?? null,
      instructions: entry.payload.instructions ?? null,
      videoUrls: JSON.stringify(entry.payload.videoUrls ?? []),
      notes: entry.payload.notes ?? null,
      createdAt: entry.payload.createdAt ?? now,
      updatedAt: entry.payload.updatedAt ?? now,
      lastUsedAt: entry.payload.lastUsedAt ?? null,
    }).run();
    return { id: entry.id, status: "ok", code: 201 };
  }
  if (entry.op === "update") {
    const existing = db.select().from(exercises).where(eq(exercises.id, id)).get();
    if (!existing) return { id: entry.id, status: "conflict", code: 404 };
    db.update(exercises).set({
      name: entry.payload.name ?? existing.name,
      type: entry.payload.type ?? existing.type,
      primaryMuscles: entry.payload.primaryMuscles != null ? JSON.stringify(entry.payload.primaryMuscles) : existing.primaryMuscles,
      secondaryMuscles: entry.payload.secondaryMuscles != null ? JSON.stringify(entry.payload.secondaryMuscles) : existing.secondaryMuscles,
      equipmentIds: entry.payload.equipmentIds != null ? JSON.stringify(entry.payload.equipmentIds) : existing.equipmentIds,
      aliases: entry.payload.aliases != null ? JSON.stringify(entry.payload.aliases) : existing.aliases,
      description: entry.payload.description ?? existing.description,
      instructions: entry.payload.instructions ?? existing.instructions,
      videoUrls: entry.payload.videoUrls != null ? JSON.stringify(entry.payload.videoUrls) : existing.videoUrls,
      notes: entry.payload.notes ?? existing.notes,
      updatedAt: Math.max(entry.payload.updatedAt ?? 0, now),
      lastUsedAt: entry.payload.lastUsedAt ?? existing.lastUsedAt,
    }).where(eq(exercises.id, id)).run();
    return { id: entry.id, status: "ok", code: 200 };
  }
  if (entry.op === "delete") {
    db.update(exercises).set({ deletedAt: now, updatedAt: now }).where(eq(exercises.id, id)).run();
    return { id: entry.id, status: "ok", code: 204 };
  }
  return { id: entry.id, status: "error", detail: "unknown_op" };
}

function applyEquipment(entry: { id: string; op: string; payload: Payload }): ItemResult {
  const id = String(entry.payload.id ?? entry.id);
  const now = Date.now();
  if (entry.op === "create") {
    const existing = db.select({ id: equipment.id }).from(equipment).where(eq(equipment.id, id)).get();
    if (existing) return { id: entry.id, status: "conflict", code: 409 };
    db.insert(equipment).values({ id, name: entry.payload.name, createdAt: entry.payload.createdAt ?? now, updatedAt: entry.payload.updatedAt ?? now }).run();
    return { id: entry.id, status: "ok", code: 201 };
  }
  if (entry.op === "update") {
    const existing = db.select({ id: equipment.id }).from(equipment).where(eq(equipment.id, id)).get();
    if (!existing) return { id: entry.id, status: "conflict", code: 404 };
    db.update(equipment).set({ name: entry.payload.name, updatedAt: Math.max(entry.payload.updatedAt ?? 0, now) }).where(eq(equipment.id, id)).run();
    return { id: entry.id, status: "ok", code: 200 };
  }
  if (entry.op === "delete") {
    db.update(equipment).set({ deletedAt: now, updatedAt: now }).where(eq(equipment.id, id)).run();
    return { id: entry.id, status: "ok", code: 204 };
  }
  return { id: entry.id, status: "error", detail: "unknown_op" };
}

function applyGoal(entry: { id: string; op: string; payload: Payload }): ItemResult {
  const id = String(entry.payload.id ?? entry.id);
  const now = Date.now();
  if (entry.op === "create") {
    const existing = db.select({ id: goals.id }).from(goals).where(eq(goals.id, id)).get();
    if (existing) return { id: entry.id, status: "conflict", code: 409 };
    db.insert(goals).values({
      id,
      category: entry.payload.category,
      title: entry.payload.title,
      direction: entry.payload.direction,
      startValue: entry.payload.startValue ?? null,
      targetValue: entry.payload.targetValue ?? null,
      currentValue: entry.payload.currentValue ?? null,
      unit: entry.payload.unit ?? null,
      linkedExerciseId: entry.payload.linkedExerciseId ?? null,
      linkedProgramRunId: entry.payload.linkedProgramRunId ?? null,
      deadline: entry.payload.deadline ?? null,
      notes: entry.payload.notes ?? null,
      status: entry.payload.status ?? "active",
      completedAt: entry.payload.completedAt ?? null,
      createdAt: entry.payload.createdAt ?? now,
      updatedAt: entry.payload.updatedAt ?? now,
    }).run();
    return { id: entry.id, status: "ok", code: 201 };
  }
  if (entry.op === "update") {
    const existing = db.select().from(goals).where(eq(goals.id, id)).get();
    if (!existing) return { id: entry.id, status: "conflict", code: 404 };
    db.update(goals).set({
      category: entry.payload.category ?? existing.category,
      title: entry.payload.title ?? existing.title,
      direction: entry.payload.direction ?? existing.direction,
      startValue: entry.payload.startValue ?? existing.startValue,
      targetValue: entry.payload.targetValue ?? existing.targetValue,
      currentValue: entry.payload.currentValue ?? existing.currentValue,
      unit: entry.payload.unit ?? existing.unit,
      deadline: entry.payload.deadline ?? existing.deadline,
      notes: entry.payload.notes ?? existing.notes,
      status: entry.payload.status ?? existing.status,
      completedAt: entry.payload.completedAt ?? existing.completedAt,
      updatedAt: Math.max(entry.payload.updatedAt ?? 0, now),
    }).where(eq(goals.id, id)).run();
    return { id: entry.id, status: "ok", code: 200 };
  }
  if (entry.op === "delete") {
    db.update(goals).set({ deletedAt: now, updatedAt: now }).where(eq(goals.id, id)).run();
    return { id: entry.id, status: "ok", code: 204 };
  }
  return { id: entry.id, status: "error", detail: "unknown_op" };
}

function applySettings(entry: { id: string; op: string; payload: Payload }): ItemResult {
  const now = Date.now();
  const existing = db.select().from(settings).limit(1).all()[0];
  if (!existing) {
    db.insert(settings).values({
      id: entry.payload.id ?? "settings",
      weightUnit: entry.payload.weightUnit ?? "kg",
      distanceUnit: entry.payload.distanceUnit ?? "km",
      heightUnit: entry.payload.heightUnit ?? "cm",
      timezone: entry.payload.timezone ?? "America/Chicago",
      weekStartsOn: entry.payload.weekStartsOn ?? "mon",
      showRpe: entry.payload.showRpe ?? true,
      showCardio: entry.payload.showCardio ?? true,
      theme: entry.payload.theme ?? "system",
      createdAt: entry.payload.createdAt ?? now,
      updatedAt: entry.payload.updatedAt ?? now,
    }).run();
    return { id: entry.id, status: "ok", code: 200 };
  }
  db.update(settings).set({
    weightUnit: entry.payload.weightUnit ?? existing.weightUnit,
    distanceUnit: entry.payload.distanceUnit ?? existing.distanceUnit,
    heightUnit: entry.payload.heightUnit ?? existing.heightUnit,
    timezone: entry.payload.timezone ?? existing.timezone,
    weekStartsOn: entry.payload.weekStartsOn ?? existing.weekStartsOn,
    showRpe: entry.payload.showRpe ?? existing.showRpe,
    showCardio: entry.payload.showCardio ?? existing.showCardio,
    theme: entry.payload.theme ?? existing.theme,
    updatedAt: Math.max(entry.payload.updatedAt ?? 0, now),
  }).where(eq(settings.id, existing.id)).run();
  return { id: entry.id, status: "ok", code: 200 };
}

function applyProfile(entry: { id: string; op: string; payload: Payload }): ItemResult {
  const id = String(entry.payload.id ?? entry.id);
  const now = Date.now();
  if (entry.op === "create") {
    const existing = db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, id)).get();
    if (existing) return { id: entry.id, status: "conflict", code: 409 };
    db.insert(profiles).values({
      id,
      name: entry.payload.name,
      avatarDataUrl: entry.payload.avatarDataUrl ?? null,
      heightCm: entry.payload.heightCm ?? null,
      dateOfBirth: entry.payload.dateOfBirth ?? null,
      sex: entry.payload.sex ?? null,
      activityLevel: entry.payload.activityLevel ?? null,
      goalType: entry.payload.goalType ?? null,
      targetWeightKg: entry.payload.targetWeightKg ?? null,
      createdAt: entry.payload.createdAt ?? now,
      updatedAt: entry.payload.updatedAt ?? now,
    }).run();
    return { id: entry.id, status: "ok", code: 201 };
  }
  if (entry.op === "update") {
    const existing = db.select().from(profiles).where(eq(profiles.id, id)).get();
    if (!existing) return { id: entry.id, status: "conflict", code: 404 };
    db.update(profiles).set({
      name: entry.payload.name ?? existing.name,
      avatarDataUrl: entry.payload.avatarDataUrl ?? existing.avatarDataUrl,
      heightCm: entry.payload.heightCm ?? existing.heightCm,
      dateOfBirth: entry.payload.dateOfBirth ?? existing.dateOfBirth,
      sex: entry.payload.sex ?? existing.sex,
      activityLevel: entry.payload.activityLevel ?? existing.activityLevel,
      goalType: entry.payload.goalType ?? existing.goalType,
      targetWeightKg: entry.payload.targetWeightKg ?? existing.targetWeightKg,
      updatedAt: Math.max(entry.payload.updatedAt ?? 0, now),
    }).where(eq(profiles.id, id)).run();
    return { id: entry.id, status: "ok", code: 200 };
  }
  if (entry.op === "delete") {
    db.delete(profiles).where(eq(profiles.id, id)).run();
    return { id: entry.id, status: "ok", code: 204 };
  }
  return { id: entry.id, status: "error", detail: "unknown_op" };
}

function applyWeightLog(entry: { id: string; op: string; payload: Payload }): ItemResult {
  const id = String(entry.payload.id ?? entry.id);
  const now = Date.now();
  if (entry.op === "create") {
    const existing = db.select({ id: weightLogs.id }).from(weightLogs).where(eq(weightLogs.id, id)).get();
    if (existing) return { id: entry.id, status: "conflict", code: 409 };
    db.insert(weightLogs).values({
      id,
      profileId: entry.payload.profileId,
      weightKg: entry.payload.weightKg,
      date: entry.payload.date,
      note: entry.payload.note ?? null,
      createdAt: entry.payload.createdAt ?? now,
    }).run();
    return { id: entry.id, status: "ok", code: 201 };
  }
  if (entry.op === "delete") {
    db.delete(weightLogs).where(eq(weightLogs.id, id)).run();
    return { id: entry.id, status: "ok", code: 204 };
  }
  return { id: entry.id, status: "error", detail: "unknown_op" };
}

function applySessionLog(entry: { id: string; op: string; payload: Payload }): ItemResult {
  const id = String(entry.payload.id ?? entry.id);
  const sessionId = String(entry.payload.sessionId ?? "");
  const now = Date.now();
  if (entry.op === "create") {
    const existing = db.select({ id: sessionSetLogs.id }).from(sessionSetLogs).where(eq(sessionSetLogs.id, id)).get();
    if (existing) return { id: entry.id, status: "conflict", code: 409 };
    const session = db.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!session) return { id: entry.id, status: "conflict", code: 404 };
    db.insert(sessionSetLogs).values({
      id,
      sessionId,
      performedExerciseId: entry.payload.performedExerciseId,
      exerciseId: entry.payload.exerciseId,
      sessionItemId: entry.payload.sessionItemId,
      plannedSetId: entry.payload.plannedSetId ?? null,
      order: entry.payload.order,
      reps: entry.payload.reps ?? null,
      weightKg: entry.payload.weightKg ?? null,
      rpe: entry.payload.rpe ?? null,
      durationSec: entry.payload.durationSec ?? null,
      distanceM: entry.payload.distanceM ?? null,
      notes: entry.payload.notes ?? null,
      setType: entry.payload.setType,
      status: entry.payload.status,
      loggedAt: new Date(entry.payload.loggedAt ?? now),
      restAfterSec: entry.payload.restAfterSec ?? null,
      enteredWeight: entry.payload.enteredWeight ?? null,
      enteredWeightUnit: entry.payload.enteredWeightUnit ?? null,
      enteredDistance: entry.payload.enteredDistance ?? null,
      enteredDistanceUnit: entry.payload.enteredDistanceUnit ?? null,
    }).run();
    return { id: entry.id, status: "ok", code: 201 };
  }
  if (entry.op === "update") {
    const existing = db.select().from(sessionSetLogs).where(and(eq(sessionSetLogs.id, id), eq(sessionSetLogs.sessionId, sessionId))).get();
    if (!existing) return { id: entry.id, status: "conflict", code: 404 };
    db.update(sessionSetLogs).set({
      reps: entry.payload.reps ?? existing.reps,
      weightKg: entry.payload.weightKg ?? existing.weightKg,
      rpe: entry.payload.rpe ?? existing.rpe,
      durationSec: entry.payload.durationSec ?? existing.durationSec,
      distanceM: entry.payload.distanceM ?? existing.distanceM,
      notes: entry.payload.notes ?? existing.notes,
      status: entry.payload.status ?? existing.status,
      restAfterSec: entry.payload.restAfterSec ?? existing.restAfterSec,
      enteredWeight: entry.payload.enteredWeight ?? existing.enteredWeight,
      enteredWeightUnit: entry.payload.enteredWeightUnit ?? existing.enteredWeightUnit,
      enteredDistance: entry.payload.enteredDistance ?? existing.enteredDistance,
      enteredDistanceUnit: entry.payload.enteredDistanceUnit ?? existing.enteredDistanceUnit,
    }).where(eq(sessionSetLogs.id, id)).run();
    return { id: entry.id, status: "ok", code: 200 };
  }
  if (entry.op === "delete") {
    db.delete(sessionSetLogs).where(eq(sessionSetLogs.id, id)).run();
    return { id: entry.id, status: "ok", code: 204 };
  }
  return { id: entry.id, status: "error", detail: "unknown_op" };
}

function applySession(entry: { id: string; op: string; payload: Payload }): ItemResult {
  const id = String(entry.payload.id ?? entry.id);
  const now = Date.now();
  if (entry.op === "create") {
    const existing = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, id)).get();
    if (existing) return { id: entry.id, status: "conflict", code: 409 };
    db.insert(sessions).values({
      id,
      status: "in_progress",
      sourceType: entry.payload.sourceType,
      sourceRoutineId: entry.payload.sourceRoutineId ?? null,
      sourceProgramId: entry.payload.sourceProgramId ?? null,
      sourceProgramWeekIndex: entry.payload.sourceProgramWeekIndex ?? null,
      sourceProgramDayIndex: entry.payload.sourceProgramDayIndex ?? null,
      templateSnapshot: entry.payload.templateSnapshot ?? null,
      liveStructure: entry.payload.liveStructure,
      restTimer: entry.payload.restTimer ?? null,
      title: entry.payload.title ?? null,
      notes: entry.payload.notes ?? null,
      startedAt: new Date(entry.payload.startedAt ?? now),
      endedAt: null,
      pausedAt: null,
      createdAt: entry.payload.createdAt ?? now,
      updatedAt: entry.payload.updatedAt ?? now,
    }).run();
    return { id: entry.id, status: "ok", code: 201 };
  }
  if (entry.op === "update") {
    const existing = db.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!existing) return { id: entry.id, status: "conflict", code: 404 };
    const isFinish = entry.payload.status === "finished";
    db.update(sessions).set({
      status: entry.payload.status ?? existing.status,
      liveStructure: entry.payload.liveStructure ?? existing.liveStructure,
      restTimer: entry.payload.restTimer ?? existing.restTimer,
      title: entry.payload.title ?? existing.title,
      notes: entry.payload.notes ?? existing.notes,
      endedAt: isFinish ? new Date(entry.payload.endedAt ?? now) : existing.endedAt,
      updatedAt: Math.max(entry.payload.updatedAt ?? 0, now),
    }).where(eq(sessions.id, id)).run();
    return { id: entry.id, status: "ok", code: 200 };
  }
  if (entry.op === "delete") {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return { id: entry.id, status: "ok", code: 204 };
  }
  return { id: entry.id, status: "error", detail: "unknown_op" };
}

function upsertDayStates(programRunId: string, dayStates: Payload[]): void {
  db.delete(programRunDayStates).where(eq(programRunDayStates.programRunId, programRunId)).run();
  for (const ds of dayStates) {
    db.insert(programRunDayStates).values({
      id: ds.id,
      programRunId,
      weekIndex: ds.weekIndex,
      dayIndex: ds.dayIndex,
      status: ds.status,
      sessionId: ds.sessionId ?? null,
      updatedAt: ds.updatedAt ?? Date.now(),
    }).run();
  }
}

function applyProgramRun(entry: { id: string; op: string; payload: Payload }): ItemResult {
  const id = String(entry.payload.id ?? entry.id);
  const now = Date.now();
  const dayStates: Payload[] = Array.isArray(entry.payload.dayStates) ? entry.payload.dayStates : [];
  if (entry.op === "create") {
    const existing = db.select({ id: programRuns.id }).from(programRuns).where(eq(programRuns.id, id)).get();
    if (existing) return { id: entry.id, status: "conflict", code: 409 };
    sqlite.transaction(() => {
      db.insert(programRuns).values({
        id,
        programId: entry.payload.programId,
        status: entry.payload.status ?? "active",
        startedAt: entry.payload.startedAt ?? now,
        endedAt: entry.payload.endedAt ?? null,
        currentWeekIndex: entry.payload.currentWeekIndex ?? 0,
        currentDayIndex: entry.payload.currentDayIndex ?? 0,
        weekZeroStartDate: entry.payload.weekZeroStartDate ?? null,
        createdAt: entry.payload.createdAt ?? now,
        updatedAt: entry.payload.updatedAt ?? now,
      }).run();
      upsertDayStates(id, dayStates);
    })();
    return { id: entry.id, status: "ok", code: 201 };
  }
  if (entry.op === "update") {
    const existing = db.select().from(programRuns).where(eq(programRuns.id, id)).get();
    if (!existing) return { id: entry.id, status: "conflict", code: 404 };
    sqlite.transaction(() => {
      db.update(programRuns).set({
        status: entry.payload.status ?? existing.status,
        currentWeekIndex: entry.payload.currentWeekIndex ?? existing.currentWeekIndex,
        currentDayIndex: entry.payload.currentDayIndex ?? existing.currentDayIndex,
        endedAt: entry.payload.endedAt ?? existing.endedAt,
        weekZeroStartDate: entry.payload.weekZeroStartDate ?? existing.weekZeroStartDate,
        updatedAt: Math.max(entry.payload.updatedAt ?? 0, now),
      }).where(eq(programRuns.id, id)).run();
      upsertDayStates(id, dayStates);
    })();
    return { id: entry.id, status: "ok", code: 200 };
  }
  return { id: entry.id, status: "error", detail: "unknown_op" };
}

const BatchSyncInput = z.object({
  writes: z.array(PendingWriteSchema),
});

// POST /api/v1/sync — process a batch of pending writes in one round-trip.
// Commits partial: each item gets its own status in the response array.
syncRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = BatchSyncInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation", issues: parsed.error.issues }, 400);
  }

  const results: ItemResult[] = [];

  sqlite.transaction(() => {
    for (const write of parsed.data.writes) {
      try {
        let result: ItemResult;
        const entry = { id: write.id, op: write.op, payload: write.payload as Payload };
        switch (write.entity) {
          case "exercise": result = applyExercise(entry); break;
          case "equipment": result = applyEquipment(entry); break;
          case "goal": result = applyGoal(entry); break;
          case "settings": result = applySettings(entry); break;
          case "profile": result = applyProfile(entry); break;
          case "weight_log": result = applyWeightLog(entry); break;
          case "session_log": result = applySessionLog(entry); break;
          case "session": result = applySession(entry); break;
          case "program_run": result = applyProgramRun(entry); break;
          default:
            // routines, programs, session_times: not handled in batch — caller falls back to individual
            result = { id: write.id, status: "error", detail: "not_in_batch" };
        }
        results.push(result);
      } catch (err) {
        results.push({ id: write.id, status: "error", detail: String(err) });
      }
    }
  })();

  return c.json({ results });
});
