import { useState, type Dispatch } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BuilderAction, DraftBlock, DraftItem } from "./state";
import { repsSummary, rpeSummary, restSummary, setTypeChip, durationSummary } from "./summary";
import { PrescriptionEditor } from "./prescription-editor";
import { RestInput } from "./fields/rest";
import { ExercisePicker } from "../../../components/exercise-picker";
import type { Exercise } from "../../../../shared";
import { cn } from "../../../lib/cn";

type Props = {
  block: DraftBlock;
  supersetIndex: number;
  exerciseMap: Map<string, Exercise>;
  dispatch: Dispatch<BuilderAction>;
};

const SUPERSET_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function SupersetBlock({ block, supersetIndex, exerciseMap, dispatch }: Props) {
  const letter = SUPERSET_LETTERS[supersetIndex] ?? "?";
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const itemIds = block.items.map((it) => it.id);

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
          aria-label="Drag to reorder superset block"
          className="flex items-center px-2 text-[var(--text-subtle)] hover:text-[var(--text-muted)] cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] touch-none"
        >
          <DragHandleIcon />
        </button>

        {/* amber left accent */}
        <div className="w-1 bg-amber-400/70 shrink-0 my-2 rounded-full" />

        {/* content */}
        <div className="flex-1 py-3 min-w-0 pl-3 pr-2">
          {/* superset header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">
                Superset {letter}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <RoundCountStepper
                value={block.roundCount ?? 3}
                onChange={(n) => dispatch({ type: "SET_BLOCK_ROUND_COUNT", blockId: block.id, roundCount: n })}
              />
              <BlockOverflowMenu
                onDelete={() => dispatch({ type: "REMOVE_BLOCK", blockId: block.id })}
              />
            </div>
          </div>

          {/* items */}
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {block.items.map((item, idx) => (
                <SupersetItemRow
                  key={item.id}
                  block={block}
                  item={item}
                  itemIndex={idx}
                  canDelete={block.items.length > 2}
                  exerciseMap={exerciseMap}
                  dispatch={dispatch}
                />
              ))}
            </div>
          </SortableContext>

          {/* add exercise to superset */}
          {block.items.length < 6 && (
            <button
              type="button"
              onClick={() => setAddPickerOpen(true)}
              className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--text-subtle)] hover:text-[var(--accent)] focus:outline-none transition-colors"
            >
              <span className="text-base leading-none">+</span>
              Add exercise
            </button>
          )}

          {/* block rest */}
          <div className="mt-2">
            <RestInput
              restSec={block.restSec}
              label="Round rest"
              onChange={(sec) => dispatch({ type: "SET_BLOCK_REST", blockId: block.id, restSec: sec })}
            />
          </div>
        </div>
      </div>

      <ExercisePicker
        open={addPickerOpen}
        onClose={() => setAddPickerOpen(false)}
        onSelect={(exerciseId) => {
          setAddPickerOpen(false);
          dispatch({ type: "ADD_ITEM_TO_SUPERSET", blockId: block.id, exerciseId });
        }}
        title="Add to superset"
      />
    </div>
  );
}

function SupersetItemRow({
  block,
  item,
  itemIndex,
  canDelete,
  exerciseMap,
  dispatch,
}: {
  block: DraftBlock;
  item: DraftItem;
  itemIndex: number;
  canDelete: boolean;
  exerciseMap: Map<string, Exercise>;
  dispatch: Dispatch<BuilderAction>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
  };

  const exercise = exerciseMap.get(item.exerciseId);
  const isMissing = !exercise;
  const exerciseName = exercise?.name ?? "Missing exercise";

  const reps = repsSummary(item);
  const rpe = rpeSummary(item);
  const rest = restSummary(block.restSec);
  const dur = durationSummary(item);
  const chip = setTypeChip(item);

  const isCardio = exercise?.type === "cardio";
  const isMixed = exercise?.type === "mixed";

  const summaryParts = [
    `${item.setCount} ×`,
    isCardio || isMixed ? null : reps,
    dur,
    rpe,
    rest ? `${rest} rest` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("rounded-lg", isDragging && "shadow")}
    >
      <div className="flex items-center gap-1 py-1.5">
        {/* item drag handle */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          aria-label="Drag to reorder exercise"
          className="p-1 text-[var(--text-subtle)] cursor-grab active:cursor-grabbing focus:outline-none touch-none"
        >
          <DragHandleIcon size={14} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-[14px] font-medium truncate",
              isMissing ? "italic text-[var(--text-muted)]" : "text-[var(--text)]",
            )}>
              {exerciseName}
            </span>
            {!isMissing && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                aria-label="Replace exercise"
                className="text-[var(--text-subtle)] hover:text-[var(--text-muted)] focus:outline-none"
              >
                <PencilIcon />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[11px] text-[var(--text-muted)]">{summaryParts}</span>
            {chip && (
              <span className="text-[8px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-sm ring-1 ring-amber-500/30">
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

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label={expanded ? "Collapse prescription" : "Expand prescription"}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="rounded-md p-1 text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none"
          >
            <ChevronIcon expanded={expanded} />
          </button>
          {canDelete && (
            <button
              type="button"
              aria-label="Remove exercise from superset"
              onClick={() => dispatch({ type: "REMOVE_ITEM", blockId: block.id, itemId: item.id })}
              className="rounded-md p-1 text-[var(--text-subtle)] hover:text-red-400 focus:outline-none"
            >
              <TrashIcon />
            </button>
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

function RoundCountStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
      <button
        type="button"
        aria-label="Decrease rounds"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
        className="px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] hover:text-[var(--text)] disabled:opacity-30 focus:outline-none"
      >
        −
      </button>
      <span className="min-w-[2ch] text-center font-semibold text-[var(--text)] tabular">{value}</span>
      <button
        type="button"
        aria-label="Increase rounds"
        disabled={value >= 20}
        onClick={() => onChange(Math.min(20, value + 1))}
        className="px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] hover:text-[var(--text)] disabled:opacity-30 focus:outline-none"
      >
        +
      </button>
      <span className="text-[var(--text-subtle)] text-[10px]">rounds</span>
    </div>
  );
}

function BlockOverflowMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Superset options"
        onClick={() => setOpen(!open)}
        className="rounded-md p-1.5 text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none"
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

function DragHandleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="m19 6-.867 13.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
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
