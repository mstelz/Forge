# [P2] Decompose oversized modules

Part of the codebase-health roadmap.

## Problem
Several single-file-does-everything modules beyond active.tsx:
- `home/index.tsx` (1,205)
- `programs/builder/index.tsx` (1,134)
- `programs/detail.tsx` (944)
- `workout/edit-structure/index.tsx` (740)
- `routes/export.ts` (697)
- `home/state.ts` (633)

## Suggested work
- Split each into focused components/helpers; extract pure logic out of the render path.

**Priority:** P2. Lower urgency than active.tsx; same pattern.
