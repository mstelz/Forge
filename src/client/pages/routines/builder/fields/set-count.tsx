type Props = {
  value: number;
  onChange: (n: number) => void;
};

export function SetCountStepper({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)] w-10 shrink-0">Sets</span>
      <div className="flex items-center rounded-md bg-[var(--surface-elevated)] overflow-hidden">
        <button
          type="button"
          aria-label="Decrease sets"
          disabled={value <= 1}
          onClick={() => onChange(Math.max(1, value - 1))}
          className="px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          −
        </button>
        <span className="min-w-[2ch] text-center text-sm font-semibold text-[var(--text)] tabular px-1">
          {value}
        </span>
        <button
          type="button"
          aria-label="Increase sets"
          disabled={value >= 20}
          onClick={() => onChange(Math.min(20, value + 1))}
          className="px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          +
        </button>
      </div>
    </div>
  );
}
