import { useEffect, useMemo, useRef } from "react";
import type { Equipment } from "../../../shared";
import { cn } from "../../lib/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  equipment: Equipment[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
};

export function EquipmentFilterSheet({
  open,
  onClose,
  equipment,
  selectedIds,
  onToggle,
  onClear,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sorted = useMemo(
    () => [...equipment].sort((a, b) => a.name.localeCompare(b.name)),
    [equipment],
  );

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Filter by equipment"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[var(--radius-card)] bg-[var(--surface)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Equipment
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            aria-label="Close equipment filter"
          >
            Done
          </button>
        </div>

        <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto">
          {sorted.map((eq) => {
            const checked = selectedIds.has(eq.id);
            return (
              <li key={eq.id}>
                <button
                  type="button"
                  onClick={() => onToggle(eq.id)}
                  aria-pressed={checked}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-sm transition-colors",
                    checked
                      ? "bg-[var(--accent)]/15 text-[var(--text)] ring-1 ring-[var(--accent)]/40"
                      : "bg-[var(--surface-elevated)] text-[var(--text)] hover:bg-[var(--surface-elevated)]/80",
                  )}
                >
                  <span>{eq.name}</span>
                  {checked ? <CheckIcon /> : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="text-xs uppercase tracking-wider text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
