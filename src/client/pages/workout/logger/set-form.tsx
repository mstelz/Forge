import {
  useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type MutableRefObject,
} from "react";
import { SettingsContext } from "../../../contexts/settings-context";
import { logSetBatch, updateSessionLog, updateSetBatch } from "../../../db/mutations";
import { listLogsForExercise } from "../../../db/queries";
import { recordsByLogId } from "../../../lib/session/records";
import { describeRecord, headlineRecord } from "../../../lib/session/record-labels";
import { syncLog } from "../../../sync/sync-logger";
import { convertDistance, convertWeight, distanceToMeters, weightToKg } from "../../../lib/units";
import { getLastLogValuesForExercise } from "../../../lib/session/prior-values";
import { platesForTarget, describeLoading } from "../../../lib/plates";
import { useLoadStyle } from "./use-load-style";
import {
  logFormReducer, initialLogFormState,
  type LogFormPrefill,
} from "../../../lib/session/log-form";
import { uuidv4 } from "../../../lib/uuid";
import { CheckIcon } from "../icons";
import { computeRestBackfill, startRestTimer, validateMetrics } from "./log-set-builders";
import { metricFieldsFor } from "./metric-visibility";
import {
  DurationDistanceInputs, RpeStepper, SetTypeChips, WeightRepsInputs,
} from "./metric-inputs";
import { RestTimerStrip } from "./rest-timer";
import { Toast, type ToastType } from "./toast";
import type { ExerciseType, Session, SessionSetLog } from "../../../../shared";
import type { CursorPos, LiveItem, LiveStructure, LogSetType, PlannedSlot, RestTimerData } from "./types";

/**
 * Which plates to put on the bar, revealed on tap.
 *
 * Only shown for barbell work, and only once there is a weight to break down.
 * The bar and plate set are the common defaults — a home gym with an odd set will
 * see a loading it cannot make, which is why an inexact target says so explicitly
 * rather than quietly rounding.
 */
function PlateHint({
  weightDisplay,
  unit,
  open,
  onToggle,
}: {
  weightDisplay: number;
  unit: "kg" | "lb";
  open: boolean;
  onToggle: () => void;
}) {
  const loading = platesForTarget(weightDisplay, unit);

  return (
    <div className="-mt-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {open ? "Hide plates" : "Show plates"}
      </button>
      {open && (
        <p className="mt-1 text-xs text-[var(--text)]">
          {!loading ? (
            <span className="text-[var(--text-muted)]">
              Lighter than the bar — nothing to load.
            </span>
          ) : (
            <>
              {describeLoading(loading, unit)}
              {loading.approximate && (
                <span className="text-[var(--text-muted)]">
                  {" "}— closest is {loading.achievedWeight}{unit}
                </span>
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}

export interface BottomPanelProps {
  cursor: CursorPos | null;
  liveStructure: LiveStructure;
  logs: SessionSetLog[];
  session: Session;
  timer: RestTimerData;
  timerDisplaySecs: number;
  onTimerToggle: () => void;
  onFinishWorkout: () => void;
  onSkipSet: () => void;
  onEditSaved: () => void;
  exerciseTypes: Map<string, ExerciseType>;
  /** Used to name the lift when a set sets a record. */
  exerciseNames: Map<string, string>;
  noteOpen: boolean;
  onToggleNote: () => void;
  onCloseNote: () => void;
  audioCtxRef: MutableRefObject<AudioContext | null>;
}

export function BottomPanel({
  cursor,
  liveStructure,
  logs,
  session,
  timer,
  timerDisplaySecs,
  onTimerToggle,
  onFinishWorkout,
  onSkipSet,
  onEditSaved,
  exerciseTypes,
  exerciseNames,
  noteOpen,
  onToggleNote,
  onCloseNote,
  audioCtxRef,
}: BottomPanelProps) {
  // All metric form fields live in one reducer so paired display/input values stay in
  // lock-step; see lib/session/log-form.ts. UI status (logging/validation/toast) is
  // orthogonal and stays as plain state.
  const [form, dispatch] = useReducer(logFormReducer, initialLogFormState);
  const { rpe, setType, note } = form;
  const { weightUnit, distanceUnit, showRpe } = useContext(SettingsContext);
  const [logging, setLogging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [platesOpen, setPlatesOpen] = useState(false);

  const showToast = useCallback((message: string, type: ToastType = "error", ms = 3000) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), ms);
  }, []);

  /**
   * Say so when a set just beat something, naming the lift and the number.
   *
   * Deliberately fire-and-forget after the write: reading an exercise's whole
   * history is not something the LOG SET button should ever wait on. If it is
   * slow, the set is already saved and the cursor has already moved.
   */
  const announceRecords = useCallback(
    (logId: string, exerciseId: string, exerciseName: string) => {
      void listLogsForExercise(exerciseId)
        .then((history) => {
          const beaten = recordsByLogId(history).get(logId);
          const headline = beaten ? headlineRecord(beaten) : null;
          if (!headline) return;
          showToast(
            `${exerciseName} — ${describeRecord(headline, { weightUnit, distanceUnit })}`,
            "record",
            5000,
          );
        })
        .catch((err) =>
          syncLog({
            level: "error",
            category: "app",
            message: "record check failed",
            detail: String(err),
          }),
        );
    },
    [showToast, weightUnit, distanceUnit],
  );

  const currentSlot = useMemo<PlannedSlot | null>(() => {
    if (!cursor) return null;
    const block = liveStructure.blocks[cursor.blockIdx];
    if (!block) return null;
    const item = block.items[cursor.itemIdx];
    if (!item) return null;
    return item.setTargets[cursor.slotIdx] ?? null;
  }, [cursor, liveStructure]);

  const currentItem = useMemo<LiveItem | null>(() => {
    if (!cursor) return null;
    const block = liveStructure.blocks[cursor.blockIdx];
    if (!block) return null;
    return block.items[cursor.itemIdx] ?? null;
  }, [cursor, liveStructure]);

  const currentExerciseType = currentItem
    ? (exerciseTypes.get(currentItem.exerciseId) ?? "strength")
    : "strength";
  const { showWeightReps, showDurationDistance } = metricFieldsFor(currentExerciseType);
  const { hasPlates } = useLoadStyle(currentItem?.exerciseId);

  const isEditingExisting = useMemo(
    () =>
      !!(
        currentItem &&
        currentSlot &&
        logs.some(
          (l) =>
            l.performedExerciseId === currentItem.performedExerciseId &&
            l.plannedSetId === currentSlot.id &&
            l.status === "logged",
        )
      ),
    [currentItem, currentSlot, logs],
  );

  // Pre-fill from the existing log for this slot (if editing) or from the last log
  // for this exercise. Re-runs whenever the active slot changes.
  const prevSlotKey = useRef<string | null>(null);
  useEffect(() => {
    if (!currentItem || !currentSlot) return;
    const slotKey = `${currentItem.performedExerciseId}:${currentSlot.id}`;
    if (prevSlotKey.current === slotKey) return;
    prevSlotKey.current = slotKey;

    // If this slot already has a logged entry, pre-fill from it so the user
    // edits the existing values rather than getting stale defaults.
    const existingLog = logs.find(
      (l) =>
        l.performedExerciseId === currentItem.performedExerciseId &&
        l.plannedSetId === currentSlot.id &&
        l.status === "logged",
    );

    const toWeightDisplay = (kg: number) => Math.round(convertWeight(kg, weightUnit) * 100) / 100;
    const toDistanceDisplay = (m: number) => Math.round(convertDistance(m, distanceUnit) * 1000) / 1000;

    if (existingLog) {
      const values: LogFormPrefill = {
        setType: (existingLog.setType as LogSetType) ?? "normal",
        // Pre-fill note from the saved log so editing can't accidentally wipe it
        note: existingLog.notes ?? "",
      };
      if (existingLog.weightKg != null) values.weightDisplay = toWeightDisplay(existingLog.weightKg);
      if (existingLog.reps != null) values.reps = existingLog.reps;
      if (existingLog.rpe != null) values.rpe = existingLog.rpe;
      if (existingLog.durationSec != null) values.durationSec = existingLog.durationSec;
      if (existingLog.distanceM != null) values.distanceDisplay = toDistanceDisplay(existingLog.distanceM);
      dispatch({ type: "prefill", values });
      return;
    }

    // No existing log — clear the note and carry last time's numbers forward.
    dispatch({ type: "prefill", values: { note: "" } });

    // The last set actually logged for this exercise, across ALL sessions — its
    // weight and reps as performed. The form proposes nothing of its own: what
    // you did last time is the honest starting point, and adjusting from a real
    // number takes one tap on a stepper.
    let isCurrent = true;
    void getLastLogValuesForExercise(currentItem.exerciseId)
      .then((prev) => {
        if (!isCurrent) return;
        if (prev) {
          const values: LogFormPrefill = {};
          if (prev.weightKg != null) values.weightDisplay = toWeightDisplay(prev.weightKg);
          if (prev.reps != null) values.reps = prev.reps;
          if (prev.durationSec != null) values.durationSec = prev.durationSec;
          if (prev.distanceM != null) values.distanceDisplay = toDistanceDisplay(prev.distanceM);
          // Do not pre-fill RPE — it is per-set
          dispatch({ type: "prefill", values });
        } else if (currentSlot.reps != null) {
          // Nothing logged before: fall back to the reps the plan prescribes.
          dispatch({ type: "prefill", values: { reps: currentSlot.reps } });
        }
      })
      .catch((err) =>
        syncLog({ level: "error", category: "app", message: "set-form prefill failed", detail: String(err) }),
      );
    return () => { isCurrent = false; };
  }, [currentItem, currentSlot, logs, weightUnit, distanceUnit]);

  const handleLogSet = async () => {
    if (!cursor || !currentItem || logging) return;
    const block = liveStructure.blocks[cursor.blockIdx];
    if (!block) return;

    const { weightDisplay, reps, durationSec, distanceDisplay } = form;
    const storedKg = weightDisplay != null ? weightToKg(weightDisplay, weightUnit) : null;
    const storedM = distanceDisplay != null ? distanceToMeters(distanceDisplay, distanceUnit) : null;

    const invalid = validateMetrics({
      showWeightReps,
      showDurationDistance,
      hasStrengthMetric: (reps != null && reps > 0) || (weightDisplay != null && weightDisplay > 0),
      hasCardioMetric: (durationSec != null && durationSec > 0) || (distanceDisplay != null && distanceDisplay > 0),
    });

    const metricFields = (now: number) => ({
      reps,
      weightKg: storedKg,
      rpe,
      durationSec: showDurationDistance ? (durationSec ?? null) : null,
      distanceM: showDurationDistance ? storedM : null,
      notes: note.trim() || null,
      setType,
      loggedAt: now,
      enteredWeight: weightDisplay,
      enteredWeightUnit: (weightDisplay != null ? weightUnit : null) as "kg" | "lb" | null,
    });
    const restingSession = (now: number) =>
      startRestTimer(session, block.restSec ?? currentItem.restSec ?? 90, now);

    // ── Extra set branch (ADD SET button) ────────────────────────────────────
    if (cursor.isExtra) {
      const extraLog = [...logs]
        .filter((l) => l.performedExerciseId === currentItem.performedExerciseId && l.status === "extra")
        .sort((a, b) => b.loggedAt - a.loggedAt)[0];
      if (!extraLog) return;

      if (invalid) { setValidationError(invalid); return; }
      setValidationError(null);
      setLogging(true);
      try {
        const now = Date.now();
        const updatedExtraLog = { ...extraLog, ...metricFields(now) };
        const prevLogUpdate = computeRestBackfill(logs, now);
        // Unlock AudioContext via this user gesture so it can play at timer expiry
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        else if (audioCtxRef.current.state === "suspended") void audioCtxRef.current.resume();
        await updateSetBatch(updatedExtraLog, restingSession(now), prevLogUpdate);
        dispatch({ type: "resetAfterLog" }); onCloseNote();
        prevSlotKey.current = null;
        announceRecords(
          updatedExtraLog.id,
          currentItem.exerciseId,
          exerciseNames.get(currentItem.exerciseId) ?? "This exercise",
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to save. Please try again.");
      } finally {
        setLogging(false);
      }
      return;
    }

    // ── Normal / edit planned-slot branch ────────────────────────────────────
    if (!currentSlot) return;

    if (invalid) {
      setValidationError(invalid);
      return;
    }
    setValidationError(null);

    setLogging(true);
    try {
      const now = Date.now();

      // Check if this planned slot already has a log (user is editing a logged set)
      const existingLog = logs.find(
        (l) =>
          l.performedExerciseId === currentItem.performedExerciseId &&
          l.plannedSetId === currentSlot.id &&
          l.status === "logged",
      );

      const updatedFields = metricFields(now);

      if (existingLog) {
        // Update in place — don't advance rest timer or backfill restAfterSec
        await updateSessionLog({ ...existingLog, ...updatedFields });
        // Return to the next unlogged set
        onEditSaved();
      } else {
        // New log: build all writes and commit in one transaction
        const prevLogUpdate = computeRestBackfill(logs, now);

        const order = logs.filter((l) => l.status === "logged").length;
        const record: SessionSetLog = {
          id: uuidv4(),
          sessionId: session.id,
          performedExerciseId: currentItem.performedExerciseId,
          exerciseId: currentItem.exerciseId,
          sessionItemId: currentItem.sessionItemId,
          plannedSetId: currentSlot.id,
          order,
          restAfterSec: null,
          enteredDistance: null,
          enteredDistanceUnit: null,
          status: "logged",
          ...updatedFields,
        };

        await logSetBatch(record, restingSession(now), prevLogUpdate);
        // Only a genuinely new set can set a record — editing one after the fact
        // would re-announce history the user already saw.
        announceRecords(
          record.id,
          currentItem.exerciseId,
          exerciseNames.get(currentItem.exerciseId) ?? "This exercise",
        );
      }

      dispatch({ type: "resetAfterLog" }); onCloseNote();
      // Reset slot tracking so the next cursor position pre-fills fresh
      prevSlotKey.current = null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save. Please try again.";
      showToast(msg);
    } finally {
      setLogging(false);
    }
  };

  // Rendered by both branches below. Logging the last set of a workout moves the
  // cursor to null, and a toast that only existed in the cursor branch would be
  // thrown away at exactly the moment it had something to say — the last set is
  // as likely to be the record as any other.
  const toastEl = toast ? <Toast message={toast.message} type={toast.type} /> : null;

  if (!cursor) {
    return (
      <>
        <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 pb-6 pt-4 space-y-3">
          <button
            type="button"
            onClick={onFinishWorkout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-base font-bold text-[var(--accent-fg)] hover:opacity-90"
          >
            <CheckIcon className="text-[var(--accent-fg)]" />
            FINISH WORKOUT
          </button>
          <button
            type="button"
            className="w-full rounded-2xl border border-[var(--border)] py-3 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Add extra set
          </button>
        </div>
        {toastEl}
      </>
    );
  }

  return (
    <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)]">
      <RestTimerStrip
        timer={timer}
        displaySecs={timerDisplaySecs}
        onToggle={onTimerToggle}
      />

      <div className="px-4 pb-5 pt-3 space-y-4">
        {/* Metric inputs */}
        <div className="flex flex-wrap gap-4">
          {showWeightReps && (
            <WeightRepsInputs
              form={form}
              dispatch={dispatch}
              weightUnit={weightUnit}
              onEdit={() => setValidationError(null)}
            />
          )}
          {showDurationDistance && (
            <DurationDistanceInputs
              form={form}
              dispatch={dispatch}
              distanceUnit={distanceUnit}
            />
          )}
        </div>

        {/* Plate breakdown — tap to reveal, because the logger is dense enough */}
        {hasPlates && showWeightReps && form.weightDisplay != null && (
          <PlateHint weightDisplay={form.weightDisplay} unit={weightUnit} open={platesOpen} onToggle={() => setPlatesOpen((o) => !o)} />
        )}

        {showRpe && <RpeStepper rpe={rpe} dispatch={dispatch} />}

        <SetTypeChips
          setType={setType}
          dispatch={dispatch}
          noteOpen={noteOpen}
          onToggleNote={onToggleNote}
        />

        {/* Note input */}
        {noteOpen && (
          <textarea
            value={note}
            onChange={(e) => dispatch({ type: "setNote", note: e.target.value })}
            placeholder="Add a note…"
            rows={2}
            autoFocus
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none"
          />
        )}

        {/* Validation error */}
        {validationError && (
          <p role="alert" className="text-xs font-semibold text-[var(--danger)]">
            {validationError}
          </p>
        )}

        {/* LOG SET (+ optional SKIP button) */}
        {!isEditingExisting && !cursor?.isExtra ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLogSet}
              disabled={logging}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-base font-bold text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50"
            >
              <CheckIcon className="text-[var(--accent-fg)]" />
              {logging ? "Saving…" : "LOG SET"}
            </button>
            <button
              type="button"
              onClick={onSkipSet}
              disabled={logging}
              className="flex items-center justify-center rounded-2xl border border-[var(--border)] px-5 py-4 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLogSet}
            disabled={logging}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-base font-bold text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50"
          >
            <CheckIcon className="text-[var(--accent-fg)]" />
            {logging ? "Saving…" : isEditingExisting ? "SAVE EDIT" : "LOG SET"}
          </button>
        )}
      </div>

      {toastEl}
    </div>
  );
}
