# Raw Idea: Today / Homepage

The homepage is the app's landing surface and the answer to "what should I do today?". It collapses what the PRD's `Today` page and `Homepage` overview have been drifting toward into one informational dashboard at `/`. Per `docs/PRODUCT-PLAN.md` lines 234–236:

- **Single primary today / active-program card** — replace the current duplicate secondary active-program card with one large, scan-first card that surfaces today's routine (or "Rest day" / "No active program") plus the in-progress session state (Resume / Start) as a single primary CTA.
- **Calendar day-detail surface** — replace the current calendar day-link navigation with an inline quick-detail surface (popover on desktop, slide-up drawer on mobile) showing the planned or completed workout for that day without leaving the homepage.
- **Collapse the dedicated Today page into the homepage overview** if the resume/start state and program/calendar surfaces are fully covered above. PRODUCT-PLAN explicitly flags this evaluation; this spec commits to the collapse in v1.

Stack: read-only React route at `/` reading from existing Dexie stores (`programs` + `program_days` + `program_runs` + `program_run_day_states` from programs spec; `sessions` from workout-sessions; `goals` from goals; `session_set_logs` for the rolling weekly stats). No new tables, no new API endpoints, no new outbox entities, no mutations — every action on the page is a `<Link>` or a CTA that delegates to existing routes (`/sessions/new`, `/sessions/:id`, `/programs/:id`, `/goals/:id`, `/history`).

Visual reference: `design/home.png` + `design/home.json` are authoritative (oversized amber `Start Workout` button, daily briefing strip, program week dots, two goal cards, three quick-stat tiles). The latest mockup edit (line 6 of `home.json`) removes bottom tab bar and "Pro Member" badge — both must stay removed; nav is the global drawer.

Key open questions the spec-researcher should resolve (do NOT answer them — just record them as open questions):

- Today's-routine derivation: when an active program exists, today = the program's next-scheduled day; when none exists, fall back to the most-recent routine + a "freeform" CTA, or hide the primary card and show a "Pick a routine to start" prompt? Pin down.
- Resume vs Start UX: if a session is `in_progress`, the primary CTA is `Resume Workout` and links to `/sessions/:id`; if not, the CTA is `Start Workout` and links to `/sessions/new` prefilled with today's routine. How to distinguish state visually?
- Day-detail surface implementation: Radix `Popover` on desktop and a custom slide-up sheet on mobile vs. a single drawer that swaps between popover and full-width sheet via media query. Pick one.
- Calendar scope: the mockup shows a current-week row only; the PRD/PRODUCT-PLAN doesn't reach for a full month grid. v1 = current week row; defer month grid.
- Quick-stats tile metrics: weekly volume, weekly workouts count, current streak (weeks). Already implied by the mockup; confirm exact computation rules and tie-in to existing `session_set_logs` math (reuse `epley()` and aggregation rules from history spec).
- Goals card surface: which goals to render — top 2 by deadline ascending? top 2 active by category? Pin down.
- "Rest day" vs "No workout planned": a planned rest day in a program (e.g., week 3 day 4 marked as a rest day) is distinct from "no active program at all". Both render as a secondary card with different copy.
- Greeting line: time-of-day variant or just date? Mockup shows just date — keep that.

Deliverable for this step: just the folder + raw-idea file. The next agent (spec-researcher) will lock decisions and produce `requirements.md`.
