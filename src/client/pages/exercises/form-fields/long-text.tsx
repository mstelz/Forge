type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
  rows?: number;
  placeholder?: string;
};

export function LongTextField({
  id,
  label,
  value,
  onChange,
  maxLength,
  rows = 4,
  placeholder,
}: Props) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
      >
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-y rounded-[10px] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
    </div>
  );
}
