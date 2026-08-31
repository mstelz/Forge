import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@radix-ui/react-dialog";
import { NavLink, Outlet } from "react-router";
import { OfflinePill } from "../components/offline-pill";
import { FlusherTroubleBanner } from "../sync/flusher-banner";
import { SWUpdateBanner } from "../sync/sw-update-banner";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "./nav-items";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Every screen renders its own hamburger, so the drawer has no Radix
  // DialogTrigger to hand focus back to on close. Remember whatever was focused
  // when it opened and restore that instead.
  const openerRef = useRef<HTMLElement | null>(null);

  const openDrawer = useCallback(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawerOpen(true);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-[var(--bg)]">
      <OfflinePill />
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        restoreFocusTo={openerRef}
      />
      <SWUpdateBanner />
      <FlusherTroubleBanner />
      <Outlet context={{ openDrawer }} />
    </div>
  );
}

export type AppShellOutletContext = { openDrawer: () => void };

const LINK_CLASSES = ({ isActive }: { isActive: boolean }) =>
  [
    "block rounded-[10px] px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
    isActive
      ? "bg-[var(--surface-elevated)] text-[var(--text)] ring-1 ring-[var(--accent)]/40"
      : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
  ].join(" ");

/**
 * Slide-out navigation. Built on Radix's Dialog so the panel gets a focus trap,
 * Escape-to-close, scroll lock, focus restoration to whichever hamburger opened it
 * and `aria-modal` — all of which the hand-rolled overlay this replaced lacked.
 */
function Drawer({
  open,
  onOpenChange,
  restoreFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restoreFocusTo: RefObject<HTMLElement | null>;
}) {
  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
        <DialogContent
          aria-describedby={undefined}
          // Radix marks the rest of the page aria-hidden and inert but does not
          // stamp aria-modal itself; say so explicitly for assistive tech.
          aria-modal="true"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocusTo.current?.focus();
          }}
          className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[var(--surface)] p-5 focus:outline-none"
        >
          <DialogTitle className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Navigation
          </DialogTitle>
          <nav className="mt-4 flex-1 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={close}
                className={LINK_CLASSES}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto space-y-1">
            <div className="mb-2 border-t border-[var(--border)]" />
            {SECONDARY_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={close}
                className={LINK_CLASSES}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
