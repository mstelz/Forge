export type ToastTone = "success" | "error" | "info";

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  /** Optional second line for detail such as an error string. */
  detail?: string;
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
