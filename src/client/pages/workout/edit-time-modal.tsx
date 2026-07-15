import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@radix-ui/react-dialog";
import { updateSessionTimes } from "../../db/mutations";
import { queryKeys } from "../../db/query-keys";

function toDatetimeLocal(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): number {
  return new Date(s).getTime();
}

interface EditTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  initialStartedAt: number;
  initialEndedAt: number | null;
  onSuccess: (newEndedAt: number | null) => void;
}

export function EditTimeModal({
  isOpen,
  onClose,
  sessionId,
  initialStartedAt,
  initialEndedAt,
  onSuccess,
}: EditTimeModalProps) {
  const qc = useQueryClient();
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStartedAt(toDatetimeLocal(initialStartedAt));
      if (initialEndedAt != null) {
        setEndedAt(toDatetimeLocal(initialEndedAt));
      } else {
        setEndedAt("");
      }
    }
  }, [isOpen, initialStartedAt, initialEndedAt]);

  const handleSave = async () => {
    if (!startedAt) return;
    setSaving(true);
    try {
      const newStart = fromDatetimeLocal(startedAt);
      const newEnd = endedAt ? fromDatetimeLocal(endedAt) : null;
      
      await updateSessionTimes(sessionId, newStart, newEnd);
      qc.invalidateQueries({ queryKey: queryKeys.sessions.active() });
      onSuccess(newEnd);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[var(--surface)] p-5 shadow-xl">
          <DialogTitle className="mb-4 text-lg font-bold text-[var(--text)]">Edit Workout Time</DialogTitle>
          <DialogDescription className="sr-only">Edit the start and end time of this workout.</DialogDescription>
          
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Start Time
              </label>
              <input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            
            {initialEndedAt != null && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  End Time
                </label>
                <input
                  type="datetime-local"
                  value={endedAt}
                  onChange={(e) => setEndedAt(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-[var(--surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-[var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
