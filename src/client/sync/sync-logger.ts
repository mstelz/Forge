export type SyncLogLevel = "info" | "warn" | "error";
export type SyncLogCategory = "flush" | "reconcile" | "sw" | "app";

export type SyncLogEntry = {
  at: number;
  level: SyncLogLevel;
  category: SyncLogCategory;
  message: string;
  detail?: string;
};

const MAX_ENTRIES = 100;
const ring: SyncLogEntry[] = [];

export function syncLog(entry: Omit<SyncLogEntry, "at">): void {
  ring.push({ ...entry, at: Date.now() });
  if (ring.length > MAX_ENTRIES) ring.shift();
}

export function getSyncLogs(): SyncLogEntry[] {
  return [...ring];
}

export function clearSyncLogs(): void {
  ring.length = 0;
}
