import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { forgeDB } from "../db/forge-db";
import { flushNow } from "./flusher";
import { getSyncLogs } from "./sync-logger";
import type { PendingEntity } from "../../shared/pending-write";

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const ENTITY_LABELS: Record<PendingEntity, string> = {
  exercise: "Exercises",
  equipment: "Equipment",
  routine: "Routines",
  session: "Sessions",
  session_log: "Set Logs",
  session_times: "Session Times",
  program: "Programs",
  program_run: "Program Runs",
  goal: "Goals",
  settings: "Settings",
  profile: "Profile",
  weight_log: "Weight Logs",
};

export function SyncStatusSheet({ onClose }: { onClose: () => void }) {
  const [logs] = useState(() => getSyncLogs().slice().reverse());

  const data = useLiveQuery(async () => {
    const [pending, lastSyncRow, storagePersistRow, versionMismatchRow] = await Promise.all([
      forgeDB.pendingWrites.toArray(),
      forgeDB.meta.get("lastSyncAt"),
      forgeDB.meta.get("storagePersisted"),
      forgeDB.meta.get("versionMismatch"),
    ]);

    const byEntity = new Map<string, { pending: number; poisoned: number }>();
    for (const p of pending) {
      const key = p.entity;
      const cur = byEntity.get(key) ?? { pending: 0, poisoned: 0 };
      if (p.status === "poisoned") cur.poisoned++;
      else cur.pending++;
      byEntity.set(key, cur);
    }

    return {
      lastSyncAt: lastSyncRow ? Number(lastSyncRow.value) : null,
      storagePersisted: storagePersistRow?.value === "true",
      versionMismatch: versionMismatchRow?.value ?? null,
      totalPending: pending.filter((p) => p.status !== "poisoned").length,
      totalPoisoned: pending.filter((p) => p.status === "poisoned").length,
      byEntity: [...byEntity.entries()].filter(([, v]) => v.pending + v.poisoned > 0),
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sync status"
        className="relative w-full max-w-md rounded-t-[var(--radius-card)] bg-[var(--surface)] shadow-2xl ring-1 ring-[var(--border)] max-h-[80dvh] flex flex-col"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        </div>

        <div className="px-4 pb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text)]">Sync Status</h2>
          <button
            type="button"
            onClick={() => void flushNow()}
            className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] focus:outline-none"
          >
            Sync now
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-5">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Last sync"
              value={data?.lastSyncAt ? formatRelative(data.lastSyncAt) : "Never"}
            />
            <StatCard
              label="Queued"
              value={String(data?.totalPending ?? 0)}
              accent={data?.totalPending ? "warn" : undefined}
            />
            <StatCard
              label="Errors"
              value={String(data?.totalPoisoned ?? 0)}
              accent={data?.totalPoisoned ? "danger" : undefined}
            />
          </div>

          {/* Metadata */}
          <div className="space-y-1">
            <MetaRow
              label="Storage persisted"
              value={data?.storagePersisted ? "Yes" : "No"}
              warn={!data?.storagePersisted}
            />
            {data?.versionMismatch && (
              <MetaRow
                label="Requires app update"
                value={`v${data.versionMismatch}+`}
                warn
              />
            )}
          </div>

          {/* Per-entity breakdown */}
          {data && data.byEntity.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)] mb-2">Pending by entity</p>
              <div className="space-y-1 rounded-[var(--radius-card)] overflow-hidden">
                {data.byEntity.map(([entity, counts]) => (
                  <div
                    key={entity}
                    className="flex items-center justify-between bg-[var(--surface-elevated)] px-3 py-2"
                  >
                    <span className="text-xs text-[var(--text-muted)]">
                      {ENTITY_LABELS[entity as PendingEntity] ?? entity}
                    </span>
                    <div className="flex gap-2">
                      {counts.pending > 0 && (
                        <span className="text-xs font-semibold text-[var(--text-subtle)]">
                          {counts.pending} queued
                        </span>
                      )}
                      {counts.poisoned > 0 && (
                        <span className="text-xs font-semibold text-[var(--danger)]">
                          {counts.poisoned} error
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent log entries */}
          {logs.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)] mb-2">Recent activity</p>
              <div className="space-y-1">
                {logs.slice(0, 20).map((entry, i) => (
                  <div key={i} className="flex gap-2 text-[10px]">
                    <span className="shrink-0 text-[var(--text-subtle)]">{formatRelative(entry.at)}</span>
                    <span
                      className={
                        entry.level === "error"
                          ? "text-[var(--danger)]"
                          : entry.level === "warn"
                            ? "text-orange-400"
                            : "text-[var(--text-muted)]"
                      }
                    >
                      {entry.message}
                      {entry.detail ? ` — ${entry.detail}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "warn" | "danger";
}) {
  const valueClass =
    accent === "danger"
      ? "text-[var(--danger)]"
      : accent === "warn"
        ? "text-orange-400"
        : "text-[var(--text)]";
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-[var(--surface-elevated)] p-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">{label}</span>
      <span className={`text-base font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

function MetaRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] bg-[var(--surface-elevated)] px-3 py-2">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className={`text-xs font-semibold ${warn ? "text-orange-400" : "text-[var(--text-subtle)]"}`}>
        {value}
      </span>
    </div>
  );
}
