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
  title: string;
  description?: string;
  /** Says what will happen, e.g. "Replace week" — never just "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void;
};

/**
 * In-app replacement for window.confirm — themed, non-blocking, and able to
 * name the action on its own button instead of offering a bare OK.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  pending,
  onConfirm,
}: Props) {
  const confirmClasses =
    tone === "danger"
      ? "bg-[var(--danger)] text-white focus-visible:ring-[var(--danger)]"
      : "bg-[var(--accent)] text-[var(--accent-fg)] focus-visible:ring-[var(--accent)]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]">
          <DialogTitle className="text-base font-semibold text-[var(--text)]">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="mt-2 text-sm text-[var(--text-muted)]">
              {description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className={`rounded-full px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:opacity-60 ${confirmClasses}`}
            >
              {confirmLabel}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
