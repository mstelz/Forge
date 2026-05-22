import Dexie, { type Table } from "dexie";
import type { Exercise, Equipment, PendingWrite, Routine, Session, SessionSetLog } from "../../shared";

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
  }
}

export const forgeDB = new ForgeDB();
