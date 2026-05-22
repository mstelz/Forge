import type { SetType } from "../../../../../shared";

const OPTIONS: { value: SetType; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "amrap", label: "AMRAP" },
  { value: "to_failure", label: "To failure" },
  { value: "drop_set", label: "Drop set" },
  { value: "rest_pause", label: "Rest-pause" },
];

type Props = {
  value: SetType | undefined;
  onChange: (t: SetType) => void;
};

export function UniformSetTypeSelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)] w-10 shrink-0">Type</span>
      <select
        value={value ?? "normal"}
        onChange={(e) => onChange(e.target.value as SetType)}
        aria-label="Set type"
        className="h-8 rounded-md bg-[var(--surface-elevated)] px-2 pr-7 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] appearance-none"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
