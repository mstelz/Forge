import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import {
  createSessionLog,
  deleteSession,
  deleteSessionLog,
  finishSession,
  updateSession,
} from "../../../db/mutations";
import { reconcileProgramRuns } from "../../../sync/program-run-reconciler";
import { reconcileGoals } from "../../../goals/reconcile";
import { syncLog } from "../../../sync/sync-logger";
import { uuidv4 } from "../../../lib/uuid";
import type { ExerciseType, Session, SessionSetLog } from "../../../../shared";
import type { CursorPos, LiveStructure, LogSetType } from "./types";

interface SessionActionsArgs {
  session: Session | null | undefined;
  liveStructure: LiveStructure;
  logs: SessionSetLog[];
  activeCursor: CursorPos | null;
  setSelectedPos: React.Dispatch<React.SetStateAction<CursorPos | null>>;
  isReopenEdit: boolean;
  originalEndedAt: number | null;
}

/**
 * Everything the logger writes back to the session: finishing, discarding,
 * pausing, skipping, and the set/structure edits made mid-workout.
 */
export function useSessionActions({
  session,
  liveStructure,
  logs,
  activeCursor,
  setSelectedPos,
  isReopenEdit,
  originalEndedAt,
}: SessionActionsArgs) {
  const navigate = useNavigate();

  const [finishing, setFinishing] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [pageToast, setPageToast] = useState<{ message: string; type: "error" | "info" } | null>(null);

  const showPageToast = useCallback((message: string, type: "error" | "info" = "error") => {
    setPageToast({ message, type });
    setTimeout(() => setPageToast(null), 3000);
  }, []);

  const handleFinish = useCallback(async () => {
    if (!session || finishing) return;
    setFinishing(true);
    try {
      const finished: Session = {
        ...session,
        status: "finished",
        endedAt: isReopenEdit && originalEndedAt != null ? originalEndedAt : Date.now(),
        updatedAt: Date.now(),
      };
      await finishSession(finished);
      // Update program run day state locally so home page reflects completion immediately
      if (session.sourceType === "program_day") {
        reconcileProgramRuns().catch((err) => syncLog({ level: "error", category: "reconcile", message: "program-run reconcile after finish failed", detail: String(err) }));
      }
      await reconcileGoals(session.id).catch((err) => syncLog({ level: "error", category: "reconcile", message: "goal reconcile after finish failed", detail: String(err) }));
      navigate(`/workout/sessions/${session.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to finish workout. Please try again.";
      showPageToast(msg);
    } finally {
      setFinishing(false);
      setFinishConfirmOpen(false);
    }
  }, [session, finishing, navigate, showPageToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDiscard = useCallback(() => {
    setDiscardConfirmOpen(true);
  }, []);

  const handleDiscardConfirmed = useCallback(async () => {
    if (!session) return;
    try {
      if (isReopenEdit) {
        // Re-editing a finished session — "discard" just re-finishes and goes back
        const finished: Session = {
          ...session,
          status: "finished",
          endedAt: originalEndedAt != null ? originalEndedAt : Date.now(),
          updatedAt: Date.now(),
        };
        await finishSession(finished);
        navigate(`/workout/sessions/${session.id}`, { replace: true });
      } else {
        await deleteSession(session.id);
        navigate("/workout/start", { replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to discard workout.";
      showPageToast(msg);
      setDiscardConfirmOpen(false);
    }
  }, [session, navigate, showPageToast, isReopenEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePauseAndLeave = useCallback(async () => {
    if (!session) return;
    await updateSession({ ...session, pausedAt: Date.now(), updatedAt: Date.now() });
    navigate("/", { replace: true });
  }, [session, navigate]);

  /** Back out of a reopened session by re-finishing it; otherwise plain history back. */
  const handleBack = useCallback(async () => {
    if (isReopenEdit && session) {
      const finished: Session = {
        ...session,
        status: "finished",
        endedAt: originalEndedAt != null ? originalEndedAt : Date.now(),
        updatedAt: Date.now(),
      };
      await finishSession(finished).catch((err) => syncLog({ level: "error", category: "app", message: "reopen-edit finish failed", detail: String(err) }));
      navigate(`/workout/sessions/${session.id}`, { replace: true });
    } else {
      navigate(-1);
    }
  }, [isReopenEdit, session, originalEndedAt, navigate]);

  const handleSkipSet = useCallback(async () => {
    if (!activeCursor || !session) return;
    const block = liveStructure.blocks[activeCursor.blockIdx];
    if (!block) return;
    const item = block.items[activeCursor.itemIdx];
    if (!item) return;
    const slot = item.setTargets[activeCursor.slotIdx];
    if (!slot) return;

    // Only skip unlogged planned sets (not extra sets, not already logged)
    if (activeCursor.isExtra) return;
    const alreadyLogged = logs.some(
      (l) =>
        l.performedExerciseId === item.performedExerciseId &&
        l.plannedSetId === slot.id &&
        l.status === "logged",
    );
    if (alreadyLogged) return;

    const order = logs.filter((l) => l.status === "logged" || l.status === "skipped").length;
    const record: SessionSetLog = {
      id: uuidv4(),
      sessionId: session.id,
      performedExerciseId: item.performedExerciseId,
      exerciseId: item.exerciseId,
      sessionItemId: item.sessionItemId,
      plannedSetId: slot.id,
      order,
      reps: null,
      weightKg: null,
      rpe: null,
      durationSec: null,
      distanceM: null,
      notes: null,
      setType: (slot.setType as LogSetType) ?? "normal",
      status: "skipped",
      loggedAt: Date.now(),
      restAfterSec: null,
      enteredWeight: null,
      enteredWeightUnit: null,
      enteredDistance: null,
      enteredDistanceUnit: null,
    };
    await createSessionLog(record);
  }, [activeCursor, session, liveStructure, logs]);

  const handleAddSet = useCallback(
    async (blockIdx: number, itemIdx: number) => {
      if (!session) return;
      const block = liveStructure.blocks[blockIdx];
      if (!block) return;
      const item = block.items[itemIdx];
      if (!item) return;

      // Order = last log for this exercise + 1
      const exerciseLogs = logs.filter(
        (l) => l.performedExerciseId === item.performedExerciseId,
      );
      const order = exerciseLogs.length > 0
        ? Math.max(...exerciseLogs.map((l) => l.order)) + 1
        : logs.length;

      const record: SessionSetLog = {
        id: uuidv4(),
        sessionId: session.id,
        performedExerciseId: item.performedExerciseId,
        exerciseId: item.exerciseId,
        sessionItemId: item.sessionItemId,
        plannedSetId: null,
        order,
        reps: null,
        weightKg: null,
        rpe: null,
        durationSec: null,
        distanceM: null,
        notes: null,
        setType: "normal",
        status: "extra",
        loggedAt: Date.now(),
        restAfterSec: null,
        enteredWeight: null,
        enteredWeightUnit: null,
        enteredDistance: null,
        enteredDistanceUnit: null,
      };
      await createSessionLog(record);

      // Place cursor on this new extra set
      const extraSlotIdx = item.setTargets.length; // beyond last planned slot
      setSelectedPos({ blockIdx, itemIdx, slotIdx: extraSlotIdx, isExtra: true });
    },
    [session, liveStructure, logs], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleDeleteSlot = useCallback(
    async (blockIdx: number, itemIdx: number, slotIdx: number) => {
      if (!session) return;
      const block = liveStructure.blocks[blockIdx];
      if (!block) return;
      const item = block.items[itemIdx];
      if (!item) return;
      const slot = item.setTargets[slotIdx];
      if (!slot) return;

      // Delete any log tied to this slot
      const matchingLog = logs.find(
        (l) => l.performedExerciseId === item.performedExerciseId && l.plannedSetId === slot.id,
      );
      if (matchingLog) {
        await deleteSessionLog(matchingLog.id, session.id);
      }

      // Remove the slot from setTargets
      const updatedItem = {
        ...item,
        setTargets: item.setTargets.filter((_, i) => i !== slotIdx),
        setCount: item.setCount - 1,
      };
      const updatedBlock = {
        ...block,
        items: block.items.map((it, i) => (i === itemIdx ? updatedItem : it)),
      };
      const updated = {
        ...liveStructure,
        blocks: liveStructure.blocks.map((b, i) => (i === blockIdx ? updatedBlock : b)),
      };
      await updateSession({ ...session, liveStructure: JSON.stringify(updated), updatedAt: Date.now() });

      // Clear cursor if it was on the deleted slot
      setSelectedPos((prev) => {
        if (prev && prev.blockIdx === blockIdx && prev.itemIdx === itemIdx && prev.slotIdx === slotIdx) {
          return null;
        }
        return prev;
      });
    },
    [session, liveStructure, logs], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleDeleteExtraLog = useCallback(
    async (logId: string) => {
      if (!session) return;
      await deleteSessionLog(logId, session.id);
      setSelectedPos((prev) => (prev?.isExtra ? null : prev));
    },
    [session], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSaveBlockNote = useCallback((blockIdx: number, note: string | null) => {
    if (!session) return;
    const updatedBlocks = liveStructure.blocks.map((b, i) =>
      i === blockIdx ? { ...b, notes: note } : b,
    );
    void updateSession({
      ...session,
      liveStructure: JSON.stringify({ ...liveStructure, blocks: updatedBlocks }),
      updatedAt: Date.now(),
    });
  }, [session, liveStructure]);

  return {
    pageToast,
    finishing,
    finishConfirmOpen,
    setFinishConfirmOpen,
    discardConfirmOpen,
    setDiscardConfirmOpen,
    handleFinish,
    handleDiscard,
    handleDiscardConfirmed,
    handlePauseAndLeave,
    handleBack,
    handleSkipSet,
    handleAddSet,
    handleDeleteSlot,
    handleDeleteExtraLog,
    handleSaveBlockNote,
  };
}

/**
 * Picking an exercise mid-session, then choosing how many sets of it to add.
 * A run is one continuous effort, so cardio defaults to a single set.
 */
export function useAddExercise(session: Session | null | undefined, liveStructure: LiveStructure) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingExerciseId, setPendingExerciseId] = useState<string | null>(null);
  const [setCountInput, setSetCountInput] = useState("3");

  const handleAddExercise = useCallback(
    (exerciseId: string, exerciseType: ExerciseType) => {
      setPickerOpen(false);
      setSetCountInput(exerciseType === "cardio" ? "1" : "3");
      setPendingExerciseId(exerciseId);
    },
    [],
  );

  const confirmAddExercise = useCallback(
    async (exerciseId: string, setCount: number) => {
      if (!session) return;
      setPendingExerciseId(null);
      const sid = uuidv4();
      const setTargets = Array.from({ length: setCount }, (_, i) => ({
        id: uuidv4(),
        order: i,
        setType: "normal",
      }));
      const newBlock = {
        id: uuidv4(),
        type: "single" as const,
        items: [
          {
            id: sid,
            performedExerciseId: uuidv4(),
            sessionItemId: sid,
            exerciseId,
            setCount,
            setTargets,
          },
        ],
      };
      const updated = { ...liveStructure, blocks: [...liveStructure.blocks, newBlock] };
      await updateSession({ ...session, liveStructure: JSON.stringify(updated), updatedAt: Date.now() });
    },
    [session, liveStructure],
  );

  return {
    pickerOpen,
    setPickerOpen,
    pendingExerciseId,
    setPendingExerciseId,
    setCountInput,
    setSetCountInput,
    handleAddExercise,
    confirmAddExercise,
  };
}
