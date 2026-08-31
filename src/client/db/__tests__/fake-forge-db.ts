/**
 * An in-memory stand-in for the Dexie database, good enough to run the *real*
 * mutation, undo and flusher code against.
 *
 * The point is to test the seam rather than the two sides of it: a delete goes
 * through the real `deleteExercise`, the undo through the real `restoreExercise`,
 * and the outbox is drained by the real `flushNow` — so an ordering mistake
 * between those three shows up as a wrong HTTP call, which is what a user would
 * actually notice.
 *
 * Only the surface those modules touch is implemented. It is not a Dexie clone:
 * `transaction` runs the body inline with no isolation or rollback.
 */

type Row = Record<string, unknown>;

class FakeTable<T extends Row> {
  private rows = new Map<string, T>();

  constructor(private readonly pk: string = "id") {}

  private key(record: T): string {
    return String(record[this.pk]);
  }

  private clone(record: T): T {
    return structuredClone(record);
  }

  async add(record: T): Promise<string> {
    const k = this.key(record);
    if (this.rows.has(k)) {
      throw new Error(`ConstraintError: key ${k} already exists`);
    }
    this.rows.set(k, this.clone(record));
    return k;
  }

  async put(record: T): Promise<string> {
    const k = this.key(record);
    this.rows.set(k, this.clone(record));
    return k;
  }

  async get(id: string): Promise<T | undefined> {
    const row = this.rows.get(id);
    return row ? this.clone(row) : undefined;
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async update(id: string, changes: Partial<T>): Promise<number> {
    const row = this.rows.get(id);
    if (!row) return 0;
    this.rows.set(id, { ...row, ...changes });
    return 1;
  }

  async toArray(): Promise<T[]> {
    return [...this.rows.values()].map((r) => this.clone(r));
  }

  async count(): Promise<number> {
    return this.rows.size;
  }

  orderBy(field: string) {
    return {
      toArray: async (): Promise<T[]> => sortBy(await this.toArray(), field),
    };
  }

  where(field: string) {
    return {
      equals: (value: unknown) => {
        const matching = async (): Promise<T[]> =>
          (await this.toArray()).filter((r) => r[field] === value);
        return {
          toArray: matching,
          sortBy: async (sortField: string): Promise<T[]> =>
            sortBy(await matching(), sortField),
          delete: async (): Promise<number> => {
            const doomed = await matching();
            for (const r of doomed) this.rows.delete(this.key(r));
            return doomed.length;
          },
        };
      },
    };
  }

  reset(): void {
    this.rows.clear();
  }
}

function sortBy<T extends Row>(rows: T[], field: string): T[] {
  return [...rows].sort((a, b) => {
    const av = a[field] as string | number;
    const bv = b[field] as string | number;
    if (av === bv) return 0;
    return av > bv ? 1 : -1;
  });
}

const TABLE_NAMES = [
  "exercises",
  "equipment",
  "routines",
  "programs",
  "programDays",
  "programRuns",
  "programRunDayStates",
  "goals",
  "sessions",
  "sessionSetLogs",
  "settings",
  "profiles",
  "weightLogs",
  "pendingWrites",
] as const;

export type FakeForgeDB = Record<(typeof TABLE_NAMES)[number], FakeTable<Row>> & {
  meta: FakeTable<Row>;
  transaction: (mode: string, ...args: unknown[]) => Promise<unknown>;
  __reset: () => void;
};

export function createFakeForgeDB(): FakeForgeDB {
  const tables = new Map<string, FakeTable<Row>>();
  for (const name of TABLE_NAMES) tables.set(name, new FakeTable<Row>());
  const meta = new FakeTable<Row>("key");

  const db = {
    meta,
    // Dexie's signature is transaction(mode, ...tables, body). The body is last.
    transaction: async (_mode: string, ...args: unknown[]) => {
      const body = args[args.length - 1] as () => unknown;
      return body();
    },
    __reset: () => {
      for (const t of tables.values()) t.reset();
      meta.reset();
    },
  } as FakeForgeDB;

  for (const [name, table] of tables) {
    (db as unknown as Record<string, unknown>)[name] = table;
  }

  return db;
}
