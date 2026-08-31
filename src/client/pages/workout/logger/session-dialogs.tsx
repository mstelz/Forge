import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@radix-ui/react-dialog";

const OVERLAY = "fixed inset-0 z-40 bg-black/60";
const PANEL =
  "fixed left-1/2 top-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]";
const TITLE = "text-base font-semibold text-[var(--text)]";
const BODY = "mt-2 text-sm text-[var(--text-muted)]";
const ACTIONS = "mt-5 flex justify-end gap-2";
const CANCEL =
  "rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/** How many sets to add, asked after the picker returns an exercise. */
export function SetCountDialog({
  open,
  setCountInput,
  onSetCountInput,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  setCountInput: string;
  onSetCountInput: (value: string) => void;
  onCancel: () => void;
  onConfirm: (count: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogPortal>
        <DialogOverlay className={OVERLAY} />
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className={PANEL}>
          <DialogTitle className={TITLE}>How many sets?</DialogTitle>
          <DialogDescription className={BODY}>
            Choose the number of sets to add for this exercise.
          </DialogDescription>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onSetCountInput(String(Math.max(1, Number(setCountInput) - 1)))}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-xl font-bold text-[var(--text)] hover:bg-[var(--surface-raised-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={20}
              value={setCountInput}
              onChange={(e) => onSetCountInput(e.target.value)}
              className="w-16 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] py-2 text-center text-xl font-semibold text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => onSetCountInput(String(Math.min(20, Number(setCountInput) + 1)))}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-xl font-bold text-[var(--text)] hover:bg-[var(--surface-raised-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              +
            </button>
          </div>
          <div className={ACTIONS}>
            <button type="button" onClick={onCancel} className={CANCEL}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(Math.max(1, Math.min(20, Number(setCountInput) || 3)))}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Add
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

export function FinishWorkoutDialog({
  open,
  onOpenChange,
  finishing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finishing: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className={OVERLAY} />
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className={PANEL}>
          <DialogTitle className={TITLE}>Finish workout?</DialogTitle>
          <DialogDescription className={BODY}>
            This will end your session. This can't be undone.
          </DialogDescription>
          <div className={ACTIONS}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={finishing}
              className={CANCEL}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={finishing}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
            >
              {finishing ? "Finishing…" : "Finish"}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

/**
 * Discarding a live session deletes it; "discarding" a reopened finished session
 * just re-finishes it, so the wording and the danger styling both flip.
 */
export function DiscardWorkoutDialog({
  open,
  onOpenChange,
  isReopenEdit,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReopenEdit: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className={OVERLAY} />
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className={PANEL}>
          <DialogTitle className={TITLE}>
            {isReopenEdit ? "Stop editing?" : "Discard workout?"}
          </DialogTitle>
          <DialogDescription className={BODY}>
            {isReopenEdit
              ? "Any changes you made will be saved and you'll return to the session summary."
              : "All logged sets will be lost. This can't be undone."}
          </DialogDescription>
          <div className={ACTIONS}>
            <button type="button" onClick={() => onOpenChange(false)} className={CANCEL}>
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`rounded-full px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 ${isReopenEdit ? "bg-[var(--accent)] text-[var(--accent-fg)] focus-visible:ring-[var(--accent)]" : "bg-red-500 text-white focus-visible:ring-red-500"}`}
            >
              {isReopenEdit ? "Done editing" : "Discard"}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
