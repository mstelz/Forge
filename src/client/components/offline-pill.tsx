import { useEffect, useState } from "react";

export function OfflinePill() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] ring-1 ring-[var(--border-strong)] shadow-md"
    >
      Offline
    </div>
  );
}
