import { Link } from "react-router";

export function FullEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-sm text-[var(--text-muted)]">No routines yet</p>
      <Link
        to="/routines/new"
        className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]"
      >
        Create your first routine
      </Link>
    </div>
  );
}

export function ZeroMatchState({
  search,
  onClear,
}: {
  search: string;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-4">
      <p className="text-sm text-[var(--text-muted)]">No matches for '{search}'</p>
      <button
        type="button"
        onClick={onClear}
        className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        Clear search
      </button>
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="h-16 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]"
        />
      ))}
    </ul>
  );
}
