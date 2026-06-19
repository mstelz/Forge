# [P2] Type the sync payload boundary

Part of the codebase-health roadmap.

## Problem
`PendingWrite.payload` is `unknown` and re-cast ad hoc throughout `flusher.ts` and `reconcile.ts` (`entry.payload as { id: string }`, `as { sessionId?: string }`, etc.). Server responses are consumed as `res.json() as ...` with no runtime validation on the client.

## Suggested work
- Discriminated union for `PendingWrite` keyed by `entity` + `op`.
- Reuse existing Zod schemas to validate sync responses on the client.

**Priority:** P2. Easier after the data/sync DRY work (02) centralizes payload handling.
