# Sprint — UI reference v8 (for Claude Code)

**Read this first.** The files here are **design references built in HTML**, not production code. Recreate them in the target codebase's environment (React/Vue/SwiftUI/native — whatever exists; if nothing exists, pick a framework suited to a small offline-first personal app with local persistence). Where prototype and this README disagree, follow this README and keep the look.

**Fidelity: high.** Colors, type, spacing and copy are final. Match them.

## What's in here
- `Sprint App v8 Libraries.dc.html` — the working prototype (all three tabs, all dialogs). Open in a browser with `support.js` and `_ds/` beside it. Vision → Data & export has **Load sample sprint** — use it to see every screen populated.
- Tweaks in the prototype: `palette` (Lake · Meadow · Dusk · Sand), `underTargetColor`, `showDateBar`.
- Persistence: one JSON blob under `sprintApp.v4`; Export JSON in Vision → Data & export.

## What changed since v3 (the last handoff)
1. **Sprints tab is a journal.** Left sidebar per area; main column is a 14-day timeline: Days 1–7 collapsed to one line → Yesterday (expandable) → **Today** (inline editor) → Tomorrow (expandable) → Days 11–14 one line. Right rail: mantra, highest impediment, cues, celebration, usage of funds.
2. **Day Close** is two steps (actual → what happened) with a shared question set used both inline and in the modal: Occurrence → Use → Response → Impact, all with None/Unsure.
3. **Highest impediment** carries WHEN → THEN → **RECOVERED WHEN** (observable recovery criterion), required at setup.
4. **Insights** has two views: single-sprint postmortem (Reviews) and Across sprints; both use the **same four cards**: Impediment impact · Response follow-through · Response recovery · Cue usefulness.
5. **Vision** is three annual steps (Define vision → Identify main obstacle → WHEN–THEN guiding rule) with a saved overview. The main obstacle **is** a global impediment in the library; the guiding rule is its WHEN → THEN.
6. **Libraries** show cues as WHEN → REMIND and impediments as SITUATION → INTERFERES → WHEN → THEN → RECOVERED.

---

## Visual language
Calm, light, spacious. White rounded cards on a faint tinted wash. One accent per palette; the only loud element is today's target.

**Palettes** (default Lake):
- Lake: bg `#f7fbfd`, ink `#16242e`, accent `#2b7ea8`, accent-ink `#1d6188`, wash `linear-gradient(180deg,#eff7fb 0%,#fbfdfe 46%)`
- Meadow: bg `#f7fbf8`, ink `#1a2620`, accent `#3f8560`, accent-ink `#2a6446`, wash `linear-gradient(180deg,#eff7f2 0%,#fbfdfc 46%)`
- Dusk: bg `#f9f9fd`, ink `#1c1b2a`, accent `#5b5bd6`, accent-ink `#4141ab`, wash `linear-gradient(180deg,#f2f2fb 0%,#fcfcfe 46%)`
- Sand: bg `#fdfbf8`, ink `#241f1a`, accent `#b4763c`, accent-ink `#8c5828`, wash `linear-gradient(180deg,#faf4ec 0%,#fefdfb 46%)`
- Derived: panel `#fff`; divider = ink 13%; muted text = ink 62%; faint fill = ink 6%. Met green `#2f7d52`; under red `#c0392b` (tweakable). Colors carry met/under; never the words HIT/MISS.

**Type:** Plus Jakarta Sans 300–700, heading and body. Page titles 30px/700, tracking -0.02em, line-height 1.15. Today's target/actual 64px/700, tracking -0.04em, line-height 1. Body 13.5–15px. Kickers 10.5px/600, tracking 0.03em, accent (or green/red for the helped/hurt columns). Field labels inside WHEN/THEN blocks 10px/700 accent uppercase.

**Shape:** cards radius 20px, 1px divider border, 18–22px padding, 14–20px gaps. Today card: 1.5px accent border + shadow `0 18px 40px accent@12%`. Small rows (yesterday/tomorrow) radius 14px. Buttons radius 12px, 13.5px/600; primary = solid accent, white text. Pills radius 999px, padding 6px 12px, 12px; active = accent fill, white 600. Inputs radius 11–14px, 1px divider border.

**States:** hover = accent tint; pressed = accent-ink; focus-visible = 2px accent outline, offset 2px. Disabled = 45% opacity. Two-tap for destructive actions (label changes to "Tap again to…", turns red).

**Responsive:** ≤1240px main+rail stack (`[data-journal]`, `[data-pm]` → 1 col; rail static). ≤940px sidebar stacks above content, 2/3-col grids (`[data-cols]`) → 1 col.

---

## App shell
Sticky header 58px, panel background, bottom divider: accent dot + "Sprint" 15px/700; tabs **Sprints · Vision · Insights** (13.5px/600, padding 0 22px, `inset 0 -2px 0 accent` on active; inactive muted). Optional date bar.

**Left sidebar (all three tabs, same component)** 266px, right divider, title 10.5px kicker, then rows: full-width button radius 12, margin-left 10, padding 11px 14px 12px; label 13.5px/600; meta 10.5px/600 right-aligned (accent when urgent); sub 11.5px muted. Active = accent 10% fill.
- Sprints: one row per area (Health · Wealth · Relationships). meta `Day n/14` · `Review` · `Ready` · `Locked`; sub = outcome or "No active sprint" / "Vision not written yet".
- Vision: **Vision** (meta `n of 3`), **Execution cues** (count), **Impediments** (count), **Data & export**.
- Insights: **Across sprints** (sub "What helps and what hurts, all sprints"); section label **Reviews**; then one row per sprint needing review (meta red "Needs review") and per finished sprint (meta green "Met" / red "Under"), sub `outcome · dates`. Empty: "Nothing to review yet / Postmortems open here when a sprint ends". Running sprints are never listed.

Main padding 30px 40px 100px. Content max-width: Sprints journal grid `minmax(0,1fr) 300px` gap 32; Vision 960px; Insights 1120px.

---

## Sprints tab — Journal

### Header
Title = sprint outcome (30px/700); meta `Area · Sep 1 → Sep 14` 12px muted; right: `Day 9 of 14` + `55%` and pct line `5,500 of 10,000 · 500 a day finishes it`; 14 thin segments (6px, radius 3) white at 15% opacity, full opacity when closed, today outlined.

### Timeline
Left label column 190px, right rule 2px (accent on today), rows with a 10px dot on the rule (green met / red under / empty future; today = 14px accent dot with 4px accent-20% halo).
- **Summary rows** (Days 1–7 / Days 11–14): label `Days 1–7` + date range 10px; text "Earlier in the sprint" / "Rest of the sprint"; `show/hide` link 12px/600 accent-ink. Expanding lists each day as a closed/missed/future row.
- **Closed row**: panel, radius 14, padding 10px 14px: `**800** of 715 · showed up: Starting late` + verdict `met`/`under` 11px/600 colored + `hide`.
- **Missed row**: 1px dashed red border: `Missed · target 715` + `add` (opens backfill modal) + `hide`.
- **Future row**: dashed divider border, `Target 715`; tomorrow shows `edit`; when editing targets: numeric input 96px.
- **Today row** — the card, states below.

### Today card
Header: kicker (`Today's entry · target 715` / `Closing Day 9 · target 715` / `Today's entry · closed`) + right `closes 11:59 PM {tz}`.

**Planning (default):** 64px target + `USD today` 15px/600 muted. Divider, "How do I intend to produce today's target?" 11px muted, task rows (18px checkbox radius 6, borderless input 14px, ×), `+ task` link. Footer: hint "At the end of the day, enter the actual and log what showed up." + primary **Close the day** (padding 11px 20px).

**Reviewing (step 2, inline):** 64px borderless input (2px dashed bottom border) for actual (+ minutes input 40px for Hours sprints) + `USD · against 715`. Then the **shared question set** (below), each block margin-top 14px: optional group kicker 10px/700 accent uppercase tracking 0.04em; label 12px/600 + right sub 11px muted; pills row. Then read-only tasks, then footer: notes input (italic 13px, borderless) · hint 11.5px accent-ink · **Back** · **Confirm close** (disabled until valid).

**Closed:** 64px result colored green/red + `USD against 715`; summary line 13.5px muted (see Day summary); quoted note italic; tasks disabled. Right after closing, a faint "Set up tomorrow · Day n" block lists items that "Didn't show up today" / "Not used today" with Remove, plus "Add impediment / Add cue"; Done dismisses. Footer `Day closed · locked · tomorrow's target 715`.

Below timeline (when editing targets): mode chips **Same daily target · Custom**, `Planned · Goal · delta`, Done, explanatory note. Footnote 12px muted: "Tap a day to see what happened or set its target. Missed days can be added there — they count toward the goal, not the streak. Days close 11:59 PM {tz}."

### Right rail (sticky, top 78px, gap 14)
1. **Mantra** card: 18px italic/500 accent-ink in curly quotes; tap to edit inline (input + Save). Under it: `n-day streak`.
2. **Highest impediment** card: kicker + `Change`; name 16px/600; `WHEN … → THEN …` 13px; `RECOVERED WHEN …` 12.5px muted; `Edit proof point` link; divider; "Also watching" list (name + Remove) + count `n of 5`; `Add impediment`.
3. **Execution cues** card: kicker + `n of 3`; each cue 2px accent left rule, padding-left 10: name 14px + note 12.5px muted + Remove; `Add cue`.
4. **Celebration** card: `Celebration` kicker + text; when cum ≥ goal: **Complete sprint** primary. Footer `End sprint early` (two-tap).
5. **Usage of funds** (Money sprints with allocations): one statement line `5,000 savings · 3,000 debt · 2,000 travel`.

### Review gate (sprint ended)
Full-width card: kicker `Wealth · sprint complete|ended early`, outcome 28px/700, copy "This sprint has ended. The next Wealth sprint stays locked until its postmortem is finished.", primary **Open the postmortem** (→ Insights → Reviews, this sprint selected).

### Blocked / empty area
Accent card: area tag, 64px title, right column copy, white primary "Create a {Area} sprint" or "Write the vision" (vision required first). "Load sample sprint" ghost when nothing exists.

---

## Day Close — shared question set
Used identically in the inline Today card and in the **Close day modal** (backfill of missed days). Modal: 620px, radius 22, header `Actual result · step 1 of 2` / `What happened · step 2 of 2` / `Day closed`; footer Back/Cancel · hint (accent-ink) · **Continue / Close the day / Back to today**.

Step 1 — **Actual result**: `Target Day 9: 715`; 34px input (+ minutes for Hours); note "Zero is a truthful answer and keeps the streak when the day is closed on time." (backfill: "Backfill counts toward the sprint goal and insights, but never repairs the streak.")

Step 2 — **What happened on Day 9?** "None and Unsure are truthful answers." Questions (pills; multi where noted):
1. Group **OCCURRENCE** — *Which obstacles showed up?* sub `Highest: {name}`. Pills: every sprint impediment (multi) · **None** · **Unsure**. Picking Unsure clears the list.
2. Group **USE** — *Which cues did you use?* Pills: every sprint cue (multi) · **None** · **Unsure**.
3. *(only if the highest impediment is in the picked list)* Group **RESPONSE · {highest}** — *Did you run the response?* sub `THEN {then}`. **Yes · No · Unsure** (single).
4. *(only if 3 = Yes)* *Did you recover?* sub `Recovered when {recover}`. **Yes · No · Unsure**.
5. *(only if highest showed up)* Group **IMPACT · {highest}** — *How much did it cost today?* sub "Your read, not the number". **Nothing · Some · A lot · Unsure**.
Then optional note (italic borderless input).

**Validation:** actual required; if highest showed up → response answer required; if response = Yes → recovery answer required. Hints: "Enter today's actual — zero is truthful" / "Did the response run?" / "Did you recover?". Impact is optional.

Result step (modal only): 78px actual colored, 14-cell strip, rows Streak / Cumulative / Day n target.

**Day summary line** (closed card): joins with ` · `: `Showed up: a, b` | `No obstacles` | `Obstacles: unsure`; `Response ran|didn't run|unsure` (+ `recovered` / `didn't recover` / `recovery unsure`); `Cost: nothing|some|a lot`; `Cues used: a, b` | `No cue used` | `Cues: unsure`.

**Day record:** `{ actual, late, tasks[], imps[], impsUnsure, impTop, cues[], cuesUnsure, cueTop, resp: yes|no|unsure|null, recov: yes|no|unsure|null, impact: none|some|alot|unsure|null, notes }`. `impTop` = highest if it showed up else first picked; `cueTop` = first picked (legacy display only).

---

## New Sprint dialog (4 steps, progress bar)
800px, radius 22. Steps: **1 Area + outcome** (area cards; vision shown in faint block; blocked note if no vision) → **2 Measure** (Money/Hours/Quantity seg, goal, unit, Money: "Usage of funds — optional") → **3 Confidence 1–10** (6–8 band), why, celebration, mantra (all required) → **4 Impediments 1–5** (checkbox rows with scope tag, create inline), **Highest impediment** (radio rows; faint block) with **WHEN / THEN / RECOVERED WHEN** inputs when the impediment lacks them ("The obstacle most likely to cause this sprint to fail. It must carry a WHEN → THEN response and one observable recovery criterion."), **Execution cues 1–3**, alignment checkbox "If you complete this sprint, will it meaningfully move you toward your vision?". Hints beside disabled primary: "The highest impediment needs WHEN → THEN and a recovery criterion", etc. Picking an area pre-fills the kit carried from that area's last review.

**Small picker modal** (560px, centered): Add impediment/cue to sprint (checkbox rows + create), **Change the highest impediment** / **Edit the proof point** (radio rows + WHEN / THEN / RECOVERED WHEN inputs; all three required; hint "WHEN, THEN and the recovery criterion are all required").

---

## Vision tab

### Setup — three annual steps (shown when no vision exists, or via Edit)
Header: kicker `Annual setup · Step n of 3` + right "Revisit once a year. Sprints are planned separately." Title 30px. Progress: 3 segments (4px, radius 2, accent up to current) max-width 320 with step names beneath (`Vision · Obstacle · Rule`, 11px; current 700 ink, others muted). Card 720px max, padding 22px 24px; prompt 14px; footer (top divider): **Back/Cancel** ghost (hidden on step 1 with no vision) · hint · **Save & continue / Save**.
1. **Define your vision** — "Where does your life stand one to two years from now? One or two sentences." Textarea 16px (4 rows). "What would prove it happened?" 12.5px/600 + input (placeholder "Something you could point to: a number, a habit held for a quarter, a signed contract"). Required: vision text. Hint "The vision unlocks every sprint."
2. **Identify the main obstacle** — "What most often pulls you off that course? Pick a global impediment or name a new one." Radio rows for every non-archived **global** impediment (tag `has WHEN → THEN` when set). Then "Or create a new impediment" / "Create the impediment": grid **SITUATION** (input 15px/600, e.g. "Saying yes to one-off projects") · **INTERFERES** (input, "What it does to your day…"). Note: "Same card as any impediment in the library, saved with global scope so every sprint can watch it. The WHEN → THEN comes next." Required: a pick or a new name. Saving creates/updates the impediment (`scope: global`) and stores its id as `visionMeta.obstacleId`.
3. **Choose a WHEN → THEN guiding rule** — "The one move you make the moment {obstacle} shows up." Grid **WHEN** · **THEN** · **RECOVERED WHEN** inputs (pre-filled from the impediment). Note: "Saved on {obstacle} as its WHEN → THEN. Any sprint that watches it uses this same response." Required: WHEN and THEN. Saving writes `when/then/recover` onto the impediment.

Each step saves on continue (answers are editable later from any card).

### Saved overview
Kicker "One to two years from now" + right meta `Saved Sep 1, 2026 · Reviewed … | Not reviewed yet`. Vision text as h1 26px/600, line-height 1.3, max 34ch. Action row: **Edit** (secondary → step 1) · **Review vision** (primary) · `Replace` ghost (two-tap: "Tap again to archive it and start over" in red → archives the text to previous visions, clears `visionMeta`, opens step 1; the impediment stays in the library) · right-aligned `n of 3 steps` 12px/600 (green at 3).

**Review vision** (independent of editing): 1.5px accent card: kicker Review; "Does this still describe where you're headed?" 16px/600; note `Proof you named: … . n sprints have run behind it.`; buttons **Still true · mark reviewed** (primary; stamps `reviewedISO`) · **Needs changes** (→ step 1) · Cancel.

Three cards (3-col grid, gap 16): each kicker + `Edit`/`Add` link, body 14.5px, sub 12px muted.
- **Vision** — body = vision; sub `Proof: {evidence}` or "No success evidence yet".
- **Main obstacle** — body = impediment name; sub = its INTERFERES text or "Global impediment · every sprint can watch it". Empty: dashed prompt "What most often pulls you off course?" → step 2.
- **Guiding rule** — body `WHEN … → THEN …`; sub `Recovered when …` or "Lives on the impediment · sprints that watch it use the same response". Empty: "One move, every time {obstacle} shows up." / "Name the obstacle first." → step 3 (or 2).

Second row (`1fr 2fr`): **Library** card — rows `Execution cues  n →`, `Impediments  n →` (open the library sections), note "Cues and impediments are picked per sprint." **Sprints behind this vision** — one row per active sprint (`Area · outcome · Day n of 14` / red `Needs review`) and finished sprint (`Met|Under · actual of goal`, green/red); tapping opens the sprint or its review. Empty: "No sprints yet. They are planned on the Sprints tab." No sprint creation here.
"Show previous visions (n)" folds archived texts (faint blocks).

`visionMeta = { evidence, obstacleId, savedISO, reviewedISO }`; vision text = `visionText`; archive = `visionPrev[]`.

### Libraries (Vision → Execution cues / Impediments)
Card: title 13px/600 + count `n · m archived`; blurb 12px muted; **example line** 12px accent-ink; scope chips **All · Global · Health · Wealth · Relationships**; ranked list with ↑↓ (9px outlined buttons) and rank number.
- **Cue card (view):** two-column grid, labels 10px/700 accent: **WHEN** `{trigger}` (12.5px; italic muted "add the moment this should fire" when empty) · **REMIND** `{name}` 14px/600. Blurb: "A when → reminder or action you keep in front of you. Ranked, reusable across sprints; add the when under Edit." Example: `e.g. WHEN I schedule anything → remind: ask "How much does this pay?"`.
- **Impediment card (view):** **SITUATION** `{name}` 14px/600 · **INTERFERES** `{interference}` · **WHEN** · **THEN** · **RECOVERED** — each 12.5px, italic muted placeholder when empty ("what it does to your day", "not set"). Blurb: "A situation, what it does to your day, and the WHEN → THEN response that answers it. Fill the rest under Edit." Example: `e.g. Starting late → the first block slips to noon → WHEN I notice delaying → THEN a 10-minute timer on the smallest task.`
- Below each: optional note 12px muted; row of scope pill (10.5px/600 outlined), usage ("In an active sprint" / "In sprint history" / "Unused"), **Edit**, **Archive/Delete** (red; disabled when it would leave a sprint with no items or remove a highest).
- **Edit:** same grid with one input per part (cue: WHEN, REMIND; impediment: SITUATION, INTERFERES, WHEN, THEN, RECOVERED WHEN), placeholders are the concise examples; note input; scope mini-chips; Cancel / Save.
- **Add row:** single input ("New reminder or action" / "New situation, e.g. Phone distraction") + **Add**; Enter adds; scope mini-chips. Rest is filled under Edit.
- "Show archived (n)" with Restore.

**Library records:** cue `{ id, name, trigger, note, scope: global|health|wealth|relationships, arch }`; impediment `{ id, name, interference, when, then, recover, note, scope, arch }`.

### Data & export
Card: "Saved on this device only · vision set · n cues · n impediments · n active · n finished" + **Export JSON** · **Load sample sprint** · **Reset all data** (two-tap).

---

## Insights tab

### Four insight cards (shared component; used by both views)
2-col grid, gap 16. Card: kicker (colored: red for impediment impact, accent for response cards, green for cues) + right **coverage** 11px muted; question 12.5px muted; rows separated by top dividers, padding 12px 0 14px. Row: name 14px/600 (+ `HIGHEST` tag 9.5px/700 accent) · right **tail** 13px/700; sub 11.5px muted (sample counts); two **bars** (6px track faint, fill colored) each with `**value** label` 11.5px right column 170px; note 11.5px (accent-ink when insufficient, muted otherwise). Empty card: dashed block with a reason.
1. **Impediment impact** — "On-target rate on days an obstacle was present vs absent." Coverage `Logged L of C closed days · U unsure`. Row per impediment (highest first, then sorted by damage): sub `Present on W of L logged days[ · n sprints]`; bars `x% on target when present` (red) / `y% on target when absent` (neutral ink 30%); tail `−31 pts` (red when ≤ −10) or **Not enough data**; note `Needs 3 days with and 3 without · has W and O` · `Felt: 2 a lot, 1 some` (perceived impact) · *cross-sprint:* `Hurt in 2 of 3 sprints with enough days — recurring`.
2. **Response follow-through** — "When the highest impediment showed up, did the WHEN → THEN response run?" Coverage `N occurrences · A answered`. Row per highest impediment: sub `THEN {then}`; bars `Y ran the response` (green) / `N didn't run it` (red) as shares of answered; tail `71% ran` (green ≥70, red <40) or Not enough data (needs 3 answered); note lists unsure days, "n days logged before this question existed", *cross:* `Ran at least half the time in 2 of 3 sprints`.
3. **Response recovery** — "After the response ran, was the recovery criterion met?" Coverage `N responses · A answered`. sub `Recovered when {recover}`; bars `met the criterion` / `didn't recover`; tail `60% recovered`; note adds `On target x% when recovered vs y% when not` when ≥2 each.
4. **Cue usefulness** — same shape as 1 with green bars, `Used on…`, `on target when used / when not used`, tail `+22 pts` (green ≥ +10); *cross:* `Helped in 3 of 3 sprints — recurring`.
Rules: comparison rows need ≥3 days on each side; tri-state rows need ≥3 answered. Unsure days count toward coverage, not the comparison. Old days without the question are shown as "logged before this question existed".

### Reviews (single-sprint postmortem)
Selected from the sidebar; running sprints never appear. Grid `1fr 300px`.
Main: outcome h1 30px + kicker `Postmortem · Wealth · dates`; result card (44px total colored, `of goal`, meta `55% · under · 8 days closed · 1 not closed · best streak 4`, 14-cell strip). **Four insight cards** (single-sprint mode). **Proof point on the highest impediment** card: `WHEN … → THEN …`, `RECOVERED WHEN …`, observation `Showed up on 4 logged days · response ran 2 of 3 answered · recovered 1 of 2 answered.`, verdict chips **Worked · Partly worked · Didn't work**. **One key lesson** textarea + "Did it move the vision?" **Yes, it advanced it · No, it did not**. **Carry forward** rows per impediment (`Keep · Promote to highest · Drop`) and cue (`Keep[ · test more] · Drop`) with sub `present n days` / `used n days`; **Finish review** (requires lesson + vision answer + verdict; hint otherwise). Finished reviews render read-only with `Reviewed {date}`.
Rail: accent **Next Wealth sprint starts with** kit card (highest + note, also watching, cues, pinned lesson); **Across n finished sprints** stats (days on target %, goals met, lessons kept) + note "Reviews are the only place a lesson is written. Each one shows up on Day 1 of the next sprint in that area."
Finishing moves the sprint to history, stores the kit for the area, unlocks the next sprint there.

### Across sprints
h1 "What actually works for you"; right `n sprints · n closed days · n on target (x%)` / "Comparisons need 3 days on each side · association, not cause". Scope chips **All areas · Health · Wealth · Relationships**. **Four insight cards** (cross-sprint mode, recurring notes). Bottom row: accent **Suggested kit for the next sprint** (sentences: keep X as highest…, response ran only n%…, keep cue Y…) and **How to read this** (with/without explanation, thresholds, recurring note).
Insights lands on Across sprints whenever nothing is reviewable.

---

## Interactions & state (unchanged rules)
- Day boundary 11:59 PM in the sprint's stored tz; unclosed day = missed (backfillable, flagged `late`, breaks streak). Streak = consecutive on-time closes.
- Closing locks actual and tasks. Past/today targets locked; future editable (Custom) or equalized (Same).
- Cumulative ≥ goal → Complete sprint; remaining days cancelled, not missed.
- Sprint → status `review` on end → postmortem → history; next sprint in that area locked until reviewed; review kit pre-fills the next New Sprint.
- Sprint record: `{ id, area, outcome, measure, unit, goal, startISO, tz, status: active|review, targetMode, targets[14], days[14], mantra, why, celebration, confidence, usage[], cues[], imps[], highest }`. History entry adds `highestWhen/Then/Recover, lesson, moved, verdict, decisions, kit, closedISO, pct, actualRaw`.

## Patterns to keep
- Today first; the target is the one dominant number. History on demand (expand), never ambient.
- Target neutral; only actuals turn green/red.
- Selection lists = full-width rounded rows with leading square (multi) or circle (single); quick answers = pills.
- Missing requirements hinted in accent text beside the disabled primary; no red error boxes.
- None and Unsure are always offered; insufficient data is stated, never hidden.
- Locked things say "locked" quietly rather than disappearing.
