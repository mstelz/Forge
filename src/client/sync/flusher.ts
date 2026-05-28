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
  if (entity === "settings") return `${API_BASE}/settings`;
  if (entity === "exercise") return `${API_BASE}/exercises`;
  if (entity === "routine") return `${API_BASE}/routines`;
  if (entity === "session") return `${API_BASE}/sessions`;
  if (entity === "session_log") return `${API_BASE}/sessions`; // URL built in send()
  if (entity === "program") return `${API_BASE}/programs`;
  if (entity === "program_run") return `${API_BASE}/program-runs`;
  if (entity === "goal") return `${API_BASE}/goals`;
  return `${API_BASE}/equipment`;
};

const send = async (entry: PendingWrite): Promise<Response> => {
  // Settings always uses PATCH /api/v1/settings with no id in URL
  if (entry.entity === "settings") {
    return fetch(`${API_BASE}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.payload),
    });
  }

  // Session logs use nested URL: /sessions/:sessionId/logs[/:logId]
  if (entry.entity === "session_log") {
    const p = entry.payload as { id: string; sessionId: string };
    const logsBase = `${API_BASE}/sessions/${p.sessionId}/logs`;
    if (entry.op === "create") {
      return fetch(logsBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
    }
    if (entry.op === "update") {
      return fetch(`${logsBase}/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
    }
    return fetch(`${logsBase}/${p.id}`, { method: "DELETE" });
  }

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
    // Finished-session updates route to /finish, not PATCH
    if (entry.entity === "session") {
      const payload = entry.payload as { id: string; status?: string; endedAt?: number | null };
      if (payload.status === "finished") {
        return fetch(`${base}/${id}/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endedAt: payload.endedAt }),
        });
      }
    }
    return fetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.payload),
    });
  }
  return fetch(`${base}/${id}`, { method: "DELETE" });
};

const isSuccess = (entry: PendingWrite, status: number): boolean => {
  if (
    entry.entity === "session" &&
    entry.op === "update" &&
    (entry.payload as { status?: string }).status === "finished"
  ) {
    return status === 200 || status === 409 || status === 404;
  }
  if (entry.op === "create") return status === 201 || status === 409;
  if (entry.op === "update") return status === 200 || status === 404;
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

  if (isSuccess(entry, res.status)) {
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

/**
 * Coalesce multiple settings pending writes — keep only the one with the
 * highest createdAt so we don't send stale updates after rapid changes.
 */
async function coalesceSettings(): Promise<void> {
  const settingsWrites = await forgeDB.pendingWrites
    .where("entity")
    .equals("settings")
    .sortBy("createdAt");

  if (settingsWrites.length <= 1) return;

  // Delete all but the last (highest createdAt)
  const toDelete = settingsWrites.slice(0, settingsWrites.length - 1);
  for (const entry of toDelete) {
    await forgeDB.pendingWrites.delete(entry.id);
  }
}

export async function flushNow(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Coalesce settings writes before draining
    await coalesceSettings();

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
