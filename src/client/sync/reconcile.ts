import { forgeDB } from "../db/forge-db";
import type { Exercise, Equipment, PendingWrite, Routine, Session, SessionSetLog, Program, ProgramRun } from "../../shared";

const API_BASE = "/api/v1";
const RECONCILE_INTERVAL_MS = 5 * 60_000;

let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
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

async function reconcileExercises(serverRows: Exercise[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "exercise");
  const localRows = await forgeDB.exercises.toArray();
  const serverIds = new Set(serverRows.map((r) => r.id));
  await forgeDB.transaction("rw", forgeDB.exercises, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      await forgeDB.exercises.put(s);
    }
    for (const l of localRows) {
      if (serverIds.has(l.id)) continue;
      if (pendingMap.get(l.id) === "create") continue;
      await forgeDB.exercises.delete(l.id);
    }
  });
}

async function reconcileEquipment(serverRows: Equipment[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "equipment");
  const localRows = await forgeDB.equipment.toArray();
  const serverIds = new Set(serverRows.map((r) => r.id));
  await forgeDB.transaction("rw", forgeDB.equipment, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      await forgeDB.equipment.put(s);
    }
    for (const l of localRows) {
      if (serverIds.has(l.id)) continue;
      if (pendingMap.get(l.id) === "create") continue;
      await forgeDB.equipment.delete(l.id);
    }
  });
}

async function reconcileRoutines(serverRows: Routine[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "routine");
  const localRows = await forgeDB.routines.toArray();
  const serverIds = new Set(serverRows.map((r) => r.id));
  await forgeDB.transaction("rw", forgeDB.routines, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      await forgeDB.routines.put(s);
    }
    for (const l of localRows) {
      if (serverIds.has(l.id)) continue;
      if (pendingMap.get(l.id) === "create") continue;
      await forgeDB.routines.delete(l.id);
    }
  });
}

async function reconcileSessions(serverRows: Session[], pending: PendingWrite[]) {
  // Build a set of sessionIds (and their child log sessionIds) that have pending writes.
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
      // Pending-wins: if any outbox entry exists for this session, keep local.
      if (pendingSessionIds.has(s.id)) continue;
      // Server is authoritative — upsert unconditionally.
      // For finished sessions this enforces immutability once the outbox drains.
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
  const localRows = await forgeDB.programs.toArray();
  const serverIds = new Set(serverRows.map((r) => r.id));
  await forgeDB.transaction("rw", forgeDB.programs, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      await forgeDB.programs.put(s);
    }
    for (const l of localRows) {
      if (serverIds.has(l.id)) continue;
      if (pendingMap.get(l.id) === "create") continue;
      await forgeDB.programs.delete(l.id);
    }
  });
}

async function reconcileProgramRuns(serverRows: ProgramRun[], pending: PendingWrite[]) {
  const pendingMap = indexPending(pending, "program_run");
  const localRows = await forgeDB.programRuns.toArray();
  const serverIds = new Set(serverRows.map((r) => r.id));
  await forgeDB.transaction("rw", forgeDB.programRuns, async () => {
    for (const s of serverRows) {
      if (pendingMap.has(s.id)) continue;
      await forgeDB.programRuns.put(s);
    }
    for (const l of localRows) {
      if (serverIds.has(l.id)) continue;
      if (pendingMap.get(l.id) === "create") continue;
      await forgeDB.programRuns.delete(l.id);
    }
  });
}

export async function reconcileNow(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  running = true;
  try {
    const [exResp, eqResp, rtResp, sessResp, logsResp, progResp, runsResp, pending] = await Promise.all([
      fetchJson<{ exercises: Exercise[] }>(`${API_BASE}/exercises`),
      fetchJson<{ equipment: Equipment[] }>(`${API_BASE}/equipment`),
      fetchJson<{ routines: Routine[] }>(`${API_BASE}/routines`),
      fetchJson<{ sessions: Session[] }>(`${API_BASE}/sessions`),
      fetchJson<{ logs: SessionSetLog[] }>(`${API_BASE}/sessions/logs`),
      fetchJson<{ programs: Program[] }>(`${API_BASE}/programs`),
      fetchJson<{ runs: ProgramRun[] }>(`${API_BASE}/program-runs`),
      forgeDB.pendingWrites.toArray(),
    ]);
    await reconcileExercises(exResp.exercises, pending);
    await reconcileEquipment(eqResp.equipment, pending);
    await reconcileRoutines(rtResp.routines, pending);
    await reconcileSessions(sessResp.sessions, pending);
    await reconcileSessionLogs(logsResp.logs, pending);
    await reconcilePrograms(progResp.programs, pending);
    await reconcileProgramRuns(runsResp.runs, pending);
  } catch (err) {
    console.warn("[reconcile] failed", err);
  } finally {
    running = false;
  }
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
