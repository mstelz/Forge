import { useLiveQuery } from "dexie-react-hooks";
import { forgeDB } from "../db/forge-db";
import { flushNow } from "./flusher";

const RETRY_THRESHOLD = 3;

export function FlusherTroubleBanner() {
  const trouble = useLiveQuery(async () => {
    const stuck = await forgeDB.pendingWrites
      .filter((p) => p.retries > RETRY_THRESHOLD)
      .toArray();
    return stuck.length;
  }, []);

  if (!trouble || trouble === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-[10px] bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)] ring-1 ring-[var(--danger)]/30"
    >
      <span>
        {trouble} change{trouble === 1 ? "" : "s"} could not sync. Will retry automatically.
      </span>
      <button
        type="button"
        onClick={() => void flushNow()}
        className="rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--danger)] ring-1 ring-[var(--danger)]/40 hover:bg-[var(--danger)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]"
      >
        Retry now
      </button>
    </div>
  );
}
