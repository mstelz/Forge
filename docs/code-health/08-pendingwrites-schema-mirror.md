# [P2] Fix or remove drifted server pendingWrites schema mirror

Part of the codebase-health roadmap.

## Problem
`src/db/schema.ts` (lines 143-158) mirrors the client outbox "for reviewability" but is missing `status` and `lastAttemptAt` that the client `PendingWrite` type carries. A mirror that is wrong is worse than none.

## Suggested work
- Either sync the mirror with the client type, or delete it with a comment pointing to the client type as the source of truth.

**Priority:** P2. Independent.
