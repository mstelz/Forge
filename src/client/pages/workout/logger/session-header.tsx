import { useState } from "react";
import { BackIcon, KebabIcon } from "../icons";

interface OverflowMenuProps {
  onFinish: () => void;
  onDiscard: () => void;
  onEditStructure: () => void;
  onEditTime?: () => void;
  onPauseAndLeave: () => void;
  isReopenEdit?: boolean;
}

export function OverflowMenu({ onFinish, onDiscard, onEditStructure, onEditTime, onPauseAndLeave, isReopenEdit }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More options"
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <KebabIcon />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <div
            role="menu"
            aria-label="Workout options"
            className="absolute right-0 z-50 mt-1 w-48 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onEditStructure(); }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
            >
              Edit workout
            </button>
            {isReopenEdit && onEditTime && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onEditTime(); }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
              >
                Edit time
              </button>
            )}
            {!isReopenEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onPauseAndLeave(); }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
              >
                Pause and leave
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onFinish(); }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
            >
              Finish Workout
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onDiscard(); }}
              className={`flex w-full items-center px-4 py-2.5 text-sm hover:bg-[var(--surface-elevated)] ${isReopenEdit ? "text-[var(--text-muted)]" : "text-red-500"}`}
            >
              {isReopenEdit ? "Stop editing" : "Discard Workout"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export interface SessionHeaderProps extends OverflowMenuProps {
  headerLabel: string;
  onBack: () => void;
}

export function SessionHeader({ headerLabel, onBack, ...menu }: SessionHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <BackIcon />
      </button>
      <h1 className="text-sm font-semibold text-[var(--text)]">{headerLabel}</h1>
      <OverflowMenu {...menu} />
    </header>
  );
}

export function PageSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-[var(--surface)]" />
        <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface)]" />
        <div className="h-8 w-8 animate-pulse rounded-lg bg-[var(--surface)]" />
      </div>
      <div className="flex-1 space-y-4 px-4 py-4">
        <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" />
        <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" />
      </div>
    </div>
  );
}
