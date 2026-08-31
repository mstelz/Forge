import type { LogSetType } from "../../../shared/session-log";
import { formatHms, parseDuration, MAX_DURATION_SEC } from "../time";

/**
 * Pure state machine for the active-workout "log a set" form (active.tsx BottomPanel).
 *
 * The form has several fields whose display value and raw input string (or digit
 * buffer) must stay in lock-step — the historical source of drift bugs when they were
 * 11 separate useState pairs. Modelling them as one reducer makes every transition a
 * pure, unit-testable function and guarantees the paired fields never diverge.
 *
 * Unit conversion stays in the component (it owns the user's unit preference); prefill
 * actions carry already-resolved display numbers.
 */

export type LogFormState = {
  weightDisplay: number | null;
  weightInputStr: string;
  reps: number | null;
  repsInputStr: string;
  rpe: number | null;
  durationSec: number | null;
  durationInputStr: string;
  distanceDisplay: number | null;
  distanceInputStr: string;
  setType: LogSetType;
  note: string;
};

export const initialLogFormState: LogFormState = {
  weightDisplay: null,
  weightInputStr: "",
  reps: null,
  repsInputStr: "",
  rpe: null,
  durationSec: null,
  durationInputStr: "",
  distanceDisplay: null,
  distanceInputStr: "",
  setType: "normal",
  note: "",
};

/** Resolved display values for a prefill; only provided keys are applied. */
export type LogFormPrefill = {
  weightDisplay?: number;
  reps?: number;
  rpe?: number;
  durationSec?: number;
  distanceDisplay?: number;
  setType?: LogSetType;
  note?: string;
};

export type LogFormAction =
  | { type: "weightInput"; value: string }
  | { type: "adjustWeight"; delta: number }
  | { type: "repsInput"; value: string }
  | { type: "incrementReps" }
  | { type: "decrementReps" }
  | { type: "incrementRpe" }
  | { type: "decrementRpe" }
  | { type: "durationInput"; value: string }
  | { type: "normalizeDuration" }
  | { type: "incrementDuration" }
  | { type: "decrementDuration" }
  | { type: "distanceInput"; value: string }
  | { type: "adjustDistance"; delta: number }
  | { type: "setSetType"; setType: LogSetType }
  | { type: "setNote"; note: string }
  | { type: "prefill"; values: LogFormPrefill }
  | { type: "resetAfterLog" };

export function logFormReducer(state: LogFormState, action: LogFormAction): LogFormState {
  switch (action.type) {
    case "weightInput": {
      const v = parseFloat(action.value);
      return { ...state, weightInputStr: action.value, weightDisplay: isNaN(v) ? null : Math.max(0, v) };
    }
    case "adjustWeight": {
      const next = Math.max(0, Number(((state.weightDisplay ?? 0) + action.delta).toFixed(2)));
      return { ...state, weightDisplay: next, weightInputStr: String(next) };
    }
    case "repsInput": {
      const v = parseInt(action.value, 10);
      return { ...state, repsInputStr: action.value, reps: isNaN(v) ? null : Math.max(0, v) };
    }
    case "incrementReps": {
      const next = (state.reps ?? 0) + 1;
      return { ...state, reps: next, repsInputStr: String(next) };
    }
    case "decrementReps": {
      const next = Math.max(1, (state.reps ?? 1) - 1);
      return { ...state, reps: next, repsInputStr: String(next) };
    }
    case "incrementRpe":
      return { ...state, rpe: Math.min(10, Math.round(((state.rpe ?? 5) + 0.5) * 2) / 2) };
    case "decrementRpe":
      return { ...state, rpe: state.rpe != null ? Math.max(0, Math.round((state.rpe - 0.5) * 2) / 2) : null };
    case "durationInput": {
      // An ordinary controlled field: whatever the input reports is the value,
      // so selecting the text and typing replaces it like any other input.
      const parsed = parseDuration(action.value);
      return {
        ...state,
        durationInputStr: action.value,
        durationSec: parsed === undefined ? state.durationSec : parsed,
      };
    }
    case "normalizeDuration": {
      // On blur, redisplay the committed value so "90" tidies to "1:30" and a
      // half-typed string falls back to the last duration that parsed.
      return {
        ...state,
        durationInputStr: state.durationSec != null ? formatHms(state.durationSec) : "",
      };
    }
    case "incrementDuration": {
      const next = Math.min(MAX_DURATION_SEC, (state.durationSec ?? 0) + 30);
      return { ...state, durationSec: next, durationInputStr: formatHms(next) };
    }
    case "decrementDuration": {
      const next = Math.max(0, (state.durationSec ?? 0) - 30);
      return {
        ...state,
        durationSec: next > 0 ? next : null,
        durationInputStr: next > 0 ? formatHms(next) : "",
      };
    }
    case "distanceInput": {
      const v = parseFloat(action.value);
      return { ...state, distanceInputStr: action.value, distanceDisplay: isNaN(v) ? null : Math.max(0, v) };
    }
    case "adjustDistance": {
      const next = Math.max(0, Math.round(((state.distanceDisplay ?? 0) + action.delta) * 1000) / 1000);
      return { ...state, distanceDisplay: next, distanceInputStr: String(next) };
    }
    case "setSetType":
      return { ...state, setType: action.setType };
    case "setNote":
      return { ...state, note: action.note };
    case "prefill": {
      const v = action.values;
      const next = { ...state };
      if (v.weightDisplay !== undefined) { next.weightDisplay = v.weightDisplay; next.weightInputStr = String(v.weightDisplay); }
      if (v.reps !== undefined) { next.reps = v.reps; next.repsInputStr = String(v.reps); }
      if (v.rpe !== undefined) next.rpe = v.rpe;
      if (v.durationSec !== undefined) { next.durationSec = v.durationSec; next.durationInputStr = formatHms(v.durationSec); }
      if (v.distanceDisplay !== undefined) { next.distanceDisplay = v.distanceDisplay; next.distanceInputStr = String(v.distanceDisplay); }
      if (v.setType !== undefined) next.setType = v.setType;
      if (v.note !== undefined) next.note = v.note;
      return next;
    }
    case "resetAfterLog":
      return { ...state, note: "", rpe: null };
  }
}
