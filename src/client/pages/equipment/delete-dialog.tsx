import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@radix-ui/react-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentName: string;
  referenceCount: number;
  onConfirm: () => void;
  pending?: boolean;
};

export function DeleteEquipmentDialog({
  open,
  onOpenChange,
  equipmentName,
  referenceCount,
  onConfirm,
  pending,
}: Props) {
  const message =
    referenceCount > 0
      ? `${referenceCount} ${referenceCount === 1 ? "exercise references" : "exercises reference"} this equipment. Delete anyway? This will remove the reference from those exercises.`
      : `"${equipmentName}" will be removed. This cannot be undone.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]">
          <DialogTitle className="text-base font-semibold text-[var(--text)]">
            Delete equipment?
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-[var(--text-muted)]">
            {message}
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-full bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
