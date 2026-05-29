import { useLiveQuery } from "dexie-react-hooks";
import { forgeDB } from "../db/forge-db";
import { flushNow } from "./flusher";

const RETRY_THRESHOLD = 3;

export function FlusherTroubleBanner() {
  const { stuck, poisoned, versionMismatch } = useLiveQuery(async () => {
    const all = await forgeDB.pendingWrites.toArray();
    const vmRow = await forgeDB.meta.get("versionMismatch");
    return {
      stuck: all.filter((p) => p.status !== "poisoned" && p.retries > RETRY_THRESHOLD),
      poisoned: all.filter((p) => p.status === "poisoned"),
      versionMismatch: vmRow?.value ?? null,
    };
  }, []) ?? { stuck: [], poisoned: [], versionMismatch: null };

  const handleDiscard = async (id: string) => {
    await forgeDB.pendingWrites.delete(id);
  };

  if (stuck.length === 0 && poisoned.length === 0 && !versionMismatch) return null;

  return (
    <div className="mx-4 mt-2 space-y-2">
      {versionMismatch && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-[10px] bg-blue-500/10 px-3 py-2 text-xs text-blue-400 ring-1 ring-blue-500/30"
        >
          <span>App update required (v{versionMismatch}+). Reload to get the latest.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-400 ring-1 ring-blue-500/40 hover:bg-blue-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Reload
          </button>
        </div>
      )}
      {stuck.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-[10px] bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)] ring-1 ring-[var(--danger)]/30"
        >
          <span>
            {stuck.length} change{stuck.length === 1 ? "" : "s"} could not sync. Will retry automatically.
          </span>
          <button
            type="button"
            onClick={() => void flushNow()}
            className="rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--danger)] ring-1 ring-[var(--danger)]/40 hover:bg-[var(--danger)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]"
          >
            Retry now
          </button>
        </div>
      )}
      {poisoned.map((p) => (
        <div
          key={p.id}
          role="alert"
          className="flex items-start justify-between gap-3 rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-400 ring-1 ring-orange-500/30"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold">Sync error ({p.entity} {p.op})</span>
            {p.lastError && (
              <span className="truncate text-[10px] opacity-70">{p.lastError}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleDiscard(p.id)}
            className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-orange-400 ring-1 ring-orange-500/40 hover:bg-orange-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            Discard
          </button>
        </div>
      ))}
    </div>
  );
}
