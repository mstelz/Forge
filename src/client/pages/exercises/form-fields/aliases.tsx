import { useState } from "react";

type Props = {
  values: string[];
  onChange: (next: string[]) => void;
};

export function AliasesField({ values, onChange }: Props) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!v) return;
    if (values.includes(v)) return;
    onChange([...values, v]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
      setDraft("");
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      e.preventDefault();
      onChange(values.slice(0, -1));
    }
  };

  const removeChip = (idx: number) => {
    const next = [...values];
    next.splice(idx, 1);
    onChange(next);
  };

  const onChipKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeChip(idx);
    }
  };

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="aliases-input"
        className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
      >
        Aliases
      </label>
      <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[var(--surface)] p-2 ring-1 ring-[var(--border)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
        {values.map((v, i) => (
          <button
            key={`${v}-${i}`}
            type="button"
            onKeyDown={(e) => onChipKeyDown(e, i)}
            onClick={() => removeChip(i)}
            aria-label={`Remove alias ${v}`}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-elevated)] px-2.5 py-1 text-xs text-[var(--text)] ring-1 ring-[var(--border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span>{v}</span>
            <span aria-hidden="true" className="text-[var(--text-subtle)]">
              ×
            </span>
          </button>
        ))}
        <input
          id="aliases-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) {
              commit(draft);
              setDraft("");
            }
          }}
          placeholder={values.length === 0 ? "back squat, bb squat" : ""}
          className="min-w-[8ch] flex-1 bg-transparent px-1 py-1 text-sm text-[var(--text)] focus:outline-none"
        />
      </div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
        Press Enter or comma to add
      </p>
    </div>
  );
}
