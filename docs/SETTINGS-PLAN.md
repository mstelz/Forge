# Settings & Admin System — Implementation Plan

## 1. Product Scope — First Settings Release

The first admin/settings release should cover **five concrete capabilities**:

### 1.1 User Profile & Body Data
- Display name (optional; single-user, but useful for export headers and future multi-user)
- Body weight (current value + unit)
- Height (current value + unit)
- Derived BMI (computed, read-only)
- Date of birth (optional; for age-based calculations later)

### 1.2 Unit & Display Preferences
- **Weight unit preference**: `lb` or `kg` (global default for all weight displays and inputs)
- **Distance unit preference**: `mi` or `km`
- **Height unit preference**: `in` (imperial, displayed as ft/in) or `cm`
- These are app-wide defaults. Per-exercise overrides already exist in the schema (`defaultWeightUnit`, `defaultDistanceUnit`) and should take precedence when set.

### 1.3 Timezone & Locale
- Timezone selection (IANA timezone string, e.g. `America/Chicago`)
- Used for: "Today" page date boundaries, workout `startedAt` display, history grouping by day
- Week start preference: Sunday or Monday (affects any future calendar views)

### 1.4 Feature Toggles
- `showRpeByDefault`: Whether RPE/perceived effort is expanded by default in the workout logger (currently behind `<details>`, which is a good default-off pattern)
- `showCardioFieldsForMixed`: Whether cardio fields (duration/distance) auto-show for `mixed` tracking mode exercises
- This is deliberately small. The toggle system should be extensible but we should not invent toggles for things nobody has asked for yet.

### 1.5 Data Management (Settings-Adjacent)
- **Export** link (already exists at `/api/v1/export`, just needs to be discoverable from settings)
- **Database info**: show DB file path, approximate row counts, last workout date
- **Danger zone**: future home for "reset all data" / "delete workout history" — defer actual destructive actions to a later release, but reserve the UI section now