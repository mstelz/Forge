import { forgeDB } from "../db/forge-db";
import type { Exercise, Equipment, PendingWrite, Routine, Session, SessionSetLog, Program, ProgramRun, Profile, WeightLog } from "../../shared";
import type { Goal } from "../../shared/goals";
import { reconcileProgramRuns as reconcileProgramRunDayStates } from "./program-run-reconciler";
import { syncLog } from "./sync-logger";

const API_BASE = "/api/v1";
const RECONCILE_INTERVAL_MS = 5 * 60_000;

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
    const id = (r.payload as { id?: string }).id;
    if (id) map.set(id, r.op);
  }
  return map;
};

// Merge-only: upsert server rows that aren't blocked by a pending local write.
// Never deletes local rows — a reset/empty server should not wipe local data.

async function reconcileExercises(serverRows: Exercise[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "exercise");
  await forgeDB.transaction("rw", forgeDB.exercises, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      if (s.deletedAt) { await forgeDB.exercises.delete(s.id); continue; }
      await forgeDB.exercises.put(s);
    }
  });
}

async function reconcileEquipment(serverRows: Equipment[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "equipment");
  await forgeDB.transaction("rw", forgeDB.equipment, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      if (s.deletedAt) { await forgeDB.equipment.delete(s.id); continue; }
      await forgeDB.equipment.put(s);
    }
  });
}

async function reconcileRoutines(serverRows: Routine[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "routine");
  await forgeDB.transaction("rw", forgeDB.routines, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      if (s.deletedAt) { await forgeDB.routines.delete(s.id); continue; }
      await forgeDB.routines.put(s);
    }
  });
}

async function reconcileSessions(serverRows: Session[], pending: PendingWrite[]) {
  const pendingSessionIds = new Set<string>();
  for (const r of pending) {
    if (r.entity === "session") {
      const id = (r.payload as { id?: string }).id;
      if (id) pendingSessionIds.add(id);
    }
    if (r.entity === "session_log") {
      const sessionId = (r.payload as { sessionId?: string }).sessionId;
      if (sessionId) pendingSessionIds.add(sessionId);
    }
  }
  await forgeDB.transaction("rw", forgeDB.sessions, async () => {
    for (const s of serverRows) {
      if (pendingSessionIds.has(s.id)) continue;
      await forgeDB.sessions.put(s);
    }
  });
}

async function reconcileSessionLogs(serverLogs: SessionSetLog[], pending: PendingWrite[]) {
  const pendingLogIds = new Set<string>();
  for (const r of pending) {
    if (r.entity === "session_log") {
      const id = (r.payload as { id?: string }).id;
      if (id) pendingLogIds.add(id);
    }
  }
  await forgeDB.transaction("rw", forgeDB.sessionSetLogs, async () => {
    for (const log of serverLogs) {
      if (pendingLogIds.has(log.id)) continue;
      await forgeDB.sessionSetLogs.put(log);
    }
  });
}

async function reconcilePrograms(serverRows: Program[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "program");
  await forgeDB.transaction("rw", forgeDB.programs, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      if (s.deletedAt) { await forgeDB.programs.delete(s.id); continue; }
      await forgeDB.programs.put(s);
    }
  });
}

async function reconcileGoals(serverRows: Goal[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "goal");
  await forgeDB.transaction("rw", forgeDB.goals, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      if (s.deletedAt) { await forgeDB.goals.delete(s.id); continue; }
      await forgeDB.goals.put(s);
    }
  });
}

async function reconcileProgramRuns(serverRows: ProgramRun[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "program_run");
  await forgeDB.transaction("rw", forgeDB.programRuns, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      await forgeDB.programRuns.put(s);
    }
  });
}

async function reconcileProfiles(serverRows: Profile[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "profile");
  await forgeDB.transaction("rw", forgeDB.profiles, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      await forgeDB.profiles.put(s);
    }
  });
}

async function reconcileWeightLogs(serverRows: WeightLog[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "weight_log");
  await forgeDB.transaction("rw", forgeDB.weightLogs, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      await forgeDB.weightLogs.put(s);
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
    const sinceParam = since > 0 ? `?since=${since - 30_000}` : "";

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
    console.warn("[reconcile] failed", err);
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
