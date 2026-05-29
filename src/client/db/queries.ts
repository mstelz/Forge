import Dexie from "dexie";
import { forgeDB } from "./forge-db";
import type { Exercise, Equipment, Routine, Session, SessionSetLog, Program, ProgramRun, Goal } from "../../shared";
import type { HistoryFilter } from "../../shared/history";

export const listExercises = (): Promise<Exercise[]> =>
  forgeDB.exercises.orderBy("name").toArray();

export const getExerciseById = (id: string): Promise<Exercise | undefined> =>
  forgeDB.exercises.get(id);

export const listEquipment = (): Promise<Equipment[]> =>
  forgeDB.equipment.orderBy("name").toArray();

export const getEquipmentById = (id: string): Promise<Equipment | undefined> =>
  forgeDB.equipment.get(id);

export const listRoutines = (): Promise<Routine[]> =>
  forgeDB.routines.orderBy("name").toArray();

export const getRoutineById = (id: string): Promise<Routine | undefined> =>
  forgeDB.routines.get(id);

export const listSessions = (): Promise<Session[]> =>
  forgeDB.sessions.orderBy("startedAt").reverse().toArray();

export const getSessionById = (id: string): Promise<Session | undefined> =>
  forgeDB.sessions.get(id);

export const getActiveSession = async (): Promise<Session | null> =>
  (await forgeDB.sessions.where("status").equals("in_progress").first()) ?? null;

export const listSessionLogs = (sessionId: string): Promise<SessionSetLog[]> =>
  forgeDB.sessionSetLogs.where("sessionId").equals(sessionId).sortBy("loggedAt");

export const listLogsForExercise = (exerciseId: string): Promise<SessionSetLog[]> =>
  forgeDB.sessionSetLogs
    .where("[exerciseId+loggedAt]")
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .toArray();

export const getLastLogForExercise = async (exerciseId: string): Promise<SessionSetLog | undefined> => {
  const rows = await forgeDB.sessionSetLogs
    .where("[exerciseId+loggedAt]")
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .toArray();
  const logged = rows.filter((r) => r.status === "logged");
  if (logged.length === 0) return undefined;
  logged.sort((a, b) => b.loggedAt - a.loggedAt);
  return logged[0];
};

export const listAllSessionLogs = (): Promise<SessionSetLog[]> =>
  forgeDB.sessionSetLogs.toArray();

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

function rangeSpan(
  range: HistoryFilter["range"],
  from?: number,
  to?: number,
): { from: number; to: number } | null {
  if (range === "all") return null;
  if (range === "custom") {
    if (from != null && to != null) return { from, to };
    return null;
  }
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (range === "week") {
    const day = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - day);
    return { from: weekStart.getTime(), to: now };
  }
  if (range === "month") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: monthStart.getTime(), to: now };
  }
  if (range === "year") {
    const yearStart = new Date(today.getFullYear(), 0, 1);
    return { from: yearStart.getTime(), to: now };
  }
  return null;
}

export const listFinishedSessions = async (
  filters?: Partial<HistoryFilter>,
): Promise<Session[]> => {
  const sessions = await forgeDB.sessions.where("status").equals("finished").toArray();
  sessions.sort((a, b) => b.startedAt - a.startedAt);
  if (!filters || Object.keys(filters).length === 0) return sessions;

  const span = rangeSpan(filters.range ?? "all", filters.from, filters.to);

  let sessionIdsWithExercise: Set<string> | null = null;
  if (filters.exercise) {
    const logs = await forgeDB.sessionSetLogs
      .where("[exerciseId+loggedAt]")
      .between([filters.exercise, Dexie.minKey], [filters.exercise, Dexie.maxKey])
      .toArray();
    sessionIdsWithExercise = new Set(logs.map((l) => l.sessionId));
  }

  return sessions.filter((s) => {
    if (s.endedAt == null) return false;
    if (span && (s.endedAt < span.from || s.endedAt > span.to)) return false;
    if (filters.routine && s.sourceRoutineId !== filters.routine) return false;
    if (sessionIdsWithExercise && !sessionIdsWithExercise.has(s.id)) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase().trim();
      if (!(s.title?.toLowerCase().includes(q) ?? false) && !(s.notes?.toLowerCase().includes(q) ?? false)) return false;
    }
    return true;
  });
};

export const countExercisesReferencingEquipment = async (
  equipmentId: string,
): Promise<number> => {
  let n = 0;
  await forgeDB.exercises.each((e) => {
    if (e.equipmentIds.includes(equipmentId)) n++;
  });
  return n;
};

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export const listPrograms = (): Promise<Program[]> =>
  forgeDB.programs.orderBy("name").toArray();

export const getProgramById = (id: string): Promise<Program | undefined> =>
  forgeDB.programs.get(id);

// ---------------------------------------------------------------------------
// Program runs
// ---------------------------------------------------------------------------

export const listProgramRuns = (): Promise<ProgramRun[]> =>
  forgeDB.programRuns.orderBy("startedAt").reverse().toArray();

export const getProgramRunById = (id: string): Promise<ProgramRun | undefined> =>
  forgeDB.programRuns.get(id);

export const getActiveRunForProgram = async (
  programId: string,
): Promise<ProgramRun | null> => {
  const run = await forgeDB.programRuns
    .where("programId")
    .equals(programId)
    .filter((r) => r.status === "active")
    .first();
  return run ?? null;
};

export const listActiveRuns = async (): Promise<ProgramRun[]> => {
  const runs = await forgeDB.programRuns.where("status").equals("active").toArray();
  runs.sort((a, b) => a.startedAt - b.startedAt);
  return runs;
};

export const getGloballyActiveRun = async (): Promise<ProgramRun | null> => {
  const run = await forgeDB.programRuns
    .filter((r) => r.status === "active")
    .first();
  return run ?? null;
};

export const listFinishedRunsForProgram = async (
  programId: string,
): Promise<ProgramRun[]> => {
  const runs = await forgeDB.programRuns
    .where("programId")
    .equals(programId)
    .filter((r) => r.status === "completed" || r.status === "abandoned")
    .toArray();
  runs.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  return runs;
};

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export const listGoals = (): Promise<Goal[]> => forgeDB.goals.toArray();

export const getGoal = (id: string): Promise<Goal | undefined> => forgeDB.goals.get(id);

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

import type { Profile, WeightLog } from "../../shared/profile";

export const listProfiles = (): Promise<Profile[]> =>
  forgeDB.profiles.orderBy("createdAt").toArray();

export const getProfileById = (id: string): Promise<Profile | undefined> =>
  forgeDB.profiles.get(id);

export const listWeightLogs = (profileId: string): Promise<WeightLog[]> =>
  forgeDB.weightLogs.where("profileId").equals(profileId).sortBy("date");
