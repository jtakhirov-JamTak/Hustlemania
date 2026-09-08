# BACKLOG

(Deferred work, production issues, non-blocking findings. One line per item.)

## Found during F9 (2026-09-07), not fixed there

- **eval-05 observations** (no P0/P1; both P2s fixed before green): the library's direct
  UPDATE grant on `impediments.proof_*` can blank one part of the vision's guiding rule
  outside `set_vision_rule` (F6's trigger guards only an active sprint's highest; the
  Guiding-rule card's Add path restores it — DECISIONS 2026-09-08 rejected extending the
  trigger) · `set_vision_obstacle` accepts a duplicate impediment name (no uniqueness rule
  in SPEC) · a sprint past its `end_date` still reads `status = 'active'`, so the wizard
  calls the area "active" while the sidebar says "Ended" — F10 owns the transition ·
  `save_vision` has no body length limit.

- **`friendlyError` matches codes as substrings of the whole message**, so a PostgREST
  schema-cache error naming `set_vision_obstacle(...)` renders the `vision_obstacle` copy
  (FIX_LOG 2026-09-07). Any future code that is a suffix of a function name will do the
  same. Match on word boundaries or on the `details`/`hint`-free message prefix.
- **An impediment that is the vision's obstacle cannot be deleted from the library** (FK
  `visions_obstacle_id_fkey`, no cascade); the copy says to change the obstacle first.
  Rule 19 already limits Delete to unused items, so this only reaches a never-used
  obstacle. Acceptable; noted so it is not read as a bug.

## Found during F8 (2026-09-07), not fixed there

- **`JWT issued at future` on the first request after a magic-link sign-in** (one desktop e2e run; the phone run and every rerun passed). PostgREST in the Docker stack rejected a token the host had just minted, so `/sprints` rendered the error boundary. A clock-skew flake between Docker and the host, not app code; if it recurs, compare `date -u` with `docker exec supabase_db_Hustlemania date -u` and restart Docker Desktop.
## Noted during the F8 interview (2026-09-07)

- **F10 input — the postmortem lists each closed day's tasks** (done and not done, read-only). The journal's closed rows stay one line (F8, user's call); after a day closes its tasks are readable nowhere until F10 renders them. Add to the F10 entry when `/interview` rewrites it.
- **F8 note for F10/F11:** `sprint_invalid_reason` still reports `no_focus_cue` on sprints seeded by `insertSprintRows` (no memberships); nothing calls it on them today.

## Found during F7 (2026-09-07), not fixed there

- **Evaluator allowlist lacks `docker`** (eval-04, P2-4): the prescribed `docker exec … psql`
  inspection was refused, so catalog details (policies, triggers) were verified from the
  migration source and the DB suite only; variable assignment and an `echo` containing
  `->` were refused too. Adding `docker exec supabase_db_Hustlemania psql` to the
  user-level `shell_guard.py` evaluator allowlist is the human's move (DECISIONS,
  handoff B2).
- **eval-04 seeded two users and a sprint through the API and left them**; the stack was
  reset afterwards in the same session, so nothing remains, but future evaluations
  should expect a `db:reset` before and after.
- **`CloseFlow`, `NewSprintWizard` and `SprintItemsRow` keep their inline styles** after
  the F7 rewrite of step 2 (not in the F7 acceptance list, same call as F6); the pill
  rows reuse `.chip` / `.chip-on` and one new `.pill-row`. The move to classes stays
  owed to F8 (Today card states) and F9 (wizard).
- **Step 2 scrolls inside the modal at 763px** once the Highest is picked (five groups
  plus the note); the footer stays pinned. Acceptable, but F8's inline Today card should
  not inherit a scroll box.
- **The wizard's focus radio and Today's FOCUS tag / "Set as focus" are not in the v8
  artboard**; F8 (rail cue card) and F9 should draw them rather than keep the
  improvised rows.
- **`friendlyError` matches codes by substring in insertion order**: a new code that
  contains an older one (none today) would map to the older copy. Consider exact-token
  matching when the table grows again.

## Found during audit remediation phases 4–6 (2026-09-06), not fixed there

- **#43 wizard split by step.** `components/NewSprintWizard.tsx` is ~600 lines across
  four steps in one component. A refactor with no behaviour change; deferred rather
  than done inside a fix pass. Actions were split by domain in phase 3.
- ~~**Tailwind keep or drop** (audit bucket D)~~ Dropped 2026-09-07 in the enabling
  pass (DECISIONS); its preflight is inlined in `app/globals.css`.
- **Inline styles remain in the components the redesign rewrites** (`TodayView`,
  `CloseFlow`, `LibraryPage`, `NewSprintWizard`, `VisionForm` and the Today cards, ~280
  of them): each moves to classes when its feature (F6–F9) replaces the component. The
  shell moved on 2026-09-07. F6 rewrote `LibraryPage` on 2026-09-07 but kept its inline
  styles (not in the F6 acceptance list); the move to classes is still owed.
- **Golden path failed once on a fresh dev server (2026-09-07, F6 build):** the first
  `npm run test:e2e` after editing `lib/data.ts` showed the app's error boundary ("This
  page could not load") on `/sprints/health` right after sign-in — the empty-state path,
  which none of the F6 changes touch. It did not reproduce on any of five later runs and
  the cause was not identified. `playwright.config.ts` already notes fresh-start
  flakiness; if it recurs, capture the web-server stderr (`DEBUG=pw:webserver`). `app/global-error.tsx` keeps its inline styles for good:
  it renders without the root layout, so no stylesheet reaches it.
- **Audit LOW lists not swept**: textareas `rows={2}`, `autoCapitalize` / `enterKeyHint`,
  the date only in a hover `title` on the day strip, 64/78px numerals against a
  seven-figure target, `aria-label` overriding visible text on Remove buttons, the
  `▾/▸` glyphs (now `aria-hidden`), `.task-remove` / reorder arrows below 24×24 on
  desktop (44px on phone now).
- **Phone footer wrap in the close dialog**: at 390px "Cancel" sits on its own line above
  the hint and primary. Readable, not pretty.
- **Playwright screenshots mid-hydration report a hydration mismatch** (`caret-color:
  transparent` injected by `screenshot()`); harmless, but a capture script should wait
  for `networkidle` before shooting if the console is being read.

## Found during the full audit (2026-09-05), not fixed there

The ranked backlog itself is `docs/audits/full-audit-2026-09-05.md` (47 findings +
34 LOW, four action buckets). Items below are the ones that need the human.

- **Supabase MCP cannot see the Hustlemania project.** The MCP's OAuth grant is scoped
  to the `Jam Taks Org` organisation (`fsbryklkgnhmmtzukfrh`), which holds only
  `pure-eq`. The `hustlemania` project (`zcdvuhcslwalhziinfqz`, us-west-1, created
  2026-09-05T13:29Z) lives in a second organisation (`tlfaqzgduptciyxbkwdf`). Until
  the plugin is re-authorised against that org, every hosted check in a session goes
  through the CLI (`npx supabase projects list`, `supabase link --project-ref
  zcdvuhcslwalhziinfqz`), and any MCP "list projects" result is not evidence about
  Hustlemania.
- **Hosted project state unverified from a session.** Migrations, "Allow new users to
  sign up" off, the redirect allow-list and the SMTP sender have never been read back
  from `zcdvuhcslwalhziinfqz`. `supabase link` + `migration list --linked` is the
  F10 step; the auth settings can be checked earlier.
- **Template residue in this repo's docs** (scaffold defect, recorded for the template
  in `docs/template-handoff-2026-09-05.md`): the template's own history was copied in
  by `gh repo create --template`. Removed from this file today (lines 133–319, three
  sections dated 2026-08-23..25). Still present and untouched: 13 template-era entries
  in `docs/FIX_LOG.md` (2026-08-23..25, including two that cite
  `scripts/hooks/test_shell_guard.py`, which is not in this repo) and 4 in
  `docs/DECISIONS.md` (from line 232). Decide whether they stay as inherited context or
  go the same way.

## Hustlemania — from eval-02 (F2, 2026-09-05), all P2

- ~~**Close dialog stays mounted under the result screen**~~ `CloseFlow` renders either
  the dialog or the result screen since the F5 rewrite; re-checked in F7.
- ~~**Most-damaging / most-useful radio only appears at ≥2 selections**~~ The hurt /
  helped questions and their radios were dropped in F7.
- ~~**Duplicate ids in `p_cue_ids` / `p_hurt` are silently de-duplicated** rather than
  rejected.~~ `close_day` rejects a repeated item with `duplicate_item` since F7 (0010);
  `start_sprint` still de-duplicates `p_cue_ids` / `p_impediment_ids`.

## Hustlemania — from eval-03 (F4, 2026-09-05), all P2

- **SPEC.md carries "As built" narratives** (F1–F4) inside the file the evaluator must
  read, so build choices reach an evaluation meant to be independent of them. Process
  point: move the as-built sections to a separate doc, or have the evaluator read only
  the criteria lines. `docs/SPEC.md`.
- **No upper bound on task text**: a 5,000-character task is accepted and rendered in
  full into the done-mark and remove `aria-label`s. Informational (the SPEC's
  "unlimited" is about row count); a `length(text) <= N` check would need a new
  migration. `supabase/migrations/0006_tasks.sql`, `components/today/TasksCard.tsx`.
- **Archived tasks remain writable on an open day** — a bulk update by `sprint_day_id`
  also flips archived rows. No UI path does this; decide the semantics with History /
  Insights (old F7 / F9 → F11 / F13).

## Found during F5 (2026-09-05), not fixed there

- **The streak must stop at the closure date once F10 (was F6) adds early completion.**
  `sprint_streak_at` walks every day with date ≤ today; after "Complete Sprint" on day 9
  the cancelled days 10–14 would read as missed and the streak as 0. F10 (was F6) owns this in the
  migration that adds the closure timestamp (DECISIONS, F5 entry).
- **A backfill offers the day's own items but not the day's own intention or tasks**:
  the dialog closes a missed day with Actual, hurt/helped and notes; the Intention and
  Tasks cards keep showing today's day. Reading a past day in full is the History view
  (old F7/F9 → F11/F13).
- **`sprint_invalid_reason` null-default bug is still open** — 0007 does not touch that
  function either.
- **A torn-down request leaves sibling loader rejections unhandled.** The area page and
  the sprints layout `Promise.all` loaders that throw on `.error`; when a request is
  abandoned mid-render (seen in the e2e teardown: the user deleted while a
  `router.refresh()` was in flight) the first rejection is handled and the rest surface
  as `unhandledRejection: permission denied` in the dev log. Harmless today; a
  `Promise.allSettled` at the two call sites, or a loader that returns `{ error }`, would
  make it quiet. `app/(app)/sprints/[area]/page.tsx`, `app/(app)/sprints/layout.tsx`.
- **`create or replace function` from a stale copy silently drops later additions.** 0007
  first rebuilt `sprint_days_immutable_after_close` from its 0001 text and lost the three
  snapshot columns 0004 had added; an existing test caught it (FIX_LOG). A lint that
  diffs a redefined function body against the last definition in an earlier migration
  would catch this before the suite runs.

## Found during F4 (2026-09-05), not fixed there

- **Optimistic task writes are lost if the user leaves the page before the request
  lands.** Seen in the Playwright trace: a remove issued 0.2 s before `page.reload()`
  ended with status −1 and the row came back. Same trait as the intention and mantra
  cards. A `beforeunload` guard while a save is pending, or a non-optimistic remove,
  would close it. `components/today/TasksCard.tsx`.
- **`sprint_invalid_reason` null-default bug is still open** — 0006 does not touch that
  function either.
- **Tasks have no reader yet beyond Today**: Insights (task completion vs result) and
  History arrive with old F7 / F9 (→ F11 / F13); `archived_at` rows are kept for them and filtered out of
  `loadTasks`.
- **Emptying a task's text and blurring restores the saved text silently** (the × is the
  remove). Intended, but there is no hint saying so.

## Found during F3 (2026-09-05), not fixed there

- **`sprint_invalid_reason` null-default bug is still open** — 0005 did not touch that
  function, so the `coalesce(…, false)` fix (below) waits for the next migration that
  does.
- **Hours-measurement plan editing is covered by the unit table and the DB suite only**;
  the e2e golden path edits a money plan. A second e2e sprint in hours would also cover
  the `h:mm` inputs end to end.
- **Wizard: switching Same → Custom → Same keeps the typed custom values** in memory and
  submits the same plan; switching back to Custom shows them again. Intended, but the
  chips give no sign the draft survived.
- **Harness, not app:** Chrome's window stayed at 1138 × 810 after `resize_window`
  reported success at 1280 × 900; `Page.captureScreenshot` timed out or returned a
  blank frame on the first attempt after most interactions and succeeded on retry.
  The shell guard also fails closed on a one-liner mixing `python -c` and nested quotes;
  scripts went to `$CLAUDE_JOB_DIR/tmp` and ran via stdin instead.

## Found during F2 (2026-09-05), not fixed there

- **`sprint_invalid_reason(sprint, kind, item)` is wrong when called with its null
  defaults** — `not (null and …)` is null and drops every row, so "is this sprint valid
  as it stands" would report `no_cues`. No caller passes null today (every caller names
  a kind and an item). The migration was already on disk when found and the write guard
  blocks editing it; fix with `coalesce(…, false)` in the next migration that touches
  the function.
- ~~**Scope filter semantics undefined in the SPEC**~~ Settled in F6 (2026-09-07): exact scope per chip. Was: the "Wealth" chip lists only
  `scope = wealth`, not `global + wealth`. Decide and write it into F2 or the library
  page copy.
- ~~**e2e covers the single-selection close only**~~ Superseded by F7: the golden path
  walks the observation groups, the response questions and the untouched-group case.
- **Harness, not app:** Claude in Chrome would not resize the window below desktop
  width (390×844 requested, 1280 kept), so the phone check rests on the Playwright phone
  project; `Page.captureScreenshot` timed out on most first attempts after an
  interaction and succeeded on retry. The evaluator's shell allowlist also lacks `kill`,
  so its `next dev` on :3000 had to be stopped by the main session.

## Hustlemania — from eval-01 (F1, 2026-09-05), all P2

- **Wizard step 4: clicking the confirmation label text does not toggle** — the box is a
  `<span role="checkbox">` inside a `<label>` with no control; only the 18px square
  responds. `components/NewSprintWizard.tsx`.
- **Close dialog: primary stays enabled for a fractional actual** (`1.5`); native
  `step=1` stops submission, not the SPEC's hint-beside-disabled-primary pattern.
  `components/today/CloseCard.tsx`.
- **Login echoes the email in the redirect URL** (`/login?sent=1&email=…`) — PII in
  browser history and server logs. Move to a cookie or a POST-rendered state.
  `app/login/actions.ts`.
- **Implicit-flow magic links fail at the callback** (`#access_token=` fragment, no PKCE
  verifier). App-requested links work; a dashboard "Send magic link" would not. Handle
  the fragment client-side or document that sign-in starts at `/login`.
  `app/auth/callback/route.ts`.
- **`supabase/config.toml` reads contradictory**: `[auth] enable_signup = false` with
  `[auth.email] enable_signup = true`. Behaviour is right (the email toggle is the
  provider switch; turning it off disables email login entirely, found 2026-09-05) —
  add the comment.
- **No write path yet to archive a vision** (`archived_at` not grantable by design);
  arrives with "Replace & archive" — note when that feature is specified.
- **Harness, not app:** the evaluator's shell allowlist blocks `cut`, `sed`, `cd`,
  `docker`, and any command containing `<`/`>`; the auto-mode classifier blocked
  `npx supabase status -o env`. It worked around them with Node scripts. Consider
  allowlisting `docker exec … psql` for DB inspection.


## Deferred at the 2026-09-06 re-baseline (`docs/RECONCILIATION-2026-09-06.md`)

- **Data export** (was F10 "Export my data"; Part 1 requirement withdrawn by the user).
  When it returns: handler order, Zod schema equal to `information_schema`'s user-owned
  table list, two-user leak test.
- **Task completion vs result insight** (SPEC v1 F7): a fifth card over F4 task data.
- **Mental rehearsal prompt** after saving a cue or impediment (docx, one sentence).
- **Night-mode tokens**: the v8 handoff has no dark palette; Claude derives one from
  Dusk inside the F8 interview and the user approves it there (2026-09-06).
- **Lake / Meadow / Sand palettes** and a palette switcher: prototype knobs, not taken.
