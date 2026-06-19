# [P3] Unify logging strategy

Part of the codebase-health roadmap.

## Problem
22 raw `console.*` calls are scattered alongside the structured `syncLog` and Hono `logger`.

## Suggested work
- Route stray client `console.*` through `syncLog`; keep one consistent logging path.

**Priority:** P3. Independent.
