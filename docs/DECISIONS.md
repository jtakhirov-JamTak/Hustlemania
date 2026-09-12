# DECISIONS

(Important decisions, approved exceptions, RCA notes. Date each entry.
Inclusion test: record it only if a future session would reasonably ask
"why did we do this?" — otherwise don't.)

---

## 2026-09-11 — F15 situations: the response is the item, situations hang off it

`/interview` in feature mode, escalated to DESIGN → SPECIFY because the change rewrites the
entity model F2, F6, F7, F10 and F11 are built on (Part 1 untouched). Two approvals: the
direction, then the spec. Nine calls, the user's:

1. **Situations are reusable library entities, one list per kind.** Not a free-text field
   on the item (cannot be asked about at the close) and not one shared library ("why would
   an impediment be the same as an execution cue?").
2. **Impediment = WHEN (its name) → INTERFERES → THEN → RECOVERED WHEN → situations; cue =
   WHEN → REMIND → situations.** The SITUATION field goes; WHEN carries the identity.
3. **1–3 impediments, 0–3 cues; every member ≥1 situation; Highest kept (auto when one);
   focus required only while the sprint has cues.** The user: "you only require one
   impediment per sprint; you don't even require a cue."
4. **The close asks per impediment "did it show up", which situations, and "recovered?"
   per ticked situation (blank allowed); per cue "used" and which situations.** The
   response-ran and cost questions are dropped — recovery is the one answer that matters.
5. **Per-item cards adapted and a per-situation breakdown now**, not later.
6. **Owner's clean restart, others converted.** First "you can delete my existing data";
   at the direction gate "others have data; delete only mine". So the migration converts
   every user's rows in place and deletes nothing; `scripts/delete-user-rows.sql` is a
   per-user script the owner runs by hand after a fresh dump.
7. **Editor is the primary screen; both viewports, desktop-first; existing mockups
   extended in-stack.**
8. **Rule 6 on every sprint impediment** (recommended, accepted): the close asks
   "recovered?" for every one, so every one needs a written criterion. Enforced at
   `start_sprint` / `add_sprint_item`; the validity check stays Highest-only so a legacy
   sprint with an unfinished non-highest is never locked out of archive / scope.
9. Direction: one `situations` table with `kind` plus two join tables with a composite FK
   (a cue situation on an impediment impossible at DDL level); `name` carries WHEN and
   `proof_when` is dropped; a situation observation row per offered situation.

Three structural decisions inside the build:

- **The six legacy day columns stay** (`proof_when/then/recover`, `response`, `recovered`,
  `impact`): never written again, out of `sprint_days_effective`, still locked by the 0012
  trigger. Global rule: data with history value is not deleted. BACKLOG: drop them once
  no hosted row carries a value.
- **A converted situation keeps its item's id.** One uuid in two tables is harmless, and it
  makes the conversion traceable with no mapping table: `situation_id = impediment_id`.
- **The conversion runs with the old triggers in place**, disabling only the observation
  rows' immutability trigger for the one snapshot copy — the smoke test found that the
  copy tripped `day_closed`, which is exactly what the trigger is for.

**Rejected.** A shared situation library. One free-text "applies when" field (the no-build
option: gives the grouping, not decisions 4–5). Per-situation response-ran and cost
questions. Keeping 1–5 impediments. Dropping the Highest and the focus (postmortem
verdict, kit promote and the Today card hang off them). A `clean_restart_required` guard
that refuses existing rows (friends have rows). A group-level None / Unsure pill (each
item answers for itself now).

**Re-open if** a user asks for a situation to belong to both libraries, or the phone close
proves too long in practice (then a "None showed up" shortcut is the first thing to add).

---

## 2026-09-10 — F14 pre-release: GitHub → Vercel, vercel.app origin, Pro backups, owner only, no Lighthouse

Feature-mode `/interview` for F14. Eight calls, the user's unless noted:

1. **Vercel through the GitHub integration**, not the CLI. No install, no interactive
   login on this machine, previews for free. The cost accepted: the project import and
   the environment variables are dashboard steps the agent cannot drive.
2. **`*.vercel.app` origin now.** A custom domain later means rotating `site_url`, the
   redirect allow-list, the Vault `reminders_url` and the PWA install; accepted.
3. **Supabase managed daily backups** for the restore runbook. The user states the
   `hustlemania` organisation is on Pro (7-day retention per
   `supabase.com/docs/guides/platform/backups`, read 2026-09-10); not verifiable from
   this clone — the CLI's org listing carries no plan. Free would have meant `db dump`.
   **Revised an hour later on evidence:** the project runs Postgres 17.6, and the same
   page says projects on 15.8.1.079 and newer use physical backups that "are not
   available for direct download". No dashboard file exists to drill from. The user
   chose **CLI dumps + Pro in place**: weekly `supabase db dump --linked` files
   (`--schema auth,public --data-only`, kept outside the repo — they carry emails) are
   the drill's source and the total-loss cover; Pro daily backups remain the
   restore-in-place layer. Rejected: PITR (also in place, no file, paid add-on).
4. **Owner only signs in.** SPEC F14's "first invitee" line moves to F12, which owns
   the invite flow and is postponed past launch (2026-09-10 entry below).
5. **Install check = automated manifest test + Chrome install**, agent's
   recommendation. Chrome's own docs mark Lighthouse PWA testing deprecated
   (`developer.chrome.com/docs/lighthouse/pwa`, read 2026-09-10), so "Lighthouse
   installable passes" had become a check that cannot fail. Rejected: keeping the
   wording (measures nothing) · a Chrome-only check (nothing guards a regression).
6. **Reminders go live inside F14, proven by one received email.** Rejected:
   configured-but-unproven (acceptance would stop at a 200 with zero due users) · after
   F14 (no reminders at launch).
7. **Hosted auth settings as code**: `[remotes.production]` in `supabase/config.toml`
   overriding `auth.site_url`, `additional_redirect_urls` and `enable_signup`, applied
   by `supabase config push` after link. The remotes syntax is documented
   (`supabase.com/docs/guides/local-development/cli/config`, read 2026-09-10); that
   `config push` honours it for auth is confirmed by the magic link itself in the F14
   sequence, with the dashboard as fallback.
8. **The production gate opens at the owner's account**, agent's reading of CLAUDE.md:
   link, push and config push run against a project with zero users; from the moment
   the owner exists every hosted write is shown and confirmed.

**Deleted from F14 on the pass:** building the manifest (already there since F8);
custom domain; invitee; CI (BACKLOG); PITR; an error sink. **Kept because the outcome
needs it:** the restore drill (global rule for an app with real users), the reminder
proof, the migration to hosted.

**Overtaken during the build, same day.** Call 2 (vercel.app origin): the user bought
`hustlemania.app` for the Resend sender and moved the app onto it while nothing was
installed — the cheapest moment. Call 4 (owner only): the user announced ten friends
signing up that day; Supabase's built-in email refuses non-team addresses
(`supabase.com/docs/guides/auth/auth-smtp`), so auth email now goes through Resend as
config (`[remotes.production.auth.email.smtp]`, key via `env(RESEND_API_KEY)` from
`.env` at push time) and the accounts are seeded from the dashboard until F12. Call 7
held, with one defect on the way (FIX_LOG 2026-09-10: `auth.email.enable_signup` is
the provider switch). `config push` also carried three local test values into
production on the first push (`max_frequency` 1s, `otp_length` 6, confirmations off);
the remotes block now pins the production values, so every future push keeps them.

**Re-open if** Supabase makes physical backups downloadable (then the dashboard file
becomes the drill's source and the weekly dump can go), or `config push` does not
apply the auth overrides (then the dashboard, and the block stays as documentation).

---

## 2026-09-10 — F13 reminder: pg_cron inside the database, a fixed 20:00, Resend from the user's domain

**Decision.** F13 interviewed in feature mode (`docs/SPEC.md` F13) and approved at the
feature gate 2026-09-10; built in the same session. Four calls settled in the interview:

1. **The scheduler is pg_cron + pg_net in the database, hourly at :05.** The v1 SPEC
   assumed "Vercel Cron hourly"; Vercel's docs (`/docs/cron-jobs/usage-and-pricing`, read
   2026-09-10) limit Hobby to **once per day with ±59 min drift**, and a per-hour
   expression fails deployment. Rejected: GitHub Actions schedules (free and hourly, but
   documented to delay and sometimes skip runs under load — a skipped hour is a missed
   evening) and a daily Vercel cron at a fixed UTC time (20:00 Pacific would land anywhere
   in 19:00–21:59 across DST and the drift; no per-user hour possible). pg_cron runs to the
   minute, costs nothing, and adds no vendor; the price is two extensions on the hosted
   project and two Vault secrets the operator creates once (`docs/RUNBOOK_REMINDERS.md`).
   The job reads the URL and bearer from Vault and selects zero rows until both exist,
   so 0018 holds no secret and the local stack runs the job harmlessly.
2. **20:00 in the sprint's zone, no chooser, no off switch.** There is no settings screen
   to hang it on; both go to BACKLOG together with an unsubscribe link.
3. **Resend from the user's own verified domain.** Resend delivers nothing without one;
   the domain records are the user's step, outside the app.
4. **One email per user, `Area · Day N` per open sprint.** Area is a fixed label
   (Health / Wealth / Relationships), so the SPEC's "nothing beyond the day number" is
   widened by exactly that word.

**Shape.** Three `service_role`-only definer functions — `reminders_due(p_now)` (read-only;
the clock is a parameter, as with `sprint_streak_at`), `reminders_claim(ids)` and
`reminders_mark(ids, error)` — and the app's first non-auth route handler,
`POST /api/cron/reminders`, gated by a constant-time bearer compare. Claim before send,
so a second pass in the same window sends nothing; a failed send keeps the row unsent
with the provider's error and is retried the next hour, three attempts at most, the
in-flight window being ten minutes on `updated_at`. Outside production an unset
`RESEND_API_KEY` means the log transport (nothing leaves the machine); in production it
is a 503 that claims nothing — the route never quietly logs instead of mailing. The
service-role client lives in `lib/supabase/admin.ts` behind `server-only`.

**Falsifiability.** Six TypeScript mutations (any bearer accepted · unset secret treated
as open · production falling back to the log transport · the outcome leaking into the
email · the claim result ignored · a failed send marked sent), seven live DB mutations
(`reminders_due` granted to `authenticated` · `reminder_log` SELECT granted · RLS off ·
due from 19:00 · a sent reminder ignored · claim retrying inside the window · the job
unscheduled) and the route's 401 branch removed under the e2e each turned a named test
red and were restored (files byte-identical; privileges, function bodies and the job
re-probed). A side effect worth knowing: with pg_cron now installed, the rule-12 /
rule-16 `cron.job` guards in `targets.test.ts` and `tasks.test.ts` run for real instead
of early-returning.

**Re-open if** a user asks for a different hour or to switch reminders off (the chooser),
or the hosted `postgres` role turns out unable to `create extension pg_cron` — then the
extension is enabled from the dashboard and 0018's remaining statements run as-is.

---

## 2026-09-10 — F12 Circles postponed past launch; F13 and F14 proceed

At the F12 feature interview the user asked how many sessions remained (4–6 with
Circles, 3–5 without) and what deferring it would cost once real users exist. **Chosen:
skip F12, build F13 and F14, release, then Circles.** Deferral is cheap because F12 is
additive: three new tables, one default-false `shared` column on `sprint_impediments`,
reads through a new definer function, existing policies untouched, sharing opt-in so
nothing is exposed retroactively. What it costs later: the migration and a `profiles`
backfill each stop at the production gate, an RLS hole would leak real rows rather than
seed rows, and onboarding is manual dashboard invites in the meantime (<10 users).
Estimated extra cost of adding it later: about half a session. The one part that gets
harder to reverse after launch is the navigation placement (a fourth top tab changes the
header every user has learned); left open. **Re-open if** manual invites become a chore
or a user asks for the group view.

---

## 2026-09-09 — Full review of F6–F11: the verdict follows the current highest, recovery votes at the card's bar, and a membership window stays a row

**Context.** `/review-changes` on `9cd1325` (F11) found two HIGH and two MEDIUM; the user
asked for those fixed and for a `/full-review` of everything since the 2026-09-05 audit
(`db40dee..HEAD`) first. Nine reviewers ran (adversarial, correctness, security, mobile,
a11y, performance, privacy, simplification, architecture); the consolidated report is
`docs/audits/full-review-2026-09-09.md`. Two CRITICALs surfaced that the F10 evaluator and
its 34 completion tests had not: both turned a normal mid-sprint action into an Area that
could never start another sprint. Both were reproduced live before any code changed.

**Decisions.**
- **The verdict is about the current highest, not every impediment that was ever highest.**
  0016 keys `finish_review`'s predicate to `sprint_impediments.is_highest` with the
  follow-through function's own join, matching the SPEC's singular wording and the UI. The
  alternative — every past highest gets a follow-through row and a verdict is asked when
  any occurred — shows more of the user's answers but asks one verdict about two proof
  points; rejected for now and recorded in BACKLOG. Revisit if a user asks where a
  promoted-away impediment's answers went.
- **A membership window is a row; readers collapse to one row per item.** Re-opening the
  removed row on re-add would have erased the window the postmortem lists ("dropped on day
  3"), so `add_sprint_item` still inserts and `finish_review`, the two per-item insight
  functions and `loadSprintMembers` dedupe instead.
- **Recovery votes only where the card shows a rate.** The row has no `recovered = 'yes'`
  count below n≥3 and the SQL's rate includes unsure-response days; voting from the
  with/without buckets at 2 contradicted the tail. Adding a column would have been a
  drop-and-create of a definer function for a two-day vote; not worth it.
- **Touch targets follow the pointer, not only the width.** The 44px block applies under
  `(max-width: 940px), (pointer: coarse)`.
- **No evaluator run for 0016.** It re-creates three existing definer functions with the
  same ownership checks and grants (`create or replace` keeps the ACL; `grants.test.ts`
  pins it), the shape 0014 and 0015 already took without a trigger. The hosted project has
  still never been migrated (2026-09-05), so no production row is touched.

**Numbers.** Unit 114 → 121; DB 270 → 274 (`completion.test.ts` 34 → 38); e2e 10 unchanged.
Seven live mutations (three SQL, four TS) each turned a named test red and were restored —
the first SQL round reported green because the applier had crashed, which is exactly the
check-that-cannot-fail trap; it was rerun after the applier was fixed.

**Second pass (same day): the user chose to fix every open HIGH and MEDIUM (#5–#29).**
- **Cross-sprint reads are one request per card, and the SPEC's "no new SQL" is amended.**
  0017 adds `sprint_totals` (a `security_invoker` view, one row per sprint) and five
  `*_many(uuid[])` SQL wrappers that `lateral`-call the existing definer functions. Chosen
  over a `.limit()` with a truncation note because the numbers were silently wrong, not
  slow, and over new cross-sprint definer SQL because the wrappers add no authorization
  logic: the per-sprint ownership check still runs inside each call, and the grants pin
  lists the five names. Not treated as an evaluator trigger for that reason (`CLAUDE.md`
  triggers: auth, RLS, money, data-transforming migration — none apply); recorded here so
  the next reader can disagree.
- **Rule 26 exempts a sprint that never closed a day** rather than letting a review carry
  an empty lesson (`reviews.lesson` keeps its CHECK) or auto-writing a review: a record of
  a sprint that never ran is the fabrication the finding objected to. The sidebar reads
  "Never ran"; the postmortem stays writable.
- **A removed member defaults to `drop`** in both the DB fill and the postmortem's rows.
- **The device date is read after mount** (`useDeviceToday`) and the wizard reads it again
  at submit; no server-side date is threaded through, since the server's zone is not the
  device's.
- **`--divider` contrast stays as designed** (BACKLOG): raising it restyles every divider.
- **Verify.** Unit 130, DB 277 (`completion.test.ts` 39, `insights.test.ts` 14, five
  wrapper names pinned in `grants.test.ts`), e2e 10 on desktop + phone (two selectors
  updated: the Vision sidebar is now a landmark named "Vision", and the phone sidebar's
  sub line is clipped off screen rather than `display:none`). Mutations: the view without
  its target filter, 0012's `start_sprint`, 0016's `finish_review`, a revoked wrapper
  grant, the context filter, the redirect regex and `attainmentPct` each turned a named
  test red. Chrome at desktop width in Dusk: the wizard (step counter, device-date start
  chips), Across, a postmortem, the Journal with its rail and the armed End-sprint copy,
  the Vision overview; the phone viewport rests on the Playwright phone project.

**Decision.** F11 interviewed in feature mode (`docs/SPEC.md` F11) and approved at the
feature gate 2026-09-09; built in the same session. Eight calls settled in the interview:

1. **One aggregate row per item with a recurring note** — the v8 card shape — rather than
   C5's "each sprint's own comparison listed" under every row.
2. **The two bars come from the most recent sprint that clears n≥3**, named in the sub.
   With no qualifying sprint the row still renders, the tail reads `Not enough data` and
   **the `from` attribution is absent**: it exists to say where the bars came from.
3. **The cross-sprint numbers are F10's per-sprint functions fanned out** over each
   finished sprint and grouped in TypeScript (`lib/across.ts`). No new SQL.
4. **Version splits the response cards only** — item + the sprint's proof tuple. Impediment
   impact and cue usefulness group by item: a renamed obstacle is the same obstacle.
5. **Area is part of the key**, so a global item used in two areas is two rows on All areas.
6. **The Suggested kit is deterministic sentences** off the ranked rows, never from a row
   whose sample is short.
7. **0 finished sprints keeps the placeholder, 1 gets real cards, recurring notes need 2.**
8. **`/insights` stays a stable destination** — it never redirects to a pending postmortem.

**Why the fan-out and not four cross-sprint SQL functions.** The v1 acceptance line asked
for "a pure SQL view or function with a fixture test", which pointed at new SQL. It was
rejected for two reasons. The calculation would then exist twice, so the Reviews card and
the Across card could silently disagree about the same sprint — and the postmortem is the
record, so a disagreement there is the one defect this page must not have. And four new
SECURITY DEFINER functions are four new authorization surfaces; F10's eval already found a
PUBLIC execute grant on ten of them. Fanning out costs N reads (single digits for years at
14 days a sprint) and buys agreement by construction plus an evaluator trigger avoided.

**Why a row quotes one sprint instead of pooling.** The artboard's own cross mode pools
every in-scope day into one comparison. Pooling days across sprints with different goals
and measurements produces a median that no postmortem can confirm and that rule 25 forbids
in spirit. So the bars are one sprint's real comparison and the only figure spanning
sprints is the recurring note, which counts sprints, never days. This is a deliberate
departure from a REQUIREMENT-level reference and is recorded as such in the SPEC entry.

**Rejected.** Pooled bars (the artboard's own behaviour). Per-sprint sub-rows under every
item (C5 as written) — the user chose the card shape. A median of per-sprint medians. New
cross-sprint SQL. A "start a sprint with this kit" action on the page. A link from each row
to the sprint it quotes. `/insights` deep-linking to a pending postmortem. Threading a
scope through `loadReviewStats`, whose other two numbers this page does not show.

**Two SPEC criteria were corrected during the build**, both recorded inline in the entry
rather than quietly diverged from: the recurring note's tri-state vote counts each card's
own denominator (`yes|no|partially` for follow-through per 0015) instead of `yes + no`, so
the note cannot disagree with the rate the card displays; and the header's evidence line is
counted inside `loadAcross` rather than by giving `loadReviewStats` a scope parameter.

**A mutation that survived, and what it exposed.** "The qualifying-sprint pick returns the
oldest instead of the newest" left the test named for it green: that fixture had only one
qualifying sprint, so `find(enough)` reaches it from either end. The mutation is caught by
the two-qualifying-sprints test instead, and a seventh mutation — the pick ignoring
`enough` altogether — was added for the test the first one was mis-paired with. Both tests
are now load-bearing, and each of the seven mutations is pinned to a test it actually
turns red.

**Numbers.** No migration; DB suite unchanged at 270. Unit 84 → 110 (`across.test.ts` 26).
Seven live mutations each turned a named test red and were restored from disk.

**Deferred to BACKLOG.** Splitting a version *inside* one sprint (the SQL reports
`max(proof_then)` per sprint, so a mid-sprint response rewrite collapses into one row with
counts spanning both texts) · the shared card's 170px bar-label column truncating
"recovered with the response" at a 777px workspace, which predates F11.

---

## 2026-09-08 — F10 sprint completion: a passed window is finished by hand, the kit is the review rows, the postmortem lives on Insights

**Decision.** F10 interviewed in feature mode (`docs/SPEC.md` F10) and approved at the
feature gate 2026-09-08; the user chose to build in the same session. Eight calls settled
in the interview:

1. **A passed window does not close itself.** After day 14 the sprint stays `active` and
   the Today slot offers **Finish the sprint** (`finish_sprint`, which lands on
   `completed` or the new `ended` status). Rejected: a settle function that closes any
   overdue sprint on the next page load.
2. **The wizard takes the kit pre-fill only.** The v8 800px dialog restyle is deferred to
   its own entry (BACKLOG), reversing the F9 note that said it would ride with F10.
3. **The postmortem lives at `/insights/reviews/[sprintId]`** with a minimal Insights
   sidebar; `/insights` keeps its placeholder and F11 builds Across sprints.
4. **A finished sprint shows the gate card, not a read-only journal.** The record is read
   in the postmortem.
5. **Carry-forward defaults to Keep.** Finish review requires the lesson, the vision
   answer and — only when it applies — the proof-point verdict.
6. **No verdict is asked when the highest impediment never occurred** on a logged day;
   `finish_review` raises `verdict_not_applicable` if one is sent anyway.
7. **The closure day's own open day is cancelled** with the future ones, so ending a
   sprint at 3pm does not book today as missed. A day already closed keeps its close.
8. **End sprint early works before day 1** and cancels all 14.

Three structural decisions inside the build:

- **There is no kit table.** The Area kit is the last completed review's
  `review_decisions` rows plus its lesson, read back per Area and filtered for archived
  items (rule 24). A stored kit would be a second copy that drifts from the review that
  wrote it.
- **The `review` sprint status is dropped and `ended` added.** The gate is "finished and
  unreviewed", which is a fact about the `reviews` table, not a status. `ended` names a
  window that ran out under the goal, which the old five values could not express.
- **One view, `sprint_days_effective`, is the only day source for the five
  calculations**, pinned by a `pg_get_functiondef` scan. Note that a cancelled day can
  never be a closed day (the CHECK forbids it), so the view's `not cancelled` is
  belt-and-braces; the load-bearing filters are its `target > 0` and the streak's own
  `not cancelled`, and those are the ones the live mutations break.

**Why.** PRD §9 says backfill is available "while the Sprint remains open", so something
has to decide when a sprint stops being open; a page load is the wrong place for a
mutation, and an explicit button keeps the UI and the DB agreeing on one definition.
F10 already carried two user-data tables, five SQL calculations, a new screen and the
gate — adding the wizard restyle was the scope risk the F9 entry had warned about in the
other direction.

**Rejected.** Automatic closure on page load. A read-only journal beside the postmortem.
Requiring a decision on every carry-forward row. A stored kit table. Keeping `review` as
a status. Attributing the day's `impact` answer to every impediment row (it is the answer
about the highest, and 0014 confines it there).

**Numbers.** DB 224 → 268 (`completion.test.ts` 34, `insights.test.ts` 10); unit 64 → 80
(`insightCards.test.ts` 16); e2e 8 → 10 on desktop + phone. Seven live mutations each
turned a named test red and were restored from disk; the two new tables each carry an
in-suite RLS disable/enable check. `npm run verify` green: hooks 60/21/23 + 6/5, unit 80,
DB 268, e2e 10.

**Three migrations, not one.** 0012 was already applied when two of its defects surfaced,
so 0013 (the PUBLIC execute grant, FIX_LOG) and 0014 (three calculation errors) are
forward-only corrections rather than edits. The write guard blocks editing an applied
migration, which is the rule that produced this shape.

**Departures from the artboard, recorded in the SPEC entry.** The Finish-the-sprint card
for a window that ran out · the `ended` status · the Day-by-day block with tasks (the
BACKLOG item that closed a closed day's tasks being unreadable) · the gate card's result
meta line · "No verdict is asked" when the highest never occurred.

---

## 2026-09-08 — F9 vision v2: step 1 unlocks sprints, edits are in place, the wizard keeps its look until F10

**Decision.** F9 interviewed in feature mode (`docs/SPEC.md` F9). One vision for the
account, three annual steps. The vision row alone (text, deadline, proof) satisfies
rule 2 — `start_sprint` checks for an active vision and nothing about the obstacle or
rule; the overview's `n of 3` is the nudge to finish. Edit updates the active row in
place; Replace is the only archive point and `vision_reviews` (verdict + optional
evidence note, one row per review, no update or delete path) is the dated record. The
New Sprint wizard changes logic and classes only — the single vision in step 1, gating
on "an active sprint already here", the alignment copy, inline styles to classes so the
`[data-cols]` phone override leaves `globals.css` — and the v8 dialog restyle rides
with F10, which rewrites step 4 for the kit pre-fill anyway. Deadline must be a future
date. Replace is allowed while a sprint runs (the sprint keeps its `vision_id`). The
collapse migration keeps the most recently updated active vision per user and archives
the rest. All vision writes go through SECURITY DEFINER functions (`save_vision`,
`set_vision_obstacle`, `set_vision_rule`, `replace_vision`, `review_vision`); the direct
INSERT and UPDATE grants on `visions` are revoked. Approved at the feature gate
2026-09-08; the user chose a fresh session for the build.

**Why.** The README's own step-1 hint says the vision unlocks every sprint, and
requiring all three steps before the first sprint is the friction failure condition #1
warns about. In-place edits keep one `vision_id` per sprint and avoid a lineage column
for a once-a-year action; the review table already preserves what changed and when.
The wizard rewrite in the same feature as a data-transforming migration and three new
screens was the scope risk; F10 touches step 4 regardless. No user data exists yet
(local stack starts blank, hosted project never migrated), so the collapse rule is
chosen for correctness in principle and pinned by a test, not for any real rows.

**Rejected.** Requiring obstacle and rule before the first sprint. A version row per
text edit (lineage column, "previous visions" filling with edits, "Sprints behind this
vision" following a chain). The full v8 wizard restyle inside F9. A required review
note (friction on a once-a-year action). Verdict-only reviews (the draft's dated
evidence would be lost). Extending the F6 proof trigger to forbid blanking the vision's
obstacle rule from the library — the README draws the empty Guiding rule card, and the
card's Add path restores it.

**Mockup.** `app/mockup/vision/` — a thin page in the stack, hardcoded data, the real
Dusk / Night toggle; views step 1 (empty and error), 2, 3, overview (review card
open, Replace armed, previous visions unfolded, 1 of 3), loading. Captured with
Playwright at 1440 and 390 in both palettes, zero horizontal overflow in all sixteen
captures. Approved at the gate; moved to `docs/mockups/f9-vision/` with four
screenshots. Additions the artboard does not draw: the deadline field, the two
optional prompts on step 1, the review note, the "days to the deadline" line, the
previous-vision meta line.

**Numbers (2026-09-08T03:38Z).** Cycle 3h22m from the interview's start, one human
stop (the fresh-session handoff). DB 224 (was 204; the F9 file adds 20 across three
describes), unit 64 (TwoTap adds 4), e2e 8 unchanged in count but the golden path now
walks the three steps, the review and Replace's two-tap. Four live function mutations
red then restored. eval-05: no P0/P1, two P2 fixed before green. Build-time calls, all
inside the entry: `save_vision` upserts on the partial unique index (one statement,
race-free, `created_at` kept); the deadline stays compared with the database's date
(UTC) as specified, and the date input's `min` is the later of local tomorrow and UTC
tomorrow so the first offered date is never refused (eval-05 P2-1); `set_vision_obstacle`
requires an explicit `null` id when a name is given (no default, exactly-one rule);
`archive_item` / `set_item_scope` raise `vision_obstacle` rather than returning a
`failing` row, so the library page shows the copy through `friendlyError`; the seed
helper for past-dated sprints keeps a service-role insert (area-less, reusing the
user's active vision) because `save_vision` takes identity from `auth.uid()`; the
Vision index lives in a route group (`(overview)`) so its `loading.tsx` does not cover
the library pages.

---

## 2026-09-07 — F8 journal restyle: night mode is a cookie, closes end on the card, past rows stay one line

**Decision.** F8 interviewed in feature mode (`docs/SPEC.md` F8). Night mode is a
per-device `theme` cookie read by the root layout and rendered as `data-theme` on
`<html>` — no migration, no flash, no system preference; the switch is a two-state
Dusk / Night control in the header. An inline close on the Today card ends on the
Closed card with "Set up tomorrow"; the modal's result screen (78px, strip, streak
rows) is backfill-only. Closed past rows are one line; a closed day's tasks are read in
the sprint review (F10 input, BACKLOG). "Set up tomorrow" lists items answered No or
left untouched, never the highest or the focus cue. The Sprints sidebar drops the
streak line (it lives in the rail and the progress block). The phone timeline keeps the
rule and dots with a 72px label column and a short date. Primary action on the
screen: planning today.

**Night tokens** (derived from Dusk; no dark palette exists in the v8 handoff): page
`#131320`, wash `#181828 → #131320`, panel `#1c1c2c`, ink `#ecebf7`, accent
`#8f8ff2`, accent-ink `#b3b3f8`, met `#5cc48a`, under `#ef7a6f`, derived ratios
unchanged (divider 13%, muted 62%, faint 6%). White on the night accent fails AA
(2.9:1), so a new `--on-accent` token carries text on accent fills: `#fff` in Dusk
(5.4:1), `#131320` at night (6.5:1). Every other pairing is ≥5.9:1 (script in the
session; ratios listed in the SPEC entry).

**Why.** A DB-backed theme would be F8's only migration and the only evaluator trigger,
for a preference that is about the device's light, not the account. The README's
closed card already carries the result and the summary; a second result screen is a
tap for nothing. One-line rows are the artboard; the full record of a day belongs
to the postmortem, which the user chose over a per-row detail block.

**Rejected.** Dusk / Night / System (a first-visit look the user did not choose;
a third state to test). localStorage (flash or a blocking script). Expandable
closed-row detail (postmortem instead). Showing or editing tomorrow's pre-planned
intention on its row. The 64px poster title on the empty-area card (wraps at our
copy length; 30px kept).

**Mockup.** `app/mockup/journal/` — a thin page in the stack, hardcoded Day 9, Dusk
and Night, planning / reviewing / closed, desktop 1440 / 1100 / phone 390. Approved
at the feature gate; moved to `docs/mockups/f8-journal/` with two screenshots.

**Numbers (2026-09-08T00:05Z).** Built in the same session as the interview, one approval (the
gate). Nine Today components became six journal components plus one shared question
set (`DayQuestions`, used by the Today card and the backfill modal); no inline
`style` left in `components/today/`. Unit 54 → 60 (daySummary), DB 204 unchanged (no
migration), e2e 8 rewritten: the golden path walks the inline close, asserts the
summary line and "Set up tomorrow", and round-trips the night cookie. Verify green.
Four live mutations each turned a named test red (unit ×3, the theme action → the
desktop e2e's night step). Chrome desktop check in both palettes; the phone capture
found the brand overlapping the Sprints tab beside the new toggle — on a phone the
brand is now its dot (≤480px). One environment flake in BACKLOG (`JWT issued at
future`). Cycle time 0h54m, human stops 0.

**Build notes.** `[data-cols]` keeps its phone override until F9 rewrites the wizard;
folds and "Set up tomorrow" are page state, gone on reload; a closed day's tasks
are read in F10's postmortem (BACKLOG).

---

## 2026-09-07 — F7 day observations: answers replace judgments, the focus cue is required, the local stack starts blank

**Decision.** Day Close records what happened (per-item occurred / used on a yes / no /
unsure / unanswered scale; for the Highest: response yes / no / partially / unsure,
recovered, optional impact) in two new immutable tables plus four columns on the day
row, and `day_impediment_hurt` / `day_cue_helped` are dropped. In-session calls at the
F7 interview: the response is asked only when the Highest occurred (README flow; the
docx's preventive-use reading rejected — a THEN run before its WHEN is not the
response); response **and** recovery required whenever it occurred, impact optional,
the multi-pick groups never block (untouched = unanswered, stored as such); the
Highest's three answers live on `sprint_days` beside its snapshot, not on the
observation row; the focus cue is required, exactly one per sprint, picked or created
in the wizard (prefilled to the first pick) and moved from Today, enforced through
`sprint_invalid_reason` so remove / archive / scope refuse it like the highest; no
backfill of a focus onto existing sprints — the user chose to start blank, so 0010
raises `focus_backfill_required` on any active sprint and `legacy_selections_present`
on any legacy row, and the local stack was reset.

**Why.** F10 / F11 need denominators that distinguish "asked and answered no" from
"never asked" from "not applicable"; only stored tri-state rows give that. Requiring
recovery whenever the Highest occurred is what feeds the with-vs-without-response
comparison (D3b / C5); Unsure is one tap. Columns on the day row keep the postmortem's
"showed up on 4 logged days · response ran 2 of 3 answered" a single read.

**Numbers.** DB 203 (was 191; F7 adds 12 across three describes plus the pin markers),
unit 54, e2e 8 on desktop + phone; eight live mutations each turned its named test red
(unanswered fill, response_required, was_highest, the SELECT policy, the UPDATE
trigger, no_focus_cue, the partial unique index, the migration guard). Chrome desktop
check of the Today cue rows (FOCUS tag, Set as focus) and the close dialog's two steps
against the v8 artboard; the close from Chrome wrote the expected five rows.

**Departures from the artboard, recorded in the SPEC entry.** USE precedes OCCURRENCE
(the focus cue is asked first); Partially; recovery asked whenever the Highest showed;
the result screen unchanged (summary line with F8); the wizard focus radio and the
FOCUS tag on Today are not drawn.

---

## 2026-09-07 — SPEC review before F6: two reads, no P0, F6 amended, stubs annotated

**Decision.** Before building F6 the user asked for an end-to-end adversarial review of
the re-baselined SPEC. Two independent passes (the session's tie-out and a
`staff-reviewer` agent) are merged in `docs/audits/spec-review-2026-09-07.md` (24
findings, dispositions applied). F6 was amended: `start_sprint`'s inline-proof guard
fires on any of the three parts; `set_highest_impediment` coalesces per column; rule 22
raises only when a proof column changed; the two remaining 0004 trigger functions join
the pin list; the day-row snapshot of RECOVERED WHEN moves to F7 (which rewrites
`close_day` anyway); the cue column is `cue_when` (user's call over `trigger`, which
was verified to work in PL/pgSQL); scope chips filter on the exact scope. F7–F11 stubs
carry dated review notes; F10 absorbs the single-sprint calculations and F5's
closure/streak items; F8 sheds the Vision and Insights sidebars.

**Why.** The postmortem (F10) rendered cards whose calculations sat in F11; the focus
cue had no consumer; "version" had no definition; the renumbering had orphaned three
F5 follow-ups; the F5 stale-body failure mode applied to six redefinitions in F6, now
four. Version is the proof text tuple on the day snapshot, not a counter: both change
on every edit, and the tuple needs no column.

**Gate.** The amended F6 entry was approved 2026-09-07; the user chose to build it in a
fresh session rather than continue (one human stop on the F6 row).

**Not verified.** The hosted project (never migrated per the 2026-09-05 entry).

---

## 2026-09-07 — Enabling pass: the shell's styles are classes, Tailwind is gone, and "no visible change" is a pixel diff

**Decision.** Before the v8 redesign lands (SPEC F6–F9), the parts of the UI that survive
it — the app header, tabs, sidebar, section layouts, login, the in-app error page,
`Modal`, `ErrorBar`, `OptionRow`, `ProofInputs`, `ItemPicker`, `PlanGrid` — moved from
inline `style={{…}}` to classes in `app/globals.css`, and Tailwind was removed
(`tailwindcss`, `@tailwindcss/postcss`, `postcss.config.mjs`, the `@theme inline` block,
`h-full` / `min-h-full`). Tailwind's preflight is inlined at the top of `globals.css`,
verbatim, inside `@layer base`, so every unlayered rule keeps beating it exactly as
before; its two `--theme()` lookups resolve to the app's own font stack. The phone
overrides lost the `!important`s that only existed to beat inline styles; the two that
still target inline-styled components (`[data-hero]`, `[data-cols]`) keep theirs until
F8 rewrites those components.

**Why the scope stopped at the shell.** The inventory found 372 inline styles in 30
files; about 300 sit in components F6–F9 rewrite outright (Today cards, close flow,
library page, wizard, vision form). Moving them to classes first would be built twice.
The user chose "shell only + settle Tailwind" (RECONCILIATION-2026-09-06). Tailwind
went because two utilities do not carry a dependency and the v8 handoff is plain CSS.

**How "no visible change" was proven.** A temporary Playwright spec
(`e2e/_baseline.spec.ts`) seeds a fixed user (`baseline@test.local`, so the header
email is stable) and a day-3 sprint with two missed days, then captures 11 screens on
desktop and phone (login, login error, Today, close step 1, plan edit, empty area,
vision, both libraries, insights, wizard step 1) as full-page screenshots with
`maxDiffPixels: 0`. Baseline taken before any edit and shown to reproduce on an
unchanged tree (the first attempt was not stable: a per-run seeded email moved 466
pixels, then the mask over it moved 36 — the fixed email fixed both). After the
refactor all 22 snapshots matched. The check was then made to fail on purpose: one
class padding nudged from 22px to 23px turned the desktop and phone Today captures
red; restored, green again. The spec is deleted at the end of the pass because its
seeded dates are relative to today and the snapshots would drift by tomorrow.

**Rejected.** Keeping Tailwind for the preflight alone (the file is 220 lines, inlined
once). A screenshot check on `test-results/today-phone.png` by eye (the diff is exact
and covers eleven screens, not one). Moving the Today cards now (rewritten by F7/F8).

---

## 2026-09-06 — Audit remediation, phases 4–6: the phone floor, native dialogs, tests that can go red

Fix pass over `docs/audits/full-audit-2026-09-05.md` buckets A + B, phases 4–6 of 6
(mobile, accessibility, tests and consolidation), resumed on the user's "continue"
after the phase-3 stop. Verified by `npm run verify` (hooks 115, unit 54, DB 178,
e2e 8 on desktop + phone) and Playwright captures of the close dialog, result screen,
library and wizard on both viewports.

**Mobile.** `.input` and `.task-text` are 16px and no `<input>`/`<textarea>` carries an
inline size any more, so iOS Safari stops zooming on focus; the golden path now asserts
that no text field on Today, plan-edit inputs included, computes below 16px. The plan
grid is class-driven (`.plan-grid`, `.plan-cell`, `.plan-input`): seven columns above
480px, five below, cells free to shrink at ≤940px, the D-label and date stacked in a
cell on a phone so two-digit dates do not wrap. The sidebar becomes one scrolling row of
chips at ≤940px (`SideNav` moved from inline styles to `.side-*` classes so the
breakpoint can restyle it); the phone e2e still measures the aside at the viewport
width, and Today's target card now starts around 500 CSS px down instead of 800. Touch
targets: `.btn`, `.chip`, `.disclosure` get `min-height: 44px` at ≤940px; `.link-quiet`
and `.task-remove` become 44×44 inline-flex boxes; the 18px task checkbox keeps its
drawing and gains a 44px hit box through a `::after` overlay. The 9–10.5px labels on
the plan grid and day strip moved to 10.5–11.5px and the D-labels to `--accent-ink`.
The day strip centres the focus day in its own scroll box (a client effect that sets
`scrollLeft`, never the page). PWA surface: `app/manifest.ts` (served as
`/manifest.webmanifest`, already excluded from the proxy matcher), `app/icon.svg`,
`app/apple-icon.png`, `public/icon-192.png` / `icon-512.png` rendered from the SVG with
the project's own `sharp`, `viewport.themeColor` and `appleWebApp` metadata; a dev
probe confirmed every URL and head tag.

**Dialogs.** The three dialogs (item picker, close flow, result screen) are native
`<dialog>` elements behind `components/Modal.tsx`: `showModal()` traps focus and makes
the page inert, Escape and the browser's `close` both route to the dismiss handler,
focus returns to the opener on unmount, and the backdrop dismisses only when a pointer
both goes down and comes up on it (the old `onMouseDown` scrim fired after a scroll on
iOS). Body scroll is locked with `body:has(dialog[open])`, the dialog scrolls in its own
`.dialog-body` with `overscroll-behavior: contain`, and the footer stays out of the
scroll so the primary is not under the keyboard. The result screen focuses one block
holding "Day N closed", the actual and its verdict, so a screen reader hears them
together. Step changes in the wizard and the close flow focus the new heading.
Rejected on the way: a JS focus trap — the platform has one.

**Validation model.** A primary that is waiting on a hint is no longer `disabled`: it
keeps `aria-disabled`, stays in the Tab order, names the hint through
`aria-describedby`, and its click is a no-op until the hint clears; the hint is an
always-rendered `aria-live="polite"` span so the change is announced. Playwright's
`toBeDisabled` honours `aria-disabled`, so every existing assertion held. Chip groups
carry `aria-pressed` and a group label; the alignment checkbox is a real
`<input type="checkbox">` drawn as the option mark (`.check`), so the sentence toggles
it and Space works; single-select `OptionRow`s move and pick with the arrow keys inside
their radiogroup. Visible labels replaced placeholder-only fields (library add/edit,
inline create rows, mantra, picker create), placeholder contrast went from 40% to 55%,
`--muted` from 0.62 to 0.70, `.label-accent` to `--accent-ink`, and inputs and option
marks draw a `--control-border` (0.45) instead of `--divider` (0.13). Per-page
`<title>`s through the root template, card titles as `<h2>`, status lines live, focus
returned to Edit after an inline form closes.

**Tests that can fail.** `tests/support/` now owns the loopback guard, the admin client,
user creation and the past-dated sprint seeder for both suites (five duplications gone;
a new column reaches the e2e seed and the DB seed through one function). Live-clock
suites (targets, start_sprint, the offered-items block, the live streak sprint) take
their zone from `zoneOffUtcDate()` — Kiritimati once UTC passes 10:00, Pago Pago before
11:00 — so the sprint's date differs from UTC's for the whole run and a `now() at time
zone 'UTC'` regression cannot pass at any hour; a unit sweep proves the helper never
lands on UTC's date. 0007's backfill `UPDATE` is read out of the migration file and run
inside a rolled-back transaction (CHECK dropped, triggers off) against a 23:30-local
and a 00:30-next-day close: on time and late respectively, and the same rows read in
UTC would both be late. Cross-user `UPDATE` denial covers `visions.body` and
`impediments`, and `impediments` joined the disable-RLS leak test. The cascade check
reads `pg_constraint` for every public table with a `user_id` column (≥10) and a
rolled-back probe table without the cascade proves it reports one. The e2e backfill
asserts the red state on the result and the day strip and the derived totals past
day 1 (`1,350 USD`, `12 days left · 113 USD a day`, `4% of goal`); those numbers come
from `remainingPlan()` in `lib/targets.ts`, which Today now calls and a unit table pins.

**Consolidation.** `ProofInputs` is one component at its four sites; `ErrorBar` replaced
thirteen alert blocks (the close flow's two-action bar and the blocked-sprint list keep
their own shape); `PlanGrid`, the wizard and the plan card call `effectivePlan` /
`planDelta` instead of inlining the sum; the three OTP entries in `friendlyError`'s
table went (login matches those codes itself).

**Left open, in BACKLOG.** #43's wizard split by step (a 600-line refactor with no
behaviour change; actions were already split by domain in phase 3) and the Tailwind
keep-or-drop question (audit bucket D). The audit's LOW mobile and a11y lists were not
swept beyond what the batch touched.

---

## 2026-09-06 — Audit remediation, phases 1–3: the gate can fail, the session is read locally, failures leave a line

Fix pass over `docs/audits/full-audit-2026-09-05.md` buckets A + B, user-approved,
stopped by the user after phase 3 of 6 (phases 4–6 — mobile CSS, accessibility, test
additions, consolidation — are still open in `docs/PROGRESS.md`).

**Verify gate.** `passWithNoTests` (Vitest) and `--pass-with-no-tests` (Playwright)
removed; each runner now exits 1 on zero files (proven: `vitest run tests/does-not-exist`
→ 1, `playwright test does-not-exist` → 1). The three Python hook suites joined `verify`
as `test:hooks` (60 + 44 + 11 cases) — they had only ever run by hand. A `prebuild`
guard refuses a build with `VERCEL`/`CI` set against a loopback or non-https
`NEXT_PUBLIC_SUPABASE_URL`, and every build prints its target.

**Session read.** `proxy.ts` and `requireUser` use `getClaims()` (local JWT
verification; a network round trip only on the local stack's symmetric key) instead of
two `getUser()` calls per request. An Auth *error* is reported and, when it is the
service's (5xx / fetch failure), answered with `/login?error=unavailable` — it is never
folded into "signed out". `requireUser` is React-`cache`d and is the identity source
for every action that needs a user id.

**Reads.** `used` (rule 19) is a `sprint_cues(count)` / `sprint_impediments(count)`
embed computed per row in SQL, so `loadLibrary` is O(library) and never fetches the
membership history (the audit's silent-truncation cliff at PostgREST's 1000-row cap).
`loadActiveSprint` embeds the 14 days on the sprint row (one round trip, not two);
`loadOverview` is `cache`d; the sprints layout reads overview and streaks in parallel;
the area page uses `allOrThrow` (allSettled) so a sibling rejection never surfaces as an
unhandled rejection with no route.

**Signal.** `lib/observe.ts` `report(kind, error, ctx)` writes one JSON line to stderr
— the host's runtime log is the sink until an error tracker exists; `shouldCapture`
holds the five-minute per-kind cooldown that capture will sit behind. Wired at: every
DB error in every action (`failed()` in `lib/actionResult.ts`, 22 sites), the two
"closed but not refreshed" branches, `auth.claims_failed`, `auth.callback_failed`,
`auth.otp_send_failed`, `auth.signout_failed`, a streak the RPC did not return, an
orphan membership, and Next's `onRequestError` (`instrumentation.ts`) for every render,
route and action throw. `app/(app)/error.tsx` keeps the shell with a retry;
`app/global-error.tsx` covers the root. Client components call actions through
`callAction`, which turns a *thrown* action (deploy mid-form, network) into `{ error }`
so the form and its input stay mounted. Verified live: a bogus `/auth/callback?code=`
logged `{"event":"auth.callback_failed","code":"pkce_code_verifier_not_found",…}`.
PostgREST row values in messages (`(a)=(b)`) are redacted before logging; context is
ids only.

**Headers.** `frame-ancestors 'none'`, `X-Frame-Options: DENY`, nosniff,
`Referrer-Policy: strict-origin-when-cross-origin`, a Permissions-Policy, and
`poweredByHeader: false`. No `script-src` CSP: Next's inline bootstrap needs nonces —
a separate change.

**Migration 0008.** Drops the index that duplicated the unique (sprint_id, date) key;
`set_highest_impediment(sprint, impediment, proof_when?, proof_then?)` writes proof and
flag atomically (FIX_LOG 2026-09-06); `sprint_invalid_reason` gets `coalesce(…, false)`
on its exclusion so the default arguments judge the whole sprint (it returned `no_cues`
for a valid sprint before; no caller hit it). Actions were split by domain into
`app/(app)/actions/{vision,sprint,day,tasks,library}.ts`.

**Rejected.** *ESLint 10*: `eslint-config-next@16.3.4` declares `eslint >=9` but its
bundled `eslint-plugin-react`/`-import`/`-jsx-a11y` peer on `^9` at most, and
`npm run lint` crashed in `eslint-plugin-react`'s version detection on 10.10.0. Stays
on 9.39.5 (deprecated on the registry) until `eslint-config-next` ships a 10-ready
release. *Deleting `docs/mockups/UI mockups.zip`*: `docs/SPEC.md:7,160,630` and the F1
decision cite it as the design reference; the extracted tree is a copy, the zip is the
source. *Rate limiter, uniform "sent" login response, dropping the `token_hash`
callback branch*: design decisions (audit bucket D), untouched.

---

## 2026-09-05 — F5 streaks: computed in SQL from a per-day on-time flag, never stored; the clock is a parameter

**Decision.** `close_day` records one boolean per closed day, `closed_on_time =
(now() at sprint tz)::date <= day.date`, and the streak is derived from those flags by
`sprint_streak_at(sprint_id, asof)`: the trailing run of on-time closes among the days
whose date is on or before "today" in the sprint's zone, with today's still-open day
left out (neither missed nor earned). Two entry points read it: `close_day` returns
the streak it just produced, and `sprint_streaks()` returns `(sprint_id, streak)` for
every active sprint of the caller in one call (definer rights, filtered on
`auth.uid()`); the `_at` variant is not callable by the API roles. There is no `streak`
column and no function that assigns `closed_on_time` except `close_day` (a DB test
scans `pg_proc` for `=`, `:=` and column-list forms and pins the trigger list on
`sprint_days`).

**Why.** A stored streak is a second copy of the truth that has to be kept in step by
every path that closes a day, and the PRD's rule 18 ("never restore a streak through
backfill") is then a rule about updates rather than a property of the data. Deriving it
from the flags makes the rule structural: a backfilled day carries `closed_on_time =
false` forever (the immutability trigger locks the column), so it ends any run it sits
in, and the only way to a long streak is to have closed each day on its own date. The
clock as a parameter is what makes the calendar logic testable: the table test closes
days and asks for the streak at ten fixed instants, including 23:30 and 00:30 local
across the US DST end, where a UTC date or a stale −7 offset both count Nov 1 missed
(verified: swapping the zone conversion for `p_asof::date` turned that scenario red).

**Sprint-zone "today" decides both ends.** The same expression, `now() at time zone
tz`, is what refuses a future day, what marks a close on time, and what the streak reads
as "today", so a sprint locked to Los Angeles keeps its midnight when the user travels
(PRD §6) and no two code paths can disagree about the boundary.

**Why the flag is stored rather than derived.** `closed_on_time` is a function of
`closed_at`, `sprints.tz` and `date`, all locked after the close, so it could be
computed at read time. It is stored because it is the *record of the close as it
happened*, written by the one path that closes a day: History and Insights read it
without repeating zone arithmetic, and if `tz` ever becomes editable (it is locked
today) the record does not silently move. The cost — a CHECK, a trigger line, the
pg_proc scan and a grants line — is the price of keeping that record honest, and the
suite carries it. Deriving at read was considered and rejected on those grounds.

**Sidebar and Today read one call.** One `sprint_streaks()` RPC per request replaces a
per-sprint RPC in the layout plus a duplicate on the page: the server client is created
once per request (React `cache`) and the loader is memoised on it, so the layout and
its page share the result. `close_day` returns the streak so the result screen needs no
second read.

**Noted for F6.** `sprint_streak_at` considers every day with date ≤ today. When early
completion cancels the remaining days (PRD §10: "cancelled, not missed") the function
must stop at the closure date, or a sprint completed on day 9 reads a streak of 0 on day
11. That is F6's change to make, in the migration that adds the closure timestamp.
Until F6 exists a sprint stays `active` after day 14, and Backfill stays available on
the plan grid for exactly as long as `close_day` accepts it (PRD §9: "while the Sprint
remains open") — the UI and the DB agree on what "open" means, and F6 (renumbered F10 on 2026-09-06) closes both at
once.

**Rejected.** A stored `streak` column on `sprints` (second copy, rule 18 becomes a
write rule); a nullable `closed_on_time` default of `false` (an open day is not late,
it is open — the CHECK ties the flag to `closed_at` exactly); letting the client pass
the clock to the RPC (harmless for a read, but a wider API for no user need); a
per-sprint `sprint_streak(id)` RPC (N calls per navigation for a value one call
returns); a PostgREST computed column on `sprints` (the generated types do not carry
it, so every read would be hand-typed).

---

## 2026-09-05 — F4 tasks: direct table writes under a row trigger; "remove" is archive

**Decision.** `tasks` is written directly by the authenticated role (insert
`user_id, sprint_day_id, text`; update `text, done, archived_at`), not through an RPC.
Every invariant the PRD attaches to a task is row-local — it belongs to one day (rule
16), it is frozen once that day is closed (rule 17), and it may not change owner or day
— so one BEFORE INSERT OR UPDATE trigger, `tasks_lock_with_day`, enforces all of them for
every role. Removing a task sets `archived_at`; there is no DELETE grant.

**Why.** The F1/F2 pattern puts writes that carry invariants in SECURITY DEFINER
functions because those invariants span rows (1–3 cues, one highest impediment, a
balanced 14-day plan). A task carries none of that: nothing else in the schema depends
on it and rule 15 says completion must not influence any total, which is best guaranteed
by having no function read it at all. The DB suite asserts exactly that — no function
body in `public` names `public.tasks`, and no trigger on `sprints` / `sprint_days`
mentions tasks — so a future "roll unfinished tasks forward" job turns a test red the
moment it is created (verified: adding one failed two tests). Archive instead of delete
because PRD §11 lists "Tasks and completion" among what History preserves and §12 keeps
permanent deletion a deliberate action; the global rule says the same.

**Noted for future triggers.** A BEFORE trigger runs before the RLS `WITH CHECK`, so a
forged insert (`user_id` = someone else) is refused by the trigger's ownership lookup
(`day_not_found`, since the caller cannot see the other user's day) rather than by the
policy (`42501`). Both outcomes leave no row; the test asserts the message and the
count, not the error code.

**Rejected.** Hard delete of an empty or unwanted task (History value, and the delete
grant would be the only one outside the libraries); a task-count or task-completion
column on `sprint_days` (rule 15 — derive it in Insights instead).

---

## 2026-09-05 — F3 plans: the DB owns balance and locking; the mockup's "informational mismatch" is rejected

**Decision.** A plan is written by exactly two SECURITY DEFINER functions, both explicit
user actions: `start_sprint` (initial 14) and `save_targets` (future days). Both call one
validator that requires the 14 targets to sum to the goal (rule 11) and to sit on the
measurement's planning step; `save_targets` and a row trigger both refuse a change to any
day whose date has begun in the sprint's zone (rule 10). The UI mirrors the same rule
only to disable the button early — it never decides.

**Why.** The handoff mockup (`docs/mockups/today/handoff_sprint_ui`) says a plan that does
not match the goal "is informational and does not block starting", and its "Same" chip
re-spreads the remaining goal over future days. The PRD §6 says the opposite on both
counts: "Save (and Start Sprint) is disabled until planned total = Sprint Goal. No
partial or unbalanced plan is ever persisted", and rule 12 forbids auto-redistribution.
The SPEC restates the PRD, and the SPEC wins over the mockup on behaviour (the mockup
governs look only). Rules 13–14 are proven structurally rather than by example: the DB
suite scans `pg_proc` for any function that UPDATEs `sprint_days.target` and expects
exactly `save_targets`; adding a `rebalance_plan` function turns that test red.

**Also settled.** (1) Custom mode is one-way once a sprint has started: there is no
"back to Same" because that would be a redistribution. Before start, the wizard lets
the user flip between the two freely and keeps the typed values. (2) The lock is
`date <= today` in the sprint zone — today's target locks the moment the day begins,
not at first close — which is what "today's Target after the Day begins" (rule 10)
says; for a sprint starting tomorrow all 14 days stay open until midnight. (3) Hours
targets are entered as `h:mm`; money and quantity as whole units; cents are rejected
by the DB (`target_precision`), not rounded.

**Rejected.** A "spread the remainder evenly" helper button on Today. User-initiated,
so not rule 12, but the SPEC lists suggested rebalancing as a non-goal and the PRD's
accepted trade-off is that the user loads the difference by hand.

---

## 2026-09-05 — F2 membership boundaries are midnight in the sprint's zone; one SQL owner for "what Day Close offers"

**Decision.** `day_offered_items(day_id)` decides which cues and impediments a day
offers, comparing `added_at` / `removed_at` converted `AT TIME ZONE sprint.tz` against
the day's date. Both `close_day` (validation) and the UI (options) call it; no client
re-implementation.

**Why.** The SPEC's draft rule `added_at::date <= day.date` casts in the server zone
(UTC). For a `Pacific/Kiritimati` sprint (UTC+14) an item added at 23:59 on day D is
already D+1 in UTC and would have been hidden from D's close — rule 23 broken at the
exact boundary the SPEC listed as a risk. A six-case table test at D 00:00:00,
D 23:59:59, D+1 00:00:00, D-1 23:59:59 in that zone is red under the UTC version (run
2026-09-05: the D 23:59:59 case failed) and green under the zone version.

**Also settled.** (1) A blocked archive / scope change reports the *first* violated
rule in PRD order (3 cues, 4 impediments, 5 highest, 6 proof) — archiving a sprint's
only impediment says "no impediments", not "no highest", though both hold. (2) Library
free-text columns are column-granted for direct UPDATE; every invariant-bearing column
(`scope`, `rank`, `archived_at`, memberships, selections) is function-only, so the
grants test enumerates exactly nine writable columns across the schema.

**Test-authoring note.** postgres.js serialises a parameter that Postgres infers as
`timestamp` through `new Date()`, i.e. in the machine's local zone; every boundary in
the table test shifted by the local UTC offset until the parameter was cast `::text`
first. Recorded here rather than in FIX_LOG because it never reached app code.

## 2026-09-05 — F1 data layer: writes only through SECURITY DEFINER functions; deny-by-default grants

**Chosen.** `start_sprint` and `close_day` are SECURITY DEFINER with identity taken from
`auth.uid()` inside the body and `set search_path = ''`. The authenticated role gets
SELECT on the three tables plus column-level UPDATE on exactly `visions.body`,
`sprints.mantra`, `sprint_days.intention`, and INSERT on `visions`. No INSERT on
`sprints`/`sprint_days`, no DELETE anywhere. The SPEC said SECURITY INVOKER; that would
have required granting INSERT on both tables, and a direct insert then skips the
no-active-vision rule (PRD rule 2) and the atomic 14-row creation. The grants test
(`tests/db/grants.test.ts`) pins the exact set and fails when a later migration widens
it without deciding to.

**Default privileges revoked for the postgres role in `public`** (0001) so a table added
by a later migration is unreachable through the API until granted — parity with the
hosted project's "automatically expose new tables = off", verified by a probe test that
creates a table in a transaction and asserts anon/authenticated have no privilege.
Functions were still PUBLIC-executable after that (verified: `proacl` null), so 0002
revokes them explicitly; the grants test asserts only `start_sprint` and `close_day`
are callable by authenticated.

**Local env comes from the running stack.** `scripts/local-env.mjs` writes `.env.local`
from `supabase status` before `dev`, `test:db` and `test:e2e`; Next loads it ahead of
`.env` (hosted keys). It refuses non-loopback hosts, and every DB/e2e test asserts a
loopback URL before running — the tests drop RLS to prove it works, and must never be
pointable at production. Local stack runs on ports 54341–54349 so it can coexist with
another project's stack on the defaults.

**Rejected:** editing `0001` in place after it was applied locally (the write guard
blocks it and the rule is forward-only regardless — hence 0002 and 0003 rather than a
rewrite) · WebKit for the phone e2e project (the SPEC checks layout at 390px, not an
engine; Chromium with a phone profile avoids a 100 MB download).

**Money planning unit.** `same_daily_targets(amount, step)` spreads remainders in steps
of 100 minor units for money (0003), so a USD 8,000 goal plans 572/571 whole dollars,
not 571.43/571.42. Storage stays minor units (the 2026-09-05 stack decision); only the
distribution granularity changed, and the SPEC line was amended.

---

## 2026-09-05 — Hustlemania stack: Next.js + Supabase over PurePath's Vite/Express/Drizzle

Direction gate of the `/interview` for Hustlemania (the 14-day goal sprint app; PRD in
`docs/references/`). **Chosen: Next.js App Router + Supabase (Postgres, magic-link
Auth, RLS) on Vercel.** The user's #2 failure condition is corrupted or lost sprint
data, and this stack enforces isolation (RLS) and the PRD's 29 invariants
(constraints, triggers, DB functions) in Postgres rather than in per-route code.
`~/PurePath` — the prior attempt on Vite + Express + Drizzle — records three
authz/logging slips in its own lessons list of exactly the kind RLS removes. Also:
the template's `write_guard.py` and `engineering-conventions` already assume
`supabase/migrations`; $0 on free tiers; Vercel Cron covers the reminder email.

**Rejected:** no-build (Notion/Sheets cannot enforce the invariants, lock closed days,
or surface cross-day patterns — and "no patterns" is the stated pain); the PurePath
stack (auth and every ownership check hand-written; needs an always-on Node host).
**Re-open only if** the circle-visibility RLS in F8 proves unmanageable.

**Amounts:** one BIGINT `amount` in base units (money in minor units although the UI
accepts whole units only, hours as minutes, quantity whole) — the money convention
wins over the PRD's "whole units" storage note; behaviour is identical.

**UI reference:** the user's Claude Design handoff (`docs/mockups/UI mockups.zip`)
is the look; its bundled `spec.md` is an older PRD draft and loses to
`docs/references/`. Today's section order and the two-step Close dialog are the
user's calls over both the PRD and the prototype (SPEC Part 2 §5).

**Hosted project (recorded 2026-09-05, after the full audit found it unlogged):**
the user created the Supabase project `hustlemania` — ref `zcdvuhcslwalhziinfqz`,
region us-west-1, Postgres 17 — at 2026-09-05T13:29Z, before F2 began, in a
**separate organisation** (`tlfaqzgduptciyxbkwdf`) from `pure-eq`'s
(`fsbryklkgnhmmtzukfrh`, "Jam Taks Org"). Its keys live in `.env`. The Supabase MCP
plugin is authorised only against the `pure-eq` organisation, so it lists one project
and cannot reach this one; the CLI login (`npx supabase projects list`) sees both.
Not linked from this clone yet; `supabase link` and `db push` remain the F10 step.

---

## 2026-08-25 — Governance protection goes in the global guard; the pre-commit claim goes in the docs

**Governance shell-writes are blocked in the user-level guard, not a restored
project copy.** The B2 put-back trigger below was considered and deliberately not
fired: restoring `scripts/hooks/shell_guard.py` would reinstate ~132 ms per shell
call of double-guard cost, measured in B2, to buy protection on machines that do not
exist yet. `check_governance()` went into `~/.claude/hooks/shell_guard.py` instead,
scoped to governance-path mutation only. **The cost is stated rather than hidden:**
this protection is machine-local, so a checkout elsewhere has the write-tool half
(`write_guard.py`, which ships) and not the shell half. `CLAUDE.md` and `README.md`
now separate those two reaches instead of presenting one enforcement story. **Put
back the project copy** under the existing B2 triggers — they are unchanged by this.

**`.githooks/pre-commit` stays unwired in this clone; only the claim changed.**
Wiring it here would not materially change protection: this template has no
`package.json`, so the hook allows every commit by design, and `new-app.ps1` already
wires and readback-asserts it for the apps that do have one. Adding
`git config core.hooksPath .githooks` to this clone would have bought nothing and
added a claim to keep true. A shell-guard exemption for the wiring command was
rejected outright: it would put a hole in a rule that currently has none, to save
the human one command they run once per clone. Demoted from P0 on that basis — the
false-green risk was in the documentation, and the documentation is what changed.

---

## 2026-08-25 — Template P0 pass: routing, build loop, context ownership, truthfulness

One session, one intent: reduce interruptions and remove claims the framework cannot
support. Grouped rather than split because they were decided together.

**Template-maintenance sessions pay five manual file copies.** `write_guard.py` locks
`.claude/`, `.githooks/` and `CLAUDE.md` (`GOVERNANCE`, line 30), so a session whose
whole purpose is editing the framework hands those files to the human instead of
writing them. This session staged five complete files plus one PowerShell script that
copies them and hash-compares each. Accepted: the framework-freeze rule makes these
sessions rare, and the alternative — disarming the guard for the duration — is the
agent editing its own governance. **Put-back trigger:** more than two maintenance
sessions in one calendar month. Then design a maintainer mode — a scoped, auditable
exception. Do not weaken the guard before then.

**Planning routes by size, with the approval count stated as a number.** New app or
architecture change = 2 approvals; a feature = 1; a one-sentence reversible change =
0, and no `/interview` at all. Previously every feature that "doesn't fit in one
sentence" paid the full three-phase interview, which made skipping planning entirely
the cheap path. `/interview` now detects its mode from whether `docs/SPEC.md` exists,
and feature mode is forbidden from touching Part 1 or any other feature's entry.
**Put-back trigger:** if feature mode ships a feature whose architecture impact should
have escalated, tighten the escalation rule — do not merge the modes back.

**One mockup, not three, and only when a screen changes.** The UI block is four
questions in one batch; its output is a short block inside the SPEC feature entry,
never a separate document, and it rides inside an existing approval rather than adding
a gate. **KILL CRITERION:** after three UI-bearing features, if mockup approval has
not reduced post-build UI rework (the `rework` column in `docs/PROGRESS.md`), delete
the mockup step. It is a cost until it is shown not to be.

**Evaluator triggers are named by effect, not by the word "migration".** "Any
migration" over-fired on additive columns and under-fired on a table created empty
that would hold user data a week later. The list now keys on what the change can do:
first vertical slice, auth/authz/RLS, money, destructive or data-transforming
migrations, migrations touching existing production rows, any migration creating a
table that will hold user data regardless of current row count, and pre-release.
Multiple triggers in one feature = one run. **Re-scope on evidence:** ~20 optional
evals with zero unique P0/P1 findings → narrow the list. Two serious defects escaping
unevaluated work → broaden it.

**`.githooks/pre-commit` is drift control, not a trust boundary — and now says so.**
It claimed "red code cannot be committed", which a local hook cannot guarantee
(`--no-verify`, repointing `core.hooksPath`); that was `BACKLOG` C7. It also
fail-opened when `package.json` existed with no `verify` script — precisely the state
where a project has verification and is not running it. Now: no package.json → allow;
package.json without `verify` → fail; with `verify` → run it. Detection is `node -e`
parsing `scripts.verify`, because the old `grep -q '"verify"'` was satisfied by a
*dependency* named `verify`. **Residual limit, stated rather than hidden:** when
`node` is absent the hook falls back to `grep -Eq '"verify"[[:space:]]*:'`, which
still cannot separate `scripts.verify` from a dependency key; the hook prints which
check ran, so the weaker answer is never silent. Covered by
`scripts/hooks/test_pre_commit.py`: 6 behaviour cases, 5 contract assertions, and a
mutation that restores the fail-open branch and must turn exactly two cases red.

**Handoff state has one owner: `session-context.md`.** `CLAUDE.md` previously required
reading `docs/PROGRESS.md` before touching anything and appending a next-action to it
every session — the same job `/save-context` already does, into a file the evaluator
is deliberately blocked from reading. `docs/PROGRESS.md` is now shipped milestones
plus the metric log (one row per feature: started_at, green_at, human_stops, rework,
defects_after_green), which is the instrument for the governing metric. Its dangling
`progress-hygiene` reference is gone — no such skill exists in this repo or in
`~/.claude`. `session-context.md` is now gitignored; nothing ignored it before, so it
was committable.

**`.archive/` deliberately NOT added to `.gitignore`.** It was proposed alongside
`session-context.md`, but `~/.claude/DECISIONS.md` (2026-08-25, P0 config pass)
records archiving, the 20-snapshot retention, category detection and the 14-day prune
as deleted ceremony — `/save-context` overwrites one file whole and creates no
archive. An ignore rule for a directory nothing produces is dead config that reads as
coverage. **Put back if** a producer of `.archive/` is ever added.

**Visual verification is conditional on browser tooling being present.** Claude in
Chrome was confirmed available on this machine (one local extension, Windows), so the
sequence — start localhost, open the page at the target viewport, screenshot, compare
against the approved mockup, exercise one key state — is written into the BUILD loop.
But `CLAUDE.md` ships to every app scaffolded from this template, including machines
without the extension, so the rule carries its precondition and says to skip and
report rather than substitute a prose description. Asserting the tools exist would
have added a false claim in the same pass that removed seven.

**`add-*` knowledge extracted; the four commands are now safe to delete.**
`~/.claude/DECISIONS.md` (2026-08-25) gated deletion of `add-table`, `add-endpoint`,
`add-page` and `add-webhook` on a session verifying their knowledge had been
extracted. This was that session. Failure-preventing rules moved into
`.claude/skills/engineering-conventions/SKILL.md` — the `set_updated_at` ordering
dependency, `archived_at` obligations, partial unique indexes, fail-loud UNIQUE
creation, RLS policies in the creating migration, the seven-step handler order with
its gate exclusions, and the webhook raw-body → verify → parse → replay → dispatch →
mutate → ack protocol — and into `.claude/rules/react-traps.md` (Strict-Mode
double-invocation, wizard-step keying, setState-then-submit, progressive save,
gate-preserve). Workflow steps, "Verify" sections, and anything already carried by
`~/.claude/REVIEWER_CONVENTIONS.md` §6 were dropped rather than copied. Deleting the
four files still requires repairing `~/.claude/commands/new-app.md`, whose frontmatter
description names three of them.

**`env.example` created, because the README told you to verify a file that did not
exist.** Four files cite it — `.gitignore`, `CLAUDE.md`, `README.md` and this one — and
the README's guardrail check says "Read `env.example` → allowed". There was no such
file in the repo, so that check could not pass. Same class of defect as the fail-open
pre-commit fixed in this pass: a verification step that cannot fail measures nothing.
It ships with empty values and one comment per key; a filled-in value here would be a
committed secret, and this repo is public.

**`.claude/rules/` is a real mechanism and its frontmatter key is `paths`, not
`globs`.** Verified against the Claude Code memory documentation before use: a rule
carrying `paths` loads only when a matching file is read. This is the first rules file
in the template.

---

## 2026-08-24 — The shell guard is registered once, at user level, not per project (handoff B2)

Context: `scripts/hooks/shell_guard.py` and `~/.claude/hooks/shell_guard.py` were
byte-identical (sha256 `d50bafc230245794…`), and both were registered for
`Bash|PowerShell`. Every shell call in a template-derived repo therefore paid for
**two** Python processes running the same parser over the same string.

**Measured.** One guard invocation: **66 ms median** on Bash (42 ms of that is
bare `python -c pass` startup, so ~24 ms is the guard). Duplicated, that is
~132 ms per shell call for zero additional protection.

**Done.** Deleted `scripts/hooks/shell_guard.py`, `scripts/hooks/test_shell_guard.py`,
and the project `Bash|PowerShell` registration in `.claude/settings.json`. The
user-level guard covers every repo on this machine, including this template, and
was verified firing from the template working directory — destructive git forms
blocked, `git status` allowed, and the full evaluator allowlist still enforced
(`echo >`, `git log`, `cat docs/PROGRESS.md`, non-allowlisted binaries all
blocked; `npm test` and `git status --porcelain` allowed).

**Scope of the claim — read this before trusting it.** "The user-level guard
protects all repos" is true *of this machine only*. It is a statement about
`~/.claude/settings.json`, not about the template. A checkout of this template
on any other machine now has **no shell guard whatsoever**.

**PUT-BACK TRIGGER.** Restore `scripts/hooks/shell_guard.py`, its test suite, and
the `Bash|PowerShell` registration when **any** of these becomes true:

1. the template must work on a machine without this `~/.claude` configuration
   (another person, another laptop, a fresh OS install, a container, CI);
2. a generated app needs guard coverage that does not depend on the developer's
   personal config;
3. the evaluator is dispatched anywhere the user-level guard is not installed —
   **this is the sharp edge**: the evaluator's shell allowlist lives *inside*
   `shell_guard.py`, so with no guard registered the evaluator keeps `tools: Bash`
   and gains an unrestricted shell. Its read isolation (`evaluator_guard.py`) is
   project-relative and survives; its *shell* isolation does not. A P0 harness
   failure that the Step 0 read probe does **not** detect, because that probe
   only tests the Read path.

Recovery is `git show 4d2c989 -- scripts/hooks/shell_guard.py`; nothing unique
was lost, since the deleted bytes are exactly the surviving user-level copy.

---

## 2026-08-23 — Permission and hook scope: what was changed and what was left alone

Context: the guardrail layer was written for the Bash tool only. On Windows the
PowerShell tool is the primary shell, so every protection was absent on the path
most likely to be used.

**Done.** `bash_guard.py` → `shell_guard.py`, registered `Bash|PowerShell`, made
shell-aware (PowerShell separators, alias canonicalization so `gc`/`type`/`rm`
cannot slip a rule, quote-stripping so a literal in a commit message cannot fake
a flag). PowerShell mirrors added to `deny`/`ask`/`allow`. Covered by 61
block/allow cases in both directions.

**`Remove-Item:*` denied broadly, not by flag.** Flag-order matching is
unreliable (`-Recurse -Force` in either order, abbreviated as `-rec`). The
built-in checks already deny system-path and wildcard targets; the broad rule
closes the rest. Alias canonicalization means it also catches `rm`, `del`, `ri`.

### Rejected

**No `defaultMode` in this file.** Per the docs, `"auto"` in project
`.claude/settings.json` does not take effect and setting any value here
overrides the user's own preference. With the key absent, the user-level
`~/.claude/settings.json` value applies (and the built-in default is auto on
Pro/Max/Team). Do not re-add it — a project-level `"auto"` is a documented no-op
that silently forces the built-in default instead.

**No `git commit` allow rule.** An allow rule resolves *before* the classifier,
which would skip the review that reads global `CLAUDE.md` — where "NEVER commit
or push unless I ask" actually lives. With no rule, commits route through the
auto-mode classifier and that hard stop is checked. Commits run without a
terminal prompt either way; the cost is one background classifier round-trip.
This reverses an earlier draft that added the rule.

**No comment inside `settings.json`.** JSON has no comment syntax, and this file
is the security layer — a parse failure would silently drop every deny rule and
hook. The note that belongs there lives in the README instead: in auto mode,
broad exec allow rules (package-manager run commands, wildcarded interpreters
like `node:*`) are dropped by design and route to the classifier; narrow rules
stay in effect. The full allow list is kept regardless, because it applies when
cycling to manual/acceptEdits mid-session.

**`/interview` stays project-level.** It writes relative `docs/` paths and
assumes the scaffold exists; the flow is scaffold-first by design
(`/new-app` → `/interview`). A global copy would run against no `docs/`.

**`engineering-conventions` stays project-level.** It is stack-specific
(Supabase/Postgres, `npm run verify`) and should version with the template, not
with the machine. Its three rules that duplicated global `CLAUDE.md` — UTC,
`archived_at`, falsifiable verification — were replaced with a pointer so they
have one home.

### Deferred

Migrating `/interview` from command to skill format, which would let it declare
`allowed-tools`. No forcing evidence yet.
