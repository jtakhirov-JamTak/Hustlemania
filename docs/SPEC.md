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
*Superseded in part by F15 (2026-09-11): the impediment's SITUATION field, the day-row response / recovered / impact answers, rules 3–4 caps and the focus-cue requirement changed there; this text is history and stays.*
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
*Superseded in part by F15 (2026-09-11): the impediment's SITUATION field, the day-row response / recovered / impact answers, rules 3–4 caps and the focus-cue requirement changed there; this text is history and stays.*
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
*Superseded in part by F15 (2026-09-11): the impediment's SITUATION field, the day-row response / recovered / impact answers, rules 3–4 caps and the focus-cue requirement changed there; this text is history and stays.*
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
*Specified 2026-09-08 by `/interview` (feature mode). Scope:
`docs/RECONCILIATION-2026-09-06.md` rows B8 B16 C4 D1 D6 D7 (D1 as re-decided:
**one vision total**). In-session calls (2026-09-08): **step 1 unlocks sprints** — the
vision row alone satisfies rule 2; obstacle and rule can be finished later and the
overview's `n of 3` nudges · **Edit is in place** — text, deadline and proof update the
active row; Replace is the only archive point; `vision_reviews` is the dated record ·
**wizard: logic and classes only** — step 1 shows the single vision and gates on "vision
exists + no active sprint in the Area", inline styles become classes so the
`[data-cols]` phone override goes; the v8 dialog restyle rides with F10 · **review note
optional** — one textarea on the review card, both verdicts save a row · deadline must be
a future date · Replace is allowed while a sprint is active (the sprint keeps its
`vision_id`; history intact) · the collapse migration keeps the most recently updated
active vision per user and archives the rest (no user data exists yet: the local stack
starts blank, the hosted project has never been migrated) · primary action on the
screen: completing the three steps.*

*Review notes 2026-09-07:* step 3 requires all three parts (WHEN, THEN, RECOVERED
WHEN), matching rule 6/22 as extended in F6 — an obstacle that is an active sprint's
highest would otherwise be rejected by the trigger; vision edits reach sprints by
reference exactly as library edits do (closed days keep their snapshot). The obstacle
link is guarded: `archive_item` and `set_item_scope` refuse to archive or narrow the
vision's obstacle. The migration is **data-transforming** (per-Area visions collapse
to one active; the rest archived) → evaluator. The direct INSERT grant on `visions`
is revoked once the atomic function exists. Includes the Vision tab and sidebar
restyle (from F8).

- **Behavior.** The Vision tab holds one vision for the whole account, written in
  three annual steps: the vision text with a deadline and the proof that would show it
  happened (optional: what it means, where you stand today) → the main obstacle, a
  global impediment picked from the library or created on the spot → its guiding rule,
  WHEN → THEN → RECOVERED WHEN, saved on that impediment. Saving step 1 unlocks every
  sprint. Once the vision exists the tab shows the saved overview: the text as a
  headline with saved / deadline / reviewed meta, Edit, Review vision, a two-tap
  Replace, `n of 3 steps`, three summary cards, the Library card and "Sprints behind
  this vision", with previous visions folded underneath. Review vision opens a card
  with Still true / Needs changes and an optional evidence note; every review is a
  dated row, never overwritten. The Sprints tab's empty cards say "Write the vision"
  until it exists, and the New Sprint wizard shows the one vision instead of gating
  per Area.
- **Acceptance criteria.**
  - **Migration `0011_vision_v2.sql`** (forward-only, applied by `db reset`):
    `visions` gains `deadline date`, `proof text`, `meaning text`, `baseline text`,
    `obstacle_id uuid references impediments(id)`; `area` is dropped and
    `visions_one_active_per_area` is replaced by a partial unique index on
    `(user_id) where archived_at is null`. Existing rows: `deadline` backfilled to
    `created_at::date + 1 year` and set `not null`; `proof` stays nullable for
    pre-0011 rows (the card reads "No success evidence yet"); per user, the most
    recently updated active vision stays active and every other active one gets
    `archived_at = now()`. Test: seed two users with two and three active per-Area
    visions and sprints on each, run the transform, assert one active per user, the
    newest kept, the rest archived with their `sprints.vision_id` untouched, and the
    unique index rejects a second active insert.
  - **`vision_reviews`** (RLS in the same migration): `id`, `user_id`, `vision_id`,
    `verdict in ('still_true','needs_changes')`, `note text` (private user text,
    nullable), `created_at`; SELECT own rows only; no INSERT / UPDATE / DELETE grant
    to `authenticated`. Tests: user B selects 0 of A's reviews (and the test fails
    with RLS disabled); an authenticated UPDATE of `verdict` on an own row errors
    (`permission denied`) and the row is unchanged; the count of a user's rows only
    ever grows across three `review_vision` calls.
  - **Write path = SECURITY DEFINER functions**, identity from `auth.uid()`, `set
    search_path = ''`, `grant execute` to `authenticated`; the direct
    `insert (user_id, area, body)` and `update (body)` grants on `visions` are
    revoked and the write policies dropped. `tests/db/grants.test.ts` pins the new
    writable-column set (`visions`: none) and the callable-function set.
    - `save_vision(p_body, p_deadline, p_proof, p_meaning, p_baseline) → uuid`:
      inserts the active vision or updates it in place (same `id`); rejects
      `vision_body_required`, `vision_proof_required`, `vision_deadline_past`
      (`p_deadline <= current_date`); trims; blank optionals become null. Tests for
      each rejection and for the edit keeping the `id` and `created_at`.
    - `set_vision_obstacle(p_impediment_id, p_name, p_explanation) → uuid`: exactly
      one of id / name (`obstacle_pick_or_name`); an existing impediment must be the
      caller's, unarchived and `scope = 'global'` (`obstacle_not_global`); a new one
      is inserted with `scope = 'global'` in the same transaction; sets
      `visions.obstacle_id`; returns the impediment id. Test: a name that violates
      the impediments check leaves `obstacle_id` unchanged (atomicity); an
      Area-scoped pick is rejected.
    - `set_vision_rule(p_when, p_then, p_recover) → void`: writes all three onto the
      obstacle impediment; rejects any blank part (`rule_incomplete`) and
      `no_vision_obstacle`. Test: the F6 highest-impediment trigger accepts the write
      when the obstacle is an active sprint's highest.
    - `replace_vision() → void`: sets `archived_at` on the active vision, rejects
      `no_active_vision`; the obstacle impediment is untouched. Test: after Replace an
      active sprint still references the archived row and `start_sprint` rejects
      `no_active_vision` until `save_vision` runs again.
    - `review_vision(p_verdict, p_note) → uuid`: inserts a row for the active vision;
      rejects `no_active_vision` and an unknown verdict.
    - `start_sprint` (redefined with the same signature): the vision lookup is
      `user_id = auth.uid() and archived_at is null`, no Area; every existing
      start_sprint test stays green with the seed helper writing one area-less
      vision. Test: a user with only a step-1 vision (no obstacle) can start a sprint.
    - `archive_item('impediment', id)` and `set_item_scope('impediment', id, ≠
      'global')` raise `vision_obstacle` for the active vision's obstacle; both allowed
      once the vision is replaced. Tests for both.
  - **Reads** (`lib/data.ts`): `loadOverview` carries one `vision` for all areas;
    `loadVision` returns the active vision with its obstacle (name, explanation,
    proof parts), the latest review, the count of sprints behind it, and the archived
    visions with their date range and sprint count; `loadVisionSprints` lists sprints
    with `vision_id = active.id` (Day n of 14 · Starts tomorrow · Ended, plus
    `Met|Under · actual of goal` from the sum of closed days once the end date has
    passed).
  - **Vision tab** (`/vision`; `/vision/[area]` removed → `/vision/health` 404s;
    `/vision/cues` and `/vision/impediments` unchanged). Sidebar rows: **Vision**
    (meta `n of 3`, accent until 3; sub `Reviewed {date}` | `Not reviewed yet` |
    `Not written yet`), then Libraries: Execution cues (n), Impediments (n). No Data &
    export.
    *Setup* (testid `vision-setup`, `data-step` 1–3), shown when no active vision
    exists or from Edit / a card's Edit / Add: kicker `Annual setup · Step n of 3` +
    "Revisit once a year. Sprints are planned separately."; 30px title; three 4px
    segments accent up to the current step with `Vision · Obstacle · Rule` beneath;
    720px card. Step 1: textarea (`aria-label` "Vision", 16px, 4 rows), "By when?"
    date input (`aria-label` "Deadline", min tomorrow), "What would prove it
    happened?" input (`aria-label` "Proof"), then "What it means to you · optional"
    and "Where you stand today · optional". Step 2: radio rows (`OptionRow`, circle)
    for every unarchived **global** impediment, tag `has WHEN → THEN` when both are
    set; "Or create a new impediment" / "Create the impediment" with SITUATION ·
    INTERFERES inputs; picking clears the new-name inputs and vice versa. Step 3:
    WHEN · THEN · RECOVERED WHEN (`ProofInputs`, pre-filled from the impediment).
    Footer: Back (Cancel on step 1 when a vision exists; nothing on a first step 1)
    · accent hint beside a disabled primary ("The vision unlocks every sprint." /
    "The deadline must be in the future." / "Pick or name one obstacle." / "WHEN,
    THEN and the recovery criterion are all required.") · **Save & continue** (Save
    on step 3). Each step saves on continue through its function; a failed save shows
    the error bar with Retry and keeps every input. Steps 2 and 3 are skippable
    from the overview (Cancel), never from a first step 1.
    *Overview* (testid `vision-overview`): kicker "One to two years from now" + meta
    `Saved {date} · By {deadline} · Reviewed {date} | Not reviewed yet` (`Deadline
    passed {date}` in the under colour once it has); h1 26px/600 max 34ch; actions
    **Edit** (secondary) · **Review vision** (primary) · Replace (`TwoTap`: "Tap again
    to archive it and start over" in red on the first tap, fires on the second,
    disarms when focus leaves) · `n of 3 steps` (green at 3). Review card (testid
    `vision-review`, 1.5px accent): "Does this still describe where you're headed?",
    note `Proof you named: {proof}. {n} sprints have run behind it. {d} days to the
    deadline.`, optional "What shows it?" textarea, **Still true · mark reviewed** ·
    **Needs changes** (saves `needs_changes`, then opens step 1) · Cancel. Three
    cards: Vision (sub `Proof: …` | "No success evidence yet", Edit) · Main obstacle
    (name + INTERFERES text; empty: dashed "What most often pulls you off course?" →
    step 2; Edit / Add) · Guiding rule (`WHEN … → THEN …`, sub `Recovered when …`;
    empty: "One move, every time {obstacle} shows up." or "Name the obstacle first.";
    Edit / Add → step 3 or 2). Second row: Library card (cue and impediment counts,
    links to the library pages, "Cues and impediments are picked per sprint.") and
    Sprints behind this vision (rows `Area · outcome · status`, tapping opens
    `/sprints/{area}`; empty: "No sprints yet. They are planned on the Sprints
    tab."). "Show previous visions (n)" folds archived texts as faint blocks with
    `{from} – {to} · replaced {date} · {n} sprints ran behind it`.
    *States:* empty (setup step 1, sidebar `0 of 3`); error (error bar + preserved
    inputs; accent hint beside the disabled primary); loading (`loading.tsx` skeleton
    in the overview's shapes: kicker, two title lines, two button blocks, three
    cards; no layout shift). Copy never uses `HIT` / `MISS` (rule 28).
  - **Sprints tab and wizard.** Sidebar sub-line "Vision not written yet" with meta
    `Locked` on every Area until the vision exists, then `Ready` / the sprint meta;
    the empty-area card reads "Write the vision" and links to `/vision` (testid
    `empty-state` kept); copy: "A sprint has to advance the vision. Write it first;
    it takes three short steps." Wizard step 1: area cards gated only by "an active
    sprint already here"; the vision text in a faint block above them; with no vision
    the step shows the blocked note and a link to `/vision`. Step 4's alignment row
    reads "This outcome meaningfully advances my vision." `NewSprintWizard` carries
    no inline `style`; the `[data-cols]` `!important` rule leaves `globals.css`.
    Phone: no horizontal overflow at 390px on any wizard step or Vision view.
  - **Two-tap component** (`components/TwoTap.tsx`): first consumer is Replace;
    unit test: one click arms and does not fire, the second fires, blur disarms.
  - **e2e** (`e2e/golden-path.spec.ts`, desktop + phone): the empty card's "Write the
    vision" lands on `/vision`; step 1 with a past deadline shows the hint and does
    not submit; a future deadline saves and lands on step 2; the Sprints sidebar now
    reads `Ready`; step 2 creates a new impediment; step 3 saves the rule; the
    overview shows `3 of 3 steps` and the obstacle card; the sprint started later
    appears under "Sprints behind this vision"; Review → Still true stamps
    `Reviewed {today}` in the meta and the sidebar; DB assertions: one active vision,
    `obstacle_id` set, one `vision_reviews` row. The night-mode round trip stays.
  - **Live mutations** (each turns a named test red, then restored): the collapse
    keeps the oldest instead of the newest; `save_vision` accepts a past deadline;
    `set_vision_obstacle` accepts an Area-scoped pick; `archive_item` no longer checks
    the obstacle link; `review_vision` updates instead of inserting.
  - Visual match against the v8 artboard (Vision tab) in Chrome at desktop width in
    Dusk and Night: setup step 2 and the overview with the review card open; phone via
    the Playwright phone project. `npm run verify` green.
- **Non-goals.** The v8 wizard restyle (F10) · a vision version history (Edit is in
  place) · review reminders or a review cadence · Met / Under on finished sprints as
  the Insights measurement (F11 owns the rows; this card's status is the same
  computation but F11 may restyle it) · the review link from a "Needs review" row
  (F10) · editing an archived vision · more than one active vision · deleting a
  review · area-scoped obstacles.
- **Risks.** (1) The collapse migration picks the wrong survivor or strands a sprint
  — the transform test seeds two users with sprints on the losing visions and asserts
  every `vision_id` is unchanged. (2) A sprint's highest impediment and the vision's
  obstacle are the same row and the two guards disagree — `set_vision_rule` writes
  all three parts, which is exactly what the F6 trigger requires, and the test covers
  the shared-row case. (3) Revoking the `visions` grants breaks a read or seed path
  that wrote directly — the grants test pins the set, the seed helper moves to
  `save_vision` through the admin client, and the e2e walks the real path.
  (4) `/vision/[area]` links survive somewhere — grep for `/vision/health|wealth|
  relationships` in `app/`, `components/`, `e2e/` returns nothing.
- **Evaluator.** data-transforming migration (the collapse) · migration creating a
  user-data table (`vision_reviews`). One run for the feature.
- **UI.** Primary action: complete the three steps; afterwards Review vision.
  Viewport: both, desktop-first (Chrome at desktop width against the artboard; phone
  via Playwright screenshot and the phone e2e project). States: empty, error (inputs
  preserved), loading. References: `docs/mockups/ui-v2/handoff_sprint_ui_v8/README.md`
  §Vision tab and the artboard; the deadline field, the optional prompts on step 1,
  the review note, the "days to the deadline" line and the previous-vision meta line
  are additions the artboard does not draw. Mockup: `app/mockup/vision/` (thin page
  in the stack, hardcoded data, `?view=step1|step1-error|step2|step3|overview|
  overview1|loading`, `?review=1`, `?armed=1`, `?prev=1`; the real Dusk / Night
  toggle) — captured at 1440 and 390 in both palettes with zero overflow; moved to
  `docs/mockups/f9-vision/` with the screenshots before the build.

### F10 — Sprint completion, End Early, postmortem, kit, next-sprint gate (was F6)
*Superseded in part by F15 (2026-09-11): the impediment's SITUATION field, the day-row response / recovered / impact answers, rules 3–4 caps and the focus-cue requirement changed there; this text is history and stays.*
*Specified 2026-09-08 by `/interview` (feature mode). Scope:
`docs/RECONCILIATION-2026-09-06.md` rows B10 B17 C6 and the C5 calculation rules for the
single-sprint view; plus the three F5 follow-ups this feature owns (closure timestamp,
`sprint_streak_at` stopping at the closure date, backfill closing with the sprint) and the
BACKLOG "F10 input — the postmortem lists each closed day's tasks". In-session calls
(2026-09-08): **a passed window does not close itself** — after day 14 the sprint stays
`active` and the Today slot offers **Finish the sprint**, so backfill stays open until the
user acts and no page load mutates data · **the wizard takes the kit pre-fill only** — the
v8 800px dialog restyle is deferred to its own entry (BACKLOG), since F10 already carries
two user-data tables, five SQL calculations, the postmortem and the gate · **the postmortem
lives at `/insights/reviews/[sprintId]`** with a minimal Insights sidebar; `/insights`
itself stays the F1 placeholder and F11 builds Across sprints and restyles the rows ·
**a finished sprint shows the gate card, not a read-only journal** — the record is read in
the postmortem · **carry-forward defaults to Keep** and Finish review requires only the
lesson, the vision answer and (when applicable) the verdict · **no verdict is asked when
the highest impediment never occurred** on a logged day · **the closure date's own open day
is cancelled** with the future ones, so ending a sprint at 3pm does not book today as
missed · **End sprint early works before day 1** and cancels all 14.*

- **Behavior.** A sprint ends in one of three ways, each from the journal: **Complete
  sprint** appears in the rail once the closed days total the goal; **End sprint early** is
  always available as a two-tap in the rail's footer; and once all 14 days have passed the
  Today slot offers **Finish the sprint**. All three stamp a closure time, cancel every
  still-open day dated on or after the closure date (cancelled, never missed), and lock the
  sprint. The Area then shows a full-width review gate: the next sprint there stays locked
  until the postmortem is finished. The postmortem is the sprint's record and its
  decisions — the result against the goal, four insight cards, a verdict on the highest
  impediment's proof point, one key lesson, whether it moved the vision, and a Keep /
  Promote / Drop choice per item — and finishing it stores that set as the Area's kit,
  which pre-fills the next New Sprint and pins the lesson on its Day 1.

- **Acceptance criteria.**
  - **Migrations `0012_sprint_completion.sql`, `0013_f10_function_privileges.sql` and
    `0014_insight_calculations_fix.sql`** (forward-only, applied by `db reset`). 0013 and
    0014 exist because 0012 was already applied when its two defects were found: the
    implicit PUBLIC execute grant on ten new functions (caught by the grants pin) and
    three errors in the calculations (caught by the insight fixture). Each is documented
    in its own header.
    - `sprints` gains `closed_at timestamptz`; the status check is replaced with
      `status in ('active','completed','completed_early','ended','ended_early')` —
      `'review'` is dropped unused (the gate is "finished and unreviewed", not a status)
      and `'ended'` is added for a window that ran out under the goal. Test: an update to
      `'review'` is rejected.
    - `sprint_days` gains `cancelled boolean not null default false` with
      `check (not (cancelled and closed_at is not null))`. Test: both directions.
    - Trigger `sprints_status_transition` (before update): `status` may only move from
      `'active'` to one of the four finished values, `closed_at` may only go from null to
      not-null, and both are frozen once finished — `sprint_finished`. Tests for a finished
      → active update, a second `closed_at` write, and a finished → other-finished update.
    - `sprint_days_immutable_after_close` redefined **from its 0007 body** plus `cancelled`
      (locked once true). The pin test in `tests/db/streaks.test.ts` that lists the triggers
      on `sprint_days` stays green, and the F5 stale-body case is re-covered: the existing
      libraries and streaks suites must pass unchanged.
    - View `sprint_days_effective` (`security_invoker = true`): closed, non-cancelled days
      with `target > 0`, carrying `sprint_id, id, day_index, date, target, actual,
      closed_on_time, response, recovered, impact, highest_impediment_id` and
      `attainment numeric` = `actual::numeric / target`. **The four card functions read
      this view and nothing else**; `sprint_review_summary` reads `sprint_days` directly
      because it counts the missed and cancelled days the view exists to exclude. Test:
      a `pg_get_functiondef` scan of the four card functions finds no reference to
      `public.sprint_days` and at least one to `sprint_days_effective`.
    - **`reviews`** (RLS, one row per sprint, written only by `finish_review`): `id`,
      `user_id`, `sprint_id uuid not null unique references sprints(id)`, `lesson text not
      null check (btrim(lesson) <> '')` (private user text), `moved_vision boolean not
      null`, `verdict text check (verdict in ('worked','partly','didnt'))` (nullable),
      `completed_at timestamptz not null default now()`, `created_at`. SELECT own rows
      only; no INSERT / UPDATE / DELETE grant to `authenticated`.
    - **`review_decisions`** (RLS, same write rule): `id`, `review_id`, `user_id`,
      `kind text check (kind in ('cue','impediment'))`, `item_id uuid not null`,
      `decision text not null`, `unique (review_id, kind, item_id)`, plus
      `check ((kind = 'impediment' and decision in ('keep','highest','drop')) or
      (kind = 'cue' and decision in ('keep','test_more','drop')))`. There is **no kit
      table**: the kit is these rows plus the review's lesson, read back per Area.
    - Tests on both tables: user B selects 0 of A's rows (and the test fails with RLS
      disabled); an authenticated UPDATE of `lesson` on an own row errors
      (`permission denied`) and the row is unchanged; the row count only grows.
  - **Closure functions** (SECURITY DEFINER, identity from `auth.uid()`,
    `set search_path = ''`, `grant execute` to `authenticated`). Each takes `p_sprint_id`,
    requires the caller's own `status = 'active'` sprint (`sprint_not_found` /
    `sprint_not_active`), computes `v_date = (now() at time zone tz)::date`, writes
    `closed_at = now()`, and sets `cancelled = true` on every day with
    `date >= v_date and closed_at is null`. Their windows do not overlap:
    - `complete_sprint()` — only while `v_date <= end_date`; rejects `goal_not_reached`
      when the sum of `actual` over closed, non-cancelled days is `< amount`; sets
      `completed_early` when `v_date < end_date`, else `completed`. Tests: the rejection,
      both statuses, and that a day already closed on `v_date` is **not** cancelled.
    - `end_sprint_early()` — only while `v_date <= end_date`, no goal check, sets
      `ended_early`. Tests: goal not required; called the day before day 1, all 14 days
      cancelled and 0 closed; called after the window, `window_passed`.
    - `finish_sprint()` — only when `v_date > end_date` (else `sprint_running`); sets
      `completed` when the total reaches the goal, else `ended`. Tests for both.
    - `close_day` is **not** redefined: its existing `status <> 'active'` guard is what
      makes "no backfill after closure" true (PRD §9). Test: backfill a missed day, close
      the sprint, the same call now errors `sprint_not_active`.
  - **`sprint_streak_at(p_sprint_id, p_asof)` redefined from its 0007 body**: the horizon
    is `least(asof date in tz, closure date in tz)` and cancelled days are excluded
    entirely. Tests added to `tests/db/streaks.test.ts`: a sprint completed on day 9 with
    days 1–9 on time reads 9 on day 11 (was 0 — the F5 defect this closes); a cancelled
    day never breaks a run; the ten existing fixed-clock scenarios stay green.
  - **`sprint_best_streak(p_sprint_id)`** (definer, owner-checked, granted): the longest
    run of consecutive `closed_on_time = true` among non-cancelled days. Test: a sprint
    with runs 4 / 2 / 3 returns 4; another user gets `sprint_not_found`.
  - **`start_sprint` redefined from its 0011 body**, same signature, one new check before
    `active_sprint_exists`: raise `review_required` when the caller has a sprint in
    `p_area` whose `status <> 'active'` and which has no `reviews` row (rule 26). Tests:
    the rejection, that it clears once `finish_review` runs, and that every existing
    `start_sprint` test stays green.
  - **`finish_review(p_sprint_id, p_lesson, p_moved boolean, p_verdict text,
    p_decisions jsonb) → uuid`** (definer, granted). One transaction:
    - own sprint, `status <> 'active'` (`sprint_running`), no existing review
      (`review_exists`); `p_lesson` non-blank after trim (`lesson_required`); `p_moved`
      not null (`vision_answer_required`).
    - `p_verdict` is required exactly when the sprint's **current** highest impediment
      (`sprint_impediments.is_highest`) has at least one `day_impediment_observations` row
      with `was_highest and occurred = 'yes'` on an effective day whose snapshot
      `highest_impediment_id` is that item — the predicate
      `insight_response_followthrough` reads, so the DB and the postmortem's verdict chips
      can never disagree — otherwise it must be null. Errors `verdict_required` and
      `verdict_not_applicable`; an unknown value raises `invalid_verdict`. (Corrected by
      0016, 2026-09-09: 0012 tested any `was_highest` observation, which after a mid-sprint
      promotion demanded a verdict the UI never offered — FIX_LOG.) Test: A occurs, B is
      promoted, the sprint ends → the follow-through row is `[B, 0]`, a verdict is refused
      and a review without one succeeds.
    - The decision fill and the four insight calculations read **one row per item**: a
      member removed and added back is two membership rows (the history the postmortem
      lists) and one item. (0016, 2026-09-09; 0012 wrote one decision per membership row
      and hit the unique key — FIX_LOG.) Test: remove and re-add a cue that was used on a
      closed day → `used_days` 1, one decision row, the review succeeds.
    - A member the user removed mid-sprint and never added back **defaults to `drop`**
      in the fill (and in the postmortem's carry-forward rows, which say "removed
      mid-sprint"); a current member defaults to `keep`. (0017, 2026-09-09: the next
      kit had resurrected what the user pruned — FIX_LOG.) Test: removed-and-re-added
      → `keep`, removed only → `drop`.
  - **Rule 26 exempts a sprint that never closed a day** (0017, 2026-09-09): `start_sprint`
    blocks on an unreviewed finished sprint only if it has a closed day; `needsReview()`
    carries the rule to the Sprints sidebar, the review gate and the Insights rows, which
    read "Never ran" for such a sprint. Its postmortem stays open to write. Test: a sprint
    ended before day 1 does not block the Area; one that closed a day still raises
    `review_required`.
    - `p_decisions` is an array of `{kind, item_id, decision}`. Every `item_id` must be a
      membership row of this sprint (`item_not_in_sprint`); at most one impediment may be
      `'highest'` (`one_highest_only`); items not named default to `'keep'`, so the stored
      set always covers every member. Tests for each rejection, for the default fill, and
      that a rejected call leaves `reviews` empty (atomicity).
  - **`insight_response_followthrough.answered` counts `yes`, `no` and `partially`**;
    only `unsure` and an unanswered day leave a denominator (0015, after eval-06 P2-3).
    `ran` stays `yes` alone, so the rate falls when the response only half ran. Test: a
    sprint answered `yes / no / partially` reports 3 answered, rate 33, `enough` true.
  - **`sprint_best_streak` renumbers the non-cancelled days before looking for gaps**, so
    it answers the same question as `sprint_streak_at` (0015, after eval-06 P2-5). Test:
    days 1–3 and 5–7 on time with day 4 cancelled reads 6 from both functions.
  - **Insight calculations** — four functions, one per card, each
    `(p_sprint_id) returns table`, definer, owner-checked, granted, reading only
    `sprint_days_effective`. Metric is **median daily attainment** (D4). Comparison rows
    need ≥ 3 days on each side; tri-state rows need ≥ 3 answered; `unsure` and
    `unanswered` are excluded from every denominator but counted in coverage.
    - `insight_impediment_impact` — per sprint impediment: `present_days`, `absent_days`,
      `median_present`, `median_absent`, `delta_pts`, `enough`, `is_highest`, and the
      `impact` tally (`a_lot`, `some`, `nothing`).
    - `insight_response_followthrough` — for the highest: `occurrences`, `answered`,
      `ran`, `didnt`, `partially`, `unsure`, `rate`, `enough`.
    - `insight_response_recovery` — `recovered` vs `didnt` split by whether the response
      ran, plus median attainment on recovered vs not when each side has ≥ 2.
    - `insight_cue_usefulness` — per sprint cue: the same shape as impediment impact with
      `used_days` / `unused_days` and `is_focus`.
    - `sprint_review_summary` — total actual, goal, pct, closed / missed / cancelled
      counts, best streak, completion type.
    - Fixture test (`tests/db/insights.test.ts`): one seeded 14-day sprint with a known
      day matrix; each function's numbers asserted against hand-computed values; a
      cancelled day and an `unsure` day are both present and must not move any figure;
      the `enough` flag flips at exactly 3.
  - **Reads** (`lib/data.ts`): `loadFinishedSprints()` (finished sprints newest first with
    their review state, for the Insights sidebar and the gate) · `loadPostmortem(sprintId)`
    (summary, the four card result sets, the highest's proof snapshot, the sprint's
    members with their day counts, the existing review and its decisions) ·
    `loadClosedDayDetail(sprintId)` (each closed day with its target, actual and tasks —
    the BACKLOG "read a closed day's tasks" item) · `loadAreaKit(area)` (the last completed
    review's decisions and lesson, archived items filtered out per rule 24).
  - **Journal and rail.** Rail gains, above Celebration, a tinted **Complete sprint** card
    (testid `complete-sprint`) shown only when the closed total reaches the goal:
    "Goal reached · {cum} of {goal}. Remaining days are cancelled, not missed." The
    Celebration card's text turns green and gains the `Goal reached · ` prefix at 100%
    (600 weight from 80%). The rail footer carries **End sprint early** as `TwoTap`
    ("Tap again to end this sprint now", `end-sprint-early`), hidden once the window has
    passed — `end_sprint_early` would only raise `window_passed` there, and the Today
    slot offers Finish the sprint instead. On Day 1, when the Area has a finished review, a **Lesson from the last
    {Area} sprint** card (testid `last-lesson`) quotes it. The `sprint-ended` slot becomes
    the Finish card (testid still `sprint-ended`): "All 14 days have passed. Add any
    missed day above, then finish the sprint. Unclosed days stay as they are once it is
    finished." + **Finish the sprint**.
  - **Review gate.** `/sprints/[area]` with a finished, unreviewed sprint renders the gate
    (testid `review-gate`): kicker `{Area} · sprint complete | completed early | ended
    early | sprint ended` (`COMPLETION_LABEL`), outcome 28px/700, the v8 copy "This sprint has ended. The next {Area}
    sprint stays locked until its postmortem is finished — what hurt, what helped, one
    lesson, and what to carry forward.", primary **Open the postmortem** and a quiet meta
    line `{actual} of {goal} · met|under · n of 14 days closed`. Once reviewed the existing
    `empty-state` card returns with a quiet **Read the last postmortem** link beside the
    primary. The Sprints sidebar reads `Ended` in the accent with sub `Needs review`
    until it is reviewed, never `Ready` — the row must not invite a start that rule 26
    refuses.
  - **Postmortem** (`/insights/reviews/[sprintId]`, testid `postmortem`; grid
    `minmax(0,1fr) 300px`, max-width 1120). Main: outcome 30px + `Postmortem · {Area} ·
    {dates}`; result card (44px total in met green / under red, `of {goal}`, meta
    `{pct}% · met|under · n days closed · n not closed · best streak n`, 14-cell strip);
    the **four insight cards** in a 2-column grid (kicker coloured red / accent / accent /
    green, right-aligned coverage, question, rows with `HIGHEST` / `FOCUS` tags, two bars
    each with a 170px label column, tail in points, note in accent-ink when the sample is
    short); the **proof-point** card (WHEN → THEN, RECOVERED WHEN, the observation line
    "Showed up on n logged days · response ran a of b answered · recovered c of d
    answered." or "It never showed up on a logged day. No verdict is asked.", and the three
    verdict chips when it did); **One key lesson** (textarea + "Did it move the vision?"
    with two chips); **Carry forward · decide for the next {Area} sprint** with one row per
    member (`Keep · Promote to highest · Drop` for impediments, `Keep[ · test more] · Drop`
    for cues, sub `present n days` / `used n days`), then **Finish review** with the hint
    "Unlocks the next {Area} sprint · the kit on the right becomes its default." (or, when
    blocked, "One lesson, the vision answer and a proof-point verdict are required.");
    and a **Day by day** block listing each closed day with its actual, target and tasks
    (done and not done). Rail: the accent **Next {Area} sprint starts with** kit card
    (highest, also watching, cues, the pinned lesson) and an **Across n finished sprints**
    card. A finished review renders read-only with `Reviewed {date}` and the kit card
    titled "Next {Area} sprint starts with".
  - **Insights sidebar** (`app/(app)/insights/layout.tsx`): finished sprints newest first
    (label = outcome, meta `Needs review` in accent or `Reviewed {date}`, sub
    `{Area} · {dates}`), then an **Across sprints** section linking `/insights`, which
    keeps its F1 placeholder. Running sprints never appear.
  - **Wizard kit pre-fill.** Step 4 pre-checks the Area kit's impediments and cues
    (decision ≠ `drop`, archived filtered out per rule 24), pre-selects the `highest`
    decision as the highest impediment, and shows "Pre-filled from your last {Area}
    review" above the impediment group. Changing the Area re-reads the kit. Everything
    else in the wizard is unchanged. Unit test: the pre-fill mapping (drop excluded,
    highest promoted, archived filtered, no kit → empty).
  - **e2e** (`e2e/golden-path.spec.ts`, desktop + phone): a seeded past-dated Wealth sprint
    with closed days is completed from the rail; the area shows the gate; the postmortem
    renders the result card, four cards and the day-by-day tasks; Finish review is blocked
    with an empty lesson and its hint shows; filling the lesson, the vision answer and the
    verdict finishes it; the sidebar row flips to `Reviewed {today}`; the New Sprint wizard
    for that Area now opens with the kit pre-checked; Day 1 of the new sprint shows the
    pinned lesson. DB assertions: one `reviews` row, one `review_decisions` row per member,
    the sprint's status and `closed_at`, and every day after the closure date `cancelled`.
    The night-mode round trip and the F5–F9 assertions stay.
  - **Live mutations** (each turns a named test red, then restored from disk). Note that
    a cancelled day is never a closed day (the CHECK forbids it), so "the view counts
    cancelled days" is a mutation that *cannot* fail — the load-bearing filters are the
    view's `target > 0` and the streak's own `not cancelled`, and those are what is
    mutated:
    - `complete_sprint` accepts a total below the goal.
    - `close_sprint_rows` drops `closed_at is null`, so the closure day's own close is
      cancelled (the CHECK then rejects the write).
    - `sprint_streak_at` counts cancelled days again — the F5 defect, restored.
    - `sprint_days_effective` drops `target > 0`, so a zero-target closed day divides by
      zero and every calculation raises.
    - `start_sprint` drops the rule-26 gate.
    - `finish_review` allows a second review for the same sprint.
    - `insight_impediment_impact` attributes the day's `impact` answer to every
      impediment row, not only the highest.
    - `prefillFromKit` returns nothing, and the e2e's wizard assertions go red.
    - RLS: `reviews` and `review_decisions` each have an in-suite disable/enable check
      that fails when the policy is off.
  - **The Celebration card grows before it lands** (PRD §10): the share reached and 600
    weight from 80% of goal, green with the `Goal reached · ` prefix at 100%.
  - Visual match against the v8 artboard (Insights → Reviews, the review gate, the rail's
    Celebration actions) in Chrome at desktop width in Dusk and Night; phone via the
    Playwright phone project with a zero-overflow check at 390px on the postmortem, the
    gate and the rail. `npm run verify` green.

- **Non-goals.** The Across-sprints view, the Insights sidebar's Met / Under and % of goal
  rows, and any cross-sprint "recurring" note (F11) · the v8 800px New Sprint dialog
  restyle (its own entry, BACKLOG) · editing or deleting a review after it is finished ·
  requiring a decision on every carry-forward row · a `review` sprint status · a stored kit
  table · task completion vs result (BACKLOG, D10) · AI narrative · a read-only journal for
  a finished sprint · re-opening a finished sprint.

- **Risks.** (1) `start_sprint`, `sprint_streak_at` and `sprint_days_immutable_after_close`
  are each redefined, and the F5 defect was exactly a redefinition copied from a stale body
  — each is copied from its current migration (0011, 0007, 0007), the existing suites for
  all three must pass unchanged, and the trigger-list pin already fails if a trigger is
  lost. (2) Cancelled days leak into one calculation and every number quietly shifts — one
  `sprint_days_effective` view is the only day source for the five functions, pinned by a
  `pg_get_functiondef` scan, and the fixture sprint carries a cancelled day whose removal
  would move the asserted figures. (3) A median over three days reads as evidence — every
  row prints both group sizes, hides its comparison below n = 3, and the card copy states
  the threshold; no card says "caused". (4) The gate is bypassed by starting a sprint some
  other way — `authenticated` holds only `update (mantra)` on `sprints`, so `start_sprint`
  is the sole insert path, and the rule-26 test asserts the rejection through the API role.
  (5) Cancelling the closure day loses a real close — the cancellation predicate skips days
  that already have `closed_at`, and a test closes the day first, then completes.

- **Evaluator.** Migration creating user-data tables (`reviews`, `review_decisions`) · a
  migration altering a table that holds user data (the `sprints` status check, the
  `sprint_days` column and the redefined immutability trigger). One run for the feature.

- **UI.** Primary action: Finish review. Viewport: both, desktop-first (Chrome at desktop
  width against the artboard; phone via the Playwright phone project). States: empty cards
  with a stated reason, error with every input preserved, read-only after finishing.
  References: `docs/mockups/ui-v2/handoff_sprint_ui_v8/README.md` §Reviews, §Review gate
  and §Right rail item 4, and the v8 artboard. Departures the artboard does not draw: the
  Finish-the-sprint card for a window that ran out, the `ended` status, the Day-by-day
  block with tasks, the gate card's result meta line, and "No verdict is asked" when the
  highest never occurred. Mockup: `app/mockup/postmortem/` (thin page in the stack,
  hardcoded data, `?view=gate-open|gate|gate-reviewed|rail|rail-lesson|postmortem|
  postmortem-error|postmortem-done|postmortem-empty`, `?armed=1`; the real Dusk / Night
  toggle) — captured at desktop width in both palettes and copied to
  `docs/mockups/f10-postmortem/` with three screenshots before the build.

### F11 — Insights v2: Across sprints, Suggested kit, the measurement rows (was F7)
*Superseded in part by F15 (2026-09-11): the impediment's SITUATION field, the day-row response / recovered / impact answers, rules 3–4 caps and the focus-cue requirement changed there; this text is history and stays.*
*Specified 2026-09-09 by `/interview` (feature mode), replacing the v1 entry. Scope:
`docs/RECONCILIATION-2026-09-06.md` rows B9 C5 D4 D9 D10 minus everything F10 already
built — the four cards, their calculations and the single-sprint postmortem are done, so
F11 is the Across-sprints view, the Suggested kit, How to read this, and the measurement
on the sidebar rows. Eight in-session calls (2026-09-09): **the row is one aggregate row
per item with a recurring note**, the v8 card shape, not C5's per-sprint listing · **its
two bars come from the most recent sprint that clears n≥3**, named in the sub, falling
back to the most recent sprint with the tail "Not enough data" when none does · **the
cross-sprint numbers are the existing per-sprint SQL fanned out per finished sprint and
grouped in TypeScript** — no new SQL, so Across and Reviews cannot disagree · **version
splits the response cards only** (item + proof tuple), while impediment impact and cue
usefulness group by item alone · **Area is part of the key**, so a global item used in two
areas is two rows · **the Suggested kit is deterministic sentences** off the ranked rows ·
**0 finished sprints keeps the placeholder, 1 gets real cards, recurring notes need 2** ·
**`/insights` stays a stable destination** — it never redirects to a pending postmortem.*

- **Behavior.** `/insights` becomes **Across sprints**: "What actually works for you", an
  evidence line counting sprints, closed days and days on target, four scope chips (All
  areas · Health · Wealth · Relationships), the same four insight cards reading every
  finished sprint in scope, and a bottom row of **Suggested kit for the next sprint**
  beside **How to read this**. Each card row is one item, and its note says in how many
  sprints the pattern repeated — the two bars are one sprint's comparison, named in the
  row, because pooling days from sprints with different goals would invent a number no
  postmortem could confirm. The Insights sidebar's finished-sprint rows gain the outcome
  measurement (Part 2 §1): Met or Under, % of goal, and how the sprint ended. The page is
  read-only; the chip is its only control.

- **Acceptance criteria.**
  - **No migration.** Every number comes from the five functions and the view F10 already
    built. Test: `git diff --name-only` for the feature touches no file under
    `supabase/migrations/`, and `supabase_migrations.schema_migrations` still tops out at
    `0015` after the feature's suites run.
  - **`loadAcross(scope)`** (`lib/data.ts`) — one read of the finished sprints in scope
    (`status <> 'active'`, area-filtered when the scope is not `all`), then, per sprint,
    the four existing `insight_*` functions. Groups the returned rows into cards:
    - `insight_impediment_impact` and `insight_cue_usefulness` group by `item_id` and, on
      the All-areas scope, by `area` — the same item in Health and in Wealth is two rows.
    - `insight_response_followthrough` and `insight_response_recovery` group by `item_id`
      **plus the version** — the function's reported `proof_then` / `proof_recover` for
      that sprint. Two rows may therefore carry the same item name; the sub distinguishes
      them. Test: two sprints sharing an impediment with different `proof_then` produce
      two follow-through rows, and with identical `proof_then` produce one.
    - The bars are the **most recent sprint in the group with `enough = true`**, and the
      sub names it (`· from Wealth · Aug 12 → 25`). When no sprint in the group qualifies,
      the row still renders, the tail reads `Not enough data`, **the `from` attribution is
      absent** (nothing is being quoted) and the note carries the shortfall. Tests for all
      three: qualifying newest wins over a qualifying older one; a thin newest sprint does
      not suppress an older qualifying one; no qualifying sprint leaves no attribution.
    - **"Most recent" means the sprint that ran most recently — `end_date` descending —**
      not the order `loadFinishedSprints` returns (`closed_at` desc) and not the array
      position. A window that ran out in July and was finished by hand in September is
      still the older sprint. (Settled 2026-09-09 during the build: the two orderings
      agree for sprints closed on time and disagreed visibly on seeded data.) Test: a
      history whose array order contradicts `end_date` still quotes the later sprint.
    - **On the All-areas scope every row is prefixed with its Area** (`Wealth · Present on
      5 of 12 logged days · …`). Two rows of the same item name with nothing between them
      is worse than either merging or splitting, so the Area label is what makes the
      per-Area grouping legible. Scoped, the prefix is omitted — the chip already says it.
      Test: All areas yields `Wealth` and `Health` prefixes; a scoped render has none.
    - **Row order: rows with a comparison first, thin rows last** — impediments worst
      delta first, cues best delta first. Tests on both: a three-row card orders
      worst/best, then mild, then the `Not enough data` row.
  - **Recurring notes** (unit-tested in `lib/insightCards.ts`, cross-sprint mode):
    - Comparison cards: `{Helped|Hurt} in {k} of {n} sprints with enough days`, plus
      ` — recurring` only when `k = n` and `n ≥ 2`. A sprint counts toward `n` when it has
      **≥ 2 days on each side** — a deliberately looser bar than the n≥3 a displayed
      comparison needs, because "did it repeat" is a different question from "what was the
      delta". `Hurt` when the sprint's delta is negative, `Helped` when positive.
    - When no sprint reaches 2 on each side: `In {n} sprints · no single sprint has enough
      days yet`.
    - Tri-state cards: `{Ran|Recovered} at least half the time in {k} of {n} sprints`,
      each sprint voting from the card's own numerator and denominator so the note can
      never disagree with the rate the card displays. Follow-through votes at
      `answered ≥ 2` from `ran / answered` (`answered` is `yes|no|partially`, 0015).
      **Recovery votes from the SQL's own `rate`**, so only where the card shows one
      (`answered ≥ 3`): the rate's numerator is every `recovered = 'yes'`, response answer
      included, and the row carries no such count below the bar. (Corrected 2026-09-09
      after the F11 review: the first build voted from `with_recovered + without_recovered`
      at 2, which drops unsure-response days and printed "67% recovered" beside "0 of 1
      sprint" — FIX_LOG.) Test: three occurrences (unsure/yes ×2, yes/no) read `67%
      recovered` and `1 of 1 sprint`; two answered with no rate do not vote.
    - The sub gains ` · {n} sprints`. Tests: the recurring suffix appears at 2 of 2 and is
      absent at 2 of 3 and at 1 of 1; the k/n counts are asserted on a fixture.
  - **Suggested kit** — deterministic sentences, at most three, in this order, from the
    ranked rows of the scope: the worst impediment (`enough`, `delta_pts ≤ −10`) →
    "Keep {name} as the highest impediment; days it shows up run {|delta|} points lower.";
    the first `enough` follow-through row → below 50%, "The response for {name} ran on only
    {rate}% of occurrences — make the THEN smaller.", otherwise "The response for {name}
    runs {rate}% of the time[ and recovers {ran_rate}% of the times it ran]." — the
    recovery clause comes from the `enough` recovery group of the **same item, Area and
    quoted sprint**, and `ran_rate` is `with_recovered / with_response` rounded, printed
    only when `with_response ≥ 3`; otherwise the clause is omitted (corrected 2026-09-09
    after the F11 review: the first build took the scope's first qualifying recovery
    group, another impediment's — FIX_LOG; corrected again 2026-09-11: the group could
    quote a different sprint from the follow-through group, and the clause printed the
    row's overall recovery, which counts recoveries on days the response did not run —
    FIX_LOG); the best cue (`enough`,
    `delta_pts ≥ +10`) → "Keep {name} — +{delta} points on the days it's used." With no
    closed day: "Nothing to suggest yet — close a few days first." With closed days but no
    qualifying row: "Not enough logged days yet. Each comparison needs 3 days on each
    side." Unit tests for each branch and for the two empty states; no sentence is emitted
    from a row whose `enough` is false.
  - **How to read this** — the v8 text rewritten for median attainment (the README's
    strings are for the on-target rate D4 replaced): it states the with/without
    comparison, that unsure days count toward coverage and not the comparison, both
    thresholds, that the bars come from the most recent qualifying sprint, and that three
    days is not reliability. Test: the copy contains neither "on-target rate" nor "caused".
  - **Header evidence line** — `{n} sprints · {c} closed days · {h} on target ({p}%)` and
    the kicker `Evidence · {first start} → today`, scoped by the chip, counted over
    `sprint_days_effective` (so a zero-target closed day is out, as it is everywhere else
    on this page — and, since 2026-09-09, on the postmortem's two coverage lines too, via
    `effectiveClosedDays`; the result card's "n days closed" keeps the summary's count.
    FIX_LOG). `loadReviewStats` is **not** touched: the rail's card needs goals-met
    and lessons-kept, which this line does not show, and the two numbers it shares are
    cheaper to count in `loadAcross` than to thread a scope through a function whose other
    outputs would be discarded. (Corrected 2026-09-09 during the build; the first draft of
    this line said `loadReviewStats` would gain an optional scope.) Test: the on-target
    count for `all` equals the sum of the three area scopes, and `loadReviewStats` has no
    new parameter.
  - **Scope chips** — always all four, in the order All areas · Health · Wealth ·
    Relationships; the active chip is `chip-on`; the scope is a URL search param so the
    page stays a server component and the chip is a link. Test: `?scope=health` renders
    Health active and only Health sprints' rows; an unknown scope value falls back to
    `all` rather than erroring.
  - **States.** 0 finished sprints → the existing placeholder card, unchanged. Finished
    sprints but no qualifying row → cards render with every row's shortfall stated and the
    thin Suggested-kit sentence. A chip whose area has no finished sprint → each card shows
    the dashed empty block with its reason and the evidence line reads
    `No finished {Area} sprint`. Tests for all three.
  - **Sidebar rows** (`app/(app)/insights/layout.tsx`) — `loadFinishedSprints` gains `pct`
    and `met` per sprint: the total `actual` over `sprint_days_effective` against the
    sprint's `amount`, `met = total ≥ amount` (rule 25 — compared per sprint, never summed
    across measurements). The row keeps its label and its `Reviewed {date}` / `Needs
    review` meta, and gains a second sub line: `{Met|Under} · {pct}% of goal ·
    {COMPLETION_LABEL[status]}`, with Met in `--success` and Under in `--under`. `SideItem`
    takes one new optional field for that line; no other caller passes it. Tests: a sprint
    whose closed days total exactly the goal reads `Met · 100% of goal`; one short of it
    reads `Under`; a money and an hours sprint are never added together.
  - **e2e** (`e2e/golden-path.spec.ts`, desktop + phone): after the existing F10 walk
    finishes a review, `/insights` shows the Across page with the finished sprint's own
    numbers, the sidebar row reads `Met|Under · n% of goal`, and a scope chip filters the
    rows. Zero-overflow assertion at 390px on the Across page.
  - **Live mutations** (each turns a named test red, then restored from disk): the
    qualifying-sprint pick returns the oldest instead of the newest · the `from`
    attribution is emitted with no qualifying sprint · the recurring suffix drops its
    `k = n` condition · the version key drops `proof_then`, merging two responses into one
    row · `met` compares against the wrong sprint's `amount`.
  - Visual match against the v8 artboard's Across page in Chrome at desktop width in Dusk
    and Night; phone via the Playwright phone project. `npm run verify` green.

- **Correction (2026-09-09, full review #5 / #6, migration 0017).** The fan-out's "N is
  single digits for years" was wrong by 10× for three-area use (~78 finished sprints a
  year), and `loadAcross` read every effective day of every sprint into TypeScript, which
  PostgREST truncates at 1,000 rows (~72 sprints) with no error. The page now reads five
  requests for any N: four `insight_*_many(uuid[])` wrappers — plain `security invoker` SQL
  that `lateral`-calls the existing definer function per id, so the ownership check still
  runs per sprint and no authorization logic is added — plus the `sprint_totals` view
  (one row per sprint: effective and on-target days, the summary's total) filtered by id.
  The Insights sidebar reads `sprint_review_summary_many` the same way. "No new SQL" below
  is therefore historical: the numbers are still F10's functions, called once.
- **Non-goals.** New SQL for the cross-sprint numbers (the per-sprint functions are fanned
  out instead — amended above) · C5's per-sprint listing under each row, and any pooling of days across
  sprints into one comparison · splitting a version **inside** one sprint (see Risks) ·
  any action on this page: no "start a sprint with this kit", no link from a row to the
  sprint it quotes · a history table (D9 is satisfied by the sidebar rows) · task
  completion vs result (BACKLOG, D10) · AI narrative · a per-row sparkline or trend over
  time · the v8 800px New Sprint dialog restyle (its own entry, BACKLOG).

- **Risks.** (1) **A mid-sprint response rewrite is invisible.**
  `insight_response_followthrough` reports `max(o.proof_then)` per sprint, so if the WHEN →
  THEN text changed inside one sprint, that sprint contributes one row under the lexically
  greatest tuple and its counts span both versions. Version grouping therefore separates
  sprints, not days. Stated in How to read this; splitting inside a sprint would need the
  new SQL this feature deliberately did not write, and it goes to BACKLOG.
  (2) **The aggregate row reads as a pooled result.** Every row names the sprint its bars
  came from and prints that sprint's group sizes; the recurring note is the only figure
  that spans sprints, and it counts sprints, never days.
  (3) **The fan-out is N+1 reads.** N is the user's finished sprints (<10 for years at 14
  days a sprint, and the reads are `Promise.all`-batched per sprint); if it ever bites, the
  fix is the SQL this entry rejected, not a cache.
  (4) **Met / Under disagrees with the postmortem's result card.** Both must read the same
  total over `sprint_days_effective`; the test asserts the sidebar's pct equals
  `sprint_review_summary`'s for the same sprint.
  (5) **A thin first user sees a wall of "Not enough data".** That is the chosen state, and
  the Suggested kit says what is missing in one sentence instead of repeating it per row.

- **Evaluator.** **none.** No migration, no new function, no policy or grant change: every
  read goes through F10's already-evaluated definer functions and the RLS on the tables
  behind them. (Had the cross-sprint numbers been written as new SQL, the new definer
  functions would have made this an authorization surface and triggered a pass — one
  reason the fan-out was chosen.)

- **UI.** Primary action: switch scope and read — the page has no button. Viewport: both,
  desktop-first (Chrome at desktop width against the artboard; phone via the Playwright
  phone project). States: empty (no finished sprint), thin (nothing clears n≥3), per-chip
  empty (an area with no finished sprint). References: the v8 artboard's Across-sprints
  page in `docs/mockups/ui-v2/handoff_sprint_ui_v8/Sprint App v8 Libraries.dc.html` and
  §Insights → §Across sprints of its README, plus `docs/mockups/f10-postmortem/` for card
  consistency. Departures from the artboard, deliberate: its cross mode **pools** every
  in-scope day into one comparison and this one quotes a single sprint (C5) · its card copy
  says "on-target rate" and this one says median attainment (D4) · two rows may share a
  name when a response was rewritten · the footer pair stacks below 1024px. Mockup:
  `app/mockup/across/` (thin page in the stack, hardcoded, `?view=full|thin|chip-empty|none`,
  `?scope=…`, the real Dusk / Night toggle and the real `InsightCard`), captured to
  `docs/mockups/f11-across/`.

### F12 — Circles: invites and accountability view (was F8)
**Postponed 2026-09-10 (user, at the F12 feature interview) to release sooner.** Build
order is now F13 → F14 → F12 after launch. Until then every user is created by hand in
the Supabase dashboard (F14's "first invitee" arrives that way). Nothing below changes;
adding it after launch is additive — new tables, one default-false column on
`sprint_impediments`, a `profiles` backfill for existing users under the production gate
(DECISIONS 2026-09-10). The three calls settled before postponing: invite as a server
action, not an API route; invited → active automatically on the invitee's first visit;
display name defaults to the email's local part and is edited on the Circles page.
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
Interviewed 2026-09-10 in feature mode; four calls settled (DECISIONS 2026-09-10):
**the scheduler is Supabase pg_cron + pg_net, hourly** — Vercel Hobby cron runs at most
once per day with ±59 min drift (`vercel.com/docs/cron-jobs/usage-and-pricing`, read
2026-09-10), so the v1 "hourly Vercel Cron" line was unbuildable · **the hour is fixed
at 20:00 in the sprint's zone**, no chooser and no off switch (BACKLOG) · **Resend from
the user's own verified domain** (Resend delivers nothing without one) · **one email per
user** listing each open sprint as `Area · Day N`.
- **Behavior.** When it is 20:00 or later, before midnight, in an active sprint's zone
  and that sprint's current day is still open, the owner receives one email that
  evening: "Health · Day 6 is still open" (two open sprints: both lines, one email) with
  a link to the app. A closed day, an ended or completed sprint, a date outside the
  sprint, or a day already reminded sends nothing. Nothing on screen. The email carries
  the Area name and the day number only — never outcome, amount, targets, actuals,
  mantra, intention or notes.
- **Acceptance criteria.**
  - Migration `0018`: `pg_cron` and `pg_net` enabled; table `reminder_log(id, user_id →
    auth.users cascade, sprint_day_id → sprint_days cascade UNIQUE, created_at,
    updated_at (trigger), sent_at null, attempts smallint default 1, error text)` with RLS on and **no** grant to
    `anon` or `authenticated` (`grants.test.ts` pins both, and that `service_role` is the
    only API role with EXECUTE on the new function); definer function
    `reminders_due(p_now timestamptz)` returning `(user_id, email, sprint_id,
    sprint_day_id, area, day_index, tz)` — the only reader of `auth.users.email` in
    `public`, `search_path ''`, EXECUTE revoked from PUBLIC/anon/authenticated
    (`has_function_privilege` false for both; calling it as a test user is a permission
    error); one `cron.job` named `reminders-hourly`, schedule `5 * * * *`, whose command
    reads the URL and bearer from `vault.decrypted_secrets` (`reminders_url`,
    `reminders_secret`) and is a no-op when either is absent — so the local stack and a
    fresh hosted project run it harmlessly. The command names `net.http_post` and
    neither `sprint_days` nor `tasks`: the two existing `cron.job` guards in
    `targets.test.ts` / `tasks.test.ts` stop early-returning and actually run from 0018 on.
  - `reminders_due` (DB test `reminders.test.ts`, `p_now` passed explicitly so every case
    is deterministic): a user whose sprint zone is at 20:00 local with today open → one
    row with that email, area and day_index; 19:59 local → 0 rows; today closed → 0;
    sprint `completed` / `ended_early` → 0; `p_now` before `start_date` or after
    `end_date` in the zone → 0; a `reminder_log` row with `sent_at` set → 0; a row with
    `sent_at` null touched (`updated_at`) under 10 minutes ago (in flight) → 0; the same
    row older than 10 minutes with `attempts < 3` → returned again (retry); `attempts =
    3` → 0. Two
    active sprints in two areas → two rows, same user. A DST zone
    (`America/Los_Angeles`) on both sides of a transition date resolves 20:00 local
    correctly. The function is read-only (DB test scans its body for
    INSERT/UPDATE/DELETE: none), so the 29 hard rules are untouched.
  - Route handler `POST /api/cron/reminders` (the app's first non-auth route; order per
    conventions): `Authorization: Bearer <CRON_SECRET>` compared constant-time → 401 with
    an empty body otherwise; GET → 405; `CRON_SECRET` unset → 503 and nothing claimed
    (fail closed). The comparison lives in `lib/reminders/authorize.ts` with unit tests
    (missing header, wrong secret, right secret, unset secret). The handler uses a
    service-role client from a new `lib/supabase/admin.ts` that imports `server-only`,
    so any client import fails the build; the key is read from `SUPABASE_SERVICE_ROLE_KEY`
    and never from a `NEXT_PUBLIC_` name.
  - Claim-then-send, both sides in SQL and `service_role` only: `reminders_claim(ids)`
    inserts the row (or bumps `attempts` on a failed row older than ten minutes with
    attempts left) and returns what it claimed, before any send; `reminders_mark(ids,
    error)` sets `sent_at` on success or stores `error` (retried by the next hour up to
    3 attempts, then left with its error). DB tests walk the lifecycle: claim → in
    flight → failed → retry after ten minutes → cap at three → sent never reclaimed. Response
    JSON `{ due, users, sent, failed }` counts only; one structured event
    `reminder.run` per run and `reminder.send_failed` per failure (ids only).
  - Transport `lib/reminders/transport.ts`: Resend's HTTP API via `fetch`
    (`RESEND_API_KEY`, `REMINDER_FROM`; the link's origin is the request's own, so no
    `APP_URL`); unit test with a stubbed fetch pins
    the request (URL, bearer, from, to, subject) and that a non-2xx is a failure. With
    `RESEND_API_KEY` unset outside production the transport is `log` (structured event,
    success) so the local stack sends nothing; in production an unset key is 503 at the
    route, nothing claimed.
  - Body `lib/reminders/message.ts`: pure; unit test on a fixture whose sprint carries an
    outcome, a mantra, an amount and a target asserts the subject and body contain
    `Health · Day 6`, the `/sprints` link, and none of those strings; the two-sprint
    fixture yields both lines and one subject.
  - e2e (`e2e/reminders.spec.ts`, desktop project): seed a user with an active
    sprint in a fixed-offset zone where local time is 20:xx–23:xx now (helper beside
    `zoneOffUtcDate`); `POST` with the bearer → 200, `sent ≥ 1`, and `reminder_log` holds
    exactly one row for that sprint day with `sent_at` set; a second `POST` → the row is
    unchanged (`attempts` 1, same `sent_at`); a wrong bearer → 401 and no row; the same
    user with the day closed first → no row.
  - `env.example` gains `CRON_SECRET`, `RESEND_API_KEY`, `REMINDER_FROM` (empty);
    `scripts/local-env.mjs` derives a local `CRON_SECRET` from the stack's own key so
    the e2e and `npm run dev` share one without a literal in source.
    `docs/RUNBOOK_REMINDERS.md`: enable the two extensions on the hosted project,
    create the two Vault secrets, verify the Resend domain, set the three env vars on
    Vercel, and the two queries that prove a run happened (`cron.job_run_details`,
    `reminder_log`). Free-tier fit: Resend 100/day, 3,000/month (pricing page, read
    2026-09-10) against <10 users × 1/day.
  - `npm run verify` green; visual verification n/a (no screen).
- **Non-goals.** Per-user hour, off switch, unsubscribe link (BACKLOG, together);
  push notifications; digests; a reminder for a missed *earlier* day (only today's
  open day qualifies); an in-app copy of the email.
- **Risks.** (1) The hosted job silently no-ops — extensions off or Vault secrets
  missing: mitigation, the runbook's proof queries plus the per-run `reminder.run` event
  with counts. (2) The Resend domain is not verified at launch, every send 4xx: rows stay
  retryable up to 3 attempts with the error stored, and `reminder.send_failed` fires. (3)
  A zone or DST slip mails at the wrong hour: due-ness is computed once, in SQL, as
  `p_now at time zone s.tz`, with explicit 19:59 / 20:00 and DST-transition tests.
- **Evaluator.** migration creating a user-data table (`reminder_log`) · a definer
  function that reads `auth.users` · scheduled network egress from the database. One run.
- **UI.** none.

### F14 — Pre-release: deploy, install check, reminders live, restore drill (was F10; export withdrawn 2026-09-06)
Interviewed 2026-09-10 in feature mode; eight calls settled (DECISIONS 2026-09-10):
**Vercel through the GitHub integration** (every push to `main` deploys; no CLI) · **the
`*.vercel.app` origin**, no custom domain · **Supabase managed daily backups** (the
organisation is on Pro, per the user; not verified from this clone) · **owner only signs
in** — the "first invitee" line moves to F12 with the invite flow · **the install check
is an automated manifest test plus a Chrome install**, because Chrome's docs mark
Lighthouse PWA testing deprecated (`developer.chrome.com/docs/lighthouse/pwa`, read
2026-09-10) · **the F13 reminder goes live inside F14, proven by one received email** ·
**hosted auth settings as code** via a `[remotes.production]` block and `supabase config
push`. The manifest and icons already exist (`app/manifest.ts`, F8 and the 2026-09-09
review), so nothing is built for the PWA beyond its check.

**Amended during the build, 2026-09-10 (three of the interview's calls overtaken by
facts):** the user bought `hustlemania.app` (Cloudflare DNS) for the Resend sender and
chose to put the **app itself on it** rather than rotate four URLs later; the user
announced **ten friends signing up the same day**, and Supabase's built-in email
"will refuse to deliver messages to addresses that are not part of the project's
team" at two messages an hour (`supabase.com/docs/guides/auth/auth-smtp`, read
2026-09-10), so **auth email goes through Resend** as `[remotes.production.auth.email.
smtp]` in config.toml, and the friends' accounts are **seeded from the dashboard**
(Create new user, auto-confirm; signups stay closed). The owner's account turned out
to exist already (created 2026-09-05 from the dashboard, never signed in), so step 5
was already done and the production gate applied from the migration push onward.

- **Behavior.** The app runs at `https://hustlemania.app` (the Vercel alias
  `hustlemania.vercel.app` keeps working) against the hosted Supabase project
  `zcdvuhcslwalhziinfqz` with all eighteen migrations applied. Accounts exist only by
  dashboard seed — the owner plus the friends the owner names; signups stay disabled.
  A magic link requested on the deployed login page arrives from
  `sprint@hustlemania.app` and lands on `/sprints`, and the app installs from Chrome
  as a standalone window opening on `/sprints`. The owner starts the first real
  sprint, and that evening's reminder arrives from the same domain. A restore runbook
  exists and has been drilled once: a production dump restored into the local stack,
  with the app booting against it.
- **Order and gates.** Every external step is shown first and waits for the user's
  word; nothing runs on a hunch. The production gate opens the moment the owner's
  account exists on the hosted project — from then on every hosted write is shown and
  confirmed, reads are free.
  1. Repo changes, no external action: `[remotes.production]` in
     `supabase/config.toml` (`project_id`, `auth.site_url` = the Vercel origin,
     `additional_redirect_urls` = `<origin>/auth/callback`, `enable_signup = false`);
     a Playwright project `deployed` in `playwright.config.ts` that runs only when
     `DEPLOY_URL` is set and never starts a web server; `docs/RUNBOOK_RESTORE.md`.
  2. Vercel (the user, in the dashboard): import the GitHub repo as a project; set
     `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (generated here and handed over),
     `RESEND_API_KEY`, `REMINDER_FROM` for Production. The first build refuses to run
     without the public URL (`scripts/check-build-env.mjs`), which is the intended
     failure if the variables are missing.
  3. `supabase link --project-ref zcdvuhcslwalhziinfqz`, then `db push --dry-run`
     shown, then `db push` on the user's word. The database password reaches the CLI
     through `SUPABASE_DB_PASSWORD` from an env-file wrapper or the user's own `!`
     line — never pasted into the conversation. If `create extension pg_cron` is
     refused, the user enables it in Database → Extensions and the push is re-run
     (DECISIONS 2026-09-10 F13 "re-open if"). `/db-check` against the hosted project
     afterwards: eighteen rows in `supabase_migrations.schema_migrations`, both
     extensions, `reminders-hourly` on `5 * * * *`, RLS enabled on every `public`
     table, `anon` and `authenticated` holding no privilege on `reminder_log`.
  4. `supabase config push` with its diff shown, then confirmed. Verified by the magic
     link in step 6 landing on the Vercel origin, not localhost.
  5. Owner account: already existed (see the amendment above). Production gate from
     the migration push.
  5a. Domain: the user adds `hustlemania.app` in Vercel → Settings → Domains and the
     records Vercel shows in Cloudflare (DNS only, not proxied); the auth config's
     `site_url` and redirect list move to that origin and are pushed again.
  5b. Auth email through Resend: the user verifies `hustlemania.app` in Resend, creates
     a sending key, puts it in `.env` as `RESEND_API_KEY` and in Vercel; the
     `[remotes.production.auth.email.smtp]` block is pushed with the key read from the
     shell. Proof: the owner's next magic link arrives from `sprint@hustlemania.app`.
  6. The user requests a magic link on `https://hustlemania.app/login` in the browser
     that will click it (the PKCE code is bound to that browser), clicks it, lands on
     `/sprints`. Recorded by a Chrome screenshot of `/sprints` signed in on the origin.
  6a. Friends: the user creates each account in Authentication → Users → Add user →
     Create new user with auto-confirm, then sends them the login URL; each requests
     their own link. Their sign-ins are not an F14 gate — they happen when the friends
     click — but the count of accounts is recorded.
  7. Reminders: env vars from step 2 plus `RESEND_API_KEY` / `REMINDER_FROM`; the two
     Vault secrets (`reminders_url` = `https://hustlemania.app/api/cron/reminders`,
     `reminders_secret` = `CRON_SECRET`) created by SQL shown and confirmed; redeploy.
     The user starts the first sprint. Proof: one `reminder_log` row with `sent_at` set
     and one email in the owner's inbox. If the :05 run has passed 20:00 in the sprint's
     zone for the day, proof waits for the next evening; the row stays open until it
     lands.
  8. Install check: `DEPLOY_URL=<origin> npx playwright test --project=deployed`
     green, and the Install control seen in Chrome on the origin (screenshot).
  9. Restore drill per `docs/RUNBOOK_RESTORE.md` on a `supabase db dump --linked`
     file taken after steps 3 and 7 (so it holds the schema's rows and the first
     sprint), kept by the user outside the repo. **Amended during the build,
     2026-09-10:** the hosted project runs Postgres 17, whose daily backups are
     physical and "not available for direct download"
     (`supabase.com/docs/guides/platform/backups`), so the dashboard file the
     interview assumed does not exist; Pro daily backups remain the restore-in-place
     layer and the runbook documents both.
  10. Pre-release evaluator, `npm run verify` green, `~/.claude/PROJECTS.md` updated
      to "live, owner is a real user" (a file outside the project: asked first).
- **Acceptance criteria.**
  - Hosted database: `/db-check` output as in step 3 (eleven assertions, all passed
    2026-09-10 after the push; `supabase db diff --linked` clean apart from the
    platform's own `ensure_rls` event trigger), and `select count(*) from auth.users`
    = 1 + the number of friends seeded in step 6a.
  - Auth config: after every `config push`, the two-address probe — the owner's
    address → sent, an uninvited address → `otp_disabled` (FIX_LOG 2026-09-10) — and,
    once SMTP is on, the owner's magic link arriving from `sprint@hustlemania.app`.
  - `e2e/deployed.spec.ts` (project `deployed`, skipped when `DEPLOY_URL` is unset,
    no DB access, no web server): `GET <origin>/manifest.webmanifest` → 200 JSON with
    `name` "Hustlemania", `start_url` "/sprints", `display` "standalone", icons of
    192 and 512 with a `maskable` entry, and every icon `src` → 200 `image/png`;
    `/login` HTML carries `<link rel="manifest">`; unauthenticated `/sprints` → 3xx
    to `/login`; response headers include `X-Frame-Options: DENY` and
    `X-Content-Type-Options: nosniff`; `POST /api/cron/reminders` without a bearer →
    401; `GET` → 405. Each assertion fails on a deploy that lost the manifest, the
    proxy, the headers or the route.
  - Sign-in: `auth.users.last_sign_in_at` not null for the owner (read query), plus
    the screenshot from step 6.
  - Reminder: `reminder_log` holds ≥1 row with `sent_at` set for the owner's sprint,
    `cron.job_run_details` shows a `succeeded` run, and the user confirms the email.
  - Install: Chrome's Install control on the origin. **Amended 2026-09-10:** the
    browser tooling screenshots the page, not the address bar, so the evidence is the
    user's confirmation that Chrome offered Install and opened Hustlemania in its own
    window (given 2026-09-10), plus the manifest test above, which is what guards a
    regression.
  - Restore: `docs/RUNBOOK_RESTORE.md` names both layers (Pro daily backups for
    restore-in-place, 7-day retention; weekly `supabase db dump` files outside the repo
    for the drill and total loss — `supabase.com/docs/guides/platform/backups`, read
    2026-09-10), the dump commands, the restore steps into the local stack, and the
    drill record — date, dump folder, row counts of `auth.users`, `sprints`,
    `sprint_days`, `reminder_log` matching the hosted project, and `npm run dev`
    serving `/login` against the restored data. The dump must contain
    `auth.users` rows (checked by grep), or it is not a backup. The drill must not
    touch the hosted project.
  - `docs/evals/eval-08.md`: pre-release evaluator, 0 P0 / 0 P1 before green.
  - `npm run verify` green. Visual verification: the two Chrome screenshots above.
- **Non-goals.** ~~A custom domain~~ (overtaken: `hustlemania.app` is the origin);
  a service worker or offline mode; the invite *flow* (F12 — accounts are seeded by
  hand until then); CI on GitHub (the
  pre-commit hook and Vercel's own build are the signal — BACKLOG); data export and
  account deletion (BACKLOG; `archived_at` until); point-in-time recovery; an error
  sink beyond Vercel runtime logs and `lib/observe.ts` events.
- **Risks.** (1) `db push` stops midway on the hosted project — most likely at 0018's
  `create extension pg_cron`: migrations are applied one file at a time and recorded
  individually, so the fix is to enable the extension in the dashboard and re-run the
  push, which resumes at the failed file; the dry-run is shown first. (2) The magic
  link points at localhost because the auth config did not apply: step 4's config push
  is verified by step 6 itself, and the dashboard is the fallback. (3) The dump silently
  omits the `auth` schema (managed schemas are excluded by default), so a restore has
  sprints with no owners: the runbook's grep for `COPY "auth"."users"` is part of
  taking a dump, and the drill compares `auth.users` counts. (4) The reminder never fires because
  20:00 in the sprint's zone has passed for the day: acceptance waits for the next
  evening rather than faking due-ness on production data.
- **Evidence, 2026-09-10 (UTC).** Step 3: push 03:5x, eleven assertions pass, diff
  clean but for the platform's `ensure_rls`. Step 4: three config pushes (origin,
  test-value pin, email-provider fix — FIX_LOG). Step 5a: `hustlemania.app` valid on
  Vercel, apex 200, `www` 308 → apex. Step 5b: the owner's magic link arrived from
  `sprint@hustlemania.app`. Step 6: signed in, `/sprints` screenshot on the origin;
  the first render failed on platform clock skew, fixed with a one-second retry
  (FIX_LOG). Step 7: Vault secrets present (64-char bearer after two placeholder
  pastes), the 06:05 run POSTed and got `200 {"due":1,"users":1,"sent":1,"failed":0}`,
  `reminder_log` 1 row sent; the owner's inbox: "Relationships · Day 1 is still
  open" from `Hustlemania <sprint@hustlemania.app>` at 23:05 Pacific. Step 8: deployed project 4/4 on the origin; Install
  confirmed by the user. Step 9: dump 06:07, restored into a blank local stack, all
  eight counts identical, `/login` 200, local stack reset afterwards
  (`docs/RUNBOOK_RESTORE.md` drill record).
- **Evaluator.** pre-release. One run, after step 9.
- **UI.** none — no screen added or changed.

### F15 — Situations: one response covers many situations
*Specified 2026-09-11 by `/interview` (feature mode, escalated to DESIGN → SPECIFY because
it rewrites the entity model F2, F6, F7, F10 and F11 are built on; Part 1 untouched). Plan
of record: `~/.claude/plans/i-think-the-change-parallel-hopcroft.md`. Direction approved
and the spec approved the same day; built in the same session. Nine calls, the user's:
situations are reusable library entities, one list per kind · impediment = WHEN (its
name) → INTERFERES → THEN → RECOVERED WHEN → situations, cue = WHEN → REMIND → situations
· 1–3 impediments, 0–3 cues, every member with ≥1 situation, Highest kept (auto when
one), focus required only while the sprint has cues · the close asks per impediment
"did it show up", which situations, and "recovered?" per ticked situation (blank
allowed); per cue "used" and which situations; response-ran and cost are gone · per-item
cards adapted and a per-situation breakdown now · the owner's rows are deleted by a
separate user-run script, everyone else's converted in place · rule 6 applies to every
sprint impediment at start / add, Highest-only in the validity check.*

- **Behavior.** A library item is the response. An impediment reads WHEN (the moment
  you will recognise; its name) → INTERFERES → THEN → RECOVERED WHEN and applies to one
  or more **situations**; a cue reads WHEN → REMIND and applies to its own situations.
  Situations are two libraries of their own (`/vision/impediment-situations`,
  `/vision/cue-situations`) with rank, scope, archive and delete like the other two, and
  are ticked under an item's editor (APPLIES TO) or named there inline. A sprint holds
  1–3 impediments and 0–3 cues; every member carries at least one live situation, every
  impediment a THEN and a RECOVERED WHEN, one impediment is the Highest (the only one by
  default) and, while the sprint has cues, one is the focus (the first pick by default).
  Closing a day asks, for every impediment, whether it showed up; when yes, in which of
  its situations (at least one), and for each ticked situation whether you recovered
  (yes / no, or left blank); for every cue, whether you used it and, when yes, which
  situations it applied to. The Highest and the focus are tagged and asked nothing more.
  Insights keep the per-item impact, recovery and cue cards, drop follow-through, and
  add a line per situation under each item: occurrences and the recovery rate for an
  impediment, days applied for a cue.
- **Acceptance criteria.**
  - Migration `supabase/migrations/0019_situations.sql`, data-transforming over every
    user's rows and deleting none: `situations(id, user_id, kind check in cue /
    impediment, name, scope, rank, archived_at, unique (id, kind))`,
    `impediment_situations` / `cue_situations` with a composite FK on `(situation_id,
    kind)` so a cue situation on an impediment is impossible at DDL level;
    `day_impediment_situation_observations(observation_id, situation_id, name snapshot,
    occurred, recovered yes / no / null, check occurred or recovered is null)` and
    `day_cue_situation_observations(…, applied)`; `day_impediment_observations` gains the
    `proof_then` / `proof_recover` snapshot; `impediments.proof_when` dropped after its
    text moves into `name`; RLS and grants in the same statements (SELECT own on every
    new table; situations INSERT `(user_id, kind, name, scope)`, UPDATE `(name)`, DELETE
    own while unattached; join and observation tables written only by definer
    functions). The six legacy day columns stay, never written again, out of
    `sprint_days_effective`, still locked by the 0012 trigger (global no-delete rule;
    BACKLOG: drop when no hosted row carries a value).
  - Conversion, set-based: each impediment and cue becomes its own first situation
    (same id, old name, rank kept), an impediment's `proof_when` becomes its `name` where
    it had one, a cue's situation is its `cue_when` where it had one; every legacy
    observation row gets a situation row (occurred = its answer; the Highest's recovered
    copied from the day row) and the Highest rows the proof snapshot; an end-of-migration
    assertion raises `conversion_incomplete` if any item ends without a situation.
    `scripts/rehearse-0019.mjs` resets the local stack to 0018, seeds legacy rows through
    the 0010 `close_day`, applies 0019 and asserts each of those (red if the coalesce or
    the observation copy is dropped); the release rehearses the same on a restored hosted
    dump (RUNBOOK_RESTORE) before the production gate.
  - Functions rebuilt from their latest bodies, one pin marker each in
    `tests/db/libraries.test.ts`: `start_sprint` (0–3 / 1–3, auto focus and highest when
    exactly one, `no_situations`, THEN + RECOVERED WHEN on every selected impediment),
    `sprint_invalid_reason` (`too_many_cues` → `no_focus_cue` only while cues remain →
    `no_impediments` / `too_many_impediments` → `no_highest_impediment` →
    `no_situations` → `proof_point_required` on the Highest), `add_sprint_item` (caps
    3 / 3, `no_situations`, `proof_point_required`, the first cue becomes the focus),
    `remove_sprint_item` / `archive_item` / `set_item_scope` (removing the last cue clears
    `is_focus` in the same UPDATE), `restore_item` / `move_item` / `archive_item` /
    `set_item_scope` / `affected_sprints_check` with the `situation` kind (scope is a
    filter, archive a validity input), `set_highest_impediment(uuid, uuid, then,
    recover)`, `impediments_before_update` (rule 22 over THEN and RECOVERED WHEN),
    `set_vision_rule` (WHEN → `name`), `day_offered_items` (+ `situations jsonb`),
    `close_day(uuid, bigint, text, jsonb, jsonb)` with `p_impediments = [{item_id, answer,
    situations: [{situation_id, recovered}]}]` and `p_cues = [{item_id, answer,
    situations: [{situation_id}]}]` — `situations_required`, `situations_not_applicable`,
    `situation_not_offered`, `duplicate_situation`, `invalid_answer` (off-scale or on a
    cue), one situation row per offered situation of every offered item; new
    `set_item_situations(kind, item, ids[])` (`situation_not_found`, `situation_archived`,
    `no_situations` when the item is a current member of an active sprint).
  - Insights: `insight_response_followthrough` and its `_many` dropped;
    `insight_impediment_impact` minus `felt_*`; `insight_response_recovery` → one row per
    impediment `(occurrences, verdict_occurrences, answered, recovered, didnt, rate,
    enough)` over situation rows, `verdict_occurrences` on the 0016 predicate so the
    postmortem's `verdictApplies` and `finish_review` cannot disagree (DB test on the
    promote-away case); new `insight_situations` per (kind, item, situation)
    `(occurrences, asked_days, recovered_yes, recovered_answered, rate, enough)` with
    `enough` at 3 answered recoveries for an impediment, 3 occurrences for a cue; every
    one reads only `sprint_days_effective` (function scan test). Hand-computed matrix in
    `tests/db/insights.test.ts`.
  - DB tests (`tests/db/`): RLS two-user denial and disable/enable leak on the five new
    tables; the amended rules 3–6 each with a failing input (0 cues starts; 4 of either
    refused; two impediments need a named highest; blank THEN or RECOVERED on any member
    refused; `no_situations` from `start_sprint`, `add_sprint_item`,
    `set_item_situations` and `archive_item('situation')`); the composite FK refused for
    the postgres role; `situations` direct-write denial on kind / scope / rank /
    archived_at; the delete policy; last-cue removal clears the focus; the close's five
    payload errors, null recovered accepted, snapshots surviving item and situation
    renames, situation rows immutable, API-role insert denied; the legacy day columns
    never written; grants list.
  - App: `lib/dayAnswers.ts` (pure state, unit-tested), `components/today/DayQuestions.tsx`
    (occurrence group first, `impediment-item` / `cue-item` with Yes / No / Unsure
    radiogroups, `impediment-situations` / `cue-situations` checkbox chips, one
    `situation-recovery` radiogroup per ticked situation, HIGHEST / FOCUS tags), hint
    "Tick at least one situation for {name}."; summary line `Showed up: {WHEN} ({sit};
    recovered k of n) · Cues used: {REMIND} ({sit})`; library editors WHEN · INTERFERES ·
    THEN · RECOVERED WHEN / WHEN · REMIND · NOTE plus the APPLIES TO picker
    (`components/SituationPicker.tsx`), hints "WHEN and at least one situation are
    needed." / "WHEN, REMIND and at least one situation are needed.", a card without a
    situation marked `data-blocked` with the usage line "Blocked · no situation";
    `components/SituationLibraryPage.tsx` on the two new routes; the wizard's hint ladder
    "Select 1–3 impediments." → "Designate the highest impediment." → "The highest
    impediment needs THEN and a recovery criterion." → "{name} needs a THEN and a
    RECOVERED WHEN — …" → "Confirm the outcome advances the vision.", inline creates with
    WHEN + situations (cue: WHEN + REMIND + situations), rows without a situation
    disabled, "n of 3"; the rail's Highest card WHEN · THEN · RECOVERED WHEN · APPLIES TO
    and "Edit response", cue rows with APPLIES TO, the last cue removable; Vision step 2
    labelled WHEN, step 3 THEN + RECOVERED WHEN; Insights recovery card `{recovered} of
    {answered}` recovered vs didn't, `situation-line`s under every card, kit sentences
    `Keep {name} as the highest impediment; days it shows up run {n} points lower.` · `You
    recover from {name} {rate}% of the time.` (rate < 50: `only {rate}% … — make the THEN
    smaller.`) · `Keep {name} — +{n} points on the days it's used.`; `lib/errors.ts`
    copy for every new code; `lib/kit.ts` trims to 3.
  - e2e golden path (desktop + phone): the obstacle card blocked until a situation is
    named inline under Edit; the wizard's create rows gated on WHEN + situation; Start
    enabled with zero cues; the rail's APPLIES TO rows; the Add-cue picker gated on a
    situation tick; the close's per-item flow, hint, recovery radio, summary line, the
    situation observation rows in the DB, the untouched cue as unanswered; the F5
    backfill with situations attached; the F10 seed with situation rows, no follow-through
    card, the situation line "4 occurrences · 50% recovered", the kit sentence `Keep Late
    meetings as the highest impediment; days it shows up run 75 points lower. You recover
    from Late meetings 50% of the time.`; the situations page's blocked archive. `npm run
    verify` green.
  - Falsifiability, live mutations each turning a named test red: a cap left at 5 ·
    `is_focus` not cleared on the last cue's removal · the auto-pick removed from
    `start_sprint` · the situation fill removed from `close_day` · `recovered` forced to
    `'yes'` · the effective-days filter dropped · the coalesce dropped from the conversion
    (rehearsal) · `.slice(0, 5)` in `lib/kit.ts`.
- **Non-goals.** Situation-level kit sentences · reusing a situation across kinds ·
  drag-and-drop · dropping the legacy day columns (BACKLOG) · Circles (F12) · the wizard
  restyle (BACKLOG) · a group-level None / Unsure pill (each item answers for itself).
- **Risks.** (1) Fourteen rebuilt functions, one from a stale body — the named source
  migration per function and a pin marker each. (2) The close becomes a wall on a phone —
  situations appear only after a Yes, recovery only per tick, checked at 390px. (3) The
  conversion mishandles a shape the seed did not cover — rehearsed on the real dump before
  the gate; the migration's own assertion refuses a half-conversion; nobody's rows are
  deleted by it. (4) A friend's active sprint with an impediment whose response was never
  finished — the validity check keeps the Highest-only rule, so archive / scope still
  work; the wizard and `add_sprint_item` are where the new rule bites.
- **Evaluator.** migration transforming production rows · migrations creating user-data
  tables — one run.
- **UI.** Primary action: write the response once, then tick the situations it applies
  to (`/vision/impediments`, `/vision/cues`). Viewport: both, desktop-first (Chrome at
  1138px; phone via the Playwright phone project). States: item with no situation
  (blocked) · close with a ticked situation · empty situations library · Insights
  breakdown with thin data. Mockups of record: `docs/mockups/ui-v2/Sprint App v8
  Libraries.dc.html`, `docs/mockups/today/handoff_sprint_ui`, `docs/mockups/f10-postmortem`,
  `docs/mockups/f11-across`, each extended in-stack; no new artboard. Guidance copy
  (verbatim on the editors): cue — "A good cue names a moment you will recognise (WHEN)
  and a reminder, question or action specific enough to act on right there (REMIND). Then
  tick the situations it applies to — one cue can cover several."; impediment — "Name the
  moment you will recognise (WHEN), what it does to your day, a response that is specific
  and feasible right there (THEN), and what you would observe, within a time window, to
  know you are back on track (RECOVERED WHEN). Then tick the situations it applies to —
  one response usually covers several." Examples reordered WHEN → INTERFERES → THEN →
  RECOVERED WHEN → applies to.

### F16 — Vision v3: picture the year, the one-year goal with confidence, the obstacle plan; dictation on every setup box
*Specified 2026-09-12 by `/interview` (feature mode; the plan of record is
`~/.claude/plans/i-want-to-make-fancy-squirrel.md`, approved the same day and built in the
same session). Eight calls, the user's: step 1 Morning / Midday / Evening is **one saved
textarea** · **all three steps unlock sprints** (reverses the 2026-09-08 "step 1 unlocks"
call) · the deadline input goes, `deadline` is set to twelve months from the first goal
save · voice is the **Web Speech API** (mic button per box, hidden where unsupported; the
phone keyboard mic remains) · the "main reason" box shows at confidence ≤ 6 and is
required then · the overview's three cards mirror the three steps · voice on the Vision
setup only, as a reusable control · UI: primary action **dictate the answers**, both
viewports phone-first, the F9 look reused, states empty / error / voice unsupported or
denied / listening. Fields not in the new script leave the UI and the database at the
user's explicit call: `visions.meaning`, `visions.baseline`, and `impediments.explanation`
(INTERFERES) everywhere it appears. Impediments and cues are otherwise untouched. Hosted
state at plan time: one active vision (meaning and baseline filled), one impediment
(explanation filled), one active sprint — three text values the push erases.*

- **Behavior.** The three annual steps become **Picture · Goal · Obstacle**. Step 1,
  "Visualize one year from today": "Close your eyes. Picture a realistic day one year
  from today." with three prompts — Morning (what took effort this morning and what made
  it easier), Midday (what hard moment happened and how you handled it differently),
  Evening (what you followed through on that the old you would have avoided) — "Picture
  specific actions.", and one textarea. Step 2, "Define your one-year goal": "In 12
  months, I ___." · "The observable proof will be ___." · "Given your time, resources,
  and current approach, how likely are you to achieve this?" 0–10 · at 6 or below, "If
  confidence is low, what is the main reason? Adjust your approach, support, or goal
  scope to address it." Step 3, "Plan for your main obstacle": "What most often pulls you
  off that course?" — choose an existing global impediment or name one, then WHEN (what
  cue will I notice) · THEN (what specific action will I take) · RECOVERED WHEN (what
  observable sign shows I am back on course), with the worked example and "Rehearse
  once: Picture the next time this happens. Notice your WHEN cue, then mentally perform
  your THEN response." Every text box on the setup carries a Dictate button. Sprints
  unlock only at 3 of 3; the overview shows three cards, one per step.
- **Acceptance criteria.**
  - **Migration `0020_vision_v3.sql`** (forward-only, one transaction, applied by `db
    reset`): drops `save_vision(text,date,text,text,text)`,
    `set_vision_obstacle(uuid,text,text)`, `set_vision_rule(text,text,text)`; `visions`
    gains `picture text`, `confidence smallint` (`visions_confidence_check`, 0–10),
    `confidence_reason text` (`visions_confidence_reason_check`: null or `confidence <=
    6`); `body` and `deadline` become nullable, `visions_body_check` restated as null or
    non-blank; `meaning` and `baseline` dropped; `library_item_before_insert` trims
    `explanation` only for cues, `impediments_before_update` no longer touches it,
    `day_offered_items` keeps its return type and returns `null` explanation for
    impediments; then `impediments.explanation` dropped (its grant goes with it;
    `cues.explanation` stays). An assertion block (`-- assert:begin/end`) refuses to
    commit unless the `visions` column set is exactly `archived_at, body, confidence,
    confidence_reason, created_at, deadline, id, obstacle_id, picture, proof, updated_at,
    user_id`, `impediments.explanation` is gone, `cues.explanation` remains, no vision row
    has both `body` and `picture` null, and no reason exists above confidence 6. Test:
    each branch provoked in a rolled-back transaction throws.
  - **Write path** (SECURITY DEFINER, `auth.uid()`, `set search_path = ''`, execute
    granted to `authenticated` and `service_role` only):
    - `save_vision_picture(p_picture) → uuid`: blank → `vision_picture_required`; upserts
      the active row on `visions_one_active_per_user`, touching only `picture` (edit keeps
      `id` and `created_at`).
    - `save_vision_goal(p_body, p_proof, p_confidence, p_reason) → uuid`: needs the active
      row (`no_active_vision`); `vision_body_required`, `vision_proof_required`,
      `confidence_out_of_range` (null, < 0, > 10), `confidence_reason_required` (≤ 6 and
      blank); a reason above 6 is stored as null; `deadline` becomes `current_date + 12
      months` only when null. Tests: each rejection leaves the row unchanged; the
      deadline is set once and survives a second goal save.
    - `set_vision_obstacle(p_impediment_id, p_when, p_then, p_recover) → uuid` (no
      defaults): `no_active_vision`; any blank part → `rule_incomplete` before any write;
      a pick must be the caller's, unarchived and global (`item_not_found`,
      `item_archived`, `obstacle_not_global`) and is renamed to WHEN with THEN and
      RECOVERED WHEN written; no pick inserts a global impediment with the three parts;
      sets `obstacle_id`. Tests: the rename; the insert; blank parts write nothing with
      and without a pick; the shared-row highest case still passes the F6 trigger.
    - `start_sprint` (same signature, rebuilt from 0019): after `no_active_vision`,
      raises `vision_incomplete` unless `picture`, `body`, `obstacle_id` and the
      obstacle's `proof_then` and `proof_recover` are all present. Test: rejected after
      step 1, after step 2, starts after step 3, rejected again once the proof is blanked.
    - `replace_vision`, `review_vision`, the `vision_obstacle` guards: unchanged.
  - **Grants and pins:** `tests/db/grants.test.ts` loses the two `impediments /
    explanation` privilege rows and pins the callable set with `save_vision_picture`,
    `save_vision_goal`, `set_vision_obstacle` and without `save_vision`,
    `set_vision_rule`; `tests/db/libraries.test.ts` pins one marker per rebuilt body and
    the `day_offered_items` row shape (cue note kept, impediment explanation null).
  - **Reads** (`lib/data.ts`): `visionSteps` counts picture, goal (`body`) and a complete
    obstacle rule; `visionReady` = 3; `loadOverview` carries the obstacle parts so the
    Sprints sidebar reads `Locked · Vision not finished` and the wizard says "A sprint has
    to advance the vision; finish its three steps first." until then; `loadVision` no
    longer selects `explanation`.
  - **Setup** (testid `vision-setup`, `data-step` 1–3; kicker, meta, title, segments and
    footer as F9; step names Picture · Goal · Obstacle): step 1 textarea `aria-label`
    "Picture", hint "Picture the day before moving on."; step 2 textarea "Goal", input
    labelled "The observable proof will be", chips `aria-label` "Confidence n" with
    `aria-pressed`, textarea "Main reason" shown only at ≤ 6, hint ladder "Write the
    goal." → "Name the observable proof." → "Pick a confidence from 0 to 10." → "Say the
    main reason your confidence is low."; step 3 radio rows of global impediments
    (picking fills the three inputs; "Name a new one" clears the pick), inputs "When" ·
    "THEN" · "RECOVERED WHEN", the example block, the Rehearse once block, hint "WHEN,
    THEN and the recovery criterion are all required."; `?step=2` and `?step=3` fall back
    to step 1 while no vision row exists; a failed save shows the error bar with Retry
    and keeps every input.
  - **Dictate** (`components/Dictate.tsx`, `lib/dictation.ts`): a 44px accent button
    `aria-label` "Dictate {label}" with `aria-pressed` on every setup box; rendered only
    after mount and only when `SpeechRecognition` or `webkitSpeechRecognition` exists;
    continuous with interim results merged into the box (`mergeTranscript`, unit-tested:
    single space join, interim separate from final, empty base); "Listening…" while
    active; one box listens at a time; `not-allowed` shows "Microphone blocked in this
    browser. Allow it or type." Exercised once in Chrome on this machine; iOS
    home-screen behaviour **not verified**.
  - **Overview:** kicker "One year from today"; meta `Saved · By {deadline} · Reviewed`
    (no "By" while the deadline is null); headline the goal or "Goal not written yet";
    cards `card-picture` (text; empty "Picture a day one year from today."),
    `card-goal` (goal, `Proof: …`, `Confidence n/10`, reason; empty "Write the goal."),
    `card-obstacle` (`WHEN … → THEN …`, `Recovered when …`; empty "What most often pulls
    you off that course?"); `card-rule` is gone; the review note's "days to the
    deadline" only with a deadline; sidebar `n of 3`.
  - **Libraries:** the impediment card and editor read WHEN · THEN · RECOVERED · APPLIES
    TO; the INTERFERES row, input, placeholder and example fragments are gone; the cue
    NOTE stays. `actions/library.ts` stops sending `explanation` for impediments.
  - **e2e** (`e2e/golden-path.spec.ts`): Picture → `1 of 3`; goal, proof, confidence 5 →
    the reason hint, reason → `2 of 3` with the Sprints sidebar still `Locked`; WHEN /
    THEN / RECOVERED WHEN → `3 of 3`, `Ready`; the Dictate buttons present by label; the
    16px guard covers the new boxes; `[data-part=interferes]` no longer asserted.
  - **Live mutations** (each turns a named test red, then restored): the
    `vision_incomplete` block deleted · the deadline set unconditionally · the reason
    raise removed · the pick branch without the rename · the trigger trim moved back
    above the cue branch · `i.explanation` in the impediment branch · the
    `impediments.explanation` assertion branch deleted.
  - `scripts/rehearse-0020.mjs`: reset to 0019, seed a 3-of-3 legacy user through the old
    functions, a step-1-only user and an impediment with an explanation, `migration up`,
    assert the column set, kept body / proof / deadline / obstacle_id, `picture` null,
    `vision_incomplete` for both users, `day_offered_items` callable.
  - Visual: Chrome at desktop in Dusk and Night for steps 1–3 and the overview; the
    Playwright phone project at 390px with the overflow check. `npm run verify` green
    from a fresh reset.
- **Non-goals.** Server transcription · voice outside the setup (BACKLOG: review note,
  library editors) · a user-set deadline · editing an archived vision · a device check of
  dictation in the installed iOS app (BACKLOG) · any change to cues, situations or the
  impediment fields other than INTERFERES.
- **Risks.** (1) `db push` erases three hosted text values — the dump precedes the push
  and the production gate shows the migration. (2) Seeded test users gain one extra
  global impediment from the completed vision — no suite pins absolute impediment
  ranks; any count assertion that breaks is fixed test-side. (3) Dictation unsupported in
  the installed iOS app — the keyboard mic remains; recorded as unverified.
- **Evaluator.** Destructive migration on production rows (three column drops) → one
  run (`docs/evals/eval-10.md`).
- **UI.** Primary action: dictate the answers. Viewport: both, phone-first (390px by the
  Playwright phone project; Chrome at desktop). States: empty, error (inputs preserved),
  voice unsupported / denied, listening. References: `docs/mockups/f9-vision/` and the v8
  README §Vision tab; the look is reused, fields and copy change. Mockup: the F9 mockup
  source rebuilt with the new steps at `app/mockup/vision/`, captured at 390 and desktop
  in both palettes, moved to `docs/mockups/f16-vision/`.
- **As built (2026-09-12).** Migration `0020_vision_v3.sql` as specified; `db reset` clean;
  types regenerated. `scripts/rehearse-0020.mjs` eleven assertions green on legacy-shaped
  rows (a 3-of-3 F9 user with meaning / baseline / INTERFERES, a text-only user): rows
  kept, columns gone, both users `vision_incomplete` until the picture is saved, then a
  sprint starts and `day_offered_items` answers with a null explanation for the
  impediment. Seven live mutations, all red and restored: the gate block · the deadline
  set unconditionally · the reason raise removed · the pick without the rename · the
  trigger trim moved back above the cue branch (caught by the seed helper's own insert:
  `record "new" has no field "explanation"`) · `i.name` as the impediment's explanation ·
  the assertion branch deleted. `npm run verify` green from a fresh reset: typecheck,
  lint, hooks 60/21+23/6+5, unit 171, DB 318, e2e 12 + 6 skipped. Visual pass by
  Playwright: 20 captures, Dusk + Night × 1138 px + 390 px, no horizontal overflow —
  steps 1–3, the overview, and step 2 at confidence 8 (reason box hidden). Chrome on this
  machine: the Dictate button renders (support detected) and a refused microphone shows
  "Microphone blocked in this browser. Allow it or type."; the **listening path with real
  audio was not exercised** — the automated tab cannot grant the microphone — so it is
  verified only as far as the state machine and stays owed to a hand check. The one
  hosted vision reads 2 of 3 and `Locked` until its owner saves the picture. Build
  choices inside the entry: the three step-3 inputs are stacked (label, one-line prompt,
  input, Dictate) instead of the two-column `proof-grid`, phone-first; the Dictate button
  sits under its box, accent-filled, 44px, "Listening… tap to stop" while active; the
  wizard's blocked line reads "A sprint has to advance the vision, and its three steps
  are not all saved."; the Sprints sidebar sub-line is "Vision not finished"; a mockup
  page was not built — the real screens were captured instead, the look being the F9 one.

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

**F15 deltas, 2026-09-11** (user's calls in the interview; `docs/DECISIONS.md` same date):
- DELTA vs PRD rules 3–4: a sprint holds **0–3 Execution Cues** and **1–3 Impediments**
  (was 1–3 / 1–5). Every member applies to at least one situation.
- DELTA vs PRD rule 6 and F6: the response is THEN → RECOVERED WHEN on an impediment whose
  **name is its WHEN**; required on **every** sprint impediment at start / add, on the
  Highest in the validity check. The SITUATION field is gone: situations are a library.
- DELTA vs F7: the focus cue is required only while the sprint has cues; the Highest's
  response-ran, recovered and cost answers are replaced by a recovery answer **per
  situation** that showed up. The six legacy day columns stay on `sprint_days`, never
  written again (global no-delete rule).
- DELTA vs F11: the follow-through card and kit clause go; recovery is per impediment over
  its situations; a situation line sits under every card.

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
