import { forgeDB } from "../db/forge-db";
import type { Exercise, Equipment, PendingWrite, Routine } from "../../shared";

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

export async function reconcileNow(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  running = true;
  try {
    const [exResp, eqResp, rtResp, pending] = await Promise.all([
      fetchJson<{ exercises: Exercise[] }>(`${API_BASE}/exercises`),
      fetchJson<{ equipment: Equipment[] }>(`${API_BASE}/equipment`),
      fetchJson<{ routines: Routine[] }>(`${API_BASE}/routines`),
      forgeDB.pendingWrites.toArray(),
    ]);
    await reconcileExercises(exResp.exercises, pending);
    await reconcileEquipment(eqResp.equipment, pending);
    await reconcileRoutines(rtResp.routines, pending);
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
