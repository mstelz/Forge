# [Tracking] Codebase Health: anti-patterns & refactoring roadmap

Tracking issue for the codebase-health review. Sub-issues are ordered so they can be tackled one at a time.

## P1 — High
- [ ] [01 — Refactor active.tsx god-component](01-active-tsx-god-component.md)
- [ ] [02 — DRY the data/sync layer](02-dry-data-sync-layer.md)
- [ ] [03 — Remove migration self-healing hacks](03-migration-self-healing-hacks.md)

## P2 — Medium
- [ ] [04 — Normalize timestamp storage modes](04-normalize-timestamp-modes.md)
- [ ] [05 — React error boundary + global error handler](05-error-boundary.md)
- [ ] [06 — Type the sync payload boundary](06-type-sync-payload.md)
- [ ] [07 — Sync drain robustness](07-sync-drain-robustness.md)
- [ ] [08 — Fix/remove drifted pendingWrites schema mirror](08-pendingwrites-schema-mirror.md)
- [ ] [09 — Decompose oversized modules](09-decompose-oversized-modules.md)

## P3 — Low
- [ ] [10 — Unify logging strategy](10-unify-logging.md)
- [ ] [11 — Consolidate time-formatting helpers](11-consolidate-time-formatters.md)

## P4 — Hygiene
- [x] [12 — Repo hygiene cleanup](12-repo-hygiene.md)

## Suggested sequencing (dependencies)
```
04 (timestamp normalization)  --> 02 (server-route dedup / shared row-mapper)
02 (data-layer dedup)         --> 06 (typed payloads)  --> eases 07, 08
01 (active.tsx) — independent; BottomPanel -> reducer extraction first
03, 05, 09, 10, 11, 12 — independent, any time
```

## Documented deferral (not a finding)
Auth is a single shared `FORGE_TOKEN` with no per-user scoping (ADR 0006, `docs/MULTI-USER-PLAN.md`) — intentional v1 decision, listed so it is not mistaken for an oversight.
