import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import { uuidv4 } from "../lib/uuid";
import {
  dismissDelayFor,
  once,
  toastReducer,
  type Toast,
  type ToastActionSpec,
  type ToastTone,
} from "./toast-state";

type ShowToast = (
  message: string,
  opts?: { tone?: ToastTone; detail?: string; action?: ToastActionSpec },
) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** Announce something that happened. Replaces the app's native alert() calls. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

/**
 * Announce a deletion and offer to take it back — the affordance that lets a
 * destructive action happen immediately instead of behind a confirm dialog.
 */
export function useUndoToast(): (message: string, undo: () => void) => void {
  const show = useToast();
  return useCallback(
    (message, undo) => show(message, { action: { label: "Undo", run: undo } }),
    [show],
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, { toasts: [] });

  const show = useCallback<ShowToast>((message, opts) => {
    const action = opts?.action;
    dispatch({
      type: "push",
      toast: {
        id: uuidv4(),
        message,
        tone: opts?.tone ?? "info",
        detail: opts?.detail,
        // Guard at creation: the button is torn down on the first tap, but a
        // double tap can fire twice before React re-renders.
        action: action ? { ...action, run: once(action.run) } : undefined,
      },
    });
  }, []);

  const dismiss = useCallback((id: string) => dispatch({ type: "dismiss", id }), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ToastViewport toasts={state.toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] mx-auto flex max-w-md flex-col gap-2 px-4"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const TONE_ACCENT: Record<ToastTone, string> = {
  success: "bg-[var(--success)]",
  error: "bg-[var(--danger)]",
  info: "bg-[var(--accent)]",
};

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const delay = dismissDelayFor(toast);

  useEffect(() => {
    if (delay === null) return;
    const timer = setTimeout(() => onDismiss(toast.id), delay);
    return () => clearTimeout(timer);
  }, [toast.id, delay, onDismiss]);

  const action = toast.action;

  return (
    <div
      role="status"
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      className="pointer-events-auto flex items-start gap-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-elevated)] p-3 ring-1 ring-[var(--border)] shadow-lg"
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 h-full min-h-[2rem] w-1 shrink-0 rounded-full ${TONE_ACCENT[toast.tone]}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text)]">{toast.message}</p>
        {toast.detail ? (
          <p className="mt-0.5 break-words text-xs text-[var(--text-muted)]">
            {toast.detail}
          </p>
        ) : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={() => {
            action.run();
            onDismiss(toast.id);
          }}
          className="shrink-0 self-center rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 rounded-md px-1.5 text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        ×
      </button>
    </div>
  );
}
