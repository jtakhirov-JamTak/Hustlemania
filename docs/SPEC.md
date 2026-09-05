# Hustlemania — SPEC

Single source of truth for what to build. Produced by `/interview` (new-app mode) on
2026-09-05. The behavioural reference is `docs/references/14-Day-Goal-Sprint-Req.md`
(the PRD, 13 sections, 29 hard rules); where this spec and the PRD differ, this spec
wins and the difference is listed in Part 2 §5. The visual reference is the handoff in
`docs/mockups/UI mockups.zip` (see Part 2, F1 UI block).

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
- REQUIREMENT — Invite-only access, magic-link sign-in, no passwords, no open sign-up.
- REQUIREMENT — Circles: inviting an email to a circle is the app invite. A member may
  belong to several circles. Circle members see, per active sprint: Area, current
  streak (and whether today is closed), % of Goal. Highest Impediment and other
  impediments are shared only if the owner opts in per item. Goal amount, actuals,
  targets, mantra, notes stay private.
- REQUIREMENT — One evening email reminder when today's Day is not yet closed.
- REQUIREMENT — Insights are rule-based statistics. AI narrative is a later feature.
- REQUIREMENT — Personal data exportable (format not an MVP blocker).
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
**Measurement:** Sprint History (F7) lists every sprint with status and % of Goal; the
owner reads it. No extra instrumentation: the sprint records are the data.

## 2. Target users
<10 people the owner knows, invited by email, mostly desktop, some phone use for Today
and Close Day. Each person's data is private; circle members see a limited view.

## 3. Features (build order: dependencies and risk first)

Conventions that apply to every feature: `engineering-conventions` skill (RLS in the
same migration as the table, `.error` inspected on every call, integers for amounts,
`archived_at` not delete, falsifiable tests). Amounts are stored as one BIGINT
`amount` in **base units**: money → minor units (cents; UI accepts whole units only,
per PRD), hours → minutes, quantity → whole units.

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
  project creation happens at F10.
- **UI.**
  - Primary action: enter Actual and Close Day, reached after a morning "Today I
    will" intention · desktop-first, both viewports · states: empty, loading, error
    (inputs preserved), closed.
  - **References:** `docs/mockups/UI mockups.zip` (Claude Design handoff). Inside:
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
       accent-bordered; weekends faint); start/end dates; "End sprint early" link (F6).
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
       <target>" in green/red, celebration line, "Complete sprint" band at goal (F6).
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
- **Non-goals.** Reminders (F9).
- **Risks.** Streak drift vs calendar — all logic in SQL, tested with fixed clocks.
- **Evaluator.** none.

### F6 — Sprint completion, End Early, Review, next-sprint gate
- **Behavior.** Reaching the Goal enables Complete Sprint (not automatic). End Sprint
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

### F7 — Insights and Sprint History (rule-based)
- **Behavior.** Insights tab: Health, Wealth, Relationships, All Areas, Sprint History.
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

### F8 — Circles: invites and accountability view
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

### F9 — Evening email reminder
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

### F10 — Pre-release: export, PWA manifest, deploy
- **Behavior.** "Export my data" downloads one JSON of everything the user owns.
  App installable (manifest + icons; no service worker). Deployed to Vercel with the
  Supabase production project; owner and first invitee signed in.
- **Acceptance criteria.** Export route follows the handler order; output validated
  against a Zod schema listing every user-owned table; a second user's data never
  appears (test with two users). Lighthouse "installable" passes. `npm run verify`
  green; evaluator pre-release pass; `docs/RUNBOOK_RESTORE.md` written and one restore
  drill run against the local stack from a production backup file.
- **Non-goals.** CSV/PDF export, account deletion UI (BACKLOG; `archived_at` until).
- **Risks.** Export leaks via a missed table — schema list is generated from
  `information_schema` in a test and must equal the export's list.
- **Evaluator.** pre-release.

## 4. Explicit v1 non-goals
AI-written insights or reviews · push notifications · native apps · offline mode ·
custom Areas · circle roles/moderation · account deletion self-service · data import
· multi-currency formatting beyond a code · sharing Mantra, Goal amount, Actuals or
Notes with anyone · any XP/points/labels (rule 28).

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
- STAGED: rules 3–6 enforced from F2, rule 26 from F6; no real sprint before F10.

## 6. Stack, auth/security model, shared entities
- Next.js 16 App Router (current release at build time; "middleware" is `proxy.ts`
  in 16), TypeScript, Tailwind; Supabase (Postgres 17, Auth, RLS);
  Vercel Hobby; Resend free tier for reminders; Vitest + Playwright; local stack via
  `npx supabase start` (Docker); migrations in `supabase/migrations/`, forward-only.
- Auth: Supabase magic link, signups disabled, users exist only via dashboard seed
  (owner) or admin invite (F8). Session from `@supabase/ssr` cookies; middleware
  redirects unauthenticated `/sprints|/vision|/insights`. Service role key only in
  server routes for invites; never in client code.
- Authorization: RLS default-deny on every table, `user_id = auth.uid()`; circle
  reads through `is_circle_mate()` helper and the `circle_feed` view (F8). Invariants
  live in DB functions and triggers (`start_sprint`, `close_day`, `save_targets`,
  `archive_item`, status-transition trigger, immutability trigger).
- Entities: `visions`, `sprints`, `sprint_days`, `tasks`, `cues`, `impediments`,
  `sprint_cues`, `sprint_impediments`, `day_cue_helped`, `day_impediment_hurt`,
  `reviews`, `profiles`, `circles`, `circle_members`, `reminder_log`. All user-scoped
  tables: `user_id` FK cascade, `created_at`, `updated_at` trigger, `archived_at`
  where archive exists, indexes on owner FK and filter columns.

## 7. Risks (pre-mortem: this spec failed because…)
1. **RLS or a trigger had a hole and a member saw or altered another's record.**
   Mitigation: every policy and trigger has an individual break-and-confirm test;
   evaluator on F1 and F8.
2. **Day/streak logic disagreed with the calendar and the owner stopped trusting it.**
   Mitigation: all date logic in SQL functions using the sprint tz, table-tested
   with fixed clocks including DST; no date math in React.
3. **F1–F10 never finished because each feature grew.** Mitigation: acceptance
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
- F2–F10 each add one migration `000N_<feature>.sql`, their pages under `app/(app)/`,
  and their tests; never edit an applied migration.
