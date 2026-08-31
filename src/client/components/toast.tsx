import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import { uuidv4 } from "../lib/uuid";
import { toastReducer, type Toast, type ToastTone } from "./toast-state";

type ShowToast = (
  message: string,
  opts?: { tone?: ToastTone; detail?: string },
) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** Announce something that happened. Replaces the app's native alert() calls. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, { toasts: [] });

  const show = useCallback<ShowToast>((message, opts) => {
    dispatch({
      type: "push",
      toast: {
        id: uuidv4(),
        message,
        tone: opts?.tone ?? "info",
        detail: opts?.detail,
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

/** Errors stay put — a message you cannot re-read is worse than none. */
const AUTO_DISMISS_MS = 4500;

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (toast.tone === "error") return;
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, toast.tone, onDismiss]);

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
