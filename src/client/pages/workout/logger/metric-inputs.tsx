import { NoteIcon } from "../icons";
import type { LogFormAction, LogFormState } from "../../../lib/session/log-form";
import type { LogSetType } from "./types";

/**
 * The metric steppers. They take the log-form `dispatch` rather than a setter per
 * field, so the paired display/input values in the reducer stay in lock-step —
 * see lib/session/log-form.ts.
 */

type Dispatch = (action: LogFormAction) => void;

const STEPPER_BUTTON =
  "flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]";
const STEPPER_FIELD =
  "flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]";
const STEPPER_INPUT =
  "w-0 min-w-0 flex-1 bg-transparent text-center text-lg font-bold tabular-nums text-[var(--text)] focus:outline-none";
const FIELD_LABEL =
  "text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]";

export function WeightRepsInputs({
  form,
  dispatch,
  weightUnit,
  onEdit,
}: {
  form: LogFormState;
  dispatch: Dispatch;
  weightUnit: "kg" | "lb";
  /** Clears the validation error as soon as the user starts fixing it. */
  onEdit: () => void;
}) {
  return (
    <>
      <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "120px" }}>
        <p className={FIELD_LABEL}>Weight {weightUnit}</p>
        <div className={STEPPER_FIELD}>
          <button
            type="button"
            aria-label={`Decrease weight by 2.5 ${weightUnit}`}
            onClick={() => {
              onEdit();
              dispatch({ type: "adjustWeight", delta: -2.5 });
            }}
            className={STEPPER_BUTTON}
          >
            −
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={form.weightInputStr}
            placeholder="—"
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              onEdit();
              dispatch({ type: "weightInput", value: e.target.value });
            }}
            className={STEPPER_INPUT}
          />
          <button
            type="button"
            aria-label={`Increase weight by 2.5 ${weightUnit}`}
            onClick={() => {
              onEdit();
              dispatch({ type: "adjustWeight", delta: 2.5 });
            }}
            className={STEPPER_BUTTON}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "120px" }}>
        <p className={FIELD_LABEL}>Reps</p>
        <div className={STEPPER_FIELD}>
          <button
            type="button"
            aria-label="Decrease reps by 1"
            onClick={() => {
              onEdit();
              dispatch({ type: "decrementReps" });
            }}
            className={STEPPER_BUTTON}
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={form.repsInputStr}
            placeholder="—"
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              onEdit();
              dispatch({ type: "repsInput", value: e.target.value });
            }}
            className={STEPPER_INPUT}
          />
          <button
            type="button"
            aria-label="Increase reps by 1"
            onClick={() => {
              onEdit();
              dispatch({ type: "incrementReps" });
            }}
            className={STEPPER_BUTTON}
          >
            +
          </button>
        </div>
      </div>
    </>
  );
}

export function DurationDistanceInputs({
  form,
  dispatch,
  distanceUnit,
}: {
  form: LogFormState;
  dispatch: Dispatch;
  distanceUnit: "m" | "km" | "mi";
}) {
  const distanceStep = distanceUnit === "m" ? 100 : 0.25;

  return (
    <>
      <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "120px" }}>
        <p className={FIELD_LABEL}>Duration</p>
        <div className={STEPPER_FIELD}>
          <button
            type="button"
            aria-label="Decrease duration by 30 seconds"
            onClick={() => dispatch({ type: "decrementDuration" })}
            className={STEPPER_BUTTON}
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Duration"
            value={form.durationInputStr}
            placeholder="0:00"
            onFocus={(e) => e.target.select()}
            onChange={(e) => dispatch({ type: "durationInput", value: e.target.value })}
            onBlur={() => dispatch({ type: "normalizeDuration" })}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={STEPPER_INPUT}
          />
          <button
            type="button"
            aria-label="Increase duration by 30 seconds"
            onClick={() => dispatch({ type: "incrementDuration" })}
            className={STEPPER_BUTTON}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "120px" }}>
        <p className={FIELD_LABEL}>Distance {distanceUnit}</p>
        <div className={STEPPER_FIELD}>
          <button
            type="button"
            aria-label={`Decrease distance by ${distanceStep} ${distanceUnit}`}
            onClick={() => dispatch({ type: "adjustDistance", delta: -distanceStep })}
            className={STEPPER_BUTTON}
          >
            −
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={form.distanceInputStr}
            placeholder="—"
            onFocus={(e) => e.target.select()}
            onChange={(e) => dispatch({ type: "distanceInput", value: e.target.value })}
            className={STEPPER_INPUT}
          />
          <button
            type="button"
            aria-label={`Increase distance by ${distanceStep} ${distanceUnit}`}
            onClick={() => dispatch({ type: "adjustDistance", delta: distanceStep })}
            className={STEPPER_BUTTON}
          >
            +
          </button>
        </div>
      </div>
    </>
  );
}

export function RpeStepper({ rpe, dispatch }: { rpe: number | null; dispatch: Dispatch }) {
  return (
    <div className="flex flex-col gap-1.5" style={{ maxWidth: "160px" }}>
      <p className={FIELD_LABEL}>RPE</p>
      <div className={STEPPER_FIELD}>
        <button
          type="button"
          aria-label="Decrease RPE by 0.5"
          onClick={() => dispatch({ type: "decrementRpe" })}
          className="flex h-11 w-11 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          −
        </button>
        <span className="flex-1 text-center text-lg font-bold tabular-nums text-[var(--text)]">
          {rpe != null ? rpe : "—"}
        </span>
        <button
          type="button"
          aria-label="Increase RPE by 0.5"
          onClick={() => dispatch({ type: "incrementRpe" })}
          className="flex h-11 w-11 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          +
        </button>
      </div>
    </div>
  );
}

const SET_TYPE_CHIPS: { key: LogSetType; label: string }[] = [
  { key: "normal", label: "N" },
  { key: "drop", label: "D" },
  { key: "warmup", label: "W" },
  { key: "failure", label: "F" },
  { key: "amrap", label: "A" },
  { key: "rest_pause", label: "RP" },
];

export function SetTypeChips({
  setType,
  dispatch,
  noteOpen,
  onToggleNote,
}: {
  setType: LogSetType;
  dispatch: Dispatch;
  noteOpen: boolean;
  onToggleNote: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SET_TYPE_CHIPS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => dispatch({ type: "setSetType", setType: key })}
          className={[
            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            setType === key
              ? "bg-[var(--accent)] text-[var(--accent-fg)]"
              : "border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={onToggleNote}
        className={[
          "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
          noteOpen
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
        ].join(" ")}
      >
        <NoteIcon />
        Note
      </button>
    </div>
  );
}
