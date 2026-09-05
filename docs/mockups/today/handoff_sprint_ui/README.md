# Sprint — UI reference for Claude Code

**Read this first.** This package answers "what does the UI look and feel like?", not "exactly how does every feature behave." The product spec has moved on since this prototype was built; where the prototype and your current spec disagree, **follow the spec and keep the look.** Treat pixel values below as the design language to match, not a contract.

## What's in here
- `Sprint App v4.dc.html` — the working prototype (open in a browser; loads `support.js` and `_ds/`). Click "Load a sample sprint" on an empty area to see a mid-sprint state.
- `screens/` — screenshots of the prototype (narrow viewport, so the sidebar stacks above the workspace; on desktop it sits left). 01 Today (top), 02 Today (mid: mantra, highest impediment, cues, tasks), 03 Close-day dialog, 04 New-sprint wizard, 05 Impediment library, 06 Insights.
- `spec.md` — the product requirements at the time of packaging.

## The product in one paragraph
Sprint turns a one-year vision per life area (Health, Wealth, Relationships) into 14-day sprints toward one locked numeric goal. Every day the user sees one target, enters one actual, and tags which impediments hurt and which execution cues helped. Impediments matter more than cues. Review after each sprint; Insights across sprints.

---

## Visual language

**Feel:** calm, light, spacious. White cards on a faint cool wash. One accent color used for the primary action, the active tab, tags and small labels. Rounded everything. Nothing shouts except the day's target number and the actual result.

**Palette (default "Lake")**
- Page wash: vertical gradient `#eff7fb → #fbfdfe`; page bg `#f7fbfd`
- Card / panel: `#ffffff`, 1px border `rgba(22,36,46,0.13)`, radius 20px (small cards 16px, inputs 12–14px, chips pill)
- Ink `#16242e`; muted text = ink at 62% opacity; faint fill = ink at 6–7%
- Accent `#2b7ea8`; accent-ink (text-safe, links) `#1d6188`; accent tint = accent at 8–12% over white
- Success green `#2f7d52` (at/above target); under-target red `#c0392b`. No HIT/MISS words — color does it.
- Dialog scrim: `#0b1620` at 52%; dialog shadow `0 24px 60px rgba(11,22,32,0.28)`
- Alternate palettes exist in the prototype (Meadow green, Dusk violet, Sand ochre) — same structure, only accent/ink change.

**Type:** Plus Jakarta Sans throughout (300–700). Headings 700 with tight tracking (−0.02 to −0.04em).
- Page/section title 38px · sprint outcome 32px · "Day 3 / 14" 30px · today's target **92px** (64px on phone) · stat values 21–24px · body 13.5–15px · labels 10.5–11px, semibold, muted or accent.
- Section labels are tiny accent-colored caps-free text ("Today's target", "Highest impediment").

**Spacing & shape:** cards padded 22–28px; 20px between cards; 6–12px gaps inside grids. Buttons radius 12px, 13.5px semibold, `.btn-primary` = solid accent, white text; ghost buttons are borderless muted text. Chips/pills for filters and scope tags. Checkbox squares 18px radius 6px; radios 18px round; accent fill when on.

**Motion:** minimal. Dialogs rise in over 180ms; the day-result reveal pops in 220ms. Nothing else animates.

---

## Layout

**App shell:** sticky header (56–58px) — brand dot + "Sprint" left, three text tabs **Sprints · Vision · Insights** with a 2px accent underline on the active tab. Below: fixed 266px left sidebar (white, 1px right border) + scrollable workspace (padding 30px 40px, max-width ~940px). Under ~940px the sidebar stacks above the workspace.

**Sidebar items:** rounded rows, label semibold 13.5px, small right-aligned meta ("Day 3/14", "Locked", "Ready", "Review" in accent), optional muted sub-line (the outcome). Active row = accent tint background. Sprints tab has a full-width "New Sprint" primary button at the bottom.

### Sprints tab → Today (one sprint at a time)
Order top to bottom:
1. Header row: area tag + date left; outcome as h1 (32px). Right: "Day 3 / 14" (30px) with streak under it.
2. **14-day strip** — 14 equal cells in a row: `D1` (tiny accent), weekday, date; a small colored bar beneath once closed (green hit / red under). Today's cell has an accent border; weekends are faint-filled. Start and end dates under the strip.
3. **Today's target card** — the hero: label, the number at 92px, unit; below it a 3-up stat grid (Cumulative · Goal locked · Remaining, each in its own small bordered cell); Usage-of-funds pills for Money sprints.
4. **Mantra card** — accent-tinted card, the mantra as a 23px italic quote, "Edit" link.
5. **Highest impediment card** — label, name 22px, WHEN / THEN rows with tiny accent labels, "Change" and "Edit proof point" links.
6. Two-column cards: **Other impediments** (left) and **Execution cues** (right), each a simple list with "Remove" links and an "Add …" ghost button.
7. **Tasks card** — checkbox rows with inline text inputs, "Add task".
8. **Close card** — "Close the day" copy + primary "Enter actual result". When closed: the actual in 28px colored green/red with "Day closed · locked". Goal reached → an accent-outlined "Complete sprint" band. Footer line: celebration text (grows more visible near/at goal) and a quiet "End sprint early".
9. **14-day plan card** — 7×2 grid of day cells (D#, weekday+date, target, actual, backfill button for missed days); mode chips Same / Custom; Planned · Goal · above/below line.

### Sprints tab → empty area
A single card: area tag, 30px title ("No sprint running in Wealth" / "No sprint can start here yet"), one paragraph, primary action ("Create a Wealth sprint" / "Write the Wealth vision").

### Sprints tab → Review
Area tag + status; "Sprint review" 38px; three stat cards (Goal / Total actual / % achieved, colored); a daily target-vs-actual bar chart card; two-column pattern cards (cues, impediments) with "most useful / most damaging"; highest-impediment observation card; lesson textarea + Yes/No segmented + "Complete review".

### Vision tab
Sidebar: three area visions (meta "Set"/"Empty"), Execution cues (count), Impediments (count), Data & export.
- **Vision page:** tag, "1-year vision" 38px, one paragraph of guidance, large textarea (7 rows, radius 16px), "Save vision" + "Replace & archive", collapsed "Show archived visions (n)".
- **Library page:** title, blurb, scope filter chips (All · Global · Health · Wealth · Relationships), an "Add" card (name, optional explanation, scope chips, Add button), then one card per item: ↑↓ rank arrows + rank number, name 15px semibold, explanation muted, right side: scope pill, "In sprint history / Unused", Edit, Archive/Delete. Impediments show WHEN/THEN beneath. Edit expands in place. Collapsed "Show archived (n)" at the bottom with Restore.

### Insights tab
Sidebar: Health · Wealth · Relationships · All areas · Sprint history.
- Area page: target-vs-actual bars for closed days (grey target, green/red actual) + "What this is discovering" pattern sentences with a small basis line and a "these are associations, not causes" note.
- All areas: horizontal % bars per area (never raw units).
- History: a plain table (Area, Outcome, Goal, Actual, %, Streak, Status).

### Dialogs
Centered-top modals, 620px (close day) / 800px (new sprint) / 560px (pickers), radius 22px, header row with a small muted step label and a × button, footer with ghost Back/Cancel left and a solid primary right.
- **Close day** is a stepper: Actual (34px numeric input, target shown above) → Impediments that hurt (checkbox list, "None today") → most damaging (radio) → Cues that helped → most useful → optional notes → **result screen**: the actual at 78px in green or red, a 14-segment progress strip, streak / cumulative / tomorrow's target rows.
- **New sprint** is 4 steps with a thin 4-segment progress bar: Area & outcome → Measure, goal, unit, usage of funds, start Today/Tomorrow → Confidence 1–10 (6–8 outlined in accent), why, celebration, mantra → 14 targets (Same/Custom), impediments, highest + WHEN/THEN, cues, vision-alignment checkbox → "Start sprint".
- **Celebration** (goal reached): a full-accent card, white type, 44px headline, "Begin sprint review".

---

## Patterns worth keeping
- One dominant number per screen; everything else steps down fast.
- Selection lists are full-width rounded rows with a leading square (multi) or circle (single) — not native checkboxes.
- Required-but-missing items are hinted in accent-ink text next to the disabled primary button, never with red error boxes.
- Green/red only ever mean at-or-above / under target.
- Locked things say "locked" in tiny muted text rather than being hidden.

## Known differences from the current spec (build to the spec)
The prototype was built against an earlier draft. Verify against `spec.md` before implementing: target-mode details, what is required at setup, Day Close order and "None" handling, archive/replacement rules for the highest impediment, Insights scope, and anything else that has changed since. The visuals above still apply.
