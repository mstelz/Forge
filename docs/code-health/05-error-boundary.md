# [P2] Add React error boundary + global error handler

Part of the codebase-health roadmap.

## Problem
No `ErrorBoundary`, `componentDidCatch`, `window.onerror`, or `unhandledrejection` handler exists anywhere in `src/`. For an offline PWA, an uncaught render error becomes a white screen with no recovery path.

## Suggested work
- Top-level error boundary in `app.tsx` with a recovery UI.
- Global `unhandledrejection` handler routed through `syncLog`.

**Priority:** P2. Independent.
