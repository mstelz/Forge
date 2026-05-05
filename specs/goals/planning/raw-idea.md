# Raw Idea: Goals

Goals are user-defined training targets surfaced on a dedicated `/goals` page and a goal-progress detail surface. They span six categories — `strength`, `cardio`, `weight`, `measurement`, `program`, `other` — and each goal carries a deadline, optional start/target values (where meaningful), optional notes, and progress derived from existing data already owned by sibling specs:

- `strength` goals link to an exercise; progress is derived from `session_set_logs` (max Epley estimated 1RM observed for that exercise since the goal was created).
- `cardio` goals carry a target time/distance; progress is derived from the best matching `session_set_logs` row for the linked exercise.
- `weight` and `measurement` goals carry a manually-logged value (bodyweight, waist, etc.); v1 stores the latest value on the goal row itself (no separate log table — deferred).
- `program` goals link to a `program_run`; progress is derived from completed weeks/days.
- `other` goals are free-form with manually entered current value.

Stack: Drizzle table on the server (`goals`), Zod schemas in `src/shared/goals.ts`, Hono CRUD under `/api/v1/goals`, Dexie mirror + `pending_writes` outbox on the client (reused as established by exercise-library), and React pages at `/goals`, `/goals/new`, `/goals/:id`, `/goals/:id/edit`. Visual references: `design/goals-list.png` + `design/goals-list.json` (list), `design/goal-form.png` + `design/goal-form.json` (create/edit). PRD references: `docs/PRD.md` §Goals, §Goal progress page.

Key open questions the spec-researcher should resolve (do NOT answer them — just record them as open questions):

- Per-category field shape: which fields are required vs optional per category, and how the form changes when the category changes.
- Progress computation: derived-on-read for strength/cardio/program (no aggregation columns) vs cached `currentValue` column refreshed on session finish — pick one and apply consistently.
- "Direction": ascending (current < target, e.g. squat 1RM) vs descending (current > target, e.g. bodyweight) vs custom (cardio time-under). Encoded explicitly on the goal row, or inferred per-category?
- Completion semantics: auto-complete when `currentValue` crosses `targetValue` vs explicit user "mark complete" action.
- Status enum: `active | completed | abandoned` vs derived (e.g. `completed` derived from progress + completion timestamp).
- Body metric tracking: do `weight` / `measurement` goals share storage with a future bodyweight/measurement log feature, or stay self-contained on the goal row in v1?
- Linked-exercise UX: goal form's exercise picker — does it match the routine-builder exercise picker, or a simpler list?
- Filter chip row: `Active | Completed | All | <category chips>` — single-select within each group, or fully toggleable?
- Goal-detail page scope: dedicated `/goals/:id` surface (charts, history, recent contributions) vs collapse into the list cards.
- Notification / reminder: any deadline reminders in v1, or strictly visual ("X weeks left" badge) only?

Deliverable for this step: just the folder + raw-idea file. The next agent (spec-researcher) will lock decisions and produce `requirements.md`.
