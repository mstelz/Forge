# Settings - Raw Idea

- Settings is a singleton feature (one row per user, fixed UUID) that lets users configure app-wide preferences.
- The schema already exists in src/shared/settings.ts with weightUnit (kg/lb) and distanceUnit (m/km/mi).
- The DB table already exists in src/db/schema.ts.
- It appears in the export registry (src/shared/export/registry.ts) as optional.
- There is a design mockup at design/settings.png.
- What's missing: server routes (GET/PATCH), client-side Dexie store + hook, and the settings page UI.
- The settings page should be reachable from the app shell navigation.
- Unit preferences should affect how weight and distance are displayed across the whole app (workout logger, history, goals).
- This is a v1 single-user local app — no auth, no multi-user concerns.
