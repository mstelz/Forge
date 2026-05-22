import { useMemo } from "react";
import { Link, useNavigate, useSearchParams, useOutletContext } from "react-router";
import { useGoals } from "../../hooks/use-goals";
import { computeGoalProgress } from "../../goals/progress";
import { formatCountdown, formatMonDD } from "./countdown";
import { formatGoalValue } from "./format";
import { cn } from "../../lib/cn";
import type { Goal, GoalCategory, GoalStatus } from "../../../shared/goals";
import type { AppShellOutletContext } from "../../layouts/app-shell";

// ─── Filter & sort helpers ────────────────────────────────────────────────────

type StatusFilter = GoalStatus | "all";
type CategoryFilter = GoalCategory | "all";

function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    // Status ordering within all/completed: active first
    if (a.status !== b.status) {
      if (a.status === "active") return -1;
      if (b.status === "active") return 1;
    }
    // deadline ASC nulls last
    if (a.deadline !== b.deadline) {
      if (a.deadline == null) return 1;
      if (b.deadline == null) return -1;
      return a.deadline - b.deadline;
    }
    // tiebreak: updatedAt DESC
    return b.updatedAt - a.updatedAt;
  });
}

// ─── Components ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<GoalCategory, string> = {
  strength: "STRENGTH",
  cardio: "CARDIO",
  weight: "WEIGHT",
  measurement: "MEASUREMENT",
  program: "PROGRAM",
  other: "OTHER",
};

function GoalCard({ goal }: { goal: Goal }) {
  const navigate = useNavigate();
  const progress = computeGoalProgress(goal, { setLogs: [] });
  const countdown = formatCountdown(goal.deadline, goal.status);
  const percent = Math.round(progress.percent * 100);

  const currentDisplay = formatGoalValue(
    progress.currentValue ?? goal.startValue,
    goal.unit,
  );
  const targetDisplay = formatGoalValue(goal.targetValue, goal.unit);
  const unitLabel = goal.unit ?? "";

  return (
    <button
      type="button"
      onClick={() => navigate(`/goals/${goal.id}`)}
      className="w-full text-left rounded-[14px] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {CATEGORY_LABELS[goal.category]}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">
            {goal.title}
          </span>
        </div>
        {countdown.text ? (
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold uppercase tracking-wider",
              countdown.variant === "overdue" && "text-red-400",
              countdown.variant === "completed" && "text-[var(--accent)]",
              countdown.variant === "abandoned" && "text-[var(--text-subtle)]",
              countdown.variant === "normal" && "text-[var(--text-muted)]",
            )}
          >
            {countdown.text}
          </span>
        ) : null}
      </div>

      {/* Big numerics */}
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums leading-none text-[var(--text)]">
          {currentDisplay}
        </span>
        <span className="text-base font-semibold text-[var(--text-muted)]">
          /
        </span>
        <span className="text-xl font-semibold tabular-nums text-[var(--text-muted)]">
          {targetDisplay}
        </span>
        {unitLabel ? (
          <span className="text-sm text-[var(--text-subtle)] ml-0.5">{unitLabel}</span>
        ) : null}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="relative h-1.5 w-full rounded-full bg-[#26272A] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-end">
          <span className="text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
            {percent}%
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-3 text-[10px] text-[var(--text-subtle)]">
        <span>Started {formatMonDD(goal.createdAt)}</span>
        {goal.deadline ? (
          <>
            <span>·</span>
            <span>Target {formatMonDD(goal.deadline)}</span>
          </>
        ) : null}
      </div>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-[14px] bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}

function FullEmptyState() {
  return (
    <div className="rounded-[14px] bg-[var(--surface)] border border-[var(--border)] p-8 text-center space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        No goals yet — set a target to start tracking.
      </p>
      <Link
        to="/goals/new"
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--accent-fg)]"
      >
        + New goal
      </Link>
    </div>
  );
}

function ZeroMatchState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-[var(--text-subtle)]">No matching goals</p>
      <button
        type="button"
        onClick={onClear}
        className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]"
      >
        Clear filters
      </button>
    </div>
  );
}

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
];

const CATEGORY_CHIPS: { value: GoalCategory; label: string }[] = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "weight", label: "Weight" },
  { value: "measurement", label: "Measurement" },
  { value: "program", label: "Program" },
  { value: "other", label: "Other" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-chip
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        active
          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
          : "bg-transparent text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function GoalListPage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const [params, setParams] = useSearchParams();

  const statusParam = (params.get("status") as StatusFilter | null) ?? "active";
  const categoryParam = (params.get("category") as CategoryFilter | null) ?? "all";

  const setStatus = (s: StatusFilter) => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (s === "active") next.delete("status");
      else next.set("status", s);
      return next;
    });
  };

  const setCategory = (c: GoalCategory | "all") => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (c === "all") next.delete("category");
      else if (categoryParam === c) next.delete("category"); // tap active to clear
      else next.set("category", c);
      return next;
    });
  };

  const clearFilters = () => {
    setParams({});
  };

  const { data: goals, isLoading } = useGoals();

  const filtered = useMemo(() => {
    if (!goals) return [];
    let result = goals;

    // Status filter
    if (statusParam !== "all") {
      result = result.filter((g) => g.status === statusParam);
    }

    // Category filter
    if (categoryParam !== "all") {
      result = result.filter((g) => g.category === categoryParam);
    }

    return sortGoals(result);
  }, [goals, statusParam, categoryParam]);

  const totalCount = goals?.length ?? 0;

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={openDrawer}
          aria-label="Open navigation"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <HamburgerIcon />
        </button>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Goals
        </h1>
        <Link
          to="/goals/new"
          aria-label="Create goal"
          className="rounded-md p-2 text-[var(--accent)] hover:text-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <PlusIcon />
        </Link>
      </header>

      {/* Filter chips */}
      <div className="-mx-0 flex items-center gap-0 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Status segment */}
        <div className="flex shrink-0 gap-2">
          {STATUS_CHIPS.map((c) => (
            <Chip
              key={c.value}
              active={statusParam === c.value}
              onClick={() => setStatus(c.value)}
            >
              {c.label}
            </Chip>
          ))}
        </div>

        {/* Divider */}
        <div className="mx-3 h-5 w-px shrink-0 bg-[#26272A]" />

        {/* Category segment */}
        <div className="flex shrink-0 gap-2">
          {CATEGORY_CHIPS.map((c) => (
            <Chip
              key={c.value}
              active={categoryParam === c.value}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Goal list */}
      <main className="flex-1 px-4 pt-2 pb-8">
        {isLoading ? (
          <ListSkeleton />
        ) : totalCount === 0 ? (
          <FullEmptyState />
        ) : filtered.length === 0 ? (
          <ZeroMatchState onClear={clearFilters} />
        ) : (
          <ul className="space-y-3">
            {filtered.map((g) => (
              <li key={g.id}>
                <GoalCard goal={g} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
