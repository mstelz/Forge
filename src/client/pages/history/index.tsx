import { useState, useMemo } from "react";
import { Link, useOutletContext } from "react-router";
import { useHistorySessions, useHistorySummary } from "../../hooks/use-history";
import type { AppShellOutletContext } from "../../layouts/app-shell";
import type { HistoryFilter } from "../../../shared/history";
import type { SessionSummary } from "../../../shared/history";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RangeFilter = HistoryFilter["range"];

function formatDurationMs(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
  return kg % 1 === 0 ? String(kg) : kg.toFixed(1);
}

function formatDayHeader(ts: number): string {
  const d = new Date(ts);
  const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = d.getDate().toString().padStart(2, "0");
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  return `${month} ${day} · ${weekday}`;
}

function groupByDay(sessions: SessionSummary[]): { label: string; day: string; sessions: SessionSummary[] }[] {
  const groups = new Map<string, SessionSummary[]>();
  const order: string[] = [];
  for (const s of sessions) {
    const d = new Date(s.endedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(s);
  }
  return order.map((key) => {
    const day = groups.get(key)![0]!.endedAt;
    return {
      label: formatDayHeader(day),
      day: key,
      sessions: groups.get(key)!,
    };
  });
}

function formatMins(ms: number): string {
  return String(Math.round(ms / 60000));
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

const FILTERS: { label: string; value: RangeFilter }[] = [
  { label: "All", value: "all" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "This Year", value: "year" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function HistoryListPage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const [range, setRange] = useState<RangeFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");

  const filters: Partial<HistoryFilter> = useMemo(() => {
    const f: Partial<HistoryFilter> = { range };
    if (q.trim()) f.q = q.trim();
    return f;
  }, [range, q]);

  const { data: sessions, isLoading } = useHistorySessions(filters);
  const { data: summary } = useHistorySummary(filters);

  const grouped = useMemo(() => groupByDay(sessions ?? []), [sessions]);

  const totalSessions = summary?.totalSessions ?? 0;
  const totalVolumeKg = summary?.totalVolumeKg ?? 0;
  const totalSets = summary?.totalSets ?? 0;
  const totalExercises = summary?.totalExercises ?? 0;
  const totalDurationMs = summary?.totalDurationMs ?? 0;

  return (
    <>
      <header className="sticky top-0 z-10 bg-[var(--bg)] px-4 pt-4 pb-0">
        <div className="flex items-center justify-between gap-2 pb-3">
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open navigation"
            className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <HamburgerIcon />
          </button>
          <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            History
          </h1>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Toggle search"
            className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <SearchIcon />
          </button>
        </div>

        {searchOpen ? (
          <div className="pb-2">
            <input
              type="search"
              placeholder="Search workouts…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-md bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] border border-[var(--border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </div>
        ) : null}

        {/* Summary tiles */}
        <div className="flex gap-2 pb-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SummaryTile label="Sessions" value={String(totalSessions)} />
          <SummaryTile label="Volume" value={`${formatVolume(totalVolumeKg)} kg`} />
          <SummaryTile label="Sets" value={String(totalSets)} />
          <SummaryTile label="Exercises" value={String(totalExercises)} />
          <SummaryTile label="Time" value={formatDurationMs(totalDurationMs)} />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 pb-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              data-chip
              aria-pressed={range === f.value}
              onClick={() => setRange(f.value)}
              className={[
                "flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                range === f.value
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "bg-transparent text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 pb-8">
        {isLoading ? (
          <ListSkeleton />
        ) : (sessions ?? []).length === 0 ? (
          <EmptyState hasFilters={range !== "all" || q.length > 0} onClear={() => { setRange("all"); setQ(""); }} />
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.day}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)] sticky top-[var(--header-height,0)] bg-[var(--bg)] py-1">
                  {group.label}
                </p>
                <ul className="space-y-2">
                  {group.sessions.map((s) => (
                    <li key={s.id}>
                      <SessionRow session={s} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-shrink-0 rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-2 text-center min-w-[64px]">
      <p className="text-lg font-bold text-[var(--text)] tabular-nums">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)]">
        {label}
      </p>
    </div>
  );
}

function SessionRow({ session }: { session: SessionSummary }) {
  const d = new Date(session.endedAt);
  const dayNum = d.getDate();
  const microLine = [
    `${session.exerciseCount} exercises`,
    `${session.setCount} sets`,
    `${formatMins(session.durationMs)} min`,
  ].join(" · ");

  return (
    <Link
      to={`/workout/sessions/${session.id}`}
      aria-label={`${session.title ?? "Freeform"}, ${microLine}`}
      className="flex items-center gap-3 rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-3 hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
    >
      {/* Day number tile */}
      <div
        className={[
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-lg font-bold tabular-nums",
          session.hasPr
            ? "bg-[var(--accent)] text-[var(--accent-fg)]"
            : "bg-transparent text-[var(--accent)] ring-1 ring-[var(--accent)]",
        ].join(" ")}
      >
        {dayNum}
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-bold text-[var(--text)]">
          {session.title ?? "Freeform"}
        </p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-subtle)]">
          {microLine}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {session.hasPr ? (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[var(--accent)]/20 text-[var(--accent)]">
            PR
          </span>
        ) : null}
        <ChevronRightIcon />
      </div>
    </Link>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  if (hasFilters) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-4">
        <p className="text-sm text-[var(--text-muted)]">No matches</p>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-sm text-[var(--text-muted)]">
        No workouts yet. Start your first workout to see history here.
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" />
      ))}
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--text-subtle)]">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
