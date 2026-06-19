# [P3] Consolidate time-formatting helpers

Part of the codebase-health roadmap.

## Problem
`active.tsx` defines `formatTimer`, `formatDuration`, and `secsToTimeStr`, with further overlapping seconds-to-string logic in `routines/builder/mmss.ts` and `goals/countdown.ts`.

## Suggested work
- Consolidate into a single `lib/time.ts` and reuse everywhere.

**Priority:** P3. Independent.
