# Raw Idea: Routine Template Layer

This spec covers the **routine template / planning layer only**. It does NOT cover live workout sessions, logging, or mutable execution state — those will be a separate spec (the workout session / logger redesign).

Source documents:
- `/home/mike/Development/Forge/docs/PRD.md` — sections "Routine builder" and "2. Routine model"
- `/home/mike/Development/Forge/docs/PRODUCT-PLAN.md` — section "2) Routine builder direction"

---

## From PRD.md — "Routine builder"

- Create a routine as an ordered list of blocks. Routines should allow for notes, estimated duration and name
- Add a single-exercise block or a superset block.
- Reorder blocks and reorder exercises inside a superset.
- Define prescription metadata per item: target sets, rep range or target reps, rest, RPE, tempo, and notes.
- Strength and Mixed exercises should allow for techniques such as dropsets, rest pause, AMRAP and to failure
- Mixed and Cardio should have duration targets

## From PRD.md — "2. Routine model"

- A routine is a reusable workout template.
- A routine contains ordered blocks.
- Supported block types in v1:
  - `single`
  - `superset`
- A block contains ordered items.
- Each item references an exercise and a prescription payload.

## From PRD.md — "API and automation" (relevant slice)

- CRUD routines via `/api/v1`.

## From PRD.md — "UX requirements" (relevant slice)

- Supersets must render clearly as grouped exercises with obvious order.
- The app must remain usable on desktop for planning tasks.
- (Logger flow is mobile-first — out of scope here, but routine builder should also be mobile-friendly per PRODUCT-PLAN.)

---

## From PRODUCT-PLAN.md — "2) Routine builder direction"

The routine builder is the highest-priority planning UX surface.

### Locked UX direction
- routine name and duration should be immediately visible
- optional details/settings should live behind a secondary affordance
- exercise rows should stay dense and scan-friendly
- rows should expand/collapse rather than always showing giant inline forms
- supersets should be clearly grouped but compact

### Locked prescription model
Each exercise in a routine must support:
- set count
- rep targets or rep ranges
- either:
  - **uniform reps across all sets**
  - **custom per-set reps/ranges**
- technique modifiers:
  - drop set
  - rest-pause
  - AMRAP
  - to-failure

### Data-model direction
Avoid overloading everything into one fragile `repScheme` string.
Prefer structured template data for:
- set count
- rep mode
- rep targets/ranges
- technique metadata
- per-set targets when custom mode is enabled

---

## From PRODUCT-PLAN.md — "Phase 2 — Routine template redesign"

Goal: improve the planning layer so routines can express real prescriptions.

Expected first chunk:
- structured set/rep model
- rep mode (uniform vs custom)
- technique metadata
- per-set target support in the builder/API/schema

This is **template-side only**.
It should not try to solve live workout execution at the same time.

---

## From PRODUCT-PLAN.md — Architectural principles relevant to this spec

- Template planning data and live execution/session data must be separate concerns:
  - templates describe intent
  - sessions capture mutable reality
- Keep template layer and session layer cleanly separated
- Avoid fragile one-string prescription models
- Templates are planning tools; sessions are execution reality.
- Dense and mobile-friendly beats decorative.
- Common actions should be obvious; advanced options should be available but secondary.

---

## Scope summary

**In scope:**
- Routine = ordered list of blocks (single or superset)
- Each block holds ordered items referencing an exercise + structured prescription
- Prescription model: set count, rep mode (uniform vs custom per-set), rep targets/ranges, rest, RPE, tempo, notes, technique modifiers (drop set, rest-pause, AMRAP, to-failure), duration targets for cardio/mixed
- Routine-level metadata: name, notes, estimated duration
- Reorder blocks; reorder items within a superset
- Mobile-friendly dense builder UX with progressive disclosure (expand/collapse rows, secondary affordance for optional settings)
- API CRUD via `/api/v1`
- Structured template data (no fragile single-string prescription)

**Out of scope:**
- Live workout sessions
- Workout logging
- Mutable execution state / session hydration
- Programs
- Workout history
- Goals
