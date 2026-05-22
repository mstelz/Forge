type Props = {
  value: number | undefined;
  onChange: (rpe: number | undefined) => void;
};

export function UniformRpeInput({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)] w-10 shrink-0">RPE</span>
      <input
        type="number"
        min={1}
        max={10}
        step={0.5}
        value={value ?? ""}
        placeholder="—"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(isNaN(v) ? undefined : Math.round(v * 2) / 2);
        }}
        aria-label="RPE (1–10 in 0.5 steps)"
        className="h-8 w-16 rounded-md bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)] text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
    </div>
  );
}
