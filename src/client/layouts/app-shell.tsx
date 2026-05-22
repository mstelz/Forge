import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { OfflinePill } from "../components/offline-pill";
import { FlusherTroubleBanner } from "../sync/flusher-banner";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-[var(--bg)]">
      <OfflinePill />
      {drawerOpen ? (
        <Drawer onClose={() => setDrawerOpen(false)} />
      ) : null}
      <FlusherTroubleBanner />
      <Outlet context={{ openDrawer: () => setDrawerOpen(true) }} />
    </div>
  );
}

export type AppShellOutletContext = { openDrawer: () => void };

const NAV_ITEMS: { to: string; label: string }[] = [
  { to: "/workout/start", label: "Workout" },
  { to: "/exercises", label: "Exercises" },
  { to: "/routines", label: "Routines" },
  { to: "/history", label: "History" },
  { to: "/equipment", label: "Equipment" },
];

function Drawer({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="absolute inset-y-0 left-0 w-64 bg-[var(--surface)] p-5"
        onClick={(e) => e.stopPropagation()}
        aria-label="Primary navigation"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Navigation
        </p>
        <nav className="mt-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  "block rounded-[10px] px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  isActive
                    ? "bg-[var(--surface-elevated)] text-[var(--text)] ring-1 ring-[var(--accent)]/40"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </div>
  );
}
