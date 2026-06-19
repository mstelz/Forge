# Code-Health Workflow — Design & Execution Plan

**Date:** 2026-06-18
**Source of truth for:** autonomous execution of the 12 issues in `docs/code-health/`.

## Goal

Address and manage all 12 code-health issues autonomously, in dependency order,
landing each as its own PR that auto-merges once the verification gate is green.

## Decisions (from brainstorming)

- **Execution model:** plan + execute in order, autonomously, no per-issue review wait.
- **Integration:** one branch + PR per issue; auto-merge to `main` once the gate passes.
- **Style:** serial execution by the main agent (not parallel subagents). The
  dependency chain dominates and serial keeps the auto-merge gate deterministic.

## Verification gate (every PR)

Both must pass before merge:

1. `bun run typecheck` → 0 errors
2. `bun run test --run` → all tests green (baseline: 143 tests, 15 files)

Each PR also ticks its checkbox in `docs/code-health/00-tracking.md`.

## Baseline (2026-06-18)

- Tests: 143 passing.
- Typecheck: **red** — 3 errors, all in `scripts/seed-demo.ts` (lines 114, 424–425).
  This is why issue 12 (P4) is pulled to the front: the gate cannot go green until
  these are fixed.

## Execution order

| Order | Issue | Rationale |
|-------|-------|-----------|
| 0 | 12 — repo hygiene (+ fix seed-demo typecheck) | Unblocks the green gate; low risk |
| 1 | 04 — normalize timestamp modes | Prereq for clean row-mappers |
| 2 | 02 — DRY data/sync layer | Depends on 04 |
| 3 | 06 — type sync payload | Depends on 02 |
| 4 | 07 — sync drain robustness | Eased by 06 |
| 5 | 08 — pendingWrites schema mirror | Eased by 06 |
| 6 | 03 — migration self-healing hacks | Independent (P1); no DB ops run |
| 7 | 05 — error boundary | Independent (P2) |
| 8 | 11 — consolidate time formatters | Before 01 (both touch active.tsx formatters) |
| 9 | 01 — active.tsx god-component | Big; cleaner after 11 |
| 10 | 09 — decompose oversized modules | Big; same pattern as 01 |
| 11 | 10 — unify logging | Lowest churn, last |

## Risk handling

- Big refactors (01, 02, 09) are **behavior-preserving**, guarded by the existing
  143 tests + typecheck. Add tests where coverage is thin before refactoring.
- **Issue 03** touches prod migration state: do the code/ADR cleanup only; the
  actual DB recovery stays a documented manual step. Nothing is run against a real DB.
- **Issue 12** untracked-file calls: gitignore root screenshots/gifs and
  `.superpowers/`; fix seed-demo; keep `docs/MULTI-USER-PLAN.md` tracked. Flag
  anything ambiguous rather than delete.

## Management

- All 12 tracked as harness tasks (in_progress/completed) with dependency links.
- `docs/code-health/00-tracking.md` checkboxes updated as each lands.
- Report after each merge.
