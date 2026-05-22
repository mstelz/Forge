# 0007 — Remove `WORKOUT_DASH_API_TOKEN` from public-facing docs

**Status:** accepted · **Date:** 2026-05-22

## Context

The PRD and early product planning docs referenced `WORKOUT_DASH_API_TOKEN` as an environment variable that controlled write access to the API. This name leaked into public-facing docs (`docs/PRODUCT-PLAN.md`) as a partially-advertised auth mechanism.

v1 deliberately ships without bearer-token auth UI (see `docs/decisions/0006-auth-deferred.md`). The actual auth implementation uses `FORGE_TOKEN` (a cleaner, project-consistent name) in `src/server/auth.ts`. `WORKOUT_DASH_API_TOKEN` was never wired up in any code path — it was only referenced in planning docs.

## Decision

1. **Remove** all public-facing references to `WORKOUT_DASH_API_TOKEN` from docs.
2. The variable is **not honored** in v1 — it has no effect anywhere in the codebase.
3. The active auth mechanism is `FORGE_TOKEN` (see ADR 0006). When auth lands post-v1, the token name remains `FORGE_TOKEN`.
4. This cleanup is tracked in `specs/export/planning/tasks.md` Phase 5.

## Grep results at time of resolution

After cleanup, `WORKOUT_DASH_API_TOKEN` only appears in:
- `specs/export/planning/` — archival spec/requirement docs (not public-facing)
- No code, no README, no `docs/PRD.md`, no `docs/PRODUCT-PLAN.md`

## Consequences

- Public docs and README no longer advertise a non-existent auth mechanism.
- When bearer-token auth lands: use `FORGE_TOKEN`, not `WORKOUT_DASH_API_TOKEN`.
- The export endpoint (`GET /api/v1/export`) is open in v1, consistent with all other `/api/v1` routes.
