import type { LogSetType } from "../../../shared/session-log";

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
  durationDigits: number[];
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
  durationDigits: [],
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
  | { type: "pushDurationDigit"; digit: number }
  | { type: "popDurationDigit" }
  | { type: "incrementDuration" }
  | { type: "decrementDuration" }
  | { type: "distanceInput"; value: string }
  | { type: "adjustDistance"; delta: number }
  | { type: "setSetType"; setType: LogSetType }
  | { type: "setNote"; note: string }
  | { type: "prefill"; values: LogFormPrefill }
  | { type: "resetAfterLog" };

// ── Pure digit-buffer helpers (shared with the duration input renderer) ──────────
export function secondsToDigits(secs: number): number[] {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const full = [
    Math.floor(h / 10), h % 10,
    Math.floor(m / 10), m % 10,
    Math.floor(r / 10), r % 10,
  ];
  // Trim leading zeros
  let start = 0;
  while (start < full.length - 1 && full[start] === 0) start++;
  return full.slice(start);
}

export function bufferToSeconds(digits: number[]): number {
  const padded = [...Array(Math.max(0, 6 - digits.length)).fill(0), ...digits];
  const h = padded[0]! * 10 + padded[1]!;
  const m = padded[2]! * 10 + padded[3]!;
  const s = padded[4]! * 10 + padded[5]!;
  return h * 3600 + m * 60 + s;
}

export function formatDigits(digits: number[]): string {
  if (digits.length === 0) return "";
  const padded = [...Array(Math.max(0, 6 - digits.length)).fill(0), ...digits];
  const h = padded[0]! * 10 + padded[1]!;
  const m = padded[2]! * 10 + padded[3]!;
  const s = padded[4]! * 10 + padded[5]!;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
    case "pushDurationDigit": {
      const next = [...state.durationDigits, action.digit].slice(-6);
      return { ...state, durationDigits: next, durationSec: bufferToSeconds(next) };
    }
    case "popDurationDigit": {
      const next = state.durationDigits.slice(0, -1);
      return { ...state, durationDigits: next, durationSec: next.length > 0 ? bufferToSeconds(next) : null };
    }
    case "incrementDuration": {
      const next = (state.durationSec ?? 0) + 30;
      return { ...state, durationSec: next, durationDigits: secondsToDigits(next) };
    }
    case "decrementDuration": {
      const next = Math.max(0, (state.durationSec ?? 0) - 30);
      return {
        ...state,
        durationSec: next > 0 ? next : null,
        durationDigits: next > 0 ? secondsToDigits(next) : [],
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
      if (v.durationSec !== undefined) { next.durationSec = v.durationSec; next.durationDigits = secondsToDigits(v.durationSec); }
      if (v.distanceDisplay !== undefined) { next.distanceDisplay = v.distanceDisplay; next.distanceInputStr = String(v.distanceDisplay); }
      if (v.setType !== undefined) next.setType = v.setType;
      if (v.note !== undefined) next.note = v.note;
      return next;
    }
    case "resetAfterLog":
      return { ...state, note: "", rpe: null };
  }
}
