export type ToastTone = "success" | "error" | "info";

/**
 * A single button on the toast — the "Undo" affordance that lets a destructive
 * action be offered instead of confirmed.
 */
export type ToastActionSpec = {
  label: string;
  run: () => void;
};

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  /** Optional second line for detail such as an error string. */
  detail?: string;
  /** Optional inline button, e.g. `{ label: "Undo", run }`. */
  action?: ToastActionSpec;
};

export type ToastState = { toasts: Toast[] };

export type ToastAction =
  | { type: "push"; toast: Toast }
  | { type: "dismiss"; id: string };

/** More than a few stacked toasts stops being readable on a phone. */
const MAX_VISIBLE = 3;

export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "push":
      return { toasts: [...state.toasts, action.toast].slice(-MAX_VISIBLE) };
    case "dismiss":
      return { toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

/** Errors stay put — a message you cannot re-read is worse than none. */
export const AUTO_DISMISS_MS = 4500;

/**
 * An actionable toast is the only chance to take the action back, so it has to
 * outlive the window for a message you merely read. Long enough to notice the
 * mistake and reach the button; short enough that it isn't furniture.
 */
export const ACTION_DISMISS_MS = 10_000;

/** How long this toast should sit before auto-dismissing; null means "never". */
export function dismissDelayFor(toast: Toast): number | null {
  if (toast.tone === "error") return null;
  return toast.action ? ACTION_DISMISS_MS : AUTO_DISMISS_MS;
}

/**
 * Wrap a callback so only the first call gets through. Undo buttons are tapped
 * twice — impatiently, or by a touch event that fires alongside a click — and
 * the second tap must be inert rather than a second restore.
 */
export function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}
