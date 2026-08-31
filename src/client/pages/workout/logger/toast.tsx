export function Toast({ message, type }: { message: string; type: "error" | "info" }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        "fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg",
        type === "error"
          ? "bg-[var(--danger)] text-white"
          : "bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--border)]",
      ].join(" ")}
    >
      {message}
    </div>
  );
}
