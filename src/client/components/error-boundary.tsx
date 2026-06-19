import { Component, type ErrorInfo, type ReactNode } from "react";
import { syncLog } from "../sync/sync-logger";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. For an offline PWA an uncaught render error would
 * otherwise become a permanent white screen with no recovery path, so we catch
 * it, log it through `syncLog` (visible in the debug log), and offer the user a
 * way to recover without losing their locally-stored data.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    syncLog({
      level: "error",
      category: "app",
      message: `render error: ${error.message}`,
      detail: (info.componentStack ?? error.stack ?? "").trim().slice(0, 1000),
    });
  }

  private handleReload = (): void => {
    window.location.assign("/");
  };

  private handleTryAgain = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center"
      >
        <h1 className="text-lg font-semibold text-[var(--text)]">Something went wrong</h1>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">
          The app hit an unexpected error. Your workout data is saved locally and
          is safe — you can try again or reload.
        </p>
        <pre className="max-w-sm overflow-x-auto rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-2 text-left text-[11px] text-[var(--text-subtle)] ring-1 ring-[var(--border)]">
          {error.message}
        </pre>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={this.handleTryAgain}
            className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border-strong)]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
