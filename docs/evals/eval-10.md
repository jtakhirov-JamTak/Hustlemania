# Evaluation report — SPEC F16 (Vision v3: Picture · Goal · Obstacle; Dictate)

**Most severe finding: none above P2.** Every acceptance criterion I could exercise passed. Two P2 copy/labelling deviations from the SPEC text, and a few areas I could not prove (listed at the end).

## Step 0 — containment probes

- **0a Read probe** (`C:\Users\jtakh\dev\Hustlemania\.claude\evaluator-hook-probe.txt`): **BLOCKED** — `evaluator_guard.py` reported "Evaluator hook self-probe: BLOCKED, which is the expected result." Read isolation active.
- **0b Shell probe** (`python -c "print('evaluator shell probe')"`): **BLOCKED** — "Evaluator shell allowlist: 'python' is not permitted. Allowed: cat, curl, diff, echo, find, git, grep, head, jq, ls, node, npm, npx, pwd, sleep, tail, wc, which (git: status/diff only)." Shell containment active.

Also blocked during the run (reported, not worked around): `ls -la .env.local` (permission denied), `cd`, and any command containing `>` (arrow functions, `2>&1`, `<>`). None of these were needed; I used `node -e` with `function(){}` literals and absolute paths instead.

## Working-tree integrity

First command output (`git status --porcelain`):
```
 M app/(app)/actions/library.ts
 M app/(app)/actions/vision.ts
 M app/(app)/sprints/[area]/page.tsx
 M app/(app)/sprints/layout.tsx
 M app/(app)/sprints/new/page.tsx
 M app/(app)/vision/(overview)/page.tsx
 M app/globals.css
 M components/LibraryPage.tsx
 M components/NewSprintWizard.tsx
 M components/VisionOverview.tsx
 M components/VisionSetup.tsx
 M components/today/AddItemPicker.tsx
 M docs/BACKLOG.md
 M docs/DECISIONS.md
 M docs/PROGRESS.md
 M docs/RUNBOOK_RESTORE.md
 M docs/SPEC.md
 M e2e/golden-path.spec.ts
 M lib/data.ts
 M lib/database.types.ts
 M lib/errors.ts
 M scripts/seed-f15-visual.mts
 M tests/db/grants.test.ts
 M tests/db/helpers.ts
 M tests/db/insights.test.ts
 M tests/db/libraries.test.ts
 M tests/db/vision.test.ts
 M tests/support/sprints.ts
?? components/Dictate.tsx
?? lib/dictation.ts
?? scripts/rehearse-0020.mjs
?? supabase/migrations/0020_vision_v3.sql
?? tests/unit/dictation.test.ts
```
Final command output: **identical** (same 28 ` M` lines and 5 `??` lines, verbatim).

Side effects outside the tracked tree, for the record: `.env.local` was rewritten by `predev`/`pretest:*` (gitignored); Playwright wrote screenshots under `test-results/` (gitignored); the local Supabase database was reset twice by `scripts/rehearse-0020.mjs` and is now at HEAD and empty (my throwaway users are gone); a `next dev` process I started on :3000 (background task) is still running.

## Scope tested

SPEC `### F16` only (`C:\Users\jtakh\dev\Hustlemania\docs\SPEC.md` lines 2222–2367). Method: black-box against the local stack (DB functions as `authenticated` with `auth.uid()` set, headless Chromium against `npm run dev` on :3000, three throwaway users A/B/C), then boundary cases, then source inspection of `supabase/migrations/0020_vision_v3.sql`, `components/Dictate.tsx`, `lib/dictation.ts`, `components/VisionSetup.tsx`, `app/(app)/actions/vision.ts`, `lib/data.ts`, and the test files named in the criteria.

## Evidence per acceptance criterion

**Migration 0020** — PASS.
- Live catalog: `visions` column set is exactly `archived_at, body, confidence, confidence_reason, created_at, deadline, id, obstacle_id, picture, proof, updated_at, user_id`; `body`/`deadline` nullable; `visions_body_check = (body IS NULL OR btrim(body) <> '')`, `visions_confidence_check = (confidence >= 0 AND <= 10)`, `visions_confidence_reason_check = (confidence_reason IS NULL OR confidence <= 6)`; `impediments` has no `explanation`, `cues.explanation` present; no column privileges on `impediments.explanation` remain; `save_vision`, `set_vision_rule` and the 3-arg `set_vision_obstacle` are gone; `day_offered_items` keeps `explanation text` in its return type. `schema_migrations` head = `0020 vision_v3`.
- Source: forward-only, no explicit BEGIN (CLI wraps the file in one transaction), `-- assert:begin/end` block present with all five branches. `tests/db/vision.test.ts` lines 151–200 provoke each branch in a rolled-back transaction; `npm run test:db` → **318 passed**.
- Rehearsal: `npx tsx --env-file=.env.local scripts/rehearse-0020.mjs` → all 11 assertions `ok`, "all assertions passed", exit 0 (legacy 3-of-3 user and text-only user both `vision_incomplete`; kept body/proof/deadline/obstacle_id; `picture` null; `day_offered_items` callable with null explanation).

**Write path** — PASS (all as `authenticated`, `SECURITY DEFINER`, `search_path=""`; grants exactly `authenticated`, `service_role` (+ owner `postgres`); `anon` → `permission denied for function`; no JWT → `not_authenticated`).
- `save_vision_picture`: `''`, `'   '`, `null` → `vision_picture_required`, row untouched. Insert returned id `8ff01d20…`; second call with new text returned the same id, same `created_at`, only `picture` changed (body/proof/deadline preserved on a later re-save).
- `save_vision_goal`: before step 1 → `no_active_vision`; blank body → `vision_body_required`; blank proof → `vision_proof_required`; null/−1/11 → `confidence_out_of_range`; 6 with blank/null reason and 0 with null reason → `confidence_reason_required`; row unchanged after every rejection (verified by re-select). Confidence 7 with reason "should be dropped" → stored `confidence_reason = null`, `deadline = 2027-09-12` = `current_date + 12 months`. Set-once: after admin set `deadline = 2028-01-01`, a further goal save left it `2028-01-01`.
- `set_vision_obstacle`: `no_active_vision` before step 1; every blank part → `rule_incomplete` with and without a pick, and the impediment table and `obstacle_id` unchanged; another user's id and a random uuid → `item_not_found`; archived → `item_archived`; `wealth`-scoped → `obstacle_not_global`; global pick "Old name" → renamed to "New when" with THEN/RECOVERED written, `obstacle_id` set; no pick → new global impediment "Fresh when" with the three parts, `obstacle_id` repointed. Note: it returns the **impediment** id (SPEC says only `→ uuid`).
- `start_sprint`: no vision → `no_active_vision`; after step 1 → `vision_incomplete`; after step 2 → `vision_incomplete`; after step 3 (with a situation attached) → sprint `3ea7cafe…` active; after blanking `proof_then` → `vision_incomplete` again. Check order: the vision gate fires before `no_situations`.
- Unchanged functions: `archive_item` on the obstacle → `vision_obstacle`; `review_vision` inserted a row; `replace_vision` archived the active row, after which goal save → `no_active_vision` and picture save created a fresh row.
- Direct table writes as `authenticated` (`update visions …`) → `permission denied for table visions`; user B selecting A's vision → 0 rows.

**Grants and pins** — PASS by test run: `tests/db/grants.test.ts` pins the callable set with `save_vision_goal/picture`, `set_vision_obstacle` (lines 175–181) and only `cues.explanation` rows (48, 74); `tests/db/libraries.test.ts` lines 1160–1167 pin the trim order, no `explanation` in `impediments_before_update`, `null::text as explanation` in `day_offered_items`; row-shape test lines 619–623. Suite green.

**Reads** — PASS. Sidebar reads `Locked · Vision not finished` on all three Areas at 1 of 3 and 2 of 3; `Ready` at 3 of 3. Wizard is blocked ("Finish the vision first.") — see P2 on copy. `lib/data.ts` `visionSteps` counts picture, body, complete obstacle rule (line 131); `visionReady = steps === 3`; selects use `*` on `visions` plus `obstacle:impediments(id, name, proof_then, proof_recover)` — no `explanation`.

**Setup** — PASS. `?step=2` and `?step=3` with no vision row → `data-step="1"`. Step 1: kicker "Annual setup · Step 1 of 3", meta, title "Visualize one year from today", segments Picture · Goal · Obstacle, textarea `aria-label="Picture"`, hint "Picture the day before moving on.", Save `aria-disabled` true→false on fill. Step 2: textarea "Goal"; proof input has visible `<label for>` "The observable proof will be ___." (accessible name "Proof" — see P2); 11 chips `aria-label="Confidence n"` with `aria-pressed` toggling; "Main reason" present at 6 and 0, absent at 7 and 10; hint ladder observed in order: "Write the goal." → "Name the observable proof." → "Pick a confidence from 0 to 10." → "Say the main reason your confidence is low." → none. Step 3: radiogroup "Global impediments" with "has THEN → RECOVERED" tag; picking filled WHEN/THEN/RECOVERED with the item's values; "Name a new one" cleared all three and the pick; inputs labelled WHEN / THEN / RECOVERED WHEN (SPEC writes "When"); example block and "Rehearse once" block present; hint "WHEN, THEN and the recovery criterion are all required." Failed save (pick archived underneath): stayed on step 3, `role=alert` "That item is archived. Restore it first." with a Retry button, all three inputs and the pick preserved, `obstacle_id` still null; after restore, Retry → overview.

**Dictate** — PASS. Server HTML for `/vision?step=1` contains no "Dictate"; after mount one button per box: "Dictate the picture", "Dictate the goal", "Dictate the proof", "Dictate the reason" (only at ≤ 6), "Dictate WHEN/THEN/RECOVERED WHEN"; 44 px high, background `rgb(91, 91, 214)` (accent), `aria-pressed`. With `SpeechRecognition`/`webkitSpeechRecognition` removed via init script → 0 buttons on all three steps. Click in real headless Chromium → `aria-pressed="true"`, text "Listening… tap to stop". With a fake recogniser: `continuous=true`, `interimResults=true`; interim "hel" → "Typed already. hel", then "hello wor" replaced it, then final "hello world" + interim "again" → "Typed already. hello world again"; starting the proof box stopped the goal box (`stopped=true`, goal `aria-pressed=false`) and the goal text was left intact; `not-allowed` → `role=status` "Microphone blocked in this browser. Allow it or type.", button back to unpressed. `npm run test:unit` → 171 passed incl. `tests/unit/dictation.test.ts` (single-space join, interim separate from final, empty base).

**Overview** — PASS. Partial (picture only): kicker "One year from today", meta "Saved Sep 12, 2026 · Not reviewed yet" (no "By"), headline "Goal not written yet", `card-goal` "Write the goal.", `card-obstacle` "What most often pulls you off that course?", sidebar "1 of 3", no `card-rule` (count 0). Complete: meta "Saved … · By Sep 12, 2027 · Not reviewed yet", headline = goal, `card-goal` "Proof: … · Confidence 5/10 · Travel weeks break the routine", `card-obstacle` "WHEN … → THEN … / Recovered when …", "3 of 3 steps", review note "365 days to the deadline" only with a deadline. Empty picture text "Picture a day one year from today." not observed (a row cannot exist without a picture after 0020 except legacy rows; not provable locally after the rehearsal reset).

**Libraries** — PASS. Impediment card `data-part` = when, then, recovered, applies-to; the page text contains no "interferes"; editor inputs are WHEN / THEN / RECOVERED WHEN / New situation only. Cue card keeps the NOTE ("A note on the cue" rendered; editor field labelled NOTE). `actions/library.ts` sends `explanation` only on the `cues` branches (lines 55, 92). Cue insert as `authenticated` with `'   padded note   '` → stored `"padded note"`.

**e2e** — PASS: `npm run test:e2e` → 12 passed, 6 skipped (phone reminders, deployed project), 1.5 min. Spec asserts Picture → 1 of 3, confidence 5 → reason hint, 2 of 3 with sidebar Locked, 3 of 3/Ready, Dictate buttons by label, 16 px guard, `[data-part=interferes]` count 0.

**Visual / phone** — PASS at 390 px (Chromium, Pixel 5 profile): steps 1–3 and overview `scrollWidth − clientWidth = 0`; no input under 16 px on any step; Dictate 44 px. Dusk/Night screenshot comparison not performed (see untested).

**Live mutations** — NOT RUN (they require editing the migration; the evaluator writes nothing). The named tests exist: `tests/db/vision.test.ts` 338, 362, 378, 405, 514; `tests/db/libraries.test.ts` 1160–1167; `vision.test.ts` 185–199.

## Findings by severity

**P0** — none.

**P1** — none.

**P2**
1. Wizard copy differs from the SPEC's quoted string. SPEC: the wizard says "A sprint has to advance the vision; finish its three steps first." Observed at `/sprints/new?area=health`: "A sprint has to advance the vision, and its three steps are not all saved. Write the vision first; it takes three short steps." plus hint "Finish the vision first." (`components/NewSprintWizard.tsx:357`). Behaviour (blocked wizard) is correct; only the text deviates.
2. Step 2 proof input's accessible name is "Proof" (`aria-label="Proof"`, `components/VisionSetup.tsx:174`), while the SPEC says the input is labelled "The observable proof will be". The visible `<label for="vision-proof">` does carry that wording, so sighted users see the SPEC text, but `getByLabel("The observable proof will be")` finds nothing. Likewise step 3's first input is labelled "WHEN" where the SPEC writes "When". Cosmetic/a11y-name mismatch only.

Observations (not defects against F16): `set_vision_obstacle` returns the impediment id, not the vision id — SPEC says only `→ uuid`. `start_sprint` (0019 behaviour, out of scope) overwrites the highest impediment's THEN/RECOVERED with the wizard's inline parts.

## Untested or unprovable

- Dictation against the real Web Speech service, microphone permission prompts, and iOS home-screen behaviour — SPEC itself marks the iOS case unverified; I could only simulate the API.
- Dusk/Night visual comparison against `docs/mockups/f16-vision/` — no screenshot tooling within the allowlist; layout/overflow/font checks were done numerically instead.
- The `card-picture` empty state text ("Picture a day one year from today.") — no reachable state produces a vision row without a picture through the UI.
- The seven live-mutation checks — require editing files.
- Hosted project — not touched, per instructions.

## Recommendation

**Continue.** F16 meets its acceptance criteria as specified; the two P2 items are copy/label deviations for BACKLOG. Working tree unchanged; note the still-running `next dev` on :3000 started by this evaluation.

## Addendum (from the evaluator, after the report above)

Addendum to the report above (one correction, no change to grades):

- The `next dev` process I started on :3000 has now **exited** (background task `bj9wg3q19`, exit code 1, after the e2e run's last requests; the log shows only normal 200 responses before the exit, no error text). So there is **no orphaned dev server** left behind by this evaluation — strike that item from the side-effects list. Nothing else in the report changes: both `git status --porcelain` outputs remain identical, findings stay at two P2 items, recommendation remains **continue**.
