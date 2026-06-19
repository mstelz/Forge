# [P2] Improve sync drain robustness (flusher/reconcile)

Part of the codebase-health roadmap.

## Problem
- `flusher.ts` `flushNow` single-item loop `break`s on the first retry to preserve FIFO; one failing write can starve all later independent writes.
- Batch and single-item paths interleave (lines 320-343) without preserving causal order across the two.
- `reconcile.ts` uses a magic `since - 30_000` overlap window and last-write-wins `.put()` without comparing `updatedAt`.

## Suggested work
- Drain per-entity-independent queues so one poisoned write does not block others.
- Extract the overlap window to a named constant with a rationale comment.

**Priority:** P2.
