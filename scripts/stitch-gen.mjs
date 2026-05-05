import { stitch } from "@google/stitch-sdk";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const [, , mode, ...rest] = process.argv;

const OUT_DIR = "/home/mike/Development/Forge/design";
fs.mkdirSync(OUT_DIR, { recursive: true });

const PROJECT_FILE = path.join(OUT_DIR, ".stitch-project.json");

async function getProject() {
  if (fs.existsSync(PROJECT_FILE)) {
    const { id } = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8"));
    return stitch.project(id);
  }
  const projects = await stitch.projects();
  const p = projects[0];
  fs.writeFileSync(PROJECT_FILE, JSON.stringify({ id: p.id }, null, 2));
  return p;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve, reject);
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
    }).on("error", (e) => { fs.unlinkSync(dest); reject(e); });
  });
}

async function generate(name, prompt, device = "MOBILE") {
  const project = await getProject();
  console.log(`Generating: ${name}...`);
  const screen = await project.generate(prompt, device);
  const imageUrl = await screen.getImage();
  const imagePath = path.join(OUT_DIR, `${name}.png`);
  await download(imageUrl, imagePath);
  const meta = { name, device, screenId: screen.id, prompt };
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(meta, null, 2));
  console.log(`  -> ${imagePath}`);
  return { imagePath, screenId: screen.id };
}

async function edit(name, instruction) {
  const project = await getProject();
  const meta = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${name}.json`), "utf8"));
  const screen = await project.getScreen(meta.screenId);
  const edited = await screen.edit(instruction);
  const imageUrl = await edited.getImage();
  const imagePath = path.join(OUT_DIR, `${name}.png`);
  await download(imageUrl, imagePath);
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify({ ...meta, screenId: edited.id, lastEdit: instruction }, null, 2));
  console.log(`  -> ${imagePath} (edited)`);
}

const PROMPTS = {
  "logger-dark": {
    device: "MOBILE",
    prompt: `Active workout logger screen for a mobile workout tracking app called "Forge". DARK MODE.

DESIGN LANGUAGE:
- Near-black background (#0B0B0C), elevated surfaces slightly lighter (#17181A)
- Single warm amber accent (#F59E0B) used ONLY for the primary action and active/progress indicators
- Text: bright white primary, muted gray secondary
- Typography: Inter, with OVERSIZED tabular numerics for weight and reps (visible from arm's length during a set)
- Shape: 14px rounded corners, 1px subtle borders (#26272A), NO heavy shadows
- Utilitarian, quiet, no decorative chrome

LAYOUT (top to bottom):
1. Compact top bar: "End" text button left, exercise index "3 of 7" center, kebab menu right. No drawer icon (locked in workout).
2. Exercise name large and bold: "Barbell Back Squat". Subtitle one line: "Superset A · with Romanian Deadlift". Small horizontal dot indicator showing position in routine.
3. Small muted row: "Last time: 225 lb x 5, 5, 4 · 8 days ago"
4. Prescription chip row: "4 sets · 5 reps · RPE 8 · 2:30 rest" — subtle outlined chips
5. SET LIST — each row shows: set number circle (filled amber for completed, outlined for pending, pulsing amber border for current), then two large tappable numeric fields WEIGHT and REPS with steppers (- value +), small RPE field, small checkmark to log. Completed sets are dim. Current set is bright.
   - Set 1: 225 x 5 ✓ (logged, dimmed)
   - Set 2: 225 x 5 ✓ (logged, dimmed)
   - Set 3: 225 | 5 — CURRENT, bright, stepper visible
   - Set 4: pending, ghosted
6. "+ Add set" subtle text button
7. Notes field collapsed as a single small "Add note" chip
8. BOTTOM BAR fixed: large amber "Log Set" primary button (full width minus margins), above it a compact REST TIMER row showing "Rest 2:30" with play/pause and a thin amber progress bar. Between exercises a small pill shows next: "Next: Romanian Deadlift ›"

Bottom thumb zone is the primary action. Top is informational. Everything between is the set list.
Show realistic content, not lorem ipsum. Make it feel like you could start logging right now.`
  },
  "logger-light": {
    device: "MOBILE",
    prompt: `Active workout logger for Forge workout tracker. LIGHT MODE.
Background off-white #FAFAF9, surfaces white, borders #E7E5E4, text near-black #0A0A0A / muted #78716C. Warm amber accent #F59E0B for primary action, progress, active states. Inter typography, oversized tabular numerics, 14px rounding, 1px borders, no heavy shadows.

TOP BAR: empty left, '3 of 7' centered, kebab (3-dot) right. NO end button (it's in the kebab).

BELOW TOP BAR:
- Exercise title 'Barbell Bench Press' large bold
- Tiny muted label 'SUPERSET A' then horizontal dots row (4 dots, first filled amber = current position). Dots tappable, area swipeable.
- Tiny muted single line: 'Last time: 185 lb x 8, 8, 7 · 5 days ago'
- Prescription chip row: '4 sets · 8 reps · RPE 8 · 2:00 rest'

SET LIST — compact read-only rows, NO inline editing:
- Set 1: 185 × 8 · RPE 8 · green check (completed, dim)
- Set 2: 185 × 8 · RPE 8 · green check (completed, dim)
- Set 3: 185 × 8 · RPE 8 · CURRENT (thin amber left border, bright)
- Set 4: — × — (ghosted pending)
- Small 'Add set' and 'Add note' text links aligned left, subtle

BOTTOM STACK:
1. REST TIMER STRIP: pause icon (amber circle), small 'REST' label, big tabular countdown '2:00', thin amber progress bar underneath full width. Clicking countdown makes it editable.
2. INPUT DOCK: big steppers '- 185 +' WEIGHT LB and '- 8 +' REPS side by side. Small optional chips below: 'RPE 8' and '+ Note'.
3. Large full-width amber 'LOG SET' button with check icon.

No 'Next' pill — swipe handles navigation. Quiet, utilitarian, native-feel.`
  },
  "home": {
    device: "MOBILE",
    prompt: `Home / Today screen for Forge workout tracker. DARK MODE with warm amber accent #F59E0B on #0B0B0C background.

Typography Inter, oversized numerics where appropriate, 14px rounding, 1px borders #26272A, no heavy shadows.

LAYOUT:
1. Top bar: hamburger drawer icon left, "Forge" wordmark center (thin serif or bold sans), profile circle right.
2. Greeting + date small muted: "Wednesday, April 23"
3. PRIMARY CARD — "Today's workout" — large card with amber left edge accent. Shows routine name "Push Day A", 5 exercises preview as small icons/names, estimated duration "~52 min". Large amber "Start Workout" button inside the card. If rest day, card says "Rest day" instead.
4. PROGRAM STRIP — "Hypertrophy Block · Week 3 of 8" with a compact horizontal week indicator: 7 small day dots (done filled amber, today outlined amber pulsing, upcoming muted, skipped with slash). Tappable.
5. MINI CALENDAR — current week row of 7 days, workout dots under completed days.
6. GOALS — 2 stacked goal cards with progress bars: "Squat 315 lb" 80% bar "285 / 315 lb · 6 weeks left", "Bodyweight 180 lb" 60% bar.
7. QUICK STATS row — 3 tiles: "This week 3 workouts", "Volume 24,850 lb", "Streak 5 wk". Oversized numbers, small labels.

Quiet and informational. No decorative images. Feels like a dashboard, not a feed.`
  },
  "routine-builder": {
    device: "MOBILE",
    prompt: `Routine builder screen for Forge workout tracker. LIGHT MODE.
Off-white #FAFAF9 bg, white cards, #E7E5E4 borders, near-black text, amber #F59E0B accent.
Inter typography, 14px rounding, 1px borders.

LAYOUT:
1. Top bar: back arrow, "Edit routine" title, "Save" text button right in amber.
2. Header card: editable routine name "Push Day A", notes field collapsed, two small chip fields: estimated duration "~52 min", tag "Upper".
3. BLOCKS LIST — drag-handle icon on left of each row:
   - Single block: "Barbell Bench Press" — 4 × 5 · RPE 8 · 2:30 rest. Tappable row, tiny pencil icon.
   - Superset block labeled "Superset A" with a subtle grouped container holding 2 exercises:
     - "Incline DB Press" — 3 × 10 · 90s
     - "Cable Fly" — 3 × 12 · 60s
     Connected by a vertical amber rail on the left inside the group.
   - Single block: "Tricep Pushdown" — 3 × 12 · 60s · AMRAP last set (technique chip)
   - Single block (cardio): "Treadmill Incline Walk" — 10 min @ 3.5 mph · mixed tracking
4. Between blocks show subtle "+ add block" inline. Bottom shows two big outlined buttons: "+ Add exercise" and "+ Add superset".

Show drag handles clearly. Superset grouping must be visually obvious (indent + amber vertical rail + "Superset A" label).`
  },
  "nav-drawer": {
    device: "MOBILE",
    prompt: `Slide-out navigation drawer overlay for Forge workout tracker. DARK MODE.
Drawer slides in from left, covers ~80% of screen width, with dimmed content visible on the right edge.
Background #0F1012, amber #F59E0B accent, Inter typography.

CONTENTS (top to bottom):
1. User header: circular avatar, "Mike Stelzer" name, small muted "Self-hosted" subtitle.
2. Divider.
3. Nav items with leading icons and generous vertical padding (tappable):
   - Today (home icon) — ACTIVE state with amber left bar and slightly lighter bg
   - Workouts / History (clock icon)
   - Routines (list icon)
   - Programs (calendar icon)
   - Exercises (dumbbell icon)
   - Goals (target icon)
4. Divider.
5. Settings (gear icon)
6. Bottom pinned: subtle "v0.1 · offline ready" muted text, and a small sun/moon theme toggle pill.

Dim overlay on right 20% shows a sliver of the Today screen behind. Quiet, utilitarian, not flashy.`
  },
  "workout-start": {
    device: "MOBILE",
    prompt: `Workout launcher screen for Forge workout tracker. DARK MODE.
#0B0B0C bg, #17181A surfaces, amber #F59E0B accent, #26272A borders, Inter typography, 14px rounding, 1px borders, no heavy shadows, oversized tabular numerics where appropriate.

TOP BAR: hamburger (drawer) icon left, 'Start Workout' title centered, empty right.

SECTIONS (top to bottom):
1. PLANNED TODAY card — prominent, amber left edge. Shows 'From your program' tiny muted label, routine name 'Push Day A', 'Hypertrophy Block · Week 3, Day 2' subtitle, 5 exercise preview list (small bullet rows: 'Bench Press · 4×5', 'Overhead Press · 4×6', 'Incline DB Press · 3×10', etc.), '~52 min' chip. Big full-width amber 'START PLANNED' button at bottom of card.
2. 'OR' small muted divider.
3. RECENT ROUTINES list — 3 compact rows, each: routine name, small muted 'last done X days ago', right-arrow. Examples: 'Pull Day A · 3 days ago', 'Leg Day · 6 days ago', 'Upper Accessory · 9 days ago'.
4. FREEFORM card — outlined, muted icon, 'Freeform session' title, 'Start without a routine — add exercises as you go' subtitle, right-arrow.
5. Tiny 'All routines ›' text link at bottom.

Quiet, utilitarian, native feel.`
  },
  "exercise-list": {
    device: "MOBILE",
    prompt: `Exercise library list screen for Forge workout tracker. DARK MODE.
#0B0B0C bg, #17181A surfaces, amber #F59E0B accent, #26272A borders, Inter, 14px rounding, 1px borders, no shadows.

TOP BAR: hamburger left, 'Exercises' title, '+' plus icon right (add new).

BELOW TOP BAR:
- Search field full width with search icon, placeholder 'Search exercises or aliases'
- Horizontal scroll filter chip row: 'All' (active amber fill), 'Strength', 'Cardio', 'Mixed', '|', 'Chest', 'Back', 'Legs', 'Equipment', 'Custom'. Active chip has amber fill, others muted outlined.

LIST — each row has: small muted-colored square tag showing type initial (S/C/M in colored pill — Strength amber-ish, Cardio teal, Mixed purple, all muted), exercise name bold, muted secondary line 'Primary muscle · equipment · aliases'. Right side: small 'last used 3d' muted text.
- Barbell Back Squat · S · 'Quads · Barbell · squat' · last used 2d
- Barbell Bench Press · S · 'Chest · Barbell · bench' · last used 4d
- Romanian Deadlift · S · 'Hamstrings · Barbell' · last used 2d
- Incline DB Press · S · 'Chest · Dumbbells' · last used 4d
- Cable Fly · S · 'Chest · Cable' · last used 4d
- Treadmill Incline Walk · C · 'Conditioning · Treadmill' · last used 5d
- Farmer Carry · M · 'Full body · Dumbbells'
- Face Pull · S · 'Rear delts · Cable'

Dense but scannable. No bottom tab bar (app uses drawer nav).`
  },
  "exercise-detail": {
    device: "MOBILE",
    prompt: `Exercise detail screen for Forge workout tracker. DARK MODE.
#0B0B0C bg, #17181A surfaces, amber #F59E0B accent, #26272A borders, Inter typography, oversized tabular numerics for stats.

TOP BAR: back arrow left, 'Exercise' small muted title, kebab menu right (edit / delete / add to routine).

CONTENT:
1. HEADER — exercise name 'Barbell Back Squat' large bold, type chip 'STRENGTH' amber outlined, small muted line 'Quadriceps · Glutes · Barbell · Squat Rack', aliases muted 'aka: back squat, high-bar squat'.
2. INSTRUCTIONAL CARD — thumbnail frame with play icon overlay (video link), 'Watch: Form Guide (YouTube)' caption. Description text 3 lines muted.
3. STATS ROW — three tiles: 'EST 1RM' 315 lb, 'BEST SET' 275×5, 'TOTAL SESSIONS' 42. Oversized numbers.
4. RECENT HISTORY heading with 'View all ›' link.
5. HISTORY LIST — 5 compact rows: date left muted, top set or summary bold ('245×5, 5, 4'), small RPE/e1RM muted right ('RPE 8 · e1RM 283').
   - Apr 21 · 245×5, 5, 4 · RPE 8 · e1RM 283
   - Apr 14 · 235×5, 5, 5 · RPE 8 · e1RM 274
   - Apr 7 · 235×5, 5, 4 · RPE 9 · e1RM 270
   - Mar 31 · 225×5, 5, 5 · RPE 8 · e1RM 263
   - Mar 24 · 225×6, 5, 5 · RPE 8 · e1RM 270

No bottom tab bar.`
  },
  "programs-list": {
    device: "MOBILE",
    prompt: `Programs list screen for Forge workout tracker. DARK MODE.
#0B0B0C bg, #17181A surfaces, amber accent #F59E0B, Inter, 14px rounding.

TOP BAR: hamburger left, 'Programs' title, '+' plus right.

1. ACTIVE PROGRAM card — amber left edge, prominent. 'ACTIVE' tiny amber label, 'Hypertrophy Block' title, 'Week 3 of 8 · Upper/Lower Split' subtitle. Progress bar 38% amber. Small row of 8 week dots below the bar (weeks 1-2 filled, week 3 half-filled current, 4-8 empty). Small 'VIEW PROGRAM ›' text link right.
2. 'OTHER PROGRAMS' section label.
3. LIST of program cards (outlined, no amber):
   - 5/3/1 Beginner · 4 weeks · completed 3 months ago
   - Classic PPL · 6 weeks · draft
   - Strength Block A · 12 weeks · never started
4. Bottom 'Browse templates' muted link.

No bottom tab bar.`
  },
  "program-detail": {
    device: "MOBILE",
    prompt: `Program detail / week grid screen for Forge workout tracker. DARK MODE.
#0B0B0C bg, surfaces #17181A, amber #F59E0B accent, #26272A borders, Inter typography.

TOP BAR: back arrow left, 'Hypertrophy Block' title (truncate if long), kebab menu right (edit / duplicate / end program).

1. SUMMARY STRIP — '8 weeks · Upper/Lower split · Started Apr 3'. Small progress bar and chip 'Week 3 of 8'.
2. TAB SEGMENT: 'Schedule' (active) | 'Overview' | 'Stats'.
3. WEEK GRID — each week is a row card showing week number left ('WEEK 3' amber highlighted current; 'WEEK 1', 'WEEK 2' dim done; 'WEEK 4' outlined upcoming), and 7 small day cells across: day cells show either a routine name abbreviation in a small pill ('Upper A', 'Lower A', 'Upper B', etc.), or a muted dash for rest day, or a green check overlay for completed. Current day has an amber outline.
   Render at least 5 weeks stacked so the pattern is obvious. Weeks 1-2 fully checked (done), week 3 partially checked with today outlined, weeks 4-5 upcoming.
4. Bottom button: 'COPY WEEK PATTERN' outlined, and 'EDIT PROGRAM' amber primary.

No bottom tab bar.`
  },
  "goals-list": {
    device: "MOBILE",
    prompt: `Goals list screen for Forge workout tracker. DARK MODE.
#0B0B0C bg, #17181A surfaces, amber #F59E0B, Inter, 14px rounding, oversized tabular numerics.

TOP BAR: hamburger left, 'Goals' title, '+' plus right.

FILTER CHIP ROW: 'Active' (amber fill) · 'Completed' · 'All' · '|' · 'Strength' · 'Cardio' · 'Weight' · 'Measurement' · 'Program' · 'Other'.

GOAL CARDS — each a card with:
- Top row: small muted category pill ('STRENGTH' / 'WEIGHT' / etc.), title big, right-side 'X weeks left' small muted
- Current value / target (big tabular numbers) with unit
- Amber progress bar with percentage label
- Small muted 'Started Feb 14 · Target Jun 1' line

Examples (stacked):
- STRENGTH · 'Squat 315 lb' · 285/315 lb · 80% progress · 6 weeks left
- WEIGHT · 'Bodyweight 180 lb' · 188/180 lb (descending) · 60% progress · 10 weeks left
- CARDIO · 'Run 5k under 25:00' · 26:40/25:00 · 45% progress · 8 weeks left
- PROGRAM · 'Finish Hypertrophy Block' · Week 3/8 · 38% · 5 weeks left
- MEASUREMENT · 'Waist 32 in' · 34/32 in · 50% · 6 weeks left

No bottom tab bar.`
  },
  "goal-form": {
    device: "MOBILE",
    prompt: `New/Edit Goal form screen for Forge workout tracker. DARK MODE.
#0B0B0C bg, surfaces #17181A, amber #F59E0B, Inter, 14px rounding, 1px borders #26272A.

TOP BAR: back arrow left, 'New Goal' title, 'Save' amber text button right.

FORM sections, each grouped in a subtle card:
1. TYPE — segmented control with 6 options in 2 rows: 'Strength' (selected, amber fill) 'Cardio' 'Weight' | 'Measurement' 'Program' 'Other'
2. TITLE — text input 'Squat 315 lb'
3. TARGET / START VALUE — two side-by-side numeric inputs with unit dropdown 'lb': 'Start 245' '→ Target 315'. Small muted helper 'Current: auto-filled from exercise PR'.
4. EXERCISE LINK (visible because type is Strength) — outlined button 'Barbell Back Squat ›' (tap to change)
5. DEADLINE — large date field 'Jun 1, 2026' with small 'calendar pick' icon.
6. NOTES — multiline field 'Focus on form and progressive overload. Peak by end of block.'
7. Bottom: large amber 'CREATE GOAL' button.

No bottom tab bar.`
  },
  "history-list": {
    device: "MOBILE",
    prompt: `Workout history list screen for Forge workout tracker. DARK MODE.
#0B0B0C bg, #17181A surfaces, amber #F59E0B, #26272A borders, Inter, 14px rounding, oversized tabular numerics for stats.

TOP BAR: hamburger left, 'History' title, search icon right.

1. STATS STRIP — 3 small tiles: 'THIS MONTH' 12 workouts, 'VOLUME' 248,400 lb, 'AVG DURATION' 52 min.
2. Filter chip row: 'All' (active amber) · 'This week' · 'This month' · 'Routines' · 'Freeform'.
3. GROUPED LIST by date (small muted sticky date headers 'APR 23 · WEDNESDAY'):
   Each workout row:
   - Left: small colored square day-number 23 (amber if PR)
   - Center: routine name 'Push Day A' bold, small muted 'Hypertrophy Block · Week 3' subtitle, tiny chips '5 exercises · 18 sets · 52 min'
   - Right: muted 'PR' amber pill if applicable, right-arrow
   Examples stacked under different date headers:
   - Apr 23 · Push Day A · 5 ex · 18 sets · 52 min · PR
   - Apr 21 · Pull Day A · 6 ex · 20 sets · 58 min
   - Apr 19 · Lower A · 5 ex · 17 sets · 61 min
   - Apr 17 · Push Day B · 5 ex · 18 sets · 49 min
   - Apr 15 · Freeform · 3 ex · 9 sets · 28 min

No bottom tab bar.`
  },
  "history-detail": {
    device: "MOBILE",
    prompt: `Workout history detail screen. Dark mode: #0B0B0C bg, #17181A cards, amber #F59E0B accent, Inter font, oversized numerics.

Top bar: back arrow, 'Workout' title, share + kebab icons right.

Header: 'Push Day A' title bold. Muted subtitle 'Apr 23 · 6:12 PM · 52 min'. Small chip 'Week 3, Day 2'. Tiny 'LOCKED' muted pill.

Summary: 3 stat tiles — VOLUME 18,240 lb (green +4%), SETS 18, PRS 1 (amber).

Exercises as cards:
- Bench Press — 4 sets: 185×8, 185×8, 185×7, 185×7. 'PR' amber chip.
- Overhead Press — 3 sets: 115×6, 115×6, 115×5.
- Superset A (amber left rail): Incline DB Press 3×10@55, Cable Fly 3×12@30.
- Tricep Pushdown — 3 sets with 'AMRAP' chip on last.
- Treadmill Walk — 10 min @ 3.5 mph.

Notes muted: 'Felt strong today.'

Read-only feel. No bottom tab bar.`
  },
  "settings": {
    device: "MOBILE",
    prompt: `Settings screen for Forge workout tracker. DARK MODE.
#0B0B0C bg, surfaces #17181A, amber #F59E0B accent, #26272A borders, Inter, 14px rounding.

TOP BAR: hamburger left, 'Settings' title, empty right.

GROUPED SECTIONS (each a card with small muted section label above):

1. PROFILE
   - Row: circular MS avatar + 'Mike Stelzer', right chevron
   - Row: 'Bodyweight' ... '188 lb' right
   - Row: 'Height' ... '5ʼ11ʺ' right
   - Row: 'BMI' ... '26.2' right muted (read-only tag)
   - Row: 'Date of birth' ... '1989-05-02' right

2. UNITS & DISPLAY
   - Row: 'Weight' ... segmented 'lb | kg' (lb selected amber)
   - Row: 'Distance' ... segmented 'mi | km' (mi selected amber)
   - Row: 'Height' ... segmented 'ft/in | cm'

3. TIMEZONE & LOCALE
   - Row: 'Timezone' ... 'America/Chicago' right chevron
   - Row: 'Week starts on' ... segmented 'Sun | Mon' (Sun amber)

4. FEATURES
   - Row: 'Show RPE by default' + toggle switch (off, muted)
   - Row: 'Show cardio fields for Mixed' + toggle switch (on, amber)
   - Row: 'Theme' ... segmented 'System | Light | Dark' (Dark selected amber)

5. DATA
   - Row: 'Export all data' right chevron
   - Row: 'Database path' muted value '/data/forge.db' right
   - Row: 'Last workout' ... 'Apr 23, 2026'
   - Row: 'Storage' ... '12.4 MB'

6. DANGER ZONE (red-tinted border)
   - Row: 'Reset all data' in muted red text, disabled-looking right chevron

Bottom: app version 'Forge v0.1 · offline ready' muted center. No bottom tab bar.`
  },
};

if (mode === "gen") {
  const names = rest.length ? rest : Object.keys(PROMPTS);
  const failed = [];
  for (const name of names) {
    const p = PROMPTS[name];
    if (!p) { console.error(`Unknown screen: ${name}`); continue; }
    let attempts = 0;
    while (attempts < 3) {
      try {
        await generate(name, p.prompt, p.device);
        break;
      } catch (e) {
        attempts++;
        console.error(`  ! ${name} attempt ${attempts} failed: ${e.message}`);
        if (attempts >= 3) { failed.push(name); break; }
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  if (failed.length) console.error(`\nFailed: ${failed.join(", ")}`);
} else if (mode === "edit") {
  const [name, ...instr] = rest;
  await edit(name, instr.join(" "));
} else {
  console.log("Usage: node stitch-gen.mjs gen [name...]  |  edit <name> <instruction>");
  console.log("Screens:", Object.keys(PROMPTS).join(", "));
}
