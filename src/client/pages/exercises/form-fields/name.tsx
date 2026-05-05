type Props = {
  value: string;
  onChange: (next: string) => void;
  error?: string;
};

export function NameField({ value, onChange, error }: Props) {
  const id = "exercise-name";
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
      >
        Name
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        required
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className="w-full rounded-[10px] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        placeholder="e.g. Barbell Back Squat"
      />
      {error ? (
        <p id={errorId} className="text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
