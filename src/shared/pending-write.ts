import { z } from "zod";
import type { Exercise } from "./exercise";
import type { Equipment } from "./equipment";
import type { Routine } from "./routine";
import type { Session } from "./session";
import type { SessionSetLog } from "./session-log";
import type { Program } from "./program";
import type { ProgramRun } from "./program-run";
import type { Goal } from "./goals";
import type { Settings } from "./settings";
import type { Profile, WeightLog } from "./profile";

export const PendingEntityEnum = z.enum(["exercise", "equipment", "routine", "session", "session_log", "session_times", "program", "program_run", "goal", "settings", "profile", "weight_log"]);
export type PendingEntity = z.infer<typeof PendingEntityEnum>;

export const PendingOpEnum = z.enum(["create", "update", "delete"]);
export type PendingOp = z.infer<typeof PendingOpEnum>;

export const PendingStatusEnum = z.enum(["pending", "poisoned"]);
export type PendingStatus = z.infer<typeof PendingStatusEnum>;

/**
 * Runtime/storage schema. `payload` stays `unknown` here because the outbox is
 * persisted in IndexedDB and validated on the server with a loose shape; the
 * precise per-entity payload types live in the `PendingWrite` discriminated
 * union below, which is what client code consumes.
 */
export const PendingWriteSchema = z.object({
  id: z.string().uuid(),
  entity: PendingEntityEnum,
  op: PendingOpEnum,
  payload: z.unknown(),
  createdAt: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative().default(0),
  lastError: z.string().nullable().optional(),
  lastAttemptAt: z.number().int().nonnegative().optional(),
  status: PendingStatusEnum.default("pending"),
});

/** Fields shared by every pending-write variant (everything except entity/op/payload). */
export interface PendingWriteBase {
  id: string;
  createdAt: number;
  retries: number;
  lastError?: string | null;
  lastAttemptAt?: number;
  status: PendingStatus;
}

/**
 * Per-entity payload shapes. `mutate` is the create/update payload (the full
 * domain record); `del` is the delete payload (id plus any keys the nested REST
 * route needs). `never` marks ops an entity never enqueues.
 */
interface PendingPayloadMap {
  exercise: { mutate: Exercise; del: { id: string } };
  equipment: { mutate: Equipment; del: { id: string } };
  routine: { mutate: Routine; del: { id: string } };
  session: { mutate: Session; del: { id: string } };
  session_log: { mutate: SessionSetLog; del: { id: string; sessionId: string } };
  session_times: { mutate: { id: string; startedAt: number; endedAt: number | null }; del: never };
  program: { mutate: Program; del: { id: string } };
  program_run: { mutate: ProgramRun; del: { id: string } };
  goal: { mutate: Goal; del: { id: string } };
  settings: { mutate: Settings; del: never };
  profile: { mutate: Profile; del: { id: string } };
  weight_log: { mutate: WeightLog; del: { id: string; profileId: string } };
}

type MutateWrite<E extends PendingEntity> = PendingWriteBase & {
  entity: E;
  op: "create" | "update";
  payload: PendingPayloadMap[E]["mutate"];
};

type DeleteWrite<E extends PendingEntity> = PendingPayloadMap[E]["del"] extends never
  ? never
  : PendingWriteBase & {
      entity: E;
      op: "delete";
      payload: PendingPayloadMap[E]["del"];
    };

type PendingWriteFor<E extends PendingEntity> = MutateWrite<E> | DeleteWrite<E>;

/** Discriminated union of every pending write, keyed by `entity` + `op`. */
export type PendingWrite = { [E in PendingEntity]: PendingWriteFor<E> }[PendingEntity];

/** Per-item result returned by the batch `POST /sync` endpoint. */
export const BatchResultSchema = z.object({
  id: z.string(),
  status: z.enum(["ok", "conflict", "error"]),
  code: z.number().int().optional(),
  detail: z.string().optional(),
});
export type BatchResult = z.infer<typeof BatchResultSchema>;

export const BatchResponseSchema = z.object({
  results: z.array(BatchResultSchema),
});
