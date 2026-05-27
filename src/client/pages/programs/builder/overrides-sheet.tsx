import { useState, type Dispatch } from "react";
import { useRoutine } from "../../../hooks/use-routines";
import { SetCountStepper } from "../../routines/builder/fields/set-count";
import { UniformRepsInput } from "../../routines/builder/fields/uniform-reps";
import { UniformRpeInput } from "../../routines/builder/fields/uniform-rpe";
import type { RoutineBlock, RoutineItem, RoutineItemOverride, Exercise } from "../../../../shared";
import type { BuilderAction } from "./state";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Draft types ─────────────────────────────────────────────────────────────

type ItemOverrideDraft = {
  setCount?: number;
  uniformReps?: number;
  uniformRepsMin?: number;
  uniformRepsMax?: number;
  uniformRpe?: number;
  notes?: string;
};

type Drafts = Record<string, ItemOverrideDraft>;

function initDrafts(existing: RoutineItemOverride[] | null): Drafts {
  const drafts: Drafts = {};
  for (const ov of existing ?? []) {
    drafts[ov.routineItemId] = {
      setCount: ov.setCount,
      uniformReps: ov.uniformReps,
      uniformRepsMin: ov.uniformRepsMin,
      uniformRepsMax: ov.uniformRepsMax,
      uniformRpe: ov.uniformRpe,
      notes: ov.notes ?? undefined,
    };
  }
  return drafts;
}

function collectOverrides(drafts: Drafts): RoutineItemOverride[] | null {
  const overrides: RoutineItemOverride[] = [];
  for (const [id, d] of Object.entries(drafts)) {
    const ov: RoutineItemOverride = { routineItemId: id };
    if (d.setCount != null) ov.setCount = d.setCount;
    if (d.uniformReps != null) ov.uniformReps = d.uniformReps;
    if (d.uniformRepsMin != null) ov.uniformRepsMin = d.uniformRepsMin;
    if (d.uniformRepsMax != null) ov.uniformRepsMax = d.uniformRepsMax;
    if (d.uniformRpe != null) ov.uniformRpe = d.uniformRpe;
    if (d.notes) ov.notes = d.notes;
    if (Object.keys(ov).length > 1) overrides.push(ov);
  }
  return overrides.length ? overrides : null;
}

function hasItemOverride(draft: ItemOverrideDraft | undefined): boolean {
  if (!draft) return false;
  return (
    draft.setCount != null ||
    draft.uniformReps != null ||
    draft.uniformRepsMin != null ||
    draft.uniformRepsMax != null ||
    draft.uniformRpe != null ||
    !!draft.notes
  );
}

// ─── Summary helpers (mirrors routine builder summary.ts) ────────────────────

function itemRepsSummary(item: RoutineItem, draft: ItemOverrideDraft | undefined): string {
  const reps = draft?.uniformReps ?? item.uniformReps;
  const repsMin = draft?.uniformRepsMin ?? item.uniformRepsMin;
  const repsMax = draft?.uniformRepsMax ?? item.uniformRepsMax;
  if (item.repMode === "per_set") return "varies";
  if (item.uniformSetType === "amrap") return "AMRAP";
  if (item.uniformSetType === "to_failure") return "fail";
  if (repsMin != null && repsMax != null) return `${repsMin}–${repsMax}`;
  return reps != null ? String(reps) : "—";
}

function itemRpeSummary(item: RoutineItem, draft: ItemOverrideDraft | undefined): string | null {
  if (item.rpeMode === "per_set") return "varies";
  const rpe = draft?.uniformRpe ?? item.uniformRpe;
  if (rpe == null) return null;
  return `RPE ${rpe % 1 === 0 ? rpe : rpe.toFixed(1)}`;
}

// ─── Override prescription panel ─────────────────────────────────────────────

type PanelProps = {
  item: RoutineItem;
  draft: ItemOverrideDraft;
  exerciseType?: Exercise["type"];
  onUpdate: (patch: Partial<ItemOverrideDraft>) => void;
  onReset: () => void;
};

function OverridePrescriptionPanel({ item, draft, exerciseType, onUpdate, onReset }: PanelProps) {
  const showReps = exerciseType !== "cardio";
  const overriding = hasItemOverride(draft);

  const effectiveSetCount = draft.setCount ?? item.setCount;
  const setCountOverriding = draft.setCount != null && draft.setCount !== item.setCount;

  return (
    <div className="space-y-3 px-4 py-3 bg-[var(--surface-elevated)] rounded-b-[var(--radius-card)] border-t border-[var(--border)]">
      {/* Sets */}
      <div className="flex items-center gap-3">
        <SetCountStepper
          value={effectiveSetCount}
          onChange={(n) => onUpdate({ setCount: n === item.setCount ? undefined : n })}
        />
        {setCountOverriding && (
          <span className="text-[10px] text-[var(--accent)]">base: {item.setCount}</span>
        )}
      </div>

      {/* Reps */}
      {item.repMode === "uniform" && showReps && (
        <div className="flex items-center gap-3">
          <UniformRepsInput
            uniformReps={draft.uniformReps ?? item.uniformReps}
            uniformRepsMin={draft.uniformRepsMin ?? item.uniformRepsMin}
            uniformRepsMax={draft.uniformRepsMax ?? item.uniformRepsMax}
            uniformSetType={item.uniformSetType}
            onReps={(r) =>
              onUpdate({
                uniformReps: r === item.uniformReps ? undefined : r,
                uniformRepsMin: undefined,
                uniformRepsMax: undefined,
              })
            }
            onRange={(min, max) =>
              onUpdate({
                uniformReps: undefined,
                uniformRepsMin: min === item.uniformRepsMin ? undefined : min,
                uniformRepsMax: max === item.uniformRepsMax ? undefined : max,
              })
            }
          />
          {(draft.uniformReps != null || draft.uniformRepsMin != null || draft.uniformRepsMax != null) && (
            <span className="text-[10px] text-[var(--accent)]">
              base: {item.uniformRepsMin != null && item.uniformRepsMax != null
                ? `${item.uniformRepsMin}–${item.uniformRepsMax}`
                : String(item.uniformReps ?? "—")}
            </span>
          )}
        </div>
      )}

      {/* RPE */}
      {item.rpeMode === "uniform" && (
        <div className="flex items-center gap-3">
          <UniformRpeInput
            value={draft.uniformRpe ?? item.uniformRpe}
            onChange={(rpe) => onUpdate({ uniformRpe: rpe === item.uniformRpe ? undefined : rpe })}
          />
          {draft.uniformRpe != null && draft.uniformRpe !== item.uniformRpe && (
            <span className="text-[10px] text-[var(--accent)]">base: {item.uniformRpe ?? "—"}</span>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <textarea
          value={draft.notes ?? ""}
          onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
          placeholder="Week-specific note, e.g. add 5 kg from last week…"
          maxLength={1000}
          rows={2}
          className="w-full rounded-md bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
      </div>

      {overriding && (
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] hover:text-red-400 focus:outline-none"
        >
          Reset to routine
        </button>
      )}
    </div>
  );
}

// ─── Override item card (single exercise) ────────────────────────────────────

type ItemCardProps = {
  item: RoutineItem;
  exercise: Exercise | undefined;
  draft: ItemOverrideDraft;
  onUpdate: (patch: Partial<ItemOverrideDraft>) => void;
  onReset: () => void;
};

function OverrideItemCard({ item, exercise, draft, onUpdate, onReset }: ItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const overriding = hasItemOverride(draft);

  const effectiveSetCount = draft.setCount ?? item.setCount;
  const reps = itemRepsSummary(item, draft);
  const rpe = itemRpeSummary(item, draft);

  const summaryParts = [
    `${effectiveSetCount} ×`,
    exercise?.type !== "cardio" ? reps : null,
    rpe,
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--surface)]">
      <div className="flex items-stretch">
        {/* Overriding indicator bar */}
        {overriding && (
          <div className="w-1 rounded-l-[var(--radius-card)] bg-[var(--accent)] shrink-0" />
        )}

        <div className="flex-1 py-3 px-3 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-[15px] font-semibold text-[var(--text)] truncate block">
                {exercise?.name ?? "Unknown exercise"}
              </span>
              <span className="text-xs text-[var(--text-muted)] mt-0.5 block">{summaryParts}</span>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse" : "Expand"}
              className="shrink-0 rounded-md p-1.5 text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <ChevronIcon expanded={expanded} />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <OverridePrescriptionPanel
          item={item}
          draft={draft}
          exerciseType={exercise?.type}
          onUpdate={onUpdate}
          onReset={onReset}
        />
      )}
    </div>
  );
}

// ─── Override block card (handles single + superset) ─────────────────────────

type BlockCardProps = {
  block: RoutineBlock;
  exerciseMap: Map<string, Exercise>;
  drafts: Drafts;
  onUpdate: (itemId: string, patch: Partial<ItemOverrideDraft>) => void;
  onReset: (itemId: string) => void;
};

function OverrideBlockCard({ block, exerciseMap, drafts, onUpdate, onReset }: BlockCardProps) {
  if (block.type === "single") {
    const item = block.items[0];
    if (!item) return null;
    return (
      <OverrideItemCard
        item={item}
        exercise={exerciseMap.get(item.exerciseId)}
        draft={drafts[item.id] ?? {}}
        onUpdate={(patch) => onUpdate(item.id, patch)}
        onReset={() => onReset(item.id)}
      />
    );
  }

  // Superset: show as a labelled group
  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--surface)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400">
          Superset · {block.roundCount ?? 1} rounds
        </span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {block.items.map((item) => {
          const exercise = exerciseMap.get(item.exerciseId);
          const draft = drafts[item.id] ?? {};
          const overriding = hasItemOverride(draft);
          const [expanded, setExpanded] = useState(false);
          const effectiveSetCount = draft.setCount ?? item.setCount;
          const reps = itemRepsSummary(item, draft);
          const rpe = itemRpeSummary(item, draft);
          const summaryParts = [`${effectiveSetCount} ×`, exercise?.type !== "cardio" ? reps : null, rpe].filter(Boolean).join(" · ");

          return (
            <div key={item.id}>
              <div className={`flex items-stretch ${overriding ? "border-l-2 border-[var(--accent)]" : ""}`}>
                <div className="flex-1 py-2.5 px-3 min-w-0">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-[var(--text)] truncate block">
                        {exercise?.name ?? "Unknown exercise"}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] mt-0.5 block">{summaryParts}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      aria-expanded={expanded}
                      aria-label={expanded ? "Collapse" : "Expand"}
                      className="shrink-0 rounded-md p-1.5 text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      <ChevronIcon expanded={expanded} />
                    </button>
                  </div>
                </div>
              </div>
              {expanded && (
                <OverridePrescriptionPanel
                  item={item}
                  draft={draft}
                  exerciseType={exercise?.type}
                  onUpdate={(patch) => onUpdate(item.id, patch)}
                  onReset={() => onReset(item.id)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

type OverridesSheetProps = {
  open: boolean;
  onClose: () => void;
  weekIndex: number;
  dayIndex: number;
  routineId: string;
  routineName: string;
  existingOverrides: RoutineItemOverride[] | null;
  existingNotes: string | null;
  exerciseMap: Map<string, Exercise>;
  dispatch: Dispatch<BuilderAction>;
  onChangeRoutine: () => void;
};

export function OverridesSheet({
  open,
  onClose,
  weekIndex,
  dayIndex,
  routineId,
  routineName,
  existingOverrides,
  existingNotes,
  exerciseMap,
  dispatch,
  onChangeRoutine,
}: OverridesSheetProps) {
  const { data: routine } = useRoutine(open ? routineId : undefined);

  const [drafts, setDrafts] = useState<Drafts>(() => initDrafts(existingOverrides));
  const [notes, setNotes] = useState(existingNotes ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  const updateItem = (itemId: string, patch: Partial<ItemOverrideDraft>) => {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? {}), ...patch } }));
  };

  const resetItem = (itemId: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleSave = () => {
    dispatch({
      type: "SET_DAY_OVERRIDES",
      weekIndex,
      dayIndex,
      overrides: collectOverrides(drafts),
      notes: notes || null,
    });
    onClose();
  };

  const handleClearAll = () => {
    setDrafts({});
  };

  const totalOverrides = Object.values(drafts).filter(hasItemOverride).length;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Day overrides"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]"
    >
      {/* Header */}
      <header className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ChevronLeftIcon />
        </button>
        <h2 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
          Week {weekIndex + 1} · {DAY_LABELS[dayIndex]}
        </h2>
        {/* Overflow menu */}
        <div className="relative">
          <button
            type="button"
            aria-label="More options"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 min-w-[160px] rounded-[var(--radius-card)] bg-[var(--surface-elevated)] shadow-lg ring-1 ring-[var(--border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    dispatch({ type: "SET_DAY", weekIndex, dayIndex, routineId: null, isRestDay: true, notes: null });
                    onClose();
                  }}
                  className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface)] focus:outline-none"
                >
                  Mark as rest day
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    dispatch({ type: "CLEAR_DAY", weekIndex, dayIndex });
                    onClose();
                  }}
                  className="flex w-full items-center px-4 py-2.5 text-sm text-red-400 hover:bg-[var(--surface)] focus:outline-none"
                >
                  Clear day
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Routine row — tap to change */}
      <button
        type="button"
        onClick={onChangeRoutine}
        className="flex w-full items-center gap-3 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]"
        >
          {routineName.charAt(0).toUpperCase()}
        </span>
        <span className="flex-1 min-w-0 text-left">
          <span className="block text-sm font-semibold text-[var(--text)] truncate">{routineName}</span>
          <span className="block text-[10px] text-[var(--text-muted)]">Tap to change routine</span>
        </span>
        <PencilIcon />
      </button>

      {/* Day notes */}
      <div className="px-4 pt-3 pb-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Day notes…"
          maxLength={1000}
          rows={2}
          className="w-full rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] resize-none"
        />
      </div>

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {!routine ? (
          <div className="py-12 text-center text-sm text-[var(--text-muted)]">Loading…</div>
        ) : (
          routine.blocks.map((block) => (
            <OverrideBlockCard
              key={block.id}
              block={block}
              exerciseMap={exerciseMap}
              drafts={drafts}
              onUpdate={updateItem}
              onReset={resetItem}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] px-4 py-3 flex gap-2">
        <button
          type="button"
          onClick={handleClearAll}
          disabled={totalOverrides === 0}
          className="flex-1 rounded-full border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {totalOverrides > 0 ? `Clear ${totalOverrides} override${totalOverrides !== 1 ? "s" : ""}` : "No overrides"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-subtle)] shrink-0" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
