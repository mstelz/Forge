import { useContext, useRef, useState } from "react";
import { useOutletContext } from "react-router";
import { ChevronRight } from "lucide-react";
import { SettingsContext } from "../../contexts/settings-context";
import { updateSettings } from "../../db/mutations";
import { setTheme } from "../../lib/theme";
import { triggerExport } from "../../export/trigger";
import { importFromJson } from "../../export/import";
import { forgeDB } from "../../db/forge-db";
import { deviceTimeZone } from "../../lib/zoned-date";
import { useToast } from "../../components/toast";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { SyncStatusSheet } from "../../sync/sync-status-sheet";
import type { AppShellOutletContext } from "../../layouts/app-shell";
import type { Settings } from "../../../shared/settings";
import type { Theme } from "../../lib/theme";
import {
  DISTANCE_UNIT_SEGMENTS,
  HEIGHT_UNIT_SEGMENTS,
  THEME_SEGMENTS,
  WEEK_START_SEGMENTS,
  WEIGHT_UNIT_SEGMENTS,
} from "./segments";
import type { SegmentOption } from "./segments";

// ─── Icons ────────────────────────────────────────────────────────────────────

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="16" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="2" y="9.25" width="16" height="1.5" rx="0.75" fill="currentColor" />
      <rect x="2" y="13.5" width="16" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}

// ─── Segmented Control ────────────────────────────────────────────────────────

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  /** The stored value, passed straight through — never coerced on the way in. */
  value: T;
  onChange: (value: T) => void;
  label: string;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>) {
  return (
    <div
      className="flex items-center rounded-full bg-[var(--border)] p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors min-h-[28px]",
              isActive
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] min-w-[48px]",
        checked ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="px-4 pt-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)]">
      {label}
    </p>
  );
}

// ─── Settings Row ─────────────────────────────────────────────────────────────

function SettingsRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] last:border-b-0">
      {children}
    </div>
  );
}

function SettingsLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-sm font-medium text-[var(--text)]">{children}</span>
  );
}

// ─── IANA Timezone list (common zones) ────────────────────────────────────────

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Warsaw",
  "Europe/Prague",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/Brussels",
  "Europe/Budapest",
  "Europe/Bucharest",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Europe/Kiev",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Jakarta",
  "Asia/Taipei",
  "Asia/Kuala_Lumpur",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "Pacific/Fiji",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "UTC",
];

/** The common list, plus this device's zone and any saved zone not already in it. */
function timezoneOptions(current: string): string[] {
  const seen = new Set(TIMEZONES);
  const extras = [deviceTimeZone(), current].filter((tz) => tz && !seen.has(tz));
  return [...new Set([...extras, ...TIMEZONES])];
}

// ─── Reset copy ───────────────────────────────────────────────────────────────

/**
 * Deliberately does not promise permanence. Reset drops the local Dexie database
 * and nothing else: the outbox and the `lastReconcileAt` cursor live inside that
 * database, so the deletion is never pushed, and the reconcile pass on the reload
 * that follows requests every collection with no cursor and writes the server's
 * rows straight back (src/client/sync/reconcile.ts). Verified end to end against a
 * live server — a logged set and a changed unit both came back within seconds.
 */
const RESET_DESCRIPTION =
  "Clears Forge's local database on this device. Anything already synced comes " +
  "back from the server as soon as the app reloads, so this rebuilds a broken " +
  "local copy rather than erasing your history. Changes still waiting to sync " +
  "are lost.";

// ─── Settings Page ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const settings = useContext(SettingsContext);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSyncStatus, setShowSyncStatus] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const deviceZone = deviceTimeZone();
  const toast = useToast();

  const save = (patch: Partial<Settings>) => {
    void updateSettings({ ...settings, ...patch, updatedAt: Date.now() });
  };

  const handleThemeChange = (theme: Settings["theme"]) => {
    setTheme(theme as Theme);
    save({ theme });
  };

  const handleExport = async () => {
    const result = await triggerExport();
    if (!result.ok) {
      toast("Export failed", { tone: "error", detail: result.error });
    } else {
      toast("Workout data exported", { tone: "success" });
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importFromJson(text);
      if (!result.ok) {
        toast("Import failed", { tone: "error", detail: result.error });
      } else {
        const summary = Object.entries(result.counts)
          .map(([k, v]) => `${v} ${k}`)
          .join(", ");
        toast("Import complete", { tone: "success", detail: summary || undefined });
        // Let the toast land before the reload wipes it.
        setTimeout(() => window.location.reload(), 900);
      }
    } catch (err) {
      toast("Import failed", {
        tone: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handleResetConfirm = async () => {
    setResetting(true);
    try {
      // Close the open connection before deleting so IndexedDB doesn't block.
      forgeDB.close();
      await forgeDB.delete();
      window.location.reload();
    } catch {
      setResetting(false);
      setShowResetConfirm(false);
      toast("Reset failed — try again.", { tone: "error" });
    }
  };

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={openDrawer}
          aria-label="Open navigation"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <HamburgerIcon />
        </button>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Settings
        </h1>
        {/* Spacer to center the title */}
        <div className="w-9" />
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-16">

        {/* ─── PROFILE (omitted in v1 — noisy with placeholder values) ─── */}
        {/* Profile section is not functional in v1; omitted to avoid placeholder noise. */}

        {/* ─── UNITS & DISPLAY ─── */}
        <SectionHeader label="UNITS & DISPLAY" />
        <div className="rounded-[var(--radius-card)] overflow-hidden mx-4">
          <SettingsRow>
            <SettingsLabel>Weight</SettingsLabel>
            <SegmentedControl
              label="Weight unit"
              options={WEIGHT_UNIT_SEGMENTS}
              value={settings.weightUnit}
              onChange={(v) => save({ weightUnit: v })}
            />
          </SettingsRow>

          <SettingsRow>
            <SettingsLabel>Distance</SettingsLabel>
            <SegmentedControl
              label="Distance unit"
              options={DISTANCE_UNIT_SEGMENTS}
              value={settings.distanceUnit}
              onChange={(v) => save({ distanceUnit: v })}
            />
          </SettingsRow>

          <SettingsRow>
            <SettingsLabel>Height</SettingsLabel>
            <SegmentedControl
              label="Height unit"
              options={HEIGHT_UNIT_SEGMENTS}
              value={settings.heightUnit}
              onChange={(v) => save({ heightUnit: v })}
            />
          </SettingsRow>

          <SettingsRow>
            <SettingsLabel>Theme</SettingsLabel>
            <SegmentedControl
              label="Theme"
              options={THEME_SEGMENTS}
              value={settings.theme}
              onChange={handleThemeChange}
            />
          </SettingsRow>
        </div>

        {/* ─── TIMEZONE & LOCALE ─── */}
        <SectionHeader label="TIMEZONE & LOCALE" />
        <div className="rounded-[var(--radius-card)] overflow-hidden mx-4">
          <SettingsRow>
            <SettingsLabel>Timezone</SettingsLabel>
            <select
              value={settings.timezone}
              onChange={(e) => save({ timezone: e.target.value })}
              className="max-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-xs text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] truncate"
            >
              {timezoneOptions(settings.timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz === deviceZone ? `${tz} (this device)` : tz}
                </option>
              ))}
            </select>
          </SettingsRow>

          <SettingsRow>
            <SettingsLabel>Week starts on</SettingsLabel>
            <SegmentedControl
              label="Week starts on"
              options={WEEK_START_SEGMENTS}
              value={settings.weekStartsOn}
              onChange={(v) => save({ weekStartsOn: v })}
            />
          </SettingsRow>
        </div>

        {/* ─── FEATURES ─── */}
        <SectionHeader label="FEATURES" />
        <div className="rounded-[var(--radius-card)] overflow-hidden mx-4">
          <SettingsRow>
            <SettingsLabel>Show RPE</SettingsLabel>
            <ToggleSwitch
              checked={settings.showRpe}
              onChange={(v) => save({ showRpe: v })}
            />
          </SettingsRow>
        </div>

        {/* ─── DATA MANAGEMENT ─── */}
        <SectionHeader label="DATA MANAGEMENT" />
        <div className="rounded-[var(--radius-card)] overflow-hidden mx-4">
          <button
            type="button"
            onClick={() => setShowSyncStatus(true)}
            className="flex w-full items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-colors"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium text-[var(--text)]">Sync status</span>
              <span className="text-xs text-[var(--text-muted)]">View sync queue and recent activity</span>
            </div>
            <ChevronRight size={16} className="text-[var(--text-subtle)]" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex w-full items-center justify-between px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-elevated)] transition-colors"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium text-[var(--text)]">Export workout data</span>
              <span className="text-xs text-[var(--text-muted)]">Download as JSON</span>
            </div>
            <ChevronRight size={16} className="text-[var(--text-subtle)]" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="flex w-full items-center justify-between px-4 py-3 bg-[var(--surface)] border-t border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-colors disabled:opacity-50"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium text-[var(--text)]">
                {importing ? "Importing…" : "Import workout data"}
              </span>
              <span className="text-xs text-[var(--text-muted)]">Restore from JSON export</span>
            </div>
            <ChevronRight size={16} className="text-[var(--text-subtle)]" aria-hidden="true" />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
            }}
          />

          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex w-full items-center justify-between px-4 py-3 bg-[var(--surface)] border-t border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-colors"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium text-[var(--danger)]">
                Reset this device
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                Rebuild the local copy from the server
              </span>
            </div>
            <ChevronRight size={16} className="text-[var(--text-subtle)]" aria-hidden="true" />
          </button>
        </div>

        {/* ─── Footer ─── */}
        <p className="mt-10 pb-8 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-subtle)]">
          FORGE MKI
        </p>
      </div>

      {/* ─── Sync status sheet ─── */}
      {showSyncStatus ? (
        <SyncStatusSheet onClose={() => setShowSyncStatus(false)} />
      ) : null}

      {/* ─── Reset confirm dialog ─── */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={(open) => {
          if (!resetting) setShowResetConfirm(open);
        }}
        title="Reset this device?"
        description={RESET_DESCRIPTION}
        confirmLabel={resetting ? "Resetting…" : "Reset this device"}
        tone="danger"
        pending={resetting}
        onConfirm={() => void handleResetConfirm()}
      />
    </>
  );
}
