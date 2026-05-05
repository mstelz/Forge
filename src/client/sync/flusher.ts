import { forgeDB } from "../db/forge-db";
import type { PendingWrite } from "../../shared";

const API_BASE = "/api/v1";
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 32000, 60000];

type FlushListener = () => void;
const listeners = new Set<FlushListener>();
let running = false;

const notify = () => listeners.forEach((l) => l());

export const subscribe = (fn: FlushListener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const endpointFor = (entity: PendingWrite["entity"]) => {
  if (entity === "exercise") return `${API_BASE}/exercises`;
  if (entity === "routine") return `${API_BASE}/routines`;
  return `${API_BASE}/equipment`;
};

const send = async (entry: PendingWrite): Promise<Response> => {
  const base = endpointFor(entry.entity);
  if (entry.op === "create") {
    return fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.payload),
    });
  }
  const id = (entry.payload as { id: string }).id;
  if (entry.op === "update") {
    return fetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.payload),
    });
  }
  return fetch(`${base}/${id}`, { method: "DELETE" });
};

const isSuccess = (op: PendingWrite["op"], status: number) => {
  if (op === "create") return status === 201 || status === 409;
  if (op === "update") return status === 200 || status === 404;
  return status === 204 || status === 404;
};

const backoffFor = (retries: number) => {
  const idx = Math.min(Math.max(retries - 1, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[idx] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 60_000;
};

const isReady = (entry: PendingWrite, now: number) => {
  if (entry.retries === 0) return true;
  return now >= entry.createdAt + backoffFor(entry.retries);
};

const handle = async (entry: PendingWrite): Promise<"done" | "retry"> => {
  let res: Response;
  try {
    res = await send(entry);
  } catch (err) {
    await forgeDB.pendingWrites.update(entry.id, {
      retries: entry.retries + 1,
      lastError: (err as Error).message ?? "network_error",
    });
    return "retry";
  }

  if (isSuccess(entry.op, res.status)) {
    if (entry.op === "create" && res.status === 409) {
      console.warn(`[flusher] id_conflict on create ${entry.entity} ${entry.id}`);
    }
    await forgeDB.pendingWrites.delete(entry.id);
    return "done";
  }

  if (res.status >= 400 && res.status < 500) {
    const body = await res.text().catch(() => "");
    console.warn(`[flusher] dropping ${entry.op} ${entry.entity} ${entry.id}: ${res.status} ${body}`);
    await forgeDB.pendingWrites.delete(entry.id);
    return "done";
  }

  await forgeDB.pendingWrites.update(entry.id, {
    retries: entry.retries + 1,
    lastError: `http_${res.status}`,
  });
  return "retry";
};

export async function flushNow(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const queue = await forgeDB.pendingWrites.orderBy("createdAt").toArray();
    const now = Date.now();
    for (const entry of queue) {
      if (!isReady(entry, now)) continue;
      const result = await handle(entry);
      if (result === "retry") {
        // Stop draining this run on first retry to preserve FIFO and avoid
        // hammering the server when offline. Triggers will re-invoke later.
        break;
      }
    }
  } finally {
    running = false;
    notify();
  }
}

export const isFlushing = () => running;
