import { useEffect } from "react";
import { useBlocker } from "react-router";

type Props = {
  isDirty: boolean;
};

export function useDiscardGuard({ isDirty }: Props) {
  const blocker = useBlocker(isDirty);

  // Handle browser back / close
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  return blocker;
}

type DialogProps = {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
};

export function DiscardDialog({ open, onKeep, onDiscard }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKeep();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onKeep]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onKeep}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--surface-elevated)] p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="discard-title" className="text-base font-semibold text-[var(--text)]">
          Discard unsaved changes?
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Your changes will be lost if you leave without saving.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onKeep}
            className="rounded-md px-4 py-2 text-sm font-medium text-[var(--text)] bg-[var(--surface)] hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-md px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
