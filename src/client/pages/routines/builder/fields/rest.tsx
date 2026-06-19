import { useState } from "react";
import { formatMmSs, parseMmSs } from "../../../../lib/time";

type Props = {
  restSec: number | null | undefined;
  label?: string;
  onChange: (sec: number | null) => void;
};

export function RestInput({ restSec, label = "Rest", onChange }: Props) {
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const displayed = raw ?? (restSec != null ? formatMmSs(restSec) : "");

  const commit = () => {
    if (raw === null) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange(null);
      setRaw(null);
      setError(false);
      return;
    }
    const parsed = parseMmSs(trimmed);
    if (parsed === null) {
      setError(true);
      return;
    }
    setError(false);
    setRaw(null);
    onChange(parsed);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-[var(--text-muted)] w-10 shrink-0">{label}</label>
      <input
        type="text"
        value={displayed}
        placeholder="mm:ss"
        aria-label={`${label} in mm:ss`}
        aria-describedby={error ? "rest-error" : undefined}
        onChange={(e) => { setRaw(e.target.value); setError(false); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
        className={`h-8 w-20 rounded-md bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${error ? "ring-1 ring-red-500" : ""}`}
      />
      {error && (
        <span id="rest-error" className="text-[10px] text-red-400">mm:ss</span>
      )}
    </div>
  );
}
