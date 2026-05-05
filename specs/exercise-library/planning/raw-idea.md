# Raw Idea: Exercise Library

The exercise library is the foundational feature of Forge (a self-hosted workout tracker; stack: Bun/Hono/SQLite+Drizzle on the server, React/Vite/Tailwind v4/Dexie on the client, PWA). It is the smallest useful feature and will seed the patterns every other feature copies: Drizzle tables in src/db, Zod schemas in src/shared, Hono CRUD routes in src/server, a Dexie mirror in src/client for offline access, and list/detail UI pages.

Scope: users can browse a list of exercises, search/filter them, view a detail page for each, and create/edit/delete their own. Visual reference is in design/exercise-list.png, design/exercise-list.json, design/exercise-detail.png, and design/exercise-detail.json — the spec must match these mockups. Additional product context lives in docs/PRD.md and docs/PRODUCT-PLAN.md; architectural decisions are in docs/decisions/.

Key open questions the spec-researcher should resolve (do NOT answer them — just record them as open questions):
- Exact exercise fields (name, muscle groups, equipment, instructions, media, tags, primary/secondary muscles, difficulty?)
- Are there seed/built-in exercises shipped with the app, vs user-created only?
- Search/filter semantics (by name, by muscle group, by equipment, by tag — combinable?)
- Offline write semantics via Dexie — queued sync, last-write-wins, or online-only writes?
- Media handling (images/video) — local file uploads, URLs, or none in v1?
- Categorization taxonomy (fixed enums vs free-form tags)

Deliverable for this step: just the folder + raw-idea file. The next agent (spec-researcher) will drive the design files and ask clarifying questions.
