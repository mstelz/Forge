import { forgeDB } from "../db/forge-db";
import type { PendingWrite } from "../../shared";
import { BatchResponseSchema } from "../../shared/pending-write";
import { APP_VERSION } from "../../shared/version";
import { syncLog } from "./sync-logger";

const API_BASE = "/api/v1";
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 32000, 60000];

const vfetch = (url: string, init: RequestInit = {}): Promise<Response> =>
  fetch(url, {
    ...init,
    headers: { "X-App-Version": APP_VERSION, ...(init.headers as Record<string, string> | undefined) },
  });

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
  if (entity === "session_times") return `${API_BASE}/sessions`; // URL built in send()
  if (entity === "program") return `${API_BASE}/programs`;
  if (entity === "program_run") return `${API_BASE}/program-runs`;
  if (entity === "goal") return `${API_BASE}/goals`;
  if (entity === "profile") return `${API_BASE}/profile`;
  return `${API_BASE}/equipment`;
};

const send = async (entry: PendingWrite): Promise<Response> => {
  // Settings always uses PATCH /api/v1/settings with no id in URL
  if (entry.entity === "settings") {
    return vfetch(`${API_BASE}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.payload),
    });
  }

  // Session times edit: PATCH /sessions/:id/times
  if (entry.entity === "session_times") {
    const p = entry.payload;
    return vfetch(`${API_BASE}/sessions/${p.id}/times`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startedAt: p.startedAt, endedAt: p.endedAt }),
    });
  }

  // Weight logs use nested URL: /profile/:profileId/weight-logs[/:logId]
  if (entry.entity === "weight_log") {
    const p = entry.payload;
    const logsBase = `${API_BASE}/profile/${p.profileId}/weight-logs`;
    if (entry.op === "create") {
      return vfetch(logsBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
    }
    return vfetch(`${logsBase}/${p.id}`, { method: "DELETE" });
  }

  // Session logs use nested URL: /sessions/:sessionId/logs[/:logId]
  if (entry.entity === "session_log") {
    const p = entry.payload;
    const logsBase = `${API_BASE}/sessions/${p.sessionId}/logs`;
    if (entry.op === "create") {
      return vfetch(logsBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
    }
    if (entry.op === "update") {
      return vfetch(`${logsBase}/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
    }
    return vfetch(`${logsBase}/${p.id}`, { method: "DELETE" });
  }

  const base = endpointFor(entry.entity);
  if (entry.op === "create") {
    return vfetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.payload),
    });
  }
  const id = entry.payload.id;
  if (entry.op === "update") {
    // Finished-session updates route to /finish, not PATCH
    if (entry.entity === "session") {
      const payload = entry.payload;
      if (payload.status === "finished") {
        return vfetch(`${base}/${id}/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endedAt: payload.endedAt }),
        });
      }
    }
    return vfetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.payload),
    });
  }
  return vfetch(`${base}/${id}`, { method: "DELETE" });
};

const isSuccess = (entry: PendingWrite, status: number): boolean => {
  if (
    entry.entity === "session" &&
    entry.op === "update" &&
    entry.payload.status === "finished"
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
  if (entry.status === "poisoned") return false;
  if (entry.retries === 0) return true;
  const ref = entry.lastAttemptAt ?? entry.createdAt;
  return now >= ref + backoffFor(entry.retries);
};

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function checkVersionMismatch(res: Response): Promise<void> {
  const minVersion = res.headers.get("X-Min-App-Version");
  if (!minVersion) return;
  if (compareVersions(APP_VERSION, minVersion) < 0) {
    const now = Date.now();
    await forgeDB.meta.put({ key: "versionMismatch", value: minVersion, updatedAt: now });
  } else {
    await forgeDB.meta.delete("versionMismatch");
  }
}

const handle = async (entry: PendingWrite): Promise<"done" | "retry"> => {
  let res: Response;
  try {
    res = await send(entry);
  } catch (err) {
    const msg = (err as Error).message ?? "network_error";
    syncLog({ level: "warn", category: "flush", message: `network error ${entry.entity} ${entry.op}`, detail: msg });
    await forgeDB.pendingWrites.update(entry.id, {
      retries: entry.retries + 1,
      lastError: msg,
      lastAttemptAt: Date.now(),
    });
    return "retry";
  }

  void checkVersionMismatch(res);

  if (isSuccess(entry, res.status)) {
    if (entry.op === "create" && res.status === 409) {
      console.warn(`[flusher] id_conflict on create ${entry.entity} ${entry.id}`);
      syncLog({ level: "warn", category: "flush", message: `id_conflict ${entry.entity}`, detail: entry.id });
    } else {
      syncLog({ level: "info", category: "flush", message: `ok ${entry.entity} ${entry.op}` });
    }
    await forgeDB.pendingWrites.delete(entry.id);
    return "done";
  }

  if (res.status >= 400 && res.status < 500) {
    const body = await res.text().catch(() => "");
    const label = res.status === 401 ? "auth_error" : `http_${res.status}`;
    const detail = `${label}: ${body}`.trim();
    console.warn(`[flusher] poisoning ${entry.op} ${entry.entity} ${entry.id}: ${res.status} ${body}`);
    syncLog({ level: "error", category: "flush", message: `poisoned ${entry.entity} ${entry.op}`, detail });
    await forgeDB.pendingWrites.update(entry.id, {
      status: "poisoned",
      lastError: detail,
      lastAttemptAt: Date.now(),
    });
    return "done";
  }

  syncLog({ level: "warn", category: "flush", message: `retry ${entry.entity} ${entry.op}`, detail: `http_${res.status}` });
  await forgeDB.pendingWrites.update(entry.id, {
    retries: entry.retries + 1,
    lastError: `http_${res.status}`,
    lastAttemptAt: Date.now(),
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

async function coalesceProfile(): Promise<void> {
  const allProfileWrites = await forgeDB.pendingWrites
    .where("entity")
    .equals("profile")
    .sortBy("createdAt");

  // Group updates by profile id; keep only the newest update per id
  const updatesByProfileId = new Map<string, typeof allProfileWrites>();
  for (const w of allProfileWrites) {
    if (w.op !== "update") continue;
    const id = w.payload.id;
    if (!updatesByProfileId.has(id)) updatesByProfileId.set(id, []);
    updatesByProfileId.get(id)!.push(w);
  }
  for (const writes of updatesByProfileId.values()) {
    if (writes.length <= 1) continue;
    const toDelete = writes.slice(0, writes.length - 1);
    for (const w of toDelete) await forgeDB.pendingWrites.delete(w.id);
  }
}

// Entities the batch endpoint can handle. Others fall back to single-item flush.
const BATCH_ENTITIES = new Set<PendingWrite["entity"]>([
  "exercise", "equipment", "goal", "settings", "profile", "weight_log",
  "session_log", "session", "program_run",
]);

async function tryBatchFlush(entries: PendingWrite[]): Promise<boolean> {
  const batchable = entries.filter((e) => BATCH_ENTITIES.has(e.entity));
  if (batchable.length === 0) return false;
  try {
    const res = await vfetch(`${API_BASE}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: batchable }),
    });
    if (res.status === 404) return false; // server doesn't have batch endpoint yet
    void checkVersionMismatch(res);
    if (!res.ok) return false;
    const parsed = BatchResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      syncLog({ level: "error", category: "flush", message: "batch response failed validation", detail: parsed.error.message });
      return false;
    }
    const { results } = parsed.data;
    const now = Date.now();
    for (const r of results) {
      const entry = batchable.find((e) => e.id === r.id);
      if (!entry) continue;
      if (r.status === "ok" || r.status === "conflict") {
        syncLog({ level: "info", category: "flush", message: `batch ok ${entry.entity} ${entry.op}` });
        await forgeDB.pendingWrites.delete(entry.id);
      } else if (r.detail === "not_in_batch") {
        // Server doesn't handle this entity in batch; will be handled by single-item loop
      } else {
        syncLog({ level: "error", category: "flush", message: `batch error ${entry.entity}`, detail: r.detail });
        await forgeDB.pendingWrites.update(entry.id, {
          status: "poisoned",
          lastError: r.detail ?? "batch_error",
          lastAttemptAt: now,
        });
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function flushNow(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  running = true;
  try {
    // Coalesce settings and profile writes before draining
    await coalesceSettings();
    await coalesceProfile();

    const queue = await forgeDB.pendingWrites.orderBy("createdAt").toArray();
    const now = Date.now();
    const ready = queue.filter((e) => isReady(e, now));

    // Try batch flush first; fall back to per-item for anything it doesn't cover
    const batchSucceeded = ready.length > 0 && await tryBatchFlush(ready);

    if (batchSucceeded) {
      // Re-fetch queue in case batch cleared some but not all (routines, programs, session_times)
      const remaining = await forgeDB.pendingWrites.orderBy("createdAt").toArray();
      const nowAfter = Date.now();
      for (const entry of remaining) {
        if (!isReady(entry, nowAfter)) continue;
        if (BATCH_ENTITIES.has(entry.entity)) continue; // already handled
        const result = await handle(entry);
        if (result === "retry") break;
      }
    } else {
      for (const entry of queue) {
        if (!isReady(entry, now)) continue;
        const result = await handle(entry);
        if (result === "retry") {
          // Stop draining this run on first retry to preserve FIFO and avoid
          // hammering the server when offline. Triggers will re-invoke later.
          break;
        }
      }
    }
  } finally {
    running = false;
    notify();
  }
}

export const isFlushing = () => running;
