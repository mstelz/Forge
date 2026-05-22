import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@radix-ui/react-dialog";
import { forgeDB } from "../../db/forge-db";
import { createEquipment } from "../../db/mutations";
import type { Equipment } from "../../../shared";

import { uuidv4 } from "../../lib/uuid";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateEquipmentDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setError(null);
      setPending(false);
    }
  }, [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const lower = trimmed.toLowerCase();
      const all = await forgeDB.equipment.toArray();
      if (all.some((eq) => eq.name.trim().toLowerCase() === lower)) {
        setError("An equipment with that name already exists");
        setPending(false);
        return;
      }
      const now = Date.now();
      const record: Equipment = {
        id: uuidv4(),
        name: trimmed,
        createdAt: now,
        updatedAt: now,
      };
      await createEquipment(record);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add equipment");
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]">
          <DialogTitle className="text-base font-semibold text-[var(--text)]">
            Add equipment
          </DialogTitle>
          <form onSubmit={onSubmit} className="mt-3 space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
              placeholder="e.g. Trap Bar"
              aria-label="Equipment name"
              aria-invalid={!!error}
              className="w-full rounded-[10px] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            {error ? (
              <p className="text-xs text-[var(--danger)]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
              >
                {pending ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
