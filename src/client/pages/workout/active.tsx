import { useState } from "react";
import { useLocation } from "react-router";
import { ExercisePicker } from "../../components/exercise-picker";
import { EditTimeModal } from "./edit-time-modal";
import { EditStructureSheet } from "./edit-structure/index";
import { PlusSmIcon } from "./icons";
import { BottomPanel } from "./logger/set-form";
import { ExerciseCard } from "./logger/exercise-card";
import { ExerciseHistorySheet, ExerciseInfoSheet } from "./logger/exercise-sheets";
import { useRestTimer } from "./logger/rest-timer";
import {
  DiscardWorkoutDialog,
  FinishWorkoutDialog,
  SetCountDialog,
} from "./logger/session-dialogs";
import { PageSkeleton, SessionHeader } from "./logger/session-header";
import { countDoneSlots, totalSlotCount } from "./logger/structure";
import { Toast } from "./logger/toast";
import { useCursor } from "./logger/use-cursor";
import { useAddExercise, useSessionActions } from "./logger/use-session-actions";
import { useExerciseMeta, useSessionData } from "./logger/use-session-data";

/**
 * The live workout logger. This file is composition only — the logger's pieces
 * live in ./logger, and the state it runs on comes from the hooks there.
 */
export function ActiveWorkoutPage() {
  const location = useLocation();
  const isReopenEdit = !!(location.state as { isReopenEdit?: boolean } | null)?.isReopenEdit;
  const [originalEndedAt, setOriginalEndedAt] = useState<number | null>(
    (location.state as { originalEndedAt?: number } | null)?.originalEndedAt ?? null
  );

  const { session, sessionLoading, logs, liveStructure } = useSessionData();
  const { exerciseNamesRef, exerciseTypesRef } = useExerciseMeta(liveStructure);
  const { cursor, setSelectedPos, activeCursor } = useCursor(liveStructure, logs);
  const { timer, displaySecs, toggle: handleTimerToggle, audioCtxRef } = useRestTimer(session);

  const [editTimeOpen, setEditTimeOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; name: string } | null>(null);
  const [infoTarget, setInfoTarget] = useState<{ id: string; name: string } | null>(null);

  const addExercise = useAddExercise(session, liveStructure);
  const actions = useSessionActions({
    session,
    liveStructure,
    logs,
    activeCursor,
    setSelectedPos,
    isReopenEdit,
    originalEndedAt,
  });

  if (sessionLoading || !session) {
    return <PageSkeleton />;
  }

  const total = totalSlotCount(liveStructure);
  const done = countDoneSlots(liveStructure, logs);
  const headerLabel =
    cursor === null ? "All sets done" : `Set ${Math.min(done + 1, total)} of ${total}`;

  return (
    <div className="flex flex-1 flex-col">
      <SessionHeader
        headerLabel={headerLabel}
        onBack={actions.handleBack}
        onFinish={() => actions.setFinishConfirmOpen(true)}
        onDiscard={actions.handleDiscard}
        onEditStructure={() => setStructureOpen(true)}
        onEditTime={() => setEditTimeOpen(true)}
        onPauseAndLeave={actions.handlePauseAndLeave}
        isReopenEdit={isReopenEdit}
      />

      {/* Scrollable body */}
      <main className="flex-1 overflow-y-auto space-y-4 px-4 pb-4 pt-2">
        {liveStructure.blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <p className="text-sm text-[var(--text-muted)]">No exercises planned.</p>
            <button
              type="button"
              onClick={() => addExercise.setPickerOpen(true)}
              className="rounded-2xl bg-[var(--accent)] px-6 py-3 text-sm font-bold text-[var(--accent-fg)] hover:opacity-90"
            >
              Add exercise
            </button>
          </div>
        ) : (
          <>
            {liveStructure.blocks.map((block, blockIdx) => (
              <ExerciseCard
                key={block.id}
                block={block}
                blockIdx={blockIdx}
                session={session}
                logs={logs}
                cursor={activeCursor}
                exerciseNames={exerciseNamesRef.current}
                onSlotTap={(bi, ii, si, isExtra) =>
                  setSelectedPos({ blockIdx: bi, itemIdx: ii, slotIdx: si, isExtra })
                }
                onAddSet={actions.handleAddSet}
                onDeleteSlot={actions.handleDeleteSlot}
                onDeleteExtraLog={actions.handleDeleteExtraLog}
                onSaveBlockNote={(note) => actions.handleSaveBlockNote(blockIdx, note)}
                onViewHistory={(id, name) => setHistoryTarget({ id, name })}
                onViewInfo={(id, name) => setInfoTarget({ id, name })}
              />
            ))}
            <button
              type="button"
              onClick={() => addExercise.setPickerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] py-3 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <PlusSmIcon />
              Add exercise
            </button>
          </>
        )}
      </main>

      <ExercisePicker
        open={addExercise.pickerOpen}
        onClose={() => addExercise.setPickerOpen(false)}
        onSelect={addExercise.handleAddExercise}
        title="Add exercise"
      />

      <SetCountDialog
        open={addExercise.pendingExerciseId !== null}
        setCountInput={addExercise.setCountInput}
        onSetCountInput={addExercise.setSetCountInput}
        onCancel={() => addExercise.setPendingExerciseId(null)}
        onConfirm={(count) => {
          if (addExercise.pendingExerciseId) {
            addExercise.confirmAddExercise(addExercise.pendingExerciseId, count);
          }
        }}
      />

      <EditStructureSheet
        open={structureOpen}
        onClose={() => setStructureOpen(false)}
        session={session}
        logs={logs}
        exerciseNames={exerciseNamesRef.current}
      />

      <BottomPanel
        cursor={activeCursor}
        liveStructure={liveStructure}
        logs={logs}
        session={session}
        timer={timer}
        timerDisplaySecs={displaySecs}
        onTimerToggle={handleTimerToggle}
        onFinishWorkout={() => actions.setFinishConfirmOpen(true)}
        onSkipSet={actions.handleSkipSet}
        onEditSaved={() => setSelectedPos(null)}
        exerciseTypes={exerciseTypesRef.current}
        noteOpen={noteOpen}
        onToggleNote={() => setNoteOpen((o) => !o)}
        onCloseNote={() => setNoteOpen(false)}
        audioCtxRef={audioCtxRef}
      />

      {historyTarget && (
        <ExerciseHistorySheet
          exerciseId={historyTarget.id}
          exerciseName={historyTarget.name}
          open={true}
          onClose={() => setHistoryTarget(null)}
        />
      )}

      {infoTarget && (
        <ExerciseInfoSheet
          exerciseId={infoTarget.id}
          exerciseName={infoTarget.name}
          open={true}
          onClose={() => setInfoTarget(null)}
        />
      )}

      <FinishWorkoutDialog
        open={actions.finishConfirmOpen}
        onOpenChange={actions.setFinishConfirmOpen}
        finishing={actions.finishing}
        onConfirm={actions.handleFinish}
      />

      <DiscardWorkoutDialog
        open={actions.discardConfirmOpen}
        onOpenChange={actions.setDiscardConfirmOpen}
        isReopenEdit={isReopenEdit}
        onConfirm={actions.handleDiscardConfirmed}
      />

      {/* Page-level toast (for finish/discard errors) */}
      {actions.pageToast && (
        <Toast message={actions.pageToast.message} type={actions.pageToast.type} />
      )}

      <EditTimeModal
        isOpen={editTimeOpen}
        onClose={() => setEditTimeOpen(false)}
        sessionId={session.id}
        initialStartedAt={session.startedAt}
        initialEndedAt={originalEndedAt}
        onSuccess={(newEndedAt) => {
          if (newEndedAt != null) setOriginalEndedAt(newEndedAt);
        }}
      />
    </div>
  );
}

// Named export alias to match what app.tsx imports
export { ActiveWorkoutPage as WorkoutActivePage };
