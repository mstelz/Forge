import { cn } from "../../../../lib/cn";

type Mode = "uniform" | "per_set";

type ToggleProps = {
  label: string;
  value: Mode;
  onChange: (m: Mode) => void;
};

function ModeToggle({ label, value, onChange }: ToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)] w-10 shrink-0">{label}</span>
      <div
        role="radiogroup"
        aria-label={`${label} mode`}
        className="flex rounded-md overflow-hidden bg-[var(--surface-elevated)]"
      >
        {(["uniform", "per_set"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={value === opt}
            onClick={() => onChange(opt)}
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              value === opt
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {opt === "uniform" ? "Uniform" : "Per set"}
          </button>
        ))}
      </div>
    </div>
  );
}

type Props = {
  repMode: Mode;
  rpeMode: Mode;
  setTypeMode: Mode;
  onRepModeChange: (m: Mode) => void;
  onRpeModeChange: (m: Mode) => void;
  onSetTypeModeChange: (m: Mode) => void;
};

export function ModeToggles({
  repMode,
  rpeMode,
  setTypeMode,
  onRepModeChange,
  onRpeModeChange,
  onSetTypeModeChange,
}: Props) {
  return (
    <div className="space-y-2">
      <ModeToggle label="Reps" value={repMode} onChange={onRepModeChange} />
      <ModeToggle label="RPE" value={rpeMode} onChange={onRpeModeChange} />
      <ModeToggle label="Type" value={setTypeMode} onChange={onSetTypeModeChange} />
    </div>
  );
}
