# 0008 — Migration baseline & recovery

**Status:** accepted · **Date:** 2026-06-18

## Context

The Drizzle migration history drifted from the databases it was supposed to
describe. Over the project's life some schema changes were applied to live
databases **out-of-band** (by hand, or by a migration run that partially applied
and was then rolled back at the ledger level). To stop `migrate()` from crashing
on the next boot ("duplicate column name" when re-adding an existing column, "no
such column" when dropping an already-dropped one), `src/server/index.ts` grew a
pair of self-healing shims, `recordIfOrphaned` / `recordIfDropped`, that
hand-insert rows into `__drizzle_migrations` with hardcoded magic timestamps so
drizzle treats those migrations as already-applied.

Symptoms of the drift:

- **Self-healing shims** in `server/index.ts` (`recordIfOrphaned` x3,
  `recordIfDropped` x1) papering over migrations `0006`–`0009`.
- **`drizzle-kit generate` is broken**: it fails with a snapshot collision —
  `meta/0002–0004_snapshot.json` point to a colliding parent snapshot — so new
  migrations cannot be generated until the meta history is repaired.
- A **server-unused `pending_writes` table** (created by migration `0000`) that
  no code reads or writes; its Drizzle mirror was removed in issue 08.

The shims are fragile in both directions: they are load-bearing for existing
prod databases (remove them and a fresh deploy can crash), yet on a *fresh*
database they can mis-record a migration as applied and leave the schema subtly
wrong. This is why they cannot simply be deleted from code.

## Decision

Adopt a **single squashed baseline migration** that matches the current intended
schema (`src/db/schema.ts`), and retire the self-healing shims as part of a
one-time, coordinated reset performed against each live database. New schema
changes proceed normally from that baseline via `drizzle-kit generate`.

The destructive parts of this reset (rewriting migration files, editing each
database's `__drizzle_migrations` ledger) **must be run by a maintainer against
each real database** — they cannot be done safely from a dev checkout because
they depend on the exact state of the live ledger. This ADR is the runbook.

## Going-forward migration process

1. Change `src/db/schema.ts`.
2. `bun run db:generate` (drizzle-kit generate) to produce a new migration +
   snapshot. **Never** hand-edit a live database's schema.
3. Review the generated SQL, commit it with the schema change.
4. Deploy. `migrate()` in `src/server/index.ts` applies pending migrations on
   boot. No shims, no manual ledger edits.

## Baseline-reset runbook (one-time, per database)

> Take a backup of every target database first. Steps 3–5 are irreversible.

1. **Snapshot the current schema as the baseline.** With a database that is
   known-good (or `schema.ts` treated as canonical), produce a single
   `0000_baseline.sql` whose `CREATE TABLE` statements match `schema.ts`. Remove
   the old `0000`–`0012` SQL files and the entire `meta/` directory, then let
   `drizzle-kit generate` rebuild `meta/` cleanly from the baseline (this also
   resolves the snapshot collision). Drop the legacy `pending_writes` table in
   this baseline (carried in from issue 08).
2. **Verify** `drizzle-kit generate` now runs without the snapshot-collision
   error and produces no diff against `schema.ts`.
3. **For each live database**: in a transaction, clear `__drizzle_migrations`
   and insert exactly one row recording the new baseline's hash as applied
   (the schema already physically matches it).
4. **Delete the shims**: remove `recordIfOrphaned` / `recordIfDropped` and their
   four call sites from `src/server/index.ts`, leaving only the
   `CREATE TABLE IF NOT EXISTS "__drizzle_migrations"` guard and `migrate()`.
5. **Deploy and verify** a clean boot: `migrate()` should report no pending
   migrations and the app should start without the `[migrations] recording …`
   log lines.

## What was done now (code-only, non-destructive)

- Fixed the copy-paste log bug: `recordIfDropped` logged "recording orphaned
  migration"; it now logs the dropped-column case correctly.
- Documented the shims as load-bearing and pointed them at this ADR.
- Removed the drifted `pending_writes` Drizzle mirror (issue 08).

The schema/ledger rewrite and shim deletion are intentionally **not** performed
from the repo — they are the runbook above, to be executed by a maintainer with
access to the live databases.

## Consequences

- Until the runbook is executed, the shims remain and `drizzle-kit generate`
  stays blocked for net-new migrations. New schema work should be sequenced
  after the baseline reset.
- After the reset, migration state is trustworthy again and adding a column is
  the standard generate-commit-deploy loop.
- The reset is a manual, per-database operation; it must be coordinated with any
  deploy that also ships schema changes.
