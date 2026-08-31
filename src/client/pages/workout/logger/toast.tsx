export type ToastType = "error" | "info" | "record";

const TOAST_STYLES: Record<ToastType, string> = {
  error: "bg-[var(--danger)] text-white",
  info: "bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--border)]",
  record: "bg-[var(--accent)] text-[var(--accent-fg)]",
};

export function Toast({ message, type }: { message: string; type: ToastType }) {
  return (
    <div
      role="alert"
      // A record is worth reading but not worth interrupting a set for, so it
      // announces politely; errors still cut in.
      aria-live={type === "error" ? "assertive" : "polite"}
      className={[
        "fixed left-1/2 top-4 z-[100] max-w-[92vw] -translate-x-1/2 rounded-xl px-4 py-2.5 text-center text-sm font-semibold shadow-lg",
        TOAST_STYLES[type],
      ].join(" ")}
    >
      {message}
    </div>
  );
}
