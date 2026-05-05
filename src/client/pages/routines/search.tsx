import { cn } from "../../lib/cn";

type Props = {
  value: string;
  onChange: (next: string) => void;
  className?: string;
};

export function SearchInput({ value, onChange, className }: Props) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">Search routines</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
      >
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search routines"
        placeholder="Search routines"
        className="h-11 w-full rounded-[var(--radius-card)] bg-[var(--surface)] pl-10 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
    </label>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
