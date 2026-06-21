import { useState, useCallback, useEffect } from "react";
import { forgeDB } from "../../../db/forge-db";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { LiveStructure } from "../../../lib/session/cursor";
import type { Session, SessionSetLog } from "../../../../shared";
import { updateSession, updateSessionLog } from "../../../db/mutations";
import { ExercisePicker } from "../../../components/exercise-picker";
import {
  addExerciseBlock,
  removeBlock,
  reorderBlocks,
  swapExercise,
  addExerciseToSuperset,
  removeExerciseFromSuperset,
} from "./exercise-ops";
import { addSetToBlock, removeSetFromBlock } from "./set-ops";
import { addRoundToSuperset, removeRoundFromSuperset } from "./round-ops";
import { splitSuperset, convertToSuperset, convertToSingle } from "./restructure-ops";
import { BlockCard, type BlockAction } from "./block-card";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditStructureSheetProps {
  open: boolean;
  onClose: () => void;
  session: Session;
  logs: SessionSetLog[];
  exerciseNames: Map<string, string>;
}

// ─── Main Edit Structure Sheet ────────────────────────────────────────────────

export function EditStructureSheet({
  open,
  onClose,
  session,
  logs,
  exerciseNames,
}: EditStructureSheetProps) {
  // Parse liveStructure from session on mount / when session changes
  const [draft, setDraft] = useState<LiveStructure>(() => {
    try {
      return JSON.parse(session.liveStructure) as LiveStructure;
    } catch {
      return { blocks: [] };
    }
  });

  // Resolved exercise names — supplement the prop with a DB lookup so names
  // appear immediately even if the parent ref hasn't populated yet.
  const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(
    () => new Map(exerciseNames),
  );

  useEffect(() => {
    if (!open) return;
    const allIds = draft.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    const uniqueIds = Array.from(new Set(allIds));
    const missing = uniqueIds.filter((id) => !exerciseNames.has(id));

    const base = new Map(exerciseNames);
    if (missing.length === 0) {
      setResolvedNames(base);
      return;
    }
    Promise.all(
      missing.map((id) =>
        forgeDB.exercises.get(id).then((ex) => [id, ex?.name ?? null] as const),
      ),
    ).then((pairs) => {
      for (const [id, name] of pairs) {
        if (name) base.set(id, name);
      }
      setResolvedNames(base);
    });
  }, [open, draft, exerciseNames]);

  // Re-sync draft when the sheet opens with a fresh session
  // (We track the session.liveStructure as a stable prop — the sheet only stages edits)
  const [prevLiveStructure, setPrevLiveStructure] = useState(session.liveStructure);
  if (session.liveStructure !== prevLiveStructure) {
    setPrevLiveStructure(session.liveStructure);
    try {
      setDraft(JSON.parse(session.liveStructure) as LiveStructure);
    } catch {
      setDraft({ blocks: [] });
    }
  }

  // ── Pending orphan log reclassifications ──────────────────────────────────
  const [orphanedPerformedExerciseIds, setOrphanedPerformedExerciseIds] = useState<string[]>([]);
  const [orphanedPlannedSetIds, setOrphanedPlannedSetIds] = useState<string[]>([]);

  // ── Exercise picker state ─────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerContext, setPickerContext] = useState<
    | { kind: "add_exercise_block" }
    | { kind: "add_to_superset"; blockIndex: number }
    | { kind: "swap"; blockIndex: number; itemIndex: number }
    | null
  >(null);

  // ── DnD sensors ───────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = draft.blocks.findIndex((b) => b.id === active.id);
    const toIndex = draft.blocks.findIndex((b) => b.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      setDraft((d) => reorderBlocks(d, fromIndex, toIndex));
    }
  };

  // ── Block action handler ───────────────────────────────────────────────────
  const handleAction = useCallback((action: BlockAction) => {
    switch (action.type) {
      case "remove_block": {
        const { newStructure, orphanedPerformedExerciseIds: orphaned } = removeBlock(
          draft,
          action.blockIndex,
        );
        setDraft(newStructure);
        setOrphanedPerformedExerciseIds((prev) => [...prev, ...orphaned]);
        break;
      }
      case "add_set": {
        setDraft((d) => addSetToBlock(d, action.blockIndex));
        break;
      }
      case "remove_set": {
        const { newStructure, orphanedPlannedSetIds: orphaned } = removeSetFromBlock(
          draft,
          action.blockIndex,
          action.slotIndex,
        );
        setDraft(newStructure);
        setOrphanedPlannedSetIds((prev) => [...prev, ...orphaned]);
        break;
      }
      case "add_round": {
        setDraft((d) => addRoundToSuperset(d, action.blockIndex));
        break;
      }
      case "remove_round": {
        const { newStructure, orphanedPlannedSetIds: orphaned } = removeRoundFromSuperset(
          draft,
          action.blockIndex,
        );
        setDraft(newStructure);
        setOrphanedPlannedSetIds((prev) => [...prev, ...orphaned]);
        break;
      }
      case "swap_exercise": {
        setPickerContext({ kind: "swap", blockIndex: action.blockIndex, itemIndex: action.itemIndex });
        setPickerOpen(true);
        break;
      }
      case "add_to_superset": {
        setPickerContext({ kind: "add_to_superset", blockIndex: action.blockIndex });
        setPickerOpen(true);
        break;
      }
      case "remove_from_superset": {
        const { newStructure, orphanedPerformedExerciseIds: orphaned } = removeExerciseFromSuperset(
          draft,
          action.blockIndex,
          action.itemIndex,
        );
        setDraft(newStructure);
        setOrphanedPerformedExerciseIds((prev) => [...prev, ...orphaned]);
        break;
      }
      case "split_superset": {
        setDraft((d) => splitSuperset(d, action.blockIndex, action.splitAfterItemIndex));
        break;
      }
      case "convert_to_superset": {
        setDraft((d) => convertToSuperset(d, action.blockIndex));
        break;
      }
      case "convert_to_single": {
        setDraft((d) => convertToSingle(d, action.blockIndex));
        break;
      }
    }
  }, [draft]);

  // ── Exercise picker handler ────────────────────────────────────────────────
  const handlePickerSelect = useCallback(
    (exerciseId: string) => {
      setPickerOpen(false);
      if (!pickerContext) return;

      if (pickerContext.kind === "add_exercise_block") {
        setDraft((d) => addExerciseBlock(d, exerciseId));
      } else if (pickerContext.kind === "add_to_superset") {
        setDraft((d) => addExerciseToSuperset(d, pickerContext.blockIndex, exerciseId));
      } else if (pickerContext.kind === "swap") {
        setDraft((d) => swapExercise(d, pickerContext.blockIndex, pickerContext.itemIndex, exerciseId));
      }

      setPickerContext(null);
    },
    [pickerContext],
  );

  // ── Done handler — commit to Dexie ────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  const handleDone = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    try {
      // Reclassify orphaned logs in parallel
      const reclassifyPromises: Promise<unknown>[] = [];

      // Reclassify logs whose performedExerciseId was orphaned
      if (orphanedPerformedExerciseIds.length > 0) {
        const orphanedSet = new Set(orphanedPerformedExerciseIds);
        const affectedLogs = logs.filter(
          (l) => orphanedSet.has(l.performedExerciseId) && l.status !== "extra",
        );
        for (const log of affectedLogs) {
          reclassifyPromises.push(
            updateSessionLog({
              ...log,
              plannedSetId: null,
              status: "extra",
            }),
          );
        }
      }

      // Reclassify logs whose plannedSetId was orphaned
      if (orphanedPlannedSetIds.length > 0) {
        const orphanedSet = new Set(orphanedPlannedSetIds);
        const affectedLogs = logs.filter(
          (l) => l.plannedSetId && orphanedSet.has(l.plannedSetId) && l.status !== "extra",
        );
        for (const log of affectedLogs) {
          reclassifyPromises.push(
            updateSessionLog({
              ...log,
              plannedSetId: null,
              status: "extra",
            }),
          );
        }
      }

      await Promise.all(reclassifyPromises);

      // Write the new session with updated liveStructure
      await updateSession({
        ...session,
        liveStructure: JSON.stringify(draft),
        updatedAt: Date.now(),
      });

      // Reset orphan tracking
      setOrphanedPerformedExerciseIds([]);
      setOrphanedPlannedSetIds([]);

      onClose();
    } finally {
      setSaving(false);
    }
  }, [saving, draft, session, logs, orphanedPerformedExerciseIds, orphanedPlannedSetIds, onClose]);

  const handleClose = useCallback(() => {
    // Reset draft and orphan state on cancel
    try {
      setDraft(JSON.parse(session.liveStructure) as LiveStructure);
    } catch {
      setDraft({ blocks: [] });
    }
    setOrphanedPerformedExerciseIds([]);
    setOrphanedPlannedSetIds([]);
    onClose();
  }, [session.liveStructure, onClose]);

  if (!open) return null;

  const blockIds = draft.blocks.map((b) => b.id);
  const activeBlock = activeId ? draft.blocks.find((b) => b.id === activeId) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={handleClose}
        role="presentation"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit structure"
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg)]"
        style={{ height: "90dvh" }}
      >
        {/* Sheet header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <h2 className="text-sm font-semibold text-[var(--text)]">Edit Structure</h2>
          <button
            type="button"
            onClick={handleDone}
            disabled={saving}
            className="rounded-md p-1.5 text-sm font-semibold text-[var(--accent)] hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Done"}
          </button>
        </div>

        {/* Scrollable block list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
              {draft.blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-[var(--text-muted)]">No exercises. Tap below to add one.</p>
                </div>
              ) : (
                draft.blocks.map((block, blockIndex) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    blockIndex={blockIndex}
                    exerciseNames={resolvedNames}
                    onAction={handleAction}
                  />
                ))
              )}
            </SortableContext>

            <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
              {activeBlock ? (
                <div className="rounded-[var(--radius-card)] border border-[var(--accent)]/40 bg-[var(--surface)] px-3 py-2.5 shadow-xl opacity-90">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">
                    {activeBlock.type === "superset"
                      ? `Superset · ${activeBlock.items.length} exercises`
                      : (resolvedNames.get(activeBlock.items[0]?.exerciseId ?? "") ?? "Exercise")}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Add exercise button */}
          <button
            type="button"
            onClick={() => {
              setPickerContext({ kind: "add_exercise_block" });
              setPickerOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] py-3 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <PlusIcon />
            Add exercise
          </button>
        </div>
      </div>

      {/* Exercise picker overlay */}
      <ExercisePicker
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPickerContext(null);
        }}
        onSelect={handlePickerSelect}
        title={
          pickerContext?.kind === "swap"
            ? "Replace exercise"
            : pickerContext?.kind === "add_to_superset"
              ? "Add to superset"
              : "Add exercise"
        }
      />
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
