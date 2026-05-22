import { useState } from "react";
import { formatMmSs, parseMmSs } from "../mmss";

type Props = {
  durationSec: number | undefined;
  durationMinSec: number | undefined;
  durationMaxSec: number | undefined;
  onSec: (sec: number | undefined) => void;
  onRange: (min: number | undefined, max: number | undefined) => void;
};

function DurationField({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number | undefined;
  onCommit: (sec: number | undefined) => void;
  ariaLabel: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const displayed = raw ?? (value != null ? formatMmSs(value) : "");

  const commit = () => {
    if (raw === null) return;
    const trimmed = raw.trim();
    if (!trimmed) { onCommit(undefined); setRaw(null); setError(false); return; }
    const parsed = parseMmSs(trimmed);
    if (parsed === null) { setError(true); return; }
    setError(false);
    setRaw(null);
    onCommit(parsed);
  };

  return (
    <input
      type="text"
      value={displayed}
      placeholder="mm:ss"
      aria-label={ariaLabel}
      onChange={(e) => { setRaw(e.target.value); setError(false); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={`h-8 w-20 rounded-md bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${error ? "ring-1 ring-red-500" : ""}`}
    />
  );
}

export function DurationInputs({ durationSec, durationMinSec, durationMaxSec, onSec, onRange }: Props) {
  const isRange = durationMinSec != null || durationMaxSec != null;
  const [rangeMode, setRangeMode] = useState(isRange);

  const toggleRange = () => {
    if (!rangeMode) {
      onRange(durationSec, durationSec);
      onSec(undefined);
    } else {
      onSec(durationMinSec ?? durationMaxSec);
      onRange(undefined, undefined);
    }
    setRangeMode(!rangeMode);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)] w-10 shrink-0">Dur.</span>
      {rangeMode ? (
        <>
          <DurationField value={durationMinSec} onCommit={(v) => onRange(v, durationMaxSec)} ariaLabel="Min duration" />
          <span className="text-xs text-[var(--text-muted)]">–</span>
          <DurationField value={durationMaxSec} onCommit={(v) => onRange(durationMinSec, v)} ariaLabel="Max duration" />
        </>
      ) : (
        <DurationField value={durationSec} onCommit={onSec} ariaLabel="Duration" />
      )}
      <button
        type="button"
        onClick={toggleRange}
        className="text-[10px] uppercase tracking-wide text-[var(--accent)] hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {rangeMode ? "Fixed" : "Range"}
      </button>
    </div>
  );
}
