# 0006 — Auth deferred to phase 2

**Status:** accepted · **Date:** 2026-04-23

## Context

The PRD specifies bearer-token-protected API access, but v1 is single-user on a self-hosted box. Implementing auth UI (login, token pairing, session handling) adds scope without delivering user-visible value in v1 unless the instance is exposed to the internet.

## Decision

Ship v1 with a stub auth middleware that checks a single `FORGE_TOKEN` environment variable against the `Authorization: Bearer` header. If the env var is unset, the middleware no-ops (dev mode). No client-side login UI — users set the token once in their Docker config.

## Specifics

- Server middleware: ~10 lines in `src/server/auth.ts`
- Behavior:
  - `FORGE_TOKEN` unset → all requests pass (development / trusted LAN)
  - `FORGE_TOKEN` set → `/api/v1/*` requires matching bearer token; 401 otherwise
- Static assets and the SPA shell are always served (no auth)
- Client reads token from a `VITE_FORGE_TOKEN` build-time env or localStorage (set once via a hidden pairing page if we add one in phase 2)

## Rationale

- Real auth (login UI, token rotation, session management) is scope creep for v1
- The bearer-token approach satisfies the PRD requirement without a client UI
- Self-hosted users comfortable running Docker are comfortable setting an env var
- Deferring keeps the critical path (logger working offline) unpolluted by auth redirects

## Consequences

- v1 is not safe to expose directly to the internet without a reverse-proxy auth layer — document this
- Phase 2 will need: pairing flow (QR code or one-time URL), token storage in IndexedDB, refresh handling, logout
- API consumers (scripts, automation) use the same bearer token — simplifies the automation story
