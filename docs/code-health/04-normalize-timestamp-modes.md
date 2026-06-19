# [P2] Normalize timestamp storage modes in schema

Part of the codebase-health roadmap.

## Problem
`src/db/schema.ts` mixes `integer(..., { mode: "timestamp_ms" })` (returns `Date`) for `startedAt/endedAt/loggedAt` with plain `integer` (returns `number`) for `createdAt/updatedAt/deletedAt`. This forces defensive `row.startedAt instanceof Date ? .getTime() : row.startedAt` in every `rowToX` mapper and feeds the ~130 `as` casts across the codebase.

## Suggested work
- Standardize on one representation (plain epoch-ms `integer` reads cleanest since the client uses numbers).
- Simplify the row mappers once consistent.

**Priority:** P2. Do this BEFORE the server-route dedup (02) so the shared row-mapper is clean.
