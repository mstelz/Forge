# [P4] Repo hygiene cleanup

Part of the codebase-health roadmap.

## Problem
- 15 untracked PNG/GIF files in repo root (`home-page.png`, `demo.gif`, `gif-frames/`, etc.); some duplicate files already in `design/screenshots/`.
- `scripts/seed-demo.ts` fails `bun run typecheck` (3 errors at lines 114, 424-425) — the only thing breaking typecheck.
- Untracked `.superpowers/`, `docs/superpowers/`, `docs/MULTI-USER-PLAN.md`, stray PNGs — decide tracked vs ignored.

## Suggested work
- Move screenshots into `design/` or gitignore them.
- Fix or exclude `seed-demo.ts` from the tsconfig include.
- Resolve the remaining untracked files.

**Priority:** P4.
