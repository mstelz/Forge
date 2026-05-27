import Dexie, { type Table } from "dexie";
import type { Exercise, Equipment, PendingWrite, Routine, Session, SessionSetLog, Program, ProgramRun, Goal, ProgramDay, ProgramRunDayState, Settings } from "../../shared";

export type MetaRow = {
  key: string;
  value: string;
  updatedAt: number;
};

export class ForgeDB extends Dexie {
  exercises!: Table<Exercise, string>;
  equipment!: Table<Equipment, string>;
  pendingWrites!: Table<PendingWrite, string>;
  meta!: Table<MetaRow, string>;
  routines!: Table<Routine, string>;
  sessions!: Table<Session, string>;
  sessionSetLogs!: Table<SessionSetLog, string>;
  programs!: Table<Program, string>;
  programDays!: Table<ProgramDay, string>;
  programRuns!: Table<ProgramRun, string>;
  programRunDayStates!: Table<ProgramRunDayState, string>;
  goals!: Table<Goal, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("forge");
    this.version(1).stores({
      exercises: "id, name, type, updatedAt",
      equipment: "id, name",
      pendingWrites: "id, createdAt, entity",
      meta: "key",
    });
    this.version(2).stores({
      exercises: "id, name, type, updatedAt",
      equipment: "id, name",
      pendingWrites: "id, createdAt, entity",
      meta: "key",
      routines: "id, name, updatedAt",
    });
    this.version(3).stores({
      exercises: "id, name, type, updatedAt",
      equipment: "id, name",
      pendingWrites: "id, createdAt, entity",
      meta: "key",
      routines: "id, name, updatedAt",
      sessions: "id, status, startedAt, sourceRoutineId",
      sessionSetLogs: "id, sessionId, [exerciseId+loggedAt], [sessionId+performedExerciseId+order], plannedSetId",
    });
    this.version(4).stores({
      exercises: "id, name, type, updatedAt",
      equipment: "id, name",
      pendingWrites: "id, createdAt, entity",
      meta: "key",
      routines: "id, name, updatedAt",
      sessions: "id, status, startedAt, sourceRoutineId",
      sessionSetLogs: "id, sessionId, [exerciseId+loggedAt], [sessionId+performedExerciseId+order], plannedSetId",
      programs: "id, name, updatedAt",
      programDays: "id, programId, weekIndex, dayIndex",
      programRuns: "id, programId, status, startedAt",
      programRunDayStates: "id, programRunId, weekIndex, dayIndex",
    });
    this.version(5).stores({
      exercises: "id, name, type, updatedAt",
      equipment: "id, name",
      pendingWrites: "id, createdAt, entity",
      meta: "key",
      routines: "id, name, updatedAt",
      sessions: "id, status, startedAt, sourceRoutineId",
      sessionSetLogs: "id, sessionId, [exerciseId+loggedAt], [sessionId+performedExerciseId+order], plannedSetId",
      programs: "id, name, updatedAt",
      programDays: "id, programId, weekIndex, dayIndex",
      programRuns: "id, programId, status, startedAt",
      programRunDayStates: "id, programRunId, weekIndex, dayIndex",
      goals: "id, status, category, deadline, updatedAt, linkedExerciseId, linkedProgramRunId",
      settings: "id",
    });
    this.version(6).stores({
      exercises: "id, name, type, updatedAt",
      equipment: "id, name",
      pendingWrites: "id, createdAt, entity",
      meta: "key",
      routines: "id, name, updatedAt",
      sessions: "id, status, startedAt, sourceRoutineId",
      sessionSetLogs: "id, sessionId, [exerciseId+loggedAt], [sessionId+performedExerciseId+order], plannedSetId",
      programs: "id, name, updatedAt",
      programDays: "id, programId, weekIndex, dayIndex",
      programRuns: "id, programId, status, startedAt",
      programRunDayStates: "id, programRunId, weekIndex, dayIndex",
      goals: "id, status, category, deadline, updatedAt, linkedExerciseId, linkedProgramRunId",
      settings: "id",
    });
  }
}

export const forgeDB = new ForgeDB();
