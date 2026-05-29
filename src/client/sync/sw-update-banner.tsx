import { useRegisterSW } from "virtual:pwa-register/react";

export function SWUpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-[10px] bg-[var(--accent)]/10 px-3 py-2 text-xs text-[var(--accent)] ring-1 ring-[var(--accent)]/30"
    >
      <span>New version available.</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] ring-1 ring-[var(--accent)]/40 hover:bg-[var(--accent)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        Reload
      </button>
    </div>
  );
}
