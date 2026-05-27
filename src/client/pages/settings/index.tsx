import { useContext, useState } from "react";
import { useOutletContext } from "react-router";
import { ChevronRight } from "lucide-react";
import { SettingsContext } from "../../contexts/settings-context";
import { updateSettings } from "../../db/mutations";
import { setTheme } from "../../lib/theme";
import { triggerExport } from "../../export/trigger";
import { forgeDB } from "../../db/forge-db";
import type { AppShellOutletContext } from "../../layouts/app-shell";
import type { Settings } from "../../../shared/settings";
import type { Theme } from "../../lib/theme";

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

interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
}

function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="flex items-center rounded-full bg-[var(--border)] p-0.5">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors min-h-[28px]",
              isActive
                ? "bg-[#F59E0B] text-black"
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
        checked ? "bg-[#F59E0B]" : "bg-[var(--border-strong)]",
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

// ─── Settings Page ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const settings = useContext(SettingsContext);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const save = (patch: Partial<Settings>) => {
    void updateSettings({ ...settings, ...patch, updatedAt: Date.now() });
  };

  const handleThemeChange = (theme: string) => {
    setTheme(theme as Theme);
    save({ theme: theme as Settings["theme"] });
  };

  const handleExport = async () => {
    const result = await triggerExport();
    if (!result.ok) {
      alert(`Export failed — try again\n\n${result.error}`);
    }
  };

  const handleResetConfirm = async () => {
    setResetting(true);
    try {
      await forgeDB.delete();
      window.location.reload();
    } catch {
      setResetting(false);
      setShowResetConfirm(false);
      alert("Reset failed — try again.");
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
              options={[
                { value: "kg", label: "kg" },
                { value: "lb", label: "lb" },
              ]}
              value={settings.weightUnit}
              onChange={(v) => save({ weightUnit: v as Settings["weightUnit"] })}
            />
          </SettingsRow>

          <SettingsRow>
            <SettingsLabel>Distance</SettingsLabel>
            <SegmentedControl
              options={[
                { value: "m", label: "m" },
                { value: "km", label: "km" },
                { value: "mi", label: "mi" },
              ]}
              value={settings.distanceUnit}
              onChange={(v) => save({ distanceUnit: v as Settings["distanceUnit"] })}
            />
          </SettingsRow>

          <SettingsRow>
            <SettingsLabel>Height</SettingsLabel>
            <SegmentedControl
              options={[
                { value: "cm", label: "cm" },
                { value: "ft", label: "ft" },
              ]}
              value={settings.heightUnit}
              onChange={(v) => save({ heightUnit: v as Settings["heightUnit"] })}
            />
          </SettingsRow>

          <SettingsRow>
            <SettingsLabel>Theme</SettingsLabel>
            <SegmentedControl
              options={[
                { value: "system", label: "SYSTEM" },
                { value: "light", label: "LIGHT" },
                { value: "dark", label: "DARK" },
              ]}
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
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </SettingsRow>

          <SettingsRow>
            <SettingsLabel>Week starts on</SettingsLabel>
            <SegmentedControl
              options={[
                { value: "mon", label: "Mon" },
                { value: "sun", label: "Sun" },
              ]}
              value={settings.weekStartsOn}
              onChange={(v) => save({ weekStartsOn: v as Settings["weekStartsOn"] })}
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

          <SettingsRow>
            <SettingsLabel>Show cardio</SettingsLabel>
            <ToggleSwitch
              checked={settings.showCardio}
              onChange={(v) => save({ showCardio: v })}
            />
          </SettingsRow>
        </div>

        {/* ─── DATA MANAGEMENT ─── */}
        <SectionHeader label="DATA MANAGEMENT" />
        <div className="rounded-[var(--radius-card)] overflow-hidden mx-4">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex w-full items-center justify-between px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-elevated)] transition-colors"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium text-[var(--text)]">Export workout data</span>
              <span className="text-xs text-[var(--text-muted)]">Export as JSON</span>
            </div>
            <ChevronRight size={16} className="text-[var(--text-subtle)]" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex w-full items-center justify-between px-4 py-3 bg-[var(--surface)] border-t border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-colors"
          >
            <span className="text-sm font-medium text-red-500">Reset all data</span>
          </button>
        </div>

        {/* ─── Footer ─── */}
        <p className="mt-10 pb-8 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-subtle)]">
          FORGE MKI
        </p>
      </div>

      {/* ─── Reset confirm dialog ─── */}
      {showResetConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="presentation">
          <div className="absolute inset-0 bg-black/70" onClick={() => !resetting && setShowResetConfirm(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            aria-describedby="reset-desc"
            className="relative w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--surface)] p-6 shadow-2xl ring-1 ring-[var(--border)]"
          >
            <h2 id="reset-title" className="text-base font-bold text-[var(--text)]">Reset all data?</h2>
            <p id="reset-desc" className="mt-2 text-sm text-[var(--text-muted)]">
              This will permanently delete all workouts, routines, programs, goals, and settings from this device. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                className="flex-1 rounded-md border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleResetConfirm()}
                disabled={resetting}
                className="flex-1 rounded-md bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {resetting ? "Resetting…" : "Reset everything"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
