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
  mirrorToConsole(entry);
}

// Single logging path: every structured entry is also surfaced to the browser
// console so devtools stays useful. error/warn map to their console levels;
// info maps to console.debug to avoid flooding the default console view (it is
// still captured in the ring buffer and the in-app Sync Status sheet).
function mirrorToConsole(entry: Omit<SyncLogEntry, "at">): void {
  const prefix = `[forge:${entry.category}]`;
  const args = entry.detail !== undefined ? [prefix, entry.message, entry.detail] : [prefix, entry.message];
  if (entry.level === "error") console.error(...args);
  else if (entry.level === "warn") console.warn(...args);
  else console.debug(...args);
}

export function getSyncLogs(): SyncLogEntry[] {
  return [...ring];
}

export function clearSyncLogs(): void {
  ring.length = 0;
}
