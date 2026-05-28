import { useState, type Dispatch } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BuilderAction, DraftBlock, DraftItem } from "./state";
import { repsSummary, restSummary, setTypeChip, durationSummary } from "./summary";
import { PrescriptionEditor } from "./prescription-editor";
import { RestInput } from "./fields/rest";
import { ExercisePicker } from "../../../components/exercise-picker";
import type { Exercise } from "../../../../shared";
import { cn } from "../../../lib/cn";

type Props = {
  block: DraftBlock;
  exerciseMap: Map<string, Exercise>;
  dispatch: Dispatch<BuilderAction>;
};

export function SingleBlock({ block, exerciseMap, dispatch }: Props) {
  const item = block.items[0];
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  if (!item) return null;

  const exercise = exerciseMap.get(item.exerciseId);
  const isMissing = !exercise;
  const exerciseName = exercise?.name ?? "Missing exercise";
  const isCardio = exercise?.type === "cardio";
  const isMixed = exercise?.type === "mixed";

  const reps = repsSummary(item);
  const rest = restSummary(block.restSec);
  const dur = durationSummary(item);
  const chip = setTypeChip(item);

  const summaryParts = [
    `${item.setCount} ×`,
    isCardio || isMixed ? null : reps,
    dur != null ? dur : null,
    rest ? `${rest} rest` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-[var(--radius-card)] bg-[var(--surface)]",
        isDragging && "shadow-lg",
      )}
    >
      <div className="flex items-stretch">
        {/* drag handle */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          aria-label="Drag to reorder block"
          className="flex items-center px-2 text-[var(--text-subtle)] hover:text-[var(--text-muted)] cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] touch-none"
        >
          <DragHandleIcon />
        </button>

        {/* main content */}
        <div className="flex-1 py-3 min-w-0">
          <div className="flex items-center gap-2 pr-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "text-[15px] font-semibold truncate",
                  isMissing ? "text-[var(--text-muted)] italic" : "text-[var(--text)]",
                )}>
                  {exerciseName}
                </span>
                {!isMissing && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    aria-label="Edit exercise name"
                    className="text-[var(--text-subtle)] hover:text-[var(--text-muted)] focus:outline-none"
                  >
                    <PencilIcon />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-[var(--text-muted)]">
                  {summaryParts}
                  {(isCardio || isMixed) && (
                    <span className="ml-1 text-[var(--text-subtle)]">· {exercise?.type === "cardio" ? "Cardio" : "Mixed"}</span>
                  )}
                </span>
                {chip && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-sm ring-1 ring-amber-500/30">
                    {chip}
                  </span>
                )}
                {isMissing && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="text-[10px] uppercase tracking-wide text-[var(--accent)] hover:opacity-80 focus:outline-none"
                  >
                    Replace
                  </button>
                )}
              </div>
            </div>

            {/* expand / overflow */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                aria-label={expanded ? "Collapse prescription" : "Expand prescription"}
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
                className="rounded-md p-1.5 text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <ChevronIcon expanded={expanded} />
              </button>
              <BlockOverflowMenu
                onDelete={() => dispatch({ type: "REMOVE_BLOCK", blockId: block.id })}
              />
            </div>
          </div>

          {expanded && (
            <div className="mt-2 pr-2">
              <RestInput
                restSec={block.restSec}
                onChange={(sec) => dispatch({ type: "SET_BLOCK_REST", blockId: block.id, restSec: sec })}
              />
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <PrescriptionEditor
          blockId={block.id}
          item={item}
          exerciseType={exercise?.type}
          dispatch={dispatch}
        />
      )}

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(exerciseId) => {
          setPickerOpen(false);
          dispatch({ type: "REPLACE_EXERCISE", blockId: block.id, itemId: item.id, exerciseId });
        }}
        title="Replace exercise"
      />
    </div>
  );
}

function BlockOverflowMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Block options"
        onClick={() => setOpen(!open)}
        className="rounded-md p-1.5 text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <DotsIcon />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 min-w-[120px] rounded-[var(--radius-card)] bg-[var(--surface-elevated)] shadow-lg ring-1 ring-[var(--border)] overflow-hidden">
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete(); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-[var(--surface)] focus:outline-none"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DragHandleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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
