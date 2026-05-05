import Dexie, { type Table } from "dexie";
import type { Exercise, Equipment, PendingWrite, Routine } from "../../shared";

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
  }
}

export const forgeDB = new ForgeDB();
