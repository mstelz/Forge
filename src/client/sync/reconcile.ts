import { type Table } from "dexie";
import { forgeDB } from "../db/forge-db";
import type { Exercise, Equipment, PendingWrite, Routine, Session, SessionSetLog, Program, ProgramRun, Profile, WeightLog } from "../../shared";
import type { Goal } from "../../shared/goals";
import { reconcileProgramRuns as reconcileProgramRunDayStates } from "./program-run-reconciler";
import { syncLog } from "./sync-logger";

const API_BASE = "/api/v1";
const RECONCILE_INTERVAL_MS = 5 * 60_000;
// Re-fetch a window of already-seen server changes on each `since` query. The
// server filters by `updatedAt >= since`, and writes that landed in the same
// millisecond as our last cursor — or arrived slightly out of order relative to
// clock skew between server and client — could otherwise be skipped forever.
// Overlapping the window by 30s trades a little redundant work for not missing
// rows at the boundary (merge is idempotent, so re-applying a row is harmless).
const RECONCILE_OVERLAP_MS = 30_000;

let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

// Returns null on any failure — callers skip reconcile for that entity rather than aborting.
const fetchSafe = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
};

const indexPending = (rows: PendingWrite[], entity: PendingWrite["entity"]) => {
  const map = new Map<string, PendingWrite["op"]>();
  for (const r of rows) {
    if (r.entity !== entity) continue;
    const id = r.payload.id;
    if (id) map.set(id, r.op);
  }
  return map;
};

// Merge-only: upsert server rows that aren't blocked by a pending local write.
// Never deletes local rows — a reset/empty server should not wipe local data.
// `softDelete` tables additionally honor a server-side `deletedAt` tombstone.
function makeReconciler<T extends { id: string; deletedAt?: number | null }>(
  table: Table<T, string>,
  entity: PendingWrite["entity"],
  opts: { softDelete: boolean },
) {
  return async (serverRows: T[], pending: PendingWrite[]) => {
    const pendingMap = indexPending(pending, entity);
    await forgeDB.transaction("rw", table, async () => {
      for (const s of serverRows) {
        if (pendingMap.has(s.id)) continue;
        if (opts.softDelete && s.deletedAt) { await table.delete(s.id); continue; }
        await table.put(s);
      }
    });
  };
}

const reconcileExercises = makeReconciler(forgeDB.exercises, "exercise", { softDelete: true });
const reconcileEquipment = makeReconciler(forgeDB.equipment, "equipment", { softDelete: true });
const reconcileRoutines = makeReconciler(forgeDB.routines, "routine", { softDelete: true });
const reconcilePrograms = makeReconciler(forgeDB.programs, "program", { softDelete: true });
const reconcileGoals = makeReconciler(forgeDB.goals, "goal", { softDelete: true });
const reconcileSessionLogs = makeReconciler(forgeDB.sessionSetLogs, "session_log", { softDelete: false });
const reconcileProgramRuns = makeReconciler(forgeDB.programRuns, "program_run", { softDelete: false });
const reconcileProfiles = makeReconciler(forgeDB.profiles, "profile", { softDelete: false });
const reconcileWeightLogs = makeReconciler(forgeDB.weightLogs, "weight_log", { softDelete: false });

// Sessions reconcile is bespoke: a pending session_log write also pins its
// parent session, so the pending set spans two entities.
async function reconcileSessions(serverRows: Session[], pending: PendingWrite[]) {
  const pendingSessionIds = new Set<string>();
  for (const r of pending) {
    if (r.entity === "session") {
      if (r.payload.id) pendingSessionIds.add(r.payload.id);
    }
    if (r.entity === "session_log") {
      if (r.payload.sessionId) pendingSessionIds.add(r.payload.sessionId);
    }
  }
  await forgeDB.transaction("rw", forgeDB.sessions, async () => {
    for (const s of serverRows) {
      if (pendingSessionIds.has(s.id)) continue;
      await forgeDB.sessions.put(s);
    }
  });
}

export async function reconcileNow(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  running = true;
  const startedAt = Date.now();
  syncLog({ level: "info", category: "reconcile", message: "cycle start" });
  try {
    const since = await getSince();
    const sinceParam = since > 0 ? `?since=${since - RECONCILE_OVERLAP_MS}` : "";

    const [exResp, eqResp, rtResp, sessResp, logsResp, progResp, runsResp, goalsResp, profileResp, wlResp, pending] = await Promise.all([
      fetchSafe<{ exercises: Exercise[] }>(`${API_BASE}/exercises${sinceParam}`),
      fetchSafe<{ equipment: Equipment[] }>(`${API_BASE}/equipment${sinceParam}`),
      fetchSafe<{ routines: Routine[] }>(`${API_BASE}/routines${sinceParam}`),
      fetchSafe<{ sessions: Session[] }>(`${API_BASE}/sessions${sinceParam}`),
      fetchSafe<{ logs: SessionSetLog[] }>(`${API_BASE}/sessions/logs${sinceParam}`),
      fetchSafe<{ programs: Program[] }>(`${API_BASE}/programs${sinceParam}`),
      fetchSafe<{ runs: ProgramRun[] }>(`${API_BASE}/program-runs${sinceParam}`),
      fetchSafe<{ goals: Goal[] }>(`${API_BASE}/goals${sinceParam}`),
      fetchSafe<{ profiles: Profile[] }>(`${API_BASE}/profile${sinceParam}`),
      fetchSafe<{ logs: WeightLog[] }>(`${API_BASE}/profile/weight-logs${sinceParam}`),
      forgeDB.pendingWrites.toArray(),
    ]);

    if (exResp) await reconcileExercises(exResp.exercises, pending);
    if (eqResp) await reconcileEquipment(eqResp.equipment, pending);
    if (rtResp) await reconcileRoutines(rtResp.routines, pending);
    if (sessResp) await reconcileSessions(sessResp.sessions, pending);
    if (logsResp) await reconcileSessionLogs(logsResp.logs, pending);
    if (progResp) await reconcilePrograms(progResp.programs, pending);
    if (runsResp) await reconcileProgramRuns(runsResp.runs, pending);
    if (goalsResp) await reconcileGoals(goalsResp.goals, pending);
    await reconcileProgramRunDayStates();
    if (profileResp) await reconcileProfiles(profileResp.profiles, pending);
    if (wlResp) await reconcileWeightLogs(wlResp.logs, pending);

    const now = Date.now();
    await forgeDB.meta.put({ key: "lastSyncAt", value: String(now), updatedAt: now });
    await forgeDB.meta.put({ key: "lastReconcileAt", value: String(now), updatedAt: now });
    syncLog({ level: "info", category: "reconcile", message: "cycle done", detail: `${now - startedAt}ms` });
  } catch (err) {
    syncLog({ level: "error", category: "reconcile", message: "cycle failed", detail: String(err) });
  } finally {
    running = false;
  }
}

async function getSince(): Promise<number> {
  const row = await forgeDB.meta.get("lastReconcileAt");
  if (!row) return 0;
  return Number(row.value) || 0;
}

export function installReconciliation(): void {
  if (intervalId) return;
  intervalId = setInterval(() => void reconcileNow(), RECONCILE_INTERVAL_MS);
  void reconcileNow();
}

export function uninstallReconciliation(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
