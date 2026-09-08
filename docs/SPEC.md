# Hustlemania — SPEC

Single source of truth for what to build. Produced by `/interview` (new-app mode) on
2026-09-05. The behavioural reference is `docs/references/14-Day-Goal-Sprint-Req.md`
(the PRD, 13 sections, 29 hard rules); where this spec and the PRD differ, this spec
wins and the difference is listed in Part 2 §5. The visual reference is the handoff in
`docs/mockups/UI mockups.zip` (see Part 2, F1 UI block).

**Re-baselined 2026-09-06.** The visual reference is now the v8 handoff,
`docs/mockups/New.zip`, extracted to `docs/mockups/ui-v2/handoff_sprint_ui_v8/`:
`README.md` is authoritative on look, `Sprint App v8 Libraries.dc.html` is the mockup of
record, and its bundled `spec_v3.md` is byte-identical to the superseded v4 `spec.md`
and is ignored. The v4 handoff under `docs/mockups/today/` is history. The
Insights/Vision draft at `docs/drafts/Changes to Insights and Vision pages.docx` was
reconciled against this spec in `docs/RECONCILIATION-2026-09-06.md`; every call from
that session is a dated line in Part 2 §5, and F6–F9 below are stubs that `/interview`
fills in build order. F1–F5 stay as built; where F8 changes their screens the entry says so.

# Part 1 — Problem

## Outcome and measurement
Members run real 14-day sprints end to end and a meaningful share reach their locked
Goal. **Measured from the app's own sprint records:** sprints started, sprints
completed (normal / early success / ended early), and % of Goal achieved per sprint.
No external instrumentation needed; Sprint History is the measurement.

## Users
A small group the owner knows personally: fewer than 10 people in the first six
months, mostly on desktop, invited by email. Each person's data is private; members
of an invite-based circle see a limited accountability view of each other.

## Problem
Sprints are tracked today in notes/journal. The pain is **no patterns**: nothing shows
which impediments actually correlate with bad days, so the same obstacles recur unseen.
Secondary: no streak, no deadline pressure, no group visibility.

## Requirements (labeled)
- REQUIREMENT — The PRD at `docs/references/14-Day-Goal-Sprint-Req.md` is the product
  behaviour: Areas → Vision → Sprint → Daily Target → Actual → Insights, and all 29 hard
  rules in its §13. The PRD is the source for acceptance criteria; Part 2 restates
  each feature's checks in machine-checkable form.
- REQUIREMENT — Day-one scope is the whole PRD: core loop, libraries with archive/scope
  rules, sprint completion + review, insights + history. No real sprint runs until all
  of it exists (user's choice; no date pressure).
- REQUIREMENT (added 2026-09-06) — **The v8 handoff's page designs are a must**,
  independent of the logic details reconciled in §5: the journal Sprints tab with its
  timeline and rail, the per-tab left sidebar, the three-step Vision and its saved
  overview, the library cards, the Insights cards and postmortem, and the dialogs, as
  `docs/mockups/ui-v2/handoff_sprint_ui_v8/README.md` draws them. Palette Dusk plus a
  night mode. No interview may trade the look away for a simpler build.
- REQUIREMENT — Invite-only access, magic-link sign-in, no passwords, no open sign-up.
- REQUIREMENT — Circles: inviting an email to a circle is the app invite. A member may
  belong to several circles. Circle members see, per active sprint: Area, current
  streak (and whether today is closed), % of Goal. Highest Impediment and other
  impediments are shared only if the owner opts in per item. Goal amount, actuals,
  targets, mantra, notes stay private.
- REQUIREMENT — One evening email reminder when today's Day is not yet closed.
- REQUIREMENT — Insights are rule-based statistics. AI narrative is a later feature.
- ~~REQUIREMENT — Personal data exportable (format not an MVP blocker).~~ Withdrawn
  by the user 2026-09-06: no data export in v1 (BACKLOG; §5).
- FACT — First users: <10, mostly desktop. Phone still matters for Today / Close.
- FACT — `~/PurePath` (Vite+Express+Drizzle, 445 commits, 18 tables, rebranded "The
  Leaf") is the prior attempt. Its lessons (route-layer gates, never log bodies,
  deprecate don't drop, golden-path e2e) apply. Its code does not.
- ASSUMPTION — Everyone in a circle is in roughly the same time zone; the PRD's
  per-sprint locked zone handles the rest.
- ASSUMPTION — A circle has no roles beyond creator; anyone in it can invite.
- PREFERENCE — Near-zero hosting cost on free tiers.
- PREFERENCE — Stack decided in Design on trade-offs; nothing forces it.

## Constraints
- Solo builder, agentic workflow, this template's guardrails (Supabase migration dir
  assumed by `write_guard.py` and `engineering-conventions`).
- Free tiers only; email reminders must fit a free sender quota (<10 users → trivial).

## Failure conditions (from the user)
1. **Stops opening it after the first week** — Day Close becomes a chore; the app adds
   friction to the sprint instead of removing it.
2. **Lost or corrupted sprint data** — a closed day or sprint history changed or lost.
   "Trust in the record is the whole product."

# Part 2 — Spec

Direction approved 2026-09-05: Next.js + Supabase on Vercel (rationale in
`docs/DECISIONS.md`). SPEC approved 2026-09-05 after review of the UI handoff.

## 1. Outcome
Members run 14-day Sprints end to end and a meaningful share reach the locked Goal.
**Measurement:** the finished-sprint rows in the Insights sidebar (F11) list every
sprint with Met / Under and % of Goal; the owner reads them. No extra instrumentation:
the sprint records are the data. (Was "Sprint History (F7)" until 2026-09-06; §5.)

## 2. Target users
<10 people the owner knows, invited by email, mostly desktop, some phone use for Today
and Close Day. Each person's data is private; circle members see a limited view.

## 3. Features (build order: dependencies and risk first)

Conventions that apply to every feature: `engineering-conventions` skill (RLS in the
same migration as the table, `.error` inspected on every call, integers for amounts,
`archived_at` not delete, falsifiable tests). Amounts are stored as one BIGINT
`amount` in **base units**: money → minor units (cents; UI accepts whole units only,
per PRD), hours → minutes, quantity → whole units.

Build order after the 2026-09-06 re-baseline: F1–F5 built · enabling pass (direct
build, no feature entry: inline styles to classes, Tailwind settled, no visible change)
· F6 Libraries v2 · F7 Day observations · F8 Journal restyle · F9 Vision v2 · F10
Sprint completion + postmortem (was F6) · F11 Insights v2 (was F7) · F12 Circles (was
F8) · F13 Evening reminder (was F9) · F14 Pre-release (was F10). Data before screens,
so the journal is built once with its final close questions.

### F1 — Walking skeleton: sign in → Vision → start Sprint → Today → Close Day
- **Behavior.** An invited user signs in with an emailed magic link (no passwords, no
  self-signup). They write a 1-year Vision for one Area, start a 14-day Sprint with the
  required setup fields and "same daily target" mode, see Today (header + 14-day
  strip, target hero, Daily Intention, Mantra, Close card), and close the day with an
  Actual and optional notes. A closed day is locked. The three tabs and the sprint
  sidebar exist; Vision and Insights tabs are placeholders.
- **Acceptance criteria.**
  - `signInWithOtp` with an email that has no `auth.users` row returns an error and
    creates no user (Supabase "disable signups" + `shouldCreateUser: false`); with the
    seeded owner email a link arrives (local: Inbucket) and lands on `/sprints`.
  - Unauthenticated request to `/sprints` → redirect to `/login` (middleware).
  - Tables `visions`, `sprints`, `sprint_days` created with RLS enabled and policies in
    the same migration. Integration test: user B `select` on user A's sprint returns 0
    rows; the same test FAILS when RLS is disabled on the table (falsifiability run
    once, recorded in the test file header). *Amended 2026-09-05: dropping the SELECT
    policy cannot be the mutation — RLS with no policy denies everything, so B would
    still see 0 rows and the test could not fail.*
  - `start_sprint(...)` DB function (SECURITY DEFINER, identity from `auth.uid()`
    inside; the authenticated role has no INSERT on `sprints`/`sprint_days`, so this
    function is the only write path — see `docs/DECISIONS.md` 2026-09-05) creates the
    sprint and its 14 `sprint_days` atomically; rejects: no active vision for the Area (PRD rule 2),
    an active sprint already in that Area (rule 1, also enforced by partial unique
    index `(user_id, area) WHERE status = 'active'`), empty mantra (rule 7), goal ≤ 0,
    confidence outside 1–10, measurement not in `money|hours|quantity`, money without
    3-letter currency, quantity without unit name.
  - Same-daily distribution: 14 targets sum to the Goal exactly for goal ∈ {14, 15,
    27, 100, 1} (table test); remainder distributed in whole planning units — one
    whole currency unit (100 minor) for money, one minute for hours, one for quantity
    (PRD §6 "whole-unit or minute remainders"; amended 2026-09-05 from "base units");
    UI shows the rounding note when any two days differ.
  - Sprint stores `tz` (IANA) and `start_date`/`end_date`; `end_date = start_date +
    13`; start is today or tomorrow in that zone only.
  - Trigger `sprints_lock_after_start` rejects UPDATE of `amount`, `measurement`,
    `unit`, `start_date`, `tz` once `status = 'active'` (rules 8–9); test asserts the
    UPDATE errors and the row is unchanged.
  - Close Day: `close_day(sprint_day_id, actual, notes)` sets `closed_at`; a second
    call, and any direct UPDATE of `actual`, `intention`, `notes` on a closed row, is
    rejected by trigger `sprint_days_immutable_after_close` (rule 17). Test asserts the
    error and unchanged values.
  - Today renders, in the UI-block order: header row (area tag, date, outcome h1,
    "Day N / 14"), 14-day strip with today's cell accent-bordered, target hero (92px)
    with Cumulative · Goal locked · Remaining, Daily Intention card (autosaved on
    blur, refresh preserves it), Mantra card as a quote, Close card. Tasks, Highest
    Impediment and the collapsed row arrive in F2/F4. Actual below target renders in
    the under-target red, at/above in success green; no HIT/MISS text anywhere (grep
    test on the rendered DOM).
  - Close dialog in F1 = step "Actual" (+ optional notes) → result screen (actual
    78px green/red, 14-segment strip, cumulative, tomorrow's target). F2 adds the
    hurt/helped content to make it the two-step dialog.
  - Empty state per prototype: sidebar "Locked / No 1-year vision yet" until a vision
    exists; workspace card with one primary action.
  - Visual match: Plus Jakarta Sans loaded, accent `#2b7ea8`, cards radius 20px,
    sidebar 266px at ≥940px and stacked below it (Playwright asserts computed styles
    at 1280 and 390).
  - Playwright golden path with no mocks: seeded user signs in → writes Vision →
    starts Sprint → sees Day 1 target → closes Day 1 → reload shows locked day.
  - `npm run verify` green: typecheck, lint, vitest (unit + DB integration against
    `npx supabase start`), playwright.
- **Non-goals.** Cues, impediments, tasks, custom targets, streak display, review.
- **Risks.** Magic-link flow on localhost (use Inbucket in the local stack) · RLS
  written but not proven (the falsifiability run is an acceptance item) · tz math
  (single server-side helper `sprintDayFor(sprint, nowUtc)` with a table test across
  DST boundaries).
- **Evaluator.** first vertical slice · auth/RLS · migration creating user-data tables.
- **Human steps before F1 (external; not build-time gates):** create the Hustlemania
  Supabase project (free tier, separate from `pure-eq`), turn off "Allow new users to
  sign up", create the owner user in the dashboard, and put the keys in `.env`. Vercel
  project creation happens at F14 (was F10).
- **UI.**
  - Primary action: enter Actual and Close Day, reached after a morning "Today I
    will" intention · desktop-first, both viewports · states: empty, loading, error
    (inputs preserved), closed.
  - **References (v4; superseded on screen by F8 from 2026-09-06 — the values below
    are what F1–F5 were built to and what the e2e pins until F8 moves them):**
    `docs/mockups/UI mockups.zip` (Claude Design handoff). Inside:
    `handoff_sprint_ui/README.md` = the visual language (authoritative on look);
    `Sprint App v4.dc.html` = working prototype (mockup of record); `screens/` =
    screenshots; `spec.md` = an OLDER PRD draft, superseded by `docs/references/`;
    `_ds/` Modernist stylesheet = a stray, ignored. The build session extracts the zip
    to `docs/mockups/today/` and leaves the zip untouched.
  - **Visual language (from the README):** Lake palette — page wash
    `#eff7fb→#fbfdfe`, ink `#16242e`, accent `#2b7ea8`, accent-ink `#1d6188`, success
    `#2f7d52`, under-target `#c0392b`; Plus Jakarta Sans; white cards radius 20px with
    1px `rgba(22,36,46,0.13)` border; sticky 56px header with three text tabs + 2px
    accent underline; fixed 266px sidebar (stacks above the workspace under ~940px);
    workspace max-width ~940px; today's target 92px (64px on phone); tiny accent
    section labels; `.btn-primary` solid accent radius 12px; chips for scope/filters;
    selection rows with leading square/circle, not native inputs; "locked" said in
    tiny muted text rather than hidden; green/red only for at-or-above / under target.
    Header brand reads **Hustlemania**.
  - **Today structure (user's order, using the prototype's cards):**
    1. Header row: area tag + date, outcome as h1 32px; right: "Day N / 14" 30px +
       streak. 14-day strip (D#, weekday, date; green/red bar once closed; today
       accent-bordered; weekends faint); start/end dates; "End sprint early" link (F10, was F6).
    2. Target hero card: label, number 92px, unit; 3-up stats (Cumulative · Goal
       locked · Remaining with "n days left · x a day"); Usage-of-funds pills (money).
    3. Daily Intention card ("Today I will…", textarea, autosave; pre-planned text if
       set at setup; locked with the day).
    4. Tasks card (F4): checkbox rows, inline text, "Add task"; "Locked with the
       closed day" after close.
    5. Highest Impediment card (F2): label, name 22px, WHEN/THEN rows, "Change",
       "Edit proof point".
    6. Collapsed row "▸ Other impediments (n) · Execution cues (n)" (F2) expanding to
       two-column cards with Remove / Add.
    7. Mantra card: accent-tinted, 23px italic quote, "Edit".
    8. Close card: copy + primary "Enter actual result" → two-step dialog: step 1 =
       Actual (34px numeric, target shown) + "Which impediments hurt?" rows with "None
       today" + most-damaging radio when ≥1 chosen; step 2 = "Which cues helped?" rows
       + most-useful radio + optional notes → "Close the day" → result screen (actual
       78px green/red, 14-segment strip, streak / cumulative / tomorrow's target,
       "Back to today"). After close: "Day closed · locked", "<actual> against
       <target>" in green/red, celebration line, "Complete sprint" band at goal (F10, was F6).
    9. 14-day plan card (F3): 7×2 day cells with target/actual, Same/Custom chips,
       Planned · Goal · delta line.
    Sidebar rows: area name; right meta "Day N/14" / "Locked" / "Review"; muted
    sub-line with the outcome or "No 1-year vision yet"; full-width "New Sprint".
    Empty state, 4-step wizard, Vision page, library page, Review, Insights: as the
    README describes.
  - **States.** Empty: one card with area tag, 30px title, one paragraph, one primary
    action; sidebar "Locked" until a vision exists. Loading: skeleton blocks in the
    same card layout, no layout shift. Error: accent-ink hint beside a disabled primary
    for validation; red inline bar with retry for a failed save; inputs preserved.
    Closed: close card shows "Day closed · locked"; tasks and intention read-only.
  - **Executable mockup:** before F1 code, a thin Today page in the actual stack with
    hardcoded data at `app/(mock)/today/page.tsx` on branch `mockup/today`,
    screenshotted at 1280 and 390 and compared against the prototype. Not a new
    approval gate.

### F2 — Execution Cue and Impediment libraries; Highest Impediment; Day Close selections
- **Behavior.** Two persistent libraries (Vision tab) with name, explanation, scope
  (global/health/wealth/relationships), rank (move up/down), archive/restore, and for
  Impediments a WHEN → THEN Proof Point. Sprint setup and the active Sprint select
  1–3 Cues and 1–5 Impediments (inline creation saves to the library), designate a
  Highest Impediment whose Proof Point must be complete. Today shows the Highest
  Impediment with WHEN → THEN and a collapsed list of other Impediments and Cues.
  Close Day becomes the two-step dialog: step 1 = Actual + "Which impediments hurt?"
  ("None today" valid) + most-damaging radio when ≥1 chosen; step 2 = "Which cues
  helped?" + most-useful radio + optional notes; then the result screen. Archive or
  scope-narrowing is blocked if any active Sprint would become invalid, else removes
  the item from all affected Sprints atomically.
- **Acceptance criteria.**
  - Tables `cues`, `impediments`, `sprint_cues`, `sprint_impediments` (with
    `added_at`, `removed_at`), `day_cue_helped`, `day_impediment_hurt`; RLS in the
    same migration; two-user denial test per table.
  - `start_sprint` now also rejects: cue count ∉ [1,3], impediment count ∉ [1,5],
    no highest impediment, highest impediment whose `proof_when` or `proof_then` is
    blank after trim (rules 3–6). Each rule has a failing test.
  - Trigger on `impediments` rejects clearing `proof_when`/`proof_then` while the row
    is highest in any active sprint (rule 22).
  - DB functions `archive_item(kind, id)` and `set_item_scope(kind, id, scope)`: return
    the list of failing sprints with reasons and change nothing when any affected
    sprint would violate rules 3–6; otherwise set `removed_at` on every affected
    membership and archive/rescope in one transaction (rule 20). Test both branches.
  - Permanent delete allowed only when no `sprint_*` membership row exists (rule 19):
    RLS DELETE policy `USING (user_id = auth.uid() AND NOT EXISTS (membership))`.
  - Restore sets `archived_at = NULL` and creates no membership rows (rule 21).
  - Day Close offers exactly the items whose membership overlapped that day's date
    (`(added_at AT TIME ZONE sprint.tz)::date <= day.date AND (removed_at IS NULL OR
    (removed_at AT TIME ZONE sprint.tz)::date >= day.date)` — the boundary is midnight
    in the sprint's zone, not UTC), including later-archived items (rule 23); test with
    a removed-then-closed day and a six-case midnight table test in `Pacific/Kiritimati`.
  - Library list, selection lists, and filters exclude archived items; the collapsed
    Archived section includes them (rule 24). Filtered views keep relative rank order.
  - At most one `sprint_impediments.is_highest = true` per sprint (partial unique
    index); changing it does not modify any `sprint_days` row (test: checksum of
    closed rows unchanged).
  - Close Day snapshots `highest_impediment_id`, `proof_when`, `proof_then` on the
    day row so History survives later Proof Point edits.
- **Non-goals.** Drag-and-drop ranking · guided fix flow for blocked archive.
- **Risks.** Membership date-range off-by-one at midnight (table test in sprint tz) ·
  archive validation duplicated in UI and DB (UI calls the DB function and renders its
  result; no client-side re-implementation).
- **Evaluator.** migrations creating user-data tables.
- **As built (2026-09-05, eval-02: 10/10 criteria PASS, 0 P0/P1, 3 P2).**
  - Migration `0004_libraries.sql`. Both libraries carry `rank` (per user, assigned by a
    BEFORE INSERT trigger; `move_item(kind, id, 'up'|'down')` swaps neighbours) and
    `archived_at`. `authenticated` may INSERT `user_id, name, explanation, scope`
    (+ `proof_when, proof_then` on impediments) and UPDATE the free-text columns
    directly; `scope`, `rank`, `archived_at` and every membership/selection table are
    written only through SECURITY DEFINER functions: `add_sprint_item`,
    `remove_sprint_item`, `set_highest_impediment`, `archive_item`, `set_item_scope`,
    `restore_item`, `move_item`. `archive_item` / `set_item_scope` return
    `{"ok": true, "removed_from": n}` or `{"ok": false, "failing": [{sprint_id, area,
    outcome, reason}]}`; the reason is the first violated rule in the order 3, 4, 5, 6.
  - `start_sprint` gained `p_cue_ids uuid[]`, `p_impediment_ids uuid[]`,
    `p_highest_impediment_id uuid`, and optional `p_proof_when` / `p_proof_then` that
    write the Highest Impediment's Proof Point atomically with the start; the F1
    overload is dropped. `close_day` gained `p_hurt`, `p_most_damaging`, `p_helped`,
    `p_most_useful` (F1 overload dropped) and snapshots `highest_impediment_id`,
    `proof_when`, `proof_then` onto `sprint_days`, which the immutability trigger now
    locks too. Selection rows have an UPDATE-only immutability trigger (a DELETE trigger
    would fire on the account-deletion cascade).
  - `day_offered_items(day_id)` (SECURITY INVOKER, RLS-scoped) is the single owner of
    rule 23; `close_day` validates against it and the UI loads the dialog's options
    from it.
  - Inline creation (wizard, Today pickers) saves with scope `global`. The library page
    lives at `/vision/cues` and `/vision/impediments`, listed in the Vision sidebar
    under "Libraries" with active counts. Selection rows are buttons with a leading
    square (multi) or circle (single), `role=checkbox|radio`.
  - Falsifiability: seven live mutations (DELETE policy without the membership guard,
    rule-22 trigger dropped, UTC boundaries, validation short-circuited, one-highest
    index dropped, selection immutability dropped, restore re-adding membership) each
    turned their test red; RLS is proven by the disable/enable run inside the suite.

### F3 — Custom daily targets, reconciliation, target locking, intention pre-planning
- **Behavior.** Setup and the active Sprint offer "custom" mode: edit each future
  day's target (zero allowed); the editor shows planned total, locked Goal, and the
  live delta; Save/Start is disabled until the total equals the Goal. Past and today's
  targets are locked. Nothing is ever auto-redistributed. Setup can also pre-fill each
  day's Daily Intention. The 14-day plan card appears on Today.
- **Acceptance criteria.**
  - `save_targets(sprint_id, targets[14])` DB function rejects: sum ≠ goal (rule 11),
    negative, any change to a day whose `date <= today` in sprint tz (rule 10); test
    each. Trigger on `sprint_days` rejects direct UPDATE of `target` for locked days.
  - No code path modifies a target other than the user's explicit save (grep/ownership
    test: the only writer of `target` is `save_targets`), covering rules 12–14.
  - UI: Save disabled while delta ≠ 0; delta text shows sign and amount.
  - Setup pre-fills `sprint_days.intention` for chosen days; Today shows it.
- **Non-goals.** Suggested rebalancing.
- **Risks.** Precision per measurement (minutes vs whole units) — one formatter/parser
  pair with a table test.
- **Evaluator.** none (additive columns on existing tables; no production rows).
- **As built (2026-09-05; no evaluator trigger).**
  - Migration `0005_targets.sql`, no new table or column. `validate_targets(measurement,
    amount, targets[])` is the one owner of the plan rules — shape (14), sign, precision
    (a multiple of `measurement_step`: 100 minor units for money, 1 minute / 1 item
    otherwise), then the sum (rule 11) — and both writers call it. `save_targets(sprint_id,
    targets[14])` (SECURITY DEFINER) refuses any change to a day whose `date <= today` in
    the sprint's zone (`target_locked`, rule 10), replaces only the future days that
    differ, and sets `target_mode = 'custom'`. Trigger `sprint_days_target_locked`
    (BEFORE UPDATE) repeats the rule-10 check for every role, the postgres role included;
    it fires after `sprint_days_immutable_after_close`, so a closed day still says
    `day_closed`. `start_sprint` gained optional `p_targets bigint[]` (starts in
    `custom`; today's target locks at start) and `p_intentions text[]` (per-day Daily
    Intentions; day 1 falls back to `p_intention`); the 0004 overload is dropped.
  - Ownership (rules 12–14) is asserted, not assumed: a DB test scans `pg_proc` and
    requires `save_targets` to be the only function whose body UPDATEs
    `sprint_days.target` and `start_sprint` the only one that INSERTs it; a second test
    reads every trigger on `sprints` / `sprint_days` and finds no `new.target :=`; a
    third finds no `cron.job` touching `sprint_days` when pg_cron is installed.
    `authenticated` has no column privilege on `target` (grants test unchanged: nine
    writable columns). Closing a day below target leaves every future target unchanged
    (rule 13, tested).
  - UI: one `PlanGrid` (7 × 2 cells, D#, weekday, date; input on editable days, target
    + "locked" / actual on the rest; summary line Planned · Goal · locked · delta with
    `data-state` balanced | below | above | invalid) serves the wizard's step 4 and the
    new `PlanCard` at the bottom of Today. Wizard: Same / Custom chips; Custom pre-fills
    the 14 inputs from Goal ÷ 14 and every day is editable, today included; Start is
    disabled with "The 14 targets must add up to the goal." until the delta is 0. A
    "Pre-plan intentions for days 2–14" disclosure adds one input per day. Today:
    "Custom" opens the future days for editing (one-way after the first save); Save is
    disabled until the plan balances and something changed; day rows are locked from
    `closed_at` or `date <= today` computed in the sprint zone, and the DB re-checks.
  - Hours targets are typed as `h:mm` (also `2h 30m`, `45m`, `2`), money and quantity
    as whole numbers; `parseTargetInput` / `formatTargetInput` are the one pair, table
    tested (16 parse cases, 6 round trips).
  - Deviation from the handoff mockup, on purpose: the mockup treats an unbalanced plan
    as "informational" and lets the user start or save; the PRD (§6, rule 11) and this
    spec forbid persisting one, so Save / Start stay disabled. The mockup's "Same"
    re-spread of the remaining goal during a sprint is not built (non-goal: suggested
    rebalancing; rule 12).
  - Falsifiability: six live DB mutations (sum check dropped, lock check dropped,
    trigger comparing in UTC, trigger dropped, anon granted execute, a second
    target-writing function added) each turned exactly their test red; the Today Save
    gate ignoring the delta turned the e2e red at the unbalanced-plan assertion.
    Visual check in Chrome (window held at 1138 px; it would not resize to 1280):
    Today plan card in view and edit state, wizard step 4 in custom mode.

### F4 — Tasks
- **Behavior.** Each day has an optional task list: text + done, unlimited, one blank
  row offered; nothing rolls over; tasks lock with the day.
- **Acceptance criteria.** Table `tasks` with RLS; denial test. Insert/update rejected
  when the parent day is closed (rule 17). No job or code path copies tasks between
  days (rule 16). Task completion has no effect on `sprint.status` or any total (rule
  15; test: complete all tasks, goal progress unchanged). Autosave on blur; refresh
  preserves.
- **Non-goals.** Ordering, due times, Eisenhower quadrants.
- **Risks.** none material.
- **Evaluator.** migration creating a user-data table.
- **As built (2026-09-05, eval-03: 5/5 criteria PASS, 0 P0/P1, 3 P2).**
  - Migration `0006_tasks.sql`: table `tasks` (`sprint_day_id` → `sprint_days` cascade,
    `user_id` → `auth.users` cascade, `text` non-blank, `done` default false,
    `created_at` / `updated_at` trigger, `archived_at`), indexes on both FKs, RLS in the
    same migration (`select` / `insert` / `update` on `auth.uid() = user_id`), grants
    `insert (user_id, sprint_day_id, text)` and `update (text, done, archived_at)` to
    `authenticated`, no `delete`. "Remove" is `archived_at` — History keeps every task
    (PRD §11) — and every list filters on it.
  - Trigger `tasks_lock_with_day` (BEFORE INSERT OR UPDATE, every role): refuses a change
    to `sprint_day_id` / `user_id` / `created_at` (`task_locked`), a day the task's owner
    does not own or that does not exist (`day_not_found`, never a leak), and any write
    once the parent day has `closed_at` (`day_closed`, rule 17). The trigger runs before
    RLS `WITH CHECK`, so a forged insert reports `day_not_found` rather than a policy
    violation; either way no row lands (tested).
  - Rule 15: completing every task leaves the `sprints` row and all 14 `sprint_days`
    rows byte-identical (DB test). Rule 16: DB tests scan `pg_proc` for any function
    body naming `public.tasks` (none), list the triggers on `tasks` (exactly
    `tasks_lock_with_day`, `tasks_set_updated_at`), find no `sprints` / `sprint_days`
    trigger naming tasks, and check `cron.job` when pg_cron exists; closing day 1 with
    open tasks leaves day 2's list unchanged.
  - UI: `TasksCard` between Daily Intention and Highest Impediment (SPEC order). Rows =
    square done-mark (`role="checkbox"`), inline text (saves on blur / Enter; emptying
    the text restores it, the × removes), quiet ×. One blank "Add a task" row is always
    offered on an open day; Enter adds and refocuses it, blur adds too; "Add task"
    focuses it. Writes are optimistic with a Saving… / Saved hint and an error bar with
    Retry that reverts the row. Closed day: "Locked with the closed day", inputs and
    marks disabled, no draft row, no × , no Add task; sprint over: "The sprint window
    has ended". Direct table writes through three server actions (`createTask`,
    `updateTask`, `removeTask`), no RPC — the invariants are all row-level.
  - Verification: DB suite 120 → 147 (`tests/db/tasks.test.ts` 27, grants updated for
    the new column grants and trigger function); e2e adds Enter/blur add, toggle,
    remove-as-archive, reload persistence, hero unchanged, and the locked state after
    close on desktop and phone. Falsifiability: eight live mutations (RLS off, trigger
    dropped, anchor check removed, ownership check removed, closed-day check removed, a
    roll-over function added, DELETE granted, anon SELECT granted) each turned their
    targeted tests red — 2, 12, 1, 2, 6, 2, 2, 1 failures respectively — and the
    restored suite was green; then `supabase db reset` reapplied 0001–0006 from disk.
    The one e2e red on the way was the test, not the app: the optimistic remove was
    aborted by a `page.reload()` issued before the request landed (Playwright trace,
    status −1); the test now waits for the DB rows before reloading.

### F5 — Day boundaries, streaks, missed days, backfill
- **Behavior.** Days advance at midnight in the sprint's zone whether or not the app
  is opened. A day closed before its 11:59 PM is "on time"; a day not closed by then is
  missed and breaks the streak. Missed days can be backfilled while the sprint is open
  (Actual + hurt/helped) and count toward totals but never repair the streak. Sidebar
  and Today show the streak.
- **Acceptance criteria.**
  - `close_day` records `closed_on_time = (now() at sprint tz)::date <= day.date`;
    backfill closes set `closed_on_time = false`. Streak = consecutive on-time closes
    ending at the latest closable day, computed in one SQL function `sprint_streak`
    with a table test (7 scenarios incl. DST change and a missed middle day).
  - A day whose date is in the future in sprint tz cannot be closed (test).
  - No grace/repair path exists (rule 18): backfilling a missed day leaves streak
    unchanged (test).
  - No backfill after sprint closure (test: closed sprint → `close_day` errors).
- **Non-goals.** Reminders (F13, was F9).
- **Risks.** Streak drift vs calendar — all logic in SQL, tested with fixed clocks.
- **Evaluator.** none.
- **As built (2026-09-05, no evaluator trigger).**
  - Migration `0007_streaks.sql`: `sprint_days.closed_on_time boolean` with
    `CHECK ((closed_at is null) = (closed_on_time is null))`, existing closed rows
    backfilled from `closed_at` in the sprint's zone before the constraint; the
    immutability trigger redefined from its latest (0004) body plus `closed_on_time`;
    `close_day` recreated with the same parameters, now `returns integer` — the streak
    after the close — and writing `closed_on_time = (now() at time zone tz)::date <=
    day.date`; `sprint_streak_at(sprint, asof)` (invoker rights, not callable by the API
    roles) and `sprint_streaks()` returning `(sprint_id, streak)` for the caller's active
    sprints (definer rights, filtered on `auth.uid()`, granted to `authenticated`). No
    streak column; no function other than `close_day` assigns `closed_on_time` (DB test
    scans `pg_proc` for `=`, `:=` and column-list forms, and pins the trigger list on
    `sprint_days`). The trigger draft that copied the 0001 body and lost the snapshot
    columns was caught by the existing libraries test (FIX_LOG).
  - Streak rule as coded: among days with date ≤ today in the sprint's zone, drop today's
    day if it is still open, then count the trailing run of `closed_on_time = true`. A
    missed day and a backfilled day both end the run; a still-open today neither counts
    nor breaks. Decision and the F10 (was F6) caveat (cancelled days after early completion) in
    DECISIONS.
  - UI: streak label under "Day N / 14" (`streakLabel`: "No streak" / "1-day streak" /
    "N-day streak") and as a third line on the sprint's sidebar entry, both from one
    `sprint_streaks()` read per request (the server client is created once per request
    and the loader memoised on it). A plan-grid cell for a past, unclosed day is one
    Backfill button (the whole cell, ≥ 44 pt; cells have a 56 px minimum so the strip
    scrolls on a phone rather than clipping); it opens the same two-step Day Close
    (`CloseFlow`, shared with the Close card: titled "Backfill day N", note: counts
    toward the goal, never repairs the streak) with that day's own offers fetched on
    press, buttons disabled while they load. The result screen gains a Streak row ("N
    days", "· unchanged by a backfill") and labels the next day by number; whether the
    close was a backfill is read from the row the DB wrote, never from the caller, so a
    close submitted after midnight reports truthfully. `closeDayAction` returns the
    streak from `close_day` and, if only the follow-up read fails, says the day is closed
    and offers Reload instead of Retry. Backfill stays available after day 14 for as
    long as `close_day` accepts it (F10, was F6, closes both; DECISIONS).
  - Full review (2026-09-05, /full-review after green): 0 CRITICAL, 0 HIGH, 8 MEDIUM,
    13 LOW; all eight MEDIUM fixed — result-screen truth from the row, backfill after day
    14, tap target, wider rule-18 scan plus trigger list, closed-but-not-refreshed
    error, one streak read per request, one `CloseFlow` host, the stored-flag rationale
    in DECISIONS.
  - Verification: DB suite 147 → 168 (`tests/db/streaks.test.ts` 21: ten fixed-clock
    scenarios through `sprint_streak_at` — before day 1, today open, three on time, today
    closed, missed middle, backfilled middle, missed yesterday, 23:30 and 00:30 local
    across the US DST end, all 14 after the sprint — plus live-clock `close_day` cases:
    future day, on-time flag, backfill flag and totals, column locked with the day, the
    CHECK both ways, no direct UPDATE privilege, another user reads 0, closed sprint
    refuses, and the no-repair scan; grants updated for the two functions); unit 43 → 44
    (`streakLabel`); Playwright 6 → 8 (streak on the golden path's result screen, header
    and sidebar; a seeded past-dated sprint backfilled from the plan on desktop and
    phone). Falsifiability: nine live mutations each turned their tests red — streak on
    UTC date (1), every close on time (3), trigger without the column (1), CHECK dropped
    (1), ownership check removed (1), `_at` granted (2), future-day check removed (2),
    closed-sprint check removed (1), a repair function added (2) — and the restored run
    was green; then `supabase db reset` reapplied 0001–0007 from disk. Visual check in
    Chrome (1138 px): header, sidebar, plan-grid missed cells, the backfill dialog, the
    result screen, and the grid after it, with the DB row reading `closed_on_time =
    false`; horizontal overflow 0. Phone layout covered by the Playwright phone project.

### F6 — Libraries v2: cue trigger, RECOVERED WHEN, relabelled editors
*Specified 2026-09-07 by `/interview` (feature mode); amended the same day after the
end-to-end spec review (`docs/audits/spec-review-2026-09-07.md`); **approved by the user
2026-09-07 as amended, to be built in the next session** (user's call; the F6 metric row
stays open from 17:17Z). Scope:
`docs/RECONCILIATION-2026-09-06.md` rows B5 B6 B7 C2 C3 C11 D5; its Decisions section is
authoritative. In-session calls (2026-09-07): cue WHEN required on Edit as well as on
every create path · the library Add form stays full (user's call; departs from the v8
README's single-input Add row) · no `note` column (`explanation` is the cue's optional
note and the impediment's INTERFERES) · usage line gets the README's three states ·
the cue column is named `cue_when`, not `trigger` (user's call after the review) · the
day-row snapshot of RECOVERED WHEN moves to F7, which rewrites `close_day` anyway.*

- **Behavior.** A cue is a WHEN (`cue_when`) → REMIND (the name) pair, both required
  wherever a cue is created or edited: the Cues page, the wizard's inline create, and
  the Today "Add cue" picker. Cues saved before this feature keep a null WHEN and show
  the italic prompt "add the moment this should fire" until edited. An impediment is
  SITUATION (name) → INTERFERES (explanation) → WHEN → THEN → RECOVERED WHEN, only the
  name required at creation; the Highest Impediment of a sprint must carry all three
  proof parts, at setup, whenever the highest changes, and whenever its proof is
  edited (rule 6 extended). Both editors carry brief quality guidance and helper
  examples (docx §"Impediments and Execution Cues").
- **Acceptance criteria.**
  - Migration `supabase/migrations/0009_libraries_v2.sql`, additive: `cues.cue_when
    text`, `impediments.proof_recover text`. `authenticated` gains INSERT/UPDATE on
    both. The before-insert/update triggers trim and nullif the new columns. DB test
    asserts the columns via `information_schema` and the grants via
    `information_schema.column_privileges`. No `sprint_days` change in F6 (F7 adds the
    `proof_recover` snapshot when it rewrites `close_day`).
  - Every function the migration redefines is rebuilt from its **latest** definer —
    `start_sprint` (0005), `set_highest_impediment` and `sprint_invalid_reason` (0008),
    `impediments_before_update`, `cues_before_update`, `library_item_before_insert`
    (0004) — and a pin test scans `pg_proc` for one marker per body that only the
    latest version has (`p_targets` and `p_intentions` in `start_sprint`, the 0008
    null-safe `coalesce` in `sprint_invalid_reason`, `p_proof_when` in
    `set_highest_impediment`), so a stale copy turns red.
  - `start_sprint` gains `p_proof_recover text default null` after `p_proof_then`;
    the F5 signature is dropped. The inline-proof write fires when **any** of the
    three parameters is non-blank and coalesces per column, so an impediment already
    carrying WHEN + THEN started with only `p_proof_recover` starts (test). Rule 6: a
    highest whose `proof_recover` is null after trim raises `proof_point_required`
    (test: WHEN and THEN present, RECOVERED blank → rejected; all three → starts and
    the impediment row carries them).
  - `set_highest_impediment` gains `p_proof_recover`; each given part is written with
    coalesce, so a call passing only the recover keeps WHEN and THEN (test); a null
    recover on the chosen impediment raises `proof_point_required`; a rejected call
    writes nothing.
  - `sprint_invalid_reason` returns `proof_point_required` when the highest's
    `proof_recover` is null, so `archive_item` / `set_item_scope` report it.
  - Rule 22 extended and narrowed: `impediments_before_update` raises only when a
    proof column **changed** and any of `proof_when`, `proof_then`, `proof_recover` is
    null afterwards while the row is highest in an active sprint. Tests: clearing any
    part → rejected; editing text → allowed; `move_item` and `set_item_scope` on a
    highest whose recover is still null → allowed (rank and scope are not proof).
  - Falsifiability, live mutations each turning a test red: rule-22 recover clause
    removed · recover check removed from `start_sprint` · the inline-proof guard
    restored to "WHEN or THEN only" · coalesce replaced by assignment in
    `set_highest_impediment` · `cues.cue_when` grant removed · a redefined function
    restored from its older body (pin test).
  - `lib/data.ts` `LibraryItem` gains `cue_when`, `proof_recover`, `used` and
    `active`; `used` / `active` come from one RLS-scoped SQL view
    `library_item_usage(kind, item_id, used, active)` read in parallel with the item
    query, which stays one round trip and never fetches membership rows.
    `lib/errors.ts` messages for `proof_point_required` and the blocked-reason text
    name all three parts.
  - Cues page: card shows **WHEN** `{cue_when}` (italic prompt when null) · **REMIND**
    `{name}` · optional note; Add and Edit have WHEN + REMIND + note + scope; Add and
    Save are `aria-disabled` with the hint "WHEN and REMIND are both needed." while
    either is blank. Impediments page: card shows **SITUATION · INTERFERES · WHEN ·
    THEN · RECOVERED** with italic placeholders ("what it does to your day", "not
    set"); Add and Edit carry the five inputs plus scope; only SITUATION gates the
    button; a DB `proof_point_required` rejection renders as "This is the highest
    impediment of an active sprint: WHEN, THEN and RECOVERED WHEN are all required."
    Card title reads `n · m archived`; blurb and example line per the README; usage
    line reads "In an active sprint" / "In sprint history" / "Unused". Scope chips
    filter on the exact scope (Global is its own chip; "Wealth" lists `wealth` only),
    settling the F2 backlog item.
  - Guidance copy on both editors (a line under the editor plus an "Examples"
    disclosure), verbatim below under UI. Impediment examples cover a missing skill, a
    practical constraint, and avoidance/forgetting.
  - Wizard step 4: the cue inline-create row has WHEN + REMIND, Create disabled until
    both are filled; `ProofInputs` shows WHEN / THEN / RECOVERED WHEN and Start stays
    blocked with "The highest impediment needs WHEN → THEN and a recovery criterion."
    until a highest lacking any part has all three. Today: the Add-cue picker's
    create row has WHEN + REMIND; "Change the highest" / "Edit proof point" show the
    three inputs with the hint "WHEN, THEN and the recovery criterion are all
    required."; the Highest card renders `RECOVERED WHEN …` (`data-testid`
    `proof-recover`) or "Recovery criterion not set — add it under Edit proof point."
    Selection rows in the wizard and the Today pickers (fed by `loadActiveLibrary`)
    show cues as `WHEN {cue_when}` and impediments as `WHEN … · THEN … · RECOVERED …`;
    the close dialog's rows (fed by `day_offered_items`) are unchanged until F7.
  - e2e golden path (desktop + phone): Start blocked until the cue WHEN and the
    RECOVERED WHEN are filled; the Today card shows the recover text; the library
    pages show the new labels; the Temporary-cue step fills WHEN + REMIND.
    `npm run verify` green.
- **Non-goals.** `sprint_days.proof_recover` and the `close_day` / immutability-trigger
  rewrite (F7) · `day_offered_items` return shape (F7) · observation-level snapshots
  (F7) · a `note` column · a `proof_version` counter (version = the proof text tuple
  snapshotted on the day row, decided 2026-09-07) · the README's single-input Add row
  · Dusk (F8) and the Vision sidebar (F9) · backfilling RECOVERED WHEN on pre-existing
  highest rows · mental rehearsal prompt (BACKLOG) · DB-level NOT NULL on
  `cues.cue_when` (D5 keeps it nullable; the requirement is UI-only and each create
  path carries its own check) · the "prevention" footer sentence (whether a
  preventive response can be recorded is F7's call).
- **Risks.** (1) A redefined function copied from a stale body drops a later column
  or check — the F5 failure; mitigation: the pin test above and the per-function
  "latest definer" list. (2) A create path misses the WHEN requirement, which the DB
  cannot catch by decision; mitigation: one e2e assertion per path (library Add,
  wizard, Today picker) and the Edit rule. (3) `getByLabel("WHEN")` becomes ambiguous
  once the wizard has a cue WHEN and a proof WHEN; mitigation: locators scoped to
  `wizard-cues` / `wizard-highest`. (4) The hosted project has never received a
  migration (DECISIONS 2026-09-05: `db push` is a later step), so no legacy highest
  exists anywhere; 0009 ships with the first push.
- **Evaluator.** none — additive nullable columns on existing tables, no table
  created, no row touched, no auth/RLS change (triggers unchanged in policy).
- **UI.** Primary action: keep the library complete — add, complete under Edit, rank.
  Viewport: both, desktop-first (Chrome at 1138px against the artboard; phone via the
  Playwright phone project). States: empty library · incomplete item (cue without
  WHEN, impediment without RECOVERED, highest card without a recovery criterion) ·
  error/blocked (rule 22 rejection, blocked archive/scope, disabled primary with
  accent hint). Mockup: `docs/mockups/ui-v2/handoff_sprint_ui_v8/Sprint App v8
  Libraries.dc.html` + README "Libraries" (mockup of record; no in-stack throwaway).
  Departures: full Add form; guidance copy not drawn. Guidance copy:
  - Cue line: "A good cue names a moment you will recognise (WHEN) and a reminder,
    question or action specific enough to act on right there (REMIND)." Example:
    `WHEN I schedule anything → remind: ask "How much does this pay?"`
  - Impediment line: "Name a situation you will recognise when it happens, what it
    does to your day, and a response that is specific and feasible in that moment.
    RECOVERED WHEN is what you would observe, within a time window, to know you are
    back on track." Examples (disclosure): *Missing skill* — SITUATION I don't know how
    to start the pitch deck · INTERFERES I open email instead · WHEN I catch myself
    opening email before the deck · THEN write the three worst slides in 15 minutes ·
    RECOVERED WHEN three slides exist before noon. *Practical constraint* — SITUATION
    the gym closes before I finish work · INTERFERES sessions get skipped · WHEN it is
    5 pm and I am still at my desk · THEN 20 minutes of bodyweight work at home ·
    RECOVERED WHEN the session is logged by 9 pm. *Avoidance / forgetting* — SITUATION
    starting late · INTERFERES the first block slips to noon · WHEN I notice delaying
    · THEN a 10-minute timer on the smallest task · RECOVERED WHEN the timer is
    running within 10 minutes.

### F7 — Day observations: what showed up, what was used, did the response run
*Specified 2026-09-07 by `/interview` (feature mode). Scope:
`docs/RECONCILIATION-2026-09-06.md` rows B4 B12 C1 C7 D3 D11; its Decisions section is
authoritative, and the 2026-09-07 review notes kept below are binding. In-session
calls (2026-09-07): the response is asked only when the Highest occurred (README flow;
the docx's "preventive use without occurrence" is not recorded) · response **and**
recovery are required whenever the Highest occurred; impact optional; Occurrence and
Use groups never block (untouched = unanswered) · the Highest's three answers are
columns on the day row beside its snapshot · the focus cue is required, exactly one,
created inline or picked from the library, changeable from Today, editable on the Cues
page — the migration does **not** backfill it: the local stack is reset and starts
blank (user's call), and 0010 raises if an active sprint lacks a focus · the closed
card's summary line and the inline Today reviewing state stay with F8.*

*Review notes 2026-09-07 (`docs/audits/spec-review-2026-09-07.md`), binding:* the
migration adds `sprint_days.proof_recover` and rewrites `close_day` and the
immutability trigger to snapshot it (moved here from F6); **version** = the (WHEN,
THEN, RECOVERED) text tuple snapshotted on the day row at close, and observation rows
snapshot item wording only (name, plus `cue_when` for cues) — no counter. The **focus
cue** is `sprint_cues.is_focus` (partial unique per sprint, same shape as
`is_highest`); its daily answer is the per-cue use row (one scale: yes / no / unsure /
unanswered), asked first in step 2; removing it from the sprint follows the highest's
rules; its consumer is F11's FOCUS tag. In a multi-pick group any pick answers the
whole group; untouched = unanswered. Snapshots are as-of-close, not as-of-date
(backfill). The table drop raises if either legacy table holds rows.
`day_offered_items` gains `cue_when` and `proof_recover` (drop + recreate, grants
re-applied). "Set up tomorrow" (B12 / C7, pure UI) moves to F8.

- **Behavior.** Closing a day is still two steps, but step 1 is the actual alone and
  step 2 is "What happened on Day n?": which cues you used (the focus cue first, tagged
  FOCUS), which obstacles showed up, and — only when the Highest showed up — did you
  run the response, did you recover, and how much it cost. Every group offers None and
  Unsure; a group you never touch is stored as unanswered, which is distinct from No,
  Unsure and not-asked. The first time the Highest showed up is the one to judge, and
  the question says so. Each sprint carries one focus cue, chosen in the wizard (or
  created there) and changeable from Today; the day's observations remember which cue
  was focus and which impediment was highest, and the wording each item had, so later
  library edits never rewrite history. The old "hurt / helped" questions are gone.
- **Acceptance criteria.**
  - Migration `supabase/migrations/0010_day_observations.sql`. Preconditions raised
    before any structural change, so the migration never leaves invalid state behind:
    `legacy_selections_present` if `day_impediment_hurt` or `day_cue_helped` holds a
    row; `focus_backfill_required` if any `status = 'active'` sprint exists (none can
    carry a focus yet). No statement in 0010 deletes or rewrites a user row; the blank
    start is `supabase db reset` on the local stack. The hosted project has never been
    migrated (DECISIONS 2026-09-05) and is not touched by this feature.
  - `sprint_cues.is_focus boolean not null default false`; partial unique index
    `sprint_cues_one_focus (sprint_id) where is_focus`; check `not is_focus or
    removed_at is null`. DB test: two focus rows in one sprint rejected by the index;
    a direct `removed_at` on the focus row rejected by the check.
  - `sprint_days` gains `proof_recover text`, `response text` (check in `yes`, `no`,
    `partially`, `unsure`), `recovered text` (`yes`, `no`, `unsure`), `impact text`
    (`nothing`, `some`, `a_lot`, `unsure`), all nullable; null means not asked (the
    Highest did not occur, or a day closed before 0010). Checks: `(response is null)
    = (recovered is null)`; `impact is null or response is not null`; `response is
    null or closed_at is not null`. `sprint_days_immutable_after_close` is rebuilt
    from its **0007** body plus the four columns; test: each of the four rejected with
    `day_closed` on a closed day.
  - Tables `day_impediment_observations` (`id`, `sprint_day_id` → `sprint_days`
    cascade, `user_id` → `auth.users` cascade, `impediment_id` → `impediments`,
    `name text not null` — private user text, snapshot, `occurred text not null`
    check in `yes` / `no` / `unsure` / `unanswered`, `was_highest boolean not null`,
    `created_at`; unique `(sprint_day_id, impediment_id)`) and `day_cue_observations`
    (same shape with `cue_id` → `cues`, `name`, `cue_when text` snapshot, `used`
    on the same scale, `was_focus boolean not null`). Rows are immutable (UPDATE
    trigger reusing `day_selection_immutable()`; DELETE unblocked so the account
    cascade works, as 0004 recorded); no `updated_at` on immutable rows, stated in
    the migration comment. RLS enabled in the same statement block: SELECT
    `user_id = auth.uid()`; no INSERT / UPDATE / DELETE policy or grant to
    `authenticated` — the only writer is `close_day`. Indexes on `user_id`,
    `impediment_id` / `cue_id`. Tests: cross-user SELECT returns no rows; a direct
    INSERT as `authenticated` is denied; an UPDATE as the owner raises `day_closed`.
  - `day_impediment_hurt` and `day_cue_helped` are dropped (with their triggers,
    policies and indexes); `information_schema` test asserts both absent and both new
    tables present with the exact column list.
  - `day_offered_items` is dropped and recreated returning `(kind, item_id, name,
    explanation, cue_when, proof_when, proof_then, proof_recover, is_focus, rank)`;
    same date-range rule, same SECURITY INVOKER; grants re-applied and the grants test
    still lists it. `is_focus` is the flag as of the call (as-of-close rule).
  - `close_day` is dropped and recreated as `close_day(p_sprint_day_id uuid, p_actual
    bigint, p_notes text default null, p_impediments jsonb default '[]', p_cues jsonb
    default '[]', p_response text default null, p_recovered text default null,
    p_impact text default null) returns integer`, rebuilt from its **0007** body (the
    lock, the future/backfill logic, `closed_on_time`, the streak return are
    unchanged). `p_impediments` / `p_cues` are arrays of `{ "item_id", "answer" }`
    with `answer` in `yes` / `no` / `unsure`. Rules, each with a DB test: an item not
    in `day_offered_items` → `item_not_offered`; an answer outside the scale →
    `invalid_answer`; the same item twice → `duplicate_item` (0004 silently deduped;
    BACKLOG); every offered item **absent** from the array is written as `unanswered`
    (test: an empty array yields one `unanswered` row per offered item); the Highest
    is the active `is_highest` member at close, its row carries `was_highest`, the
    focus cue's row `was_focus`; `name` and `cue_when` are copied from the library
    rows at close. If the Highest's answer is `yes`: `p_response` and `p_recovered`
    are required (`response_required`, `recovered_required`), `p_impact` optional,
    each validated against its scale; otherwise all three must be null
    (`response_not_applicable`). The day row's snapshot gains `proof_recover`
    alongside `proof_when` / `proof_then` (test: edit the impediment's three parts
    after the close; the day row still reads the close-time text). Grants: revoke
    from `public, anon`; execute to `authenticated, service_role`; the grants test's
    anon probe uses the new signature.
  - Legacy: a day closed with no observation rows is "missing", never "unanswered";
    no function in 0010 derives an answer from an absent row, and a later day of the
    same sprint closes normally (test: rows deleted as superuser on day 1, day 2
    closes green).
  - `start_sprint` gains `p_focus_cue_id uuid` after `p_highest_impediment_id`
    (before the defaulted parameters); the 0009 signature is dropped. Rebuilt from
    its **0009** body: `no_focus_cue` unless `p_focus_cue_id = any(p_cue_ids)`; the
    membership insert writes `is_focus`. `sprint_invalid_reason` (from **0009**)
    returns `no_focus_cue` when no active cue is focus after the exclusion, placed
    after the cue-count checks, so `remove_sprint_item`, `archive_item` and
    `set_item_scope` refuse the focus cue through the existing single owner (tests:
    remove → `no_focus_cue`; archive of the focus cue blocked with that reason; a
    non-focus cue still removable while two remain). New `set_focus_cue(p_sprint_id,
    p_cue_id)` SECURITY DEFINER: owner, active sprint, active member
    (`not_in_sprint`), flag moved atomically (test: exactly one `is_focus` row
    after the call; a removed cue rejected). Grants list gains `set_focus_cue`.
  - Pin test extended with one 0010 marker per rebuilt body: `p_focus_cue_id` in
    `start_sprint`, `no_focus_cue` in `sprint_invalid_reason`, `p_impediments` in
    `close_day`, `new.impact` in `sprint_days_immutable_after_close`, `is_focus` in
    `day_offered_items`; the 0004–0009 markers stay.
  - Falsifiability, live mutations each turning a named test red: the
    `unanswered` fill removed from `close_day` · `response_required` check removed ·
    `was_highest` written as `false` · the observation SELECT policy widened to
    `true` · the UPDATE trigger dropped from one observation table · `no_focus_cue`
    removed from `sprint_invalid_reason` · the partial unique focus index dropped ·
    the drop guard removed (test seeds a legacy row in a transaction and expects the
    guard's `raise` text).
  - `lib/database.types.ts` regenerated from the local stack. `lib/data.ts`:
    `OfferedItems` carries the new columns and `is_focus`; `SprintItems.cues` gains
    `is_focus`. `lib/errors.ts` maps the new codes (`no_focus_cue`,
    `response_required`, `recovered_required`, `response_not_applicable`,
    `invalid_answer`, `duplicate_item`), drops `most_damaging_required` /
    `most_useful_required`, and `blockedReason("no_focus_cue")` reads "this is its
    focus cue". `closeDayAction` takes `{ actual, notes, impediments, cues, response,
    recovered, impact }` and mirrors the DB's required/not-applicable rules before
    the RPC.
  - Close dialog (`components/today/CloseFlow.tsx`), both today and backfill: step 1
    is the actual only (`Close day n · step 1 of 2`, hint "Enter the actual, zero
    included."); step 2 heading "What happened on Day n?" with "None and Unsure are
    truthful answers." Groups in order, each a pill row (`role="group"`,
    `aria-pressed` pills, testids `use-group`, `occurrence-group`, `response-group`,
    `recovery-group`, `impact-group`): **USE** "Which cues did you use?" — every
    offered cue, focus first with a FOCUS tag, plus None · Unsure; **OCCURRENCE**
    "Which obstacles showed up?" sub "Highest: {name}" — every offered impediment plus
    None · Unsure; shown only when the Highest is picked: **RESPONSE · {highest}**
    "Did you run the response?" sub "THEN {then} · judge the first time it showed up
    today" — Yes · No · Partially · Unsure; **RECOVERY** "Did you recover?" sub
    "Recovered when {recover}" — Yes · No · Unsure; **IMPACT** "How much did it cost
    today?" sub "Your read, not the number" — Nothing · Some · A lot · Unsure; then
    the optional note. Pill semantics: tapping an item marks it yes and the rest of
    the group no; None = all no; Unsure = all unsure; untouched = every item
    unanswered and nothing sent for that group. The primary is `aria-disabled` with
    the accent hint "Did the response run?" then "Did you recover?" until both are
    answered when the Highest is picked; DB rejections render in the error bar. A
    backfill still fetches that day's offered items before the dialog opens.
  - Wizard step 4 (`components/NewSprintWizard.tsx`): a "Focus cue" radiogroup
    (testid `wizard-focus`) over the picked cues, prefilled to the first pick, kept
    valid as picks change; an inline-created cue is picked and, if first, focus. Start
    blocked with "Pick the focus cue." only if the focus is not among the picks.
    Today (`components/today/SprintItemsRow.tsx`): the focus row carries a FOCUS tag
    (testid `focus-tag`), other cue rows a "Set as focus" link calling
    `setFocusCue`, and Remove is absent on the focus row.
  - e2e golden path (desktop + phone): the wizard starts with the default focus and
    Today shows the FOCUS tag on that cue; "Set as focus" moves the tag; the close
    walks step 1 → step 2, picks the Highest as occurred, sees the primary blocked
    with "Did the response run?", answers response and recovery, closes; the admin
    read asserts the day row's `response` / `recovered` / `proof_recover` and one
    observation row per offered item with `was_highest` / `was_focus` set and the
    untouched cue group `unanswered`. The backfill path closes with None + None and
    asserts `no` rows. Horizontal overflow 0 at 390px. `npm run verify` green.
- **Non-goals.** The closed card's summary line, the inline Today reviewing state
  and "Set up tomorrow" (F8) · any reader of the observations beyond the tests (F10
  and F11) · preventive response runs (decided against) · a per-item impact or
  most-damaging pick · snapshotting `explanation` · a `proof_version` counter ·
  backfilling a focus on existing sprints (blank start) · a `updated_at` on
  immutable observation rows · `db push` to the hosted project.
- **Risks.** (1) A rebuilt function copied from a stale body drops a later check —
  the F5 failure; mitigation: the per-function "rebuilt from" list above and the pin
  markers. (2) UI and DB disagree on what "untouched" means, so a group the user
  never opened lands as `no`; mitigation: the DB fills `unanswered` for absent items
  and the e2e asserts it on the untouched cue group. (3) The `start_sprint`
  signature change breaks every test seed and the wizard action at once; mitigation:
  `tests/db/helpers.ts` and `tests/support/sprints.ts` own the arguments, the grants
  test pins the new signature. (4) 0010's guards refuse to apply on a stack that
  still holds sprints; intended — the local stack is reset, and the hosted project is
  empty.
- **Evaluator.** yes — two tables that hold user data are created, two are dropped
  (destructive), RLS policies added. One run for the feature.
- **UI.** Primary action: log what happened, then close. Viewport: both,
  desktop-first (Chrome at desktop width against the artboard's "What happened"
  modal; phone via the Playwright phone project). States: error / blocked (accent
  hint beside the disabled primary; DB rejections in the error bar) · loading (a
  backfill's offered items fetched before the dialog opens). Empty cannot occur
  (rules 3–4 hold on every sprint date). Mockup: `docs/mockups/ui-v2/handoff_sprint_ui_v8/Sprint
  App v8 Libraries.dc.html` + README "Day Close — shared question set" (mockup of
  record; no in-stack throwaway). Departures: the USE group precedes OCCURRENCE (the
  focus cue is asked first, per the review note) · RESPONSE offers Partially ·
  RECOVERY is asked whenever the Highest showed, not only after a Yes · the result
  screen is unchanged (summary line with F8) · the focus radio in the wizard and the
  FOCUS tag / "Set as focus" on Today are not drawn in the artboard.

### F8 — Journal restyle: timeline, rail, Dusk, night mode
*Specified 2026-09-07 by `/interview` (feature mode). Scope:
`docs/RECONCILIATION-2026-09-06.md` rows B1 B2 B3 B11 B13 B14 B18 C8 D8; B16 (two-tap)
and D9 (Insights sidebar rows) left with F10 / F11 per the review notes below. In-session
calls (2026-09-07): night mode is a per-device **cookie** read by the root layout (no
migration, no flash) · the switch is a two-state **Dusk / Night** toggle in the header,
default Dusk, no system preference · an inline close ends on the **Closed card + "Set up
tomorrow"** (the modal's result screen stays backfill-only) · phone timeline: the label
column narrows to 72px with a short date, the rule and dots stay (approved in the mockup)
· closed past rows are **one line** — a closed day's tasks are read in the sprint review
(F10, noted in BACKLOG) · the Sprints sidebar drops the streak line · "Set up tomorrow"
lists items answered **No or untouched**, never the highest or the focus cue · future
rows do not show their pre-planned intention · primary action on the screen is planning
today (intention + tasks); closing is the evening's action.*

*Review notes 2026-09-07:* F8 = the journal (timeline, rail, Today card states,
"Set up tomorrow" from F7) and the **Sprints** sidebar only. The Vision tab and its
sidebar move to F9, the Insights sidebar to F11; the rail's Complete sprint / End
sprint early and the Review gate card arrive with F10, the two-tap component with
its first consumer. The rail's cue card shows `WHEN {cue_when}` under the name (no
note column exists).

- **Behavior.** The Sprints tab becomes a journal: a header block with the sprint's
  progress, then a 14-day timeline (earlier days folded, Yesterday, the Today card,
  Tomorrow, the rest folded) with a right rail carrying the mantra and streak, the
  highest impediment and the other impediments, the cues, the celebration and the
  usage of funds. The Today card is planned in place (intention, tasks), closed in
  place (actual, then the F7 questions), and once closed shows the result, a summary
  of what happened and a "Set up tomorrow" block to prune the sprint's items. The
  whole app takes the Dusk palette, and a header toggle switches every screen to a
  night palette that this device remembers.
- **Acceptance criteria.**
  - **Tokens.** `app/globals.css` `:root` carries Dusk: `--page-bg #f9f9fd`, wash
    `linear-gradient(180deg,#f2f2fb 0%,#fcfcfe 46%)`, `--panel #fff`, `--ink #1c1b2a`,
    `--accent #5b5bd6`, `--accent-ink #4141ab`, new `--on-accent #fff`; divider /
    muted / faint / control-border derived from the new ink at the existing ratios.
    `:root[data-theme="night"]` carries: `--page-bg #131320`, wash
    `linear-gradient(180deg,#181828 0%,#131320 46%)`, `--panel #1c1c2c`, `--ink
    #ecebf7`, `--accent #8f8ff2`, `--accent-ink #b3b3f8`, `--on-accent #131320`,
    `--success #5cc48a`, `--under #ef7a6f`, divider ink 13%, muted ink 62%, faint ink
    6%, control-border ink 40%, `color-scheme: dark`. Every white-on-accent surface
    (primary buttons, active pills and chips, the progress block, the active side
    row's tag) reads `--on-accent`; a grep for `#fff` / `white` in `app/` and
    `components/` after the pass finds only `app/global-error.tsx` and the login
    brand. Contrast (WCAG AA, computed): night ink/panel 14.2, muted/panel 6.2,
    accent/panel 5.9, accent-ink/panel 8.6, on-accent/accent 6.5, met/panel 7.8,
    under/panel 6.1; Dusk on-accent/accent 5.4. `themeColor` follows the mode
    (`#f9f9fd` / `#131320`) in `app/layout.tsx` (`generateViewport` reading the
    cookie) and `#f9f9fd` in `manifest.ts`.
  - **Switch.** A header control (testid `theme-toggle`, `aria-label` "Switch to night
    mode" / "Switch to dusk mode", icon-only ≤940px) submits a form to a server action
    that sets cookie `theme` = `night` | `dusk` (path `/`, `SameSite=Lax`, one year)
    and redirects back; the root layout reads the cookie and renders
    `data-theme` on `<html>`, so the first paint is already in the chosen mode. Works
    without client JS. e2e: toggle → cookie present → reload → `html[data-theme=night]`
    and computed `--page-bg` on `<html>` is `#131320`; toggle again → attribute absent
    and `#f9f9fd`; the login page renders in night mode too.
  - **Sprints sidebar.** No New Sprint button (the empty-area card carries the CTA).
    Rows: label · meta (`Day n/14` · `Starts tomorrow` · `Ended` · `Ready` · `Locked`)
    · sub (outcome · "No active sprint" · "Vision not written yet"); the streak line
    and its `side-note` testid are gone.
  - **Journal header.** Title = outcome, 30px/700 (testid `journal-title`); meta `Area
    · Sep 1 → Sep 14`; progress block (testid `sprint-progress`, accent fill,
    on-accent text): `Day n of 14` (testid `day-label`, text `Day 9 of 14`), pct
    44px, line `{cum} of {goal} {unit} · {perDay} a day finishes it` |
    `· goal reached` | `· final day` (perDay = ceil(remaining ÷ days left, incl.
    today), the `remainingPlan` helper), 14 segments (`data-closed`, `data-today`),
    streak line (`streakLabel`; `Streak starts with day 1` before the start).
  - **Timeline** (testid `timeline`; grid `190px 1fr`, rule 2px, accent on today; ≤940px
    `72px 1fr` with the short date `Wed, Sep 9`). Rows carry `data-day` and
    `data-kind` ∈ `summary` `closed` `missed` `future` `today`. Order: folded
    `Days 1–{n-2}` ("Earlier in the sprint" · show/hide; present when today ≥ Day 3),
    Yesterday (folded "Yesterday · show" → its row · hide), Today, Tomorrow (folded
    "Tomorrow · show" → its future row · hide), folded `Days {n+2}–14` ("Rest of the
    sprint"). Folds are page state (open on the client, closed on reload). Dots:
    10px, met green / under red / empty; today 14px accent with a 4px 20% halo.
    Closed row: `**{actual}** of {target}` + ` · showed up: {name}` when an
    impediment occurred (the highest first, else the first by rank) + verdict `met` /
    `under` (`data-state`). Missed row (dashed red): `Missed · target {t}` + `add` →
    the existing backfill modal (`CloseFlow`, its result screen and 78px pin
    unchanged). Future row (dashed): `Target {t}`; Tomorrow's carries `edit`.
  - **Target editing.** `edit` (or the `Custom` chip) opens every unlocked future row
    as a numeric input (ids `plan-target-{i}` kept, ≥16px), shows the mode chips
    `Same daily target · Custom` (testid `plan-modes`), a summary `Planned {sum} ·
    Goal {goal} · {delta}` and Cancel / **Save plan** (`aria-disabled` until balanced
    and changed; hints unchanged). Rules 10–12 and `saveTargetsAction` are untouched;
    `PlanGrid` stays for the wizard only.
  - **Today card** (testid `today-card`, `data-state` ∈ `planning` `reviewing`
    `closed`; 1.5px accent border, radius 20, shadow accent 12%).
    *Planning:* kicker `Today's entry · target {t}` (`Day 1 target` before the
    start) + `closes 11:59 PM {tz}`; target 64px/700 (`[data-hero]`, 64px on both
    viewports); `{unit} today`; divider; prompt "How do I intend to produce today's
    target?" over a borderless auto-growing textarea (`aria-label` "Daily intention",
    16px, saves on blur through `saveIntention`, unchanged); task rows (18px box
    radius 6, borderless 16px input, ×, `+ task`; the F3 behaviour unchanged); footer
    hint "At the end of the day, enter the actual and log what showed up." + primary
    **Close the day** (`aria-disabled` with the existing reason before the start /
    after the window).
    *Reviewing* (after Close the day, inline): kicker `Closing Day n · target {t}`;
    64px borderless actual input (`aria-label` "Actual result", numeric; hours add a
    minutes input) over `{unit} · against {t}`; the F7 question set with the same
    groups, order, copy, testids, pill semantics and validation, rendered by one
    shared component (`components/today/DayQuestions.tsx`) that the backfill modal
    uses too; tasks read-only; note input; footer: accent hint · Back · **Confirm
    close** (`aria-disabled` until valid). Submits `closeDayAction` unchanged.
    *Closed:* kicker `Today's entry · closed`; 64px actual green / red (testid
    `closed-actual`, `data-state`) over `{unit} against {t}`; summary line (testid
    `day-summary`) joined with ` · ` from the day row and its observation rows:
    `Showed up: a, b` | `No obstacles` | `Obstacles: unsure` (omitted when every row
    is unanswered); `Response ran` | `Response didn't run` | `Response partially ran`
    | `Response unsure` + `recovered` | `didn't recover` | `recovery unsure`; `Cost:
    nothing` | `some` | `a lot` | `unsure`; `Cues used: a, b` | `No cue used` |
    `Cues: unsure`. Quoted note in italics when present; intention and tasks
    read-only; footer `Day closed · locked · tomorrow's target {t}` (`final day` on
    Day 14). A day closed before 0010 (no observation rows) shows only the numbers.
  - **Set up tomorrow** (testid `setup-tomorrow`): shown in the Closed card right
    after an inline close in this page session only (gone on reload), never on
    Day 14. Under "Didn't show up today": impediments whose `occurred` ∈ {`no`,
    `unanswered`}, the highest excluded; under "Not used today": cues whose `used` ∈
    {`no`, `unanswered`}, the focus excluded; each with Remove → `removeSprintItem`
    (DB rejections in the error bar); `Add impediment` / `Add cue` open the existing
    picker; **Done** dismisses. Copy: "Keep what still matters. Anything you remove
    leaves this sprint, not the library."
  - **Rail** (testid `rail`; 300px, sticky top 78; static single column ≤1240px).
    Mantra card: 18px italic accent-ink in curly quotes, tap to edit inline (input +
    Save / Cancel, `saveMantra` unchanged), `streak-label` under it. Highest card:
    kicker + Change; name 16px/600 (`highest-name`); `WHEN … → THEN …` 13px;
    `RECOVERED WHEN …` 12.5px muted (or the existing "not set" line); Edit proof
    point; divider; "Also watching" rows with Remove + `n of 5`; Add impediment —
    `HighestImpedimentCard` and the impediment half of `SprintItemsRow` merged, all
    actions unchanged. Cues card: `n of 3`; each cue on a 2px accent rule: name 14px
    + FOCUS tag (`focus-tag`) or `Set as focus`, `WHEN {cue_when}` 12.5px muted (or
    the existing missing-when line), Remove (absent on the focus); Add cue.
    Celebration card: text only. Usage of funds: money sprints with allocations,
    one line `5,000 savings · 3,000 debt`.
  - **Empty and edge states.** No sprint: accent card (on-accent text) with the area
    tag, the existing titles at 30px, the lede and the white primary (`Create a
    {Area} sprint` / `Write the {Area} vision`) — testid `empty-state` kept. Before
    the start: Day 1 in the Today slot, planning, Close disabled with "Day 1 begins
    tomorrow." After the window: all 14 rows past (folded), no future rows, and a
    quiet panel in the Today slot `Sprint window ended · {closed} of 14 days closed`
    (F10 replaces it with the review gate); the rail stays.
  - **Code.** `TodayView`, `CloseCard`, `PlanCard`, `DayStrip`, `MantraCard`,
    `HighestImpedimentCard`, `SprintItemsRow`, `TasksCard`, `IntentionCard` are
    rewritten as journal components with classes in `globals.css`; no inline
    `style={{…}}` remains in `components/today/`. The `[data-hero]` `!important`
    phone override is deleted; `[data-cols]` stays until F9 rewrites the wizard, its
    last inline-styled user (build note 2026-09-07). `lib/data.ts` gains
    `loadSprintObservations(sprintId)` (one query per table, `sprint_day_id in (…)`,
    RLS SELECT as built in 0010). No migration. `NewSprintWizard` keeps its inline
    styles (F9).
  - **e2e golden path (desktop + phone).** Pins move with the spec: `[data-hero]`
    64px on both projects; `highest-name` 16px; `journal-title` 30px; `day-label`
    `Day 1 of 14`; the result 78px pin only on the backfill path. Today's close walks
    the inline card (Close the day → actual → the F7 group assertions → Confirm
    close) and asserts the Closed card's `day-summary` text and the `setup-tomorrow`
    lists; the DB assertions from F7 are unchanged. Rows: Yesterday shows the closed
    line with `showed up:`; a missed row's `add` reaches the modal. Night mode: the
    toggle round-trip above. Overflow ≤ 0 at 390px on planning, reviewing and closed,
    with Days 1–7 shown; every text field ≥16px in all three states. Rule 28
    (`HIT` / `MISS` absent) kept. `npm run verify` green.
- **Non-goals.** The Vision and Insights tabs and sidebars (F9, F11) · Complete
  sprint, End sprint early, the review gate, the two-tap component, the "Lesson from
  the last sprint" card (F10) · the wizard restyle (F9) · a system colour-scheme
  preference, a cross-device theme, other palettes, the date bar · editing future
  intentions from the journal · reading a closed day's tasks (F10's postmortem) ·
  an expandable detail block on closed rows · any change to the DB functions.
- **Risks.** (1) Rewriting nine Today components at once breaks the golden path in a
  way the old pins would not see — the e2e is rewritten in the same feature and its
  DB-side assertions stay identical to F7's. (2) Night mode leaks white text on
  accent in a component that hardcodes `#fff` — one `--on-accent` token, the grep
  above, and the toggle round-trip in e2e. (3) The inline reviewing card and the
  backfill modal drift apart — one `DayQuestions` owner, one validation helper, and
  both paths in e2e. (4) A cookie theme with no JS fallback flashes or fails on the
  first load — the layout reads the cookie server-side and the control is a form.
- **Evaluator.** none (no migration, no auth / RLS / money change).
- **UI.** Primary action: plan today (intention + tasks); closing is the evening's
  action. Viewport: both, desktop-first (Chrome at desktop width against the artboard;
  phone via a Playwright screenshot and the phone e2e project). States: empty /
  blocked area, error (error bar; accent hints beside disabled primaries), loading
  (backfill offers fetched before the modal; the theme switch is a full request),
  gated (existing). Mockup: `app/mockup/journal/` (thin page in the stack, hardcoded
  Day 9, `?theme=night`, `?state=…`) — approved 2026-09-07 with the night tokens
  above; moved to `docs/mockups/f8-journal/` with two screenshots before the build.
  Departures from the artboard: the empty-area title stays 30px (the 64px poster
  title wraps at our copy length) · the header toggle, the FOCUS tag and "Set as
  focus" on the rail cue card are not drawn in v8 · closed past rows carry no
  detail block.

### F9 — Vision v2: one vision, three annual steps, obstacle link, dated reviews
*Stub (2026-09-06). Filled by `/interview`. Scope: rows B8 C4 D1 D6 D7.* **One vision
total** (user, 2026-09-06; overrides PRD §2 — rule 2 becomes "a sprint requires the
vision"; `visions.area` goes). Step 1: vision text (the desired future), annual
deadline, "What would prove it happened? (observable success criteria)" — all three
required; personal meaning and current baseline optional. Step 2: the main obstacle
**is** a global impediment, picked or created. Step 3: its WHEN → THEN → RECOVERED
WHEN, saved on the impediment. Vision + new impediment saved atomically by one DB
function. Saved overview per the README (Edit · Review vision · Replace two-tap ·
three cards · Library card · Sprints behind this vision). Reviews go to a
`vision_reviews` table (date, still-true / needs-changes, evidence note); nothing
overwritten. Evaluator: user-data table.

*Review notes 2026-09-07:* step 3 requires all three parts (WHEN, THEN, RECOVERED
WHEN), matching rule 6/22 as extended in F6 — an obstacle that is an active sprint's
highest would otherwise be rejected by the trigger; vision edits reach sprints by
reference exactly as library edits do (closed days keep their snapshot). The obstacle
link is guarded: `archive_item` and `set_item_scope` refuse to archive or narrow the
vision's obstacle. The migration is **data-transforming** (per-Area visions collapse
to one active; the rest archived) → evaluator. The direct INSERT grant on `visions`
is revoked once the atomic function exists. Includes the Vision tab and sidebar
restyle (from F8).

### F10 — Sprint completion, End Early, postmortem, kit, next-sprint gate (was F6)
*Re-scoped 2026-09-06 (rows B10 B17 C6); the text below is the v1 entry and is
rewritten by `/interview`.* Adds to v1: Complete sprint in the rail's Celebration card;
End sprint early two-tap in its footer; a Review gate card → "Open the postmortem";
postmortem = result card + the four insight cards + proof-point verdict (Worked /
Partly / Didn't) + one lesson + moved-the-vision + carry-forward per item (Keep /
Promote to highest / Drop; Keep / test more / Drop) stored as the Area's kit, which
pre-fills the next New Sprint's step 4; the lesson is pinned on Day 1 of the next
sprint in that Area.
*Review notes 2026-09-07:* F10 also owns, from F5's decisions (recorded there as
"F6", the old number): the closure timestamp, `sprint_streak_at` stopping at the
closure date (cancelled days are neither missed nor counted), and backfill closing
with the sprint. The **single-sprint insight calculations** (one SQL function per
card: impediment impact, response follow-through, response recovery, cue usefulness,
with the C5 rules) are built here, since the postmortem renders the cards; F11 adds
the cross-sprint view. The postmortem reads the highest's proof from the sprint's
last closed day snapshot, not live from `impediments`. Kit pre-fill filters archived
items (rule 24). Review gate card, Celebration-card actions and the two-tap component
arrive here.
- **Behavior (v1).** Reaching the Goal enables Complete Sprint (not automatic). End Sprint
  Early is always available. Both cancel future days (not counted as missed), set the
  status, show Celebration on success, and open the Review, which must be completed
  before the next Sprint in that Area can start. Review shows the PRD §10 summary and
  captures one key lesson and whether the Vision was advanced. Completing Review shows
  Start Next Sprint.
- **Acceptance criteria.**
  - `complete_sprint` rejects when cumulative actual < goal; sets `status` to
    `completed` or `completed_early` (if before day 14) and `cancelled = true` on
    future days. `end_sprint_early` sets `ended_early`. Tests for each transition and
    for the invalid one; status transitions guarded by trigger (no other UPDATE).
  - Table `reviews` (RLS). `start_sprint` rejects while a non-active sprint in the
    Area has no completed review (rule 26); test.
  - Celebration text visible only when `status ∈ {completed, completed_early}`.
  - Review page renders goal, total actual, % achieved, per-day target/actual, most
    useful cues, most damaging impediments, highest impediment + proof point.
- **Non-goals.** Editing a review after completion.
- **Risks.** "Cancelled" vs "missed" days confused in streak/insights — `cancelled`
  days excluded everywhere by one view `sprint_days_effective`.
- **Evaluator.** migration creating a user-data table.

### F11 — Insights v2: four cards, Reviews and Across sprints (was F7)
*Re-scoped 2026-09-06 (rows B9 C5 D4 D9 D10); the text below is the v1 entry and is
rewritten by `/interview`.* Replaces v1's area pages and history table with the four
cards — Impediment impact · Response follow-through · Response recovery · Cue
usefulness — in two views: Reviews (single-sprint postmortem, F10) and Across sprints
(scope chips by Area, Suggested kit, How to read this). Metric: **median daily
attainment** (Actual ÷ Target on positive-target days) with vs without, in the README's
card shape. Follow-through and recovery rates; partial reported separately; recovery
with vs without the response. Every card shows both group sizes, logging coverage over
elapsed eligible days, backfill count; unsure and unanswered excluded from
denominators; closed, non-cancelled days only; cross-sprint lists each sprint's own
comparison grouped by item + version + Area, never pooled; "n ≥ 3 does not establish
reliability" stated; associations, never causes. Finished-sprint sidebar rows carry
Met / Under and % of goal (the §1 measurement). Task completion vs result → BACKLOG.
*Review notes 2026-09-07:* the single-sprint calculations are F10's; F11 = the
Across-sprints view (per-sprint comparisons grouped by item + version + Area, where
version is the proof text tuple on the day snapshot), Suggested kit, How to read
this, and the Insights sidebar (moved from F8) whose finished-sprint rows carry Met /
Under, % of goal and the completion type (normal / early / ended early, the Part 1
measurement). Card copy is rewritten for median attainment (the README strings are
for on-target rate) and the recovery card compares with vs without the response
(D3b / C5), not only "after the response ran". The FOCUS tag marks the focus cue on
the Cue usefulness card, pinned first.
- **Behavior (v1).** Insights tab: Health, Wealth, Relationships, All Areas, Sprint History.
  Per area and overall: % of Goal per sprint, impediment/cue frequency on lowest- vs
  highest-result days, most damaging / most useful items, task completion vs result.
  Findings are phrased as associations with counts ("Starting late appeared on 4 of
  your 5 lowest-result days"). History shows every sprint's full record including
  archived items and the closed-day snapshots.
- **Acceptance criteria.** Each insight is a pure SQL view or function with a fixture
  test; areas compared only by % of goal, never summed across measurements (rule 25;
  test: no query sums `amount` across differing `measurement`). Global items keep the
  source area per observation. Insights read only closed, non-cancelled days. Text
  never contains "caused". Empty state when < 1 closed sprint.
- **Non-goals.** AI narrative (later feature), charts beyond simple bars.
- **Risks.** Insights that mislead on tiny samples — each shows its n and hides
  below n = 3.
- **Evaluator.** none.

### F12 — Circles: invites and accountability view (was F8)
- **Behavior.** A member creates a circle and invites emails; the invite creates the
  Supabase user (admin invite) so the invite is the app invite. Members see, per
  fellow member's active sprint: Area, current streak, whether today is closed, and %
  of Goal. Impediments (including the Highest) appear only where the owner marked
  that sprint-impediment shared. A person may belong to several circles.
- **Acceptance criteria.**
  - Tables `profiles` (display name, PII comment), `circles`, `circle_members`
    (status invited/active), `sprint_impediments.shared` column; RLS: circle rows
    readable only by members; profile readable by circle-mates.
  - Server route `POST /api/circles/:id/invites` (order per conventions: origin →
    session → rate limit → schema → business) calls `auth.admin.inviteUserByEmail`
    with the service role key server-side only; test that the key never reaches the
    client bundle (grep on `.next` output).
  - A view `circle_feed` exposes exactly: user display name, area, streak, today
    closed, pct_of_goal, and shared impediment names. Denial tests: a non-member gets 0
    rows; a member cannot read the other member's `amount`, `actual`, targets, mantra,
    notes, or unshared impediments via any table or view (query each; expect 0 rows or
    permission error). Falsifiability run per policy.
- **Non-goals.** Roles, removing members, leaving circles (BACKLOG), comments,
  reactions.
- **Risks.** RLS on circle visibility is the highest-risk policy set — written as
  named helper `is_circle_mate(uid)` used by every policy; evaluator required.
- **Evaluator.** auth/RLS · migrations creating user-data tables.

### F13 — Evening email reminder (was F9)
- **Behavior.** If a user has an active sprint whose today is not closed, one email
  arrives at their chosen local hour (default 20:00 in the sprint tz).
- **Acceptance criteria.** Vercel Cron hits `/api/cron/reminders` hourly with a
  bearer secret (401 otherwise); it selects users whose local hour matches and today
  unclosed; sends via Resend; writes `reminder_log(sprint_day_id)` with a unique index
  so a rerun sends nothing (idempotency test). No reminder for closed days or ended
  sprints. Email body contains no personal sprint data beyond the day number.
- **Non-goals.** Push notifications, digest emails.
- **Risks.** Free-tier cron granularity (hourly is within Vercel Hobby limits).
- **Evaluator.** migration creating a user-data table.

### F14 — Pre-release: PWA manifest, deploy (was F10; export withdrawn 2026-09-06)
- **Behavior.** App installable (manifest + icons; no service worker). Deployed to
  Vercel with the Supabase production project; owner and first invitee signed in.
  ~~"Export my data" downloads one JSON of everything the user owns.~~ Withdrawn by
  the user 2026-09-06 (BACKLOG); the Vision sidebar has no Data & export row.
- **Acceptance criteria.** Lighthouse "installable" passes. `npm run verify`
  green; evaluator pre-release pass; `docs/RUNBOOK_RESTORE.md` written and one restore
  drill run against the local stack from a production backup file.
- **Non-goals.** Data export in any format (BACKLOG), account deletion UI (BACKLOG;
  `archived_at` until).
- **Risks.** none beyond the restore drill.
- **Evaluator.** pre-release.

## 4. Explicit v1 non-goals
AI-written insights or reviews · push notifications · native apps · offline mode ·
custom Areas · circle roles/moderation · account deletion self-service · data import
· multi-currency formatting beyond a code · sharing Mantra, Goal amount, Actuals or
Notes with anyone · any XP/points/labels (rule 28) · **added 2026-09-06:** data export
· the v8 prototype's Load sample sprint and Reset all data · palettes other than Dusk
and night · a Sprint History table · task-completion-vs-result insight · mental
rehearsal prompt · the old hurt/helped questions.

## 5. Key assumptions and PRD deltas
- ASSUMPTION: one time zone per sprint (from the browser at start) suffices.
- ASSUMPTION: anyone in a circle may invite; no roles.
- ASSUMPTION: local Supabase via Docker is available for tests (verified 2026-09-05).
- DELTA vs PRD §7: Today order is header/strip → Target hero → Daily Intention →
  Tasks → Highest Impediment → collapsed others/cues → Mantra → Close → 14-day plan
  (user, 2026-09-05, re-confirmed after reviewing the prototype).
- DELTA vs PRD: **Daily Intention** text box per day, optionally pre-planned at setup.
  Feeds History, not Insights (v1).
- DELTA vs prototype: Close Day is a **two-step** dialog, not six (user); brand is
  **Hustlemania**, not "Sprint"; the prototype's bundled `spec.md` (older draft:
  unbalanced custom plans allowed) is superseded by the PRD (plan must equal Goal).
- Term stays **Execution Cue**; minimums stay PRD rules 3–4 (1–3 Cues, 1–5
  Impediments).
- DELTA vs PRD §5 storage: money stored in minor units (UI whole units only).
- DELTA vs PRD §4: rank via move up/down, no drag-and-drop.
- STAGED: rules 3–6 enforced from F2, rule 26 from F10; no real sprint before F14.

**Re-baseline deltas, 2026-09-06** (user's calls in session; full ledger and
recommendations in `docs/RECONCILIATION-2026-09-06.md`):
- DELTA vs PRD §2 and rule 2: **one vision total**, not one per Area. Rule 2 reads "a
  sprint requires the vision"; `visions.area` goes (F9). Overrides the v8 prototype's
  own Sprints sidebar, which assumed per-Area.
- DELTA vs SPEC v1 Today order (the 2026-09-05 line above): the Sprints tab is the v8
  **journal** (timeline + rail); the 14-day strip, target hero with stats, collapsed
  others/cues row and plan grid are replaced (F8). Daily Intention stays, as the first
  line of the Today card.
- DELTA vs PRD §8 and F2: Day Close step 2 collects **observations** (occurred / used /
  response ran / recovered / impact, with Unsure and unanswered distinct) instead of
  hurt/helped judgments; `day_impediment_hurt` and `day_cue_helped` are dropped (F7).
  A **focus cue** per sprint is tracked daily.
- DELTA vs PRD §3 and rule 6: the Highest Impediment's proof point is WHEN → THEN →
  **RECOVERED WHEN**, all three required (F6). Cue = WHEN → REMIND, trigger required on
  every create path (F6).
- DELTA vs PRD §11 and F7 v1: Insights = four cards in two views on **median daily
  attainment**; no history table — finished-sprint rows carry % of goal (F11).
- DELTA vs PRD §10 and F6 v1: Review = postmortem with verdict, carry-forward, per-Area
  kit pre-filling the next sprint, lesson pinned on Day 1 (F10).
- DELTA vs PRD §2 and v8 README: Vision step 1 requires text, **annual deadline**, and
  proof (observable success criteria); reviews are a dated table, never overwritten (F9).
- DELTA vs v8 README: palette **Dusk**, not Lake, plus a user-switchable **night mode**
  (dark tokens derived from Dusk by Claude, user-approved in the F8 interview); no palette switcher, Load
  sample, or Reset; brand stays **Hustlemania**.
- DELTA vs PRD §12 and Part 1: **no data export in v1** (F14; BACKLOG).
- IGNORED: `spec_v3.md` in the v8 zip — identical to the superseded v4 `spec.md`.
- BACKLOG from the drafts: task-completion-vs-result insight; mental rehearsal prompt.

## 6. Stack, auth/security model, shared entities
- Next.js 16 App Router (current release at build time; "middleware" is `proxy.ts`
  in 16), TypeScript, plain CSS (Tailwind dropped 2026-09-07); Supabase (Postgres 17, Auth, RLS);
  Vercel Hobby; Resend free tier for reminders; Vitest + Playwright; local stack via
  `npx supabase start` (Docker); migrations in `supabase/migrations/`, forward-only.
- Auth: Supabase magic link, signups disabled, users exist only via dashboard seed
  (owner) or admin invite (F12). Session from `@supabase/ssr` cookies; middleware
  redirects unauthenticated `/sprints|/vision|/insights`. Service role key only in
  server routes for invites; never in client code.
- Authorization: RLS default-deny on every table, `user_id = auth.uid()`; circle
  reads through `is_circle_mate()` helper and the `circle_feed` view (F12). Invariants
  live in DB functions and triggers (`start_sprint`, `close_day`, `save_targets`,
  `archive_item`, status-transition trigger, immutability trigger).
- Entities: `visions`, `sprints`, `sprint_days`, `tasks`, `cues`, `impediments`,
  `sprint_cues` (with `is_focus`, F7), `sprint_impediments`, the F7 day-observation
  tables (replacing `day_cue_helped` / `day_impediment_hurt`, dropped in F7),
  `vision_reviews` (F9), `reviews` (F10), `profiles`, `circles`, `circle_members`
  (F12), `reminder_log` (F13). All user-scoped
  tables: `user_id` FK cascade, `created_at`, `updated_at` trigger, `archived_at`
  where archive exists, indexes on owner FK and filter columns.

## 7. Risks (pre-mortem: this spec failed because…)
1. **RLS or a trigger had a hole and a member saw or altered another's record.**
   Mitigation: every policy and trigger has an individual break-and-confirm test;
   evaluator on F1 and F12.
2. **Day/streak logic disagreed with the calendar and the owner stopped trusting it.**
   Mitigation: all date logic in SQL functions using the sprint tz, table-tested
   with fixed clocks including DST; no date math in React.
3. **F1–F14 never finished because each feature grew.** Mitigation: acceptance
   criteria above are the whole feature; anything else goes to BACKLOG; one open
   metric row at a time makes drift visible.

## 8. File / step plan
- Build session, first: `npx create-next-app` (TS, Tailwind, App Router, no `src/`),
  `npx supabase init`, `package.json` `verify` script, `.gitattributes` present, wire
  `git config core.hooksPath .githooks`. The F1 metric row is already open in
  `docs/PROGRESS.md` (opened by `/interview`, 2026-09-05T04:15Z).
- Extract `docs/mockups/UI mockups.zip` → `docs/mockups/today/` (README, prototype,
  screenshots); the zip itself is the user's file and is left as is.
- Then the executable Today mockup on `mockup/today`; screenshot at 1280/390; compare
  with the prototype; back to main.
- F1: `supabase/migrations/0001_init.sql` (set_updated_at, visions, sprints,
  sprint_days, RLS, start_sprint, close_day, triggers), `0002_function_privileges.sql`,
  `0003_targets_step.sql` (as built) · `app/login`,
  `app/auth/callback`, `proxy.ts` · `app/(app)/layout.tsx` (tabs + sidebar) ·
  `app/(app)/sprints/[area]/page.tsx` (Today) · `app/(app)/sprints/new` ·
  `lib/supabase/{server,client}.ts` · `lib/sprintDay.ts` · tests under `tests/db`,
  `tests/unit`, `e2e/`.
- F2–F14 each add one migration `000N_<feature>.sql`, their pages under `app/(app)/`,
  and their tests; never edit an applied migration.
