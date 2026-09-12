# FIX_LOG

(Every real defect: dated entry — problem, fix, regression test, where found.
Template-derived apps split: FIX_LOG.md = what the next app from the template
would also hit; APP_FIX_LOG.md = the rest.)

---

## 2026-09-11 — The 0019 conversion could not copy the proof snapshot: the rule-17 trigger refused its own history rows

**Problem.** F15 moves the Highest's THEN / RECOVERED WHEN snapshot from `sprint_days`
onto `day_impediment_observations`, and the conversion fills the new columns for every
legacy row with one UPDATE. `day_impediment_observations_immutable` (0010, rule 17)
raises `day_closed` on any UPDATE of a row whose day is closed — which is every row
the conversion needs to touch. Written as a plain UPDATE the migration aborts on the
first hosted user with a closed day; the local `db reset` (no rows) would never show
it. The 0019 draft also auto-named an inline CHECK, which collided with the table's own
`_check` name on reset.

**Fix.** The migration disables that one trigger for the single snapshot UPDATE and
re-enables it in the next statement (`supabase/migrations/0019_situations.sql`, above
the `day_impediment_situation_observations` fill); the CHECK is named
`day_impediment_situation_observations_recovered_needs_occurred`.

**Regression test.** `scripts/rehearse-0019.mjs` seeds a closed day whose highest
observation exists before the migration, runs 0019 and asserts the snapshot landed on
that row (`proof snapshot copied onto the highest's observation row`); without the
disable it exits non-zero on `day_closed`. The smoke test that found it ran the whole
file inside a rolled-back transaction against seeded legacy rows.

**Where found.** The F15 build, 0019 smoke test on the local stack (2026-09-11), before
the file was ever applied to a database with rows.

---

## 2026-09-11 — The skew retry never retried inside a server render: Next.js handed it the memoised 401

**Problem.** `withSkewRetry` (FIX_LOG 2026-09-10) re-issued the refused request
byte-for-byte after one second. Inside a server-component render Next.js dedupes
identical GETs — same method, headers and URL (`next/dist/server/lib/dedupe-fetch.js`)
— and gives the second caller a clone of the first response without a network call. So
the retry received the same `JWT issued at future` 401 and the page fell to the error
boundary anyway. The gateway log showed it: one request for
`sprints?select=*&status=eq.active` at :21, four sibling requests at :21 succeeding on
the same token, no second request, the error thrown at :22.4. The unit tests injected
their own fetch and could not see the dedupe; the local e2e reproduced it twice in four
runs on 2026-09-11 with the Docker and host clocks agreeing.

**Fix.** The retry carries `x-skew-retry: 1` (`lib/supabase/skew.ts`), which changes the
dedupe key; the original headers, including the bearer, are preserved, and nothing
reads the marker.

**Regression test.** `tests/unit/skew.test.ts`, "under a deduping fetch": a fake fetch
keyed like Next's returns the memoised refusal for an identical retry — the old code
gets 401 and one real call, the new code 200 and two; a second test checks the apikey
and bearer survive on the retry. The first describe's retry assertion now checks the
marker instead of byte-equality.

**Where found.** The pre-commit verify for U2–U4 (05:00Z), desktop golden path, after the
clock-sync explanation had been shown wrong by a failure with synchronised clocks.

---

## 2026-09-11 — The Suggested kit credited a response with recoveries that happened without it, from a sprint it was not measured in

**Problem.** Two defects in one sentence of `suggestedKit` (`lib/acrossCards.ts`), found
by an outside review that ran the function on constructed rows and reproduced here.
(1) The recovery clause matched the follow-through group by item and Area only. Each
Across-sprints group quotes its own most recent sprint that clears n≥3, so the
follow-through group could quote August while the recovery group for the same
response quoted July, and the sentence read as one measurement. (2) The clause printed
the row's `rate`, which migration 0014 defines as recoveries over all answered
occurrences, including the days the response did not run. Recovered 0 of 3 times the
response ran and 3 of 3 times it did not printed "recovers 50% of the time" — the
opposite of what the data says about the response. Latent since F11 (2026-09-09).

**Fix.** The recovery group must also share the follow-through group's `from.id`, and
the clause prints `with_recovered / with_response` as "recovers N% of the times it
ran", only when `with_response ≥ MIN_DAYS` (3), so a two-occurrence sample stays
silent as every other kit sentence does.

**Regression test.** `tests/unit/across.test.ts`, "the suggested kit": the 0-of-3 /
3-of-3 case expects 0%, and printed 50% before the fix; the two-sprint case expects no
recovery clause, and printed the older sprint's 50% before; the ran-twice case expects
no clause, and printed 100% before. The existing three-sentence test moved from 60% to
67% for the same reason. `e2e/golden-path.spec.ts` (F10): the seeded sprint's response
ran 2 of 4 times, so the kit now carries no recovery clause; the old expectation
("recovers 50%") was the defect on real rows, and the test now also asserts "recovers"
is absent.

**Where found.** Product review of `bf5c4cb` (2026-09-11), verified by running
`suggestedKit` on the reviewer's two cases before any edit.

---

## 2026-09-10 — A clipped sidebar sub line escaped the chip row and made the phone page scroll sideways

**Problem.** The chip row hides an unselected chip's sub line off screen with the usual
visually-hidden recipe (`position: absolute; width: 1px; clip: rect(0,0,0,0)`), but the
chip (`.side-link`) was not positioned, so the 1px span took the nearest positioned
ancestor — the document — as its containing block. Its static position sits where the
chip is, and a chip scrolled past the right edge of the row put the span at x ≈ 399 on a
390px viewport. The row's own `overflow-x: auto` never saw it, and the document grew 9px
wider. Latent since the phone chip row shipped; U1 surfaced it because the selected chip
now shows its sub line and is wider, pushing the third chip out of view.

**Fix.** `.side-link { position: relative }` (`app/globals.css`), so the span is contained
by the chip and scrolls with the row.

**Regression test.** `e2e/golden-path.spec.ts` (phone project), the `noOverflow()` after the
plan edit on the journal: `scrollWidth - clientWidth` was 9 before the fix and 0 after.
Remove the `position: relative` and it goes red again.

**Where found.** U1 build, the phone golden path, first run after the CSS edits.

## 2026-09-10 — The first page after the owner's first production sign-in failed with `sprint_totals: JWT issued at future`

**Problem.** The magic link landed, the session was minted, the callback redirected to
`/sprints` within the same second, and PostgREST refused the brand-new token: `401 JWT
issued at future`. Supabase Auth and the data API keep separate clocks; when the data
API's runs a beat behind, a token issued at second T is "from the future" until T
passes there. The Sprints layout's `loadFinishedSprints` threw, the app error boundary
showed "This page could not load", and one click on Try again — one second later —
loaded everything. Never seen on the local stack, where both run on one clock.

**Fix.** `lib/supabase/skew.ts`: a fetch wrapper for the server client that retries a
request exactly once, after one second, when the answer is a 401 whose body carries
that message. Any other status or message passes through, and a second refusal is
returned as-is, so it can never loop. Wired in `lib/supabase/server.ts` through
`global.fetch`. Layer: Supabase's platform clock skew; the app's defence is the retry.

**Regression test.** `tests/unit/skew.test.ts`: skew-then-ok → one wait of 1000 ms,
the same request twice, 200 returned; skew twice → 401 returned after one retry; a
`JWT expired` 401 → not retried; a 200 → passed through with its body; a returned
refusal is still readable. Two mutations turned it red and were restored: the retry
removed (test 1), and the retry widened to every 401 (test 3).

**Found.** F14 step 6, the owner's first sign-in on `hustlemania.app`; the Vercel
runtime log line `request.error … sprint_totals: JWT issued at future` pasted by the
user.

---

## 2026-09-10 — The first production magic link failed: `auth.email.enable_signup` is the email-provider switch, not a signup switch

**Problem.** F14's `[remotes.production.auth.email] enable_signup = false`, written to
close signups on the hosted project, was pushed by `supabase config push` and every
magic-link request then answered `422 email_provider_disabled — Email logins are
disabled`; the login page showed "The link could not be sent". The CLI maps that key to
GoTrue's `external_email_enabled` (the dashboard's "Enable Email provider"), which is
why the root config keeps it `true` for the local stack while the global
`[auth] enable_signup = false` is what actually closes signups.

**Fix.** `enable_signup = true` under `[remotes.production.auth.email]` with a comment
naming the mapping; `[remotes.production.auth] enable_signup = false` stays the
signup lock, and the app's `shouldCreateUser: false` backs it.

**Regression check.** No automated test can reach the hosted auth service. The check is
the two-address probe run after every `config push` and recorded here: the owner's
address → `SENT`, an uninvited address → `422 otp_disabled — Signups not allowed for
otp`. Both were run on 2026-09-10 after the fix; the first had failed with
`email_provider_disabled` before it.

**Found.** F14 step 6, the owner's first sign-in on the deployed origin, and
reproduced with a script calling `signInWithOtp` against the hosted project. The next
template-derived app with a `[remotes.<name>]` block would hit it the same way.

---

## 2026-09-09 — Every Across / Vision number was one PostgREST page away from being silently wrong, and the Insights page cost 5N+4 requests

**Problem.** `loadAcross`, `loadReviewStats` and `loadVisionSprints` read every
`sprint_days_effective` / `sprint_days` row of every sprint and summed in TypeScript.
PostgREST returns at most 1,000 rows (`max_rows`), so at ~72 finished sprints — inside a
year of three-area use — the evidence line, every coverage denominator, goals-met and the
Vision tab's Met/Under would have gone quietly wrong, with no error. Separately the
Insights layout issued one `sprint_review_summary` per finished sprint and the page four
insight RPCs per sprint: 5N+4 requests per render against a 20-connection pool, and the
SPEC's "N < 10 for years" was off by 10× for the product's own intended use.

**Fix.** `0017`: a `security_invoker` view `sprint_totals` (one row per sprint: closed,
effective and on-target day counts and the summary's own total) read with `.in(...)`, and
five `*_many(uuid[])` SQL wrappers that `lateral`-call the existing definer functions, so
the ownership check still runs per sprint and no authorization logic is added. Insights is
now five requests whatever N is. `full()` in `lib/data.ts` names the cap instead of
rendering a partial number. Goals-met and the Vision verdict use the summary's total, so
they can no longer disagree with the result card (#15).

**Regression test.** `tests/db/insights.test.ts`: `sprint_totals` on the hand-computed
fixture (11 closed, 10 effective, 5 on target, total 1060; readable under RLS); each `_many`
wrapper returns the per-sprint rows tagged with the sprint and refuses a foreign id with
`sprint_not_found`; `grants.test.ts` pins the five wrappers in the authenticated set.
Mutations: the view without its `target > 0` filter turned the totals test red; revoking
one wrapper turned the grants pin red.

**Where found.** `/full-review` 2026-09-09, performance pass (#5, #6, #15).

## 2026-09-09 — Ending a sprint before it ran locked the Area behind a fabricated lesson, and a pruned item came back in the next kit

**Problem.** Rule 26 blocked the next sprint in an Area until the finished one was reviewed,
including a sprint ended early before day 1 with zero closed days — the only way through was
a "key lesson" for a sprint that never happened. And `finish_review` defaulted every member
to `keep`, removed ones included, so the next sprint's kit pre-checked what the user had
removed with "Set up tomorrow → Remove".

**Fix.** `0017`: `start_sprint`'s rule-26 clause also requires a closed day; a removed
member defaults to `drop` in the decision fill. `needsReview()` in `lib/data.ts` carries the
same rule to the Sprints sidebar, the review gate and the Insights rows ("Never ran"), and
`loadSprintMembers` exposes `removed` so the postmortem's carry-forward rows default the
same way and say "removed mid-sprint".

**Regression test.** `tests/db/completion.test.ts`: a sprint ended before day 1 does not
block a new one, and one that closed a day still raises `review_required`; a cue removed
and never re-added is stored as `drop`, one removed and re-added as `keep`. The existing
rule-26 fixture gained one closed day, since it had relied on the old behaviour. Unit:
`needsReview`. Mutations: 0012's `start_sprint` turned the exemption test red; 0016's
`finish_review` turned the default-drop test red.

**Where found.** `/full-review` 2026-09-09, adversarial pass (#22, #25).

## 2026-09-09 — Second-pass fixes from the full review, one line each

- **Theme return path** (`lib/redirect.ts`, #14): `/\evil.com` and control characters passed
  the `startsWith("/")` guard; REDIRECT-VALIDATE regex, unit-tested, mutation red.
- **Client "today" during render** (`components/useDeviceToday.ts`, #16): the wizard, the
  Vision overview and setup computed the device date while rendering — a hydration mismatch
  for hours a day — and the wizard memoised it at mount, submitting yesterday after
  midnight. The hook reads after mount and on `visibilitychange`; the wizard reads the date
  at submit.
- **Host-zone formatting outside `stampDate`** (`monthYear`, #17): routed through one helper.
- **"% of goal" four ways** (`attainmentPct`, `goalMet` in `lib/format.ts`, #18): one
  arithmetic, matching the SQL's `round`; mutation to `floor` red.
- **Ended-early sprint shown as running on the Vision tab** (#19): `loadVisionSprints` reads
  `status` first.
- **Closure copy** (`closureWarning`, #20): End early and Complete name today's open entry
  and the count of earlier days that can no longer be added.
- **Wizard Area chip re-click wiped step 4** (#21): prefill only on a change of Area.
- **Direct-table actions under an expired session** (#23): `saveIntention`, `updateItem`,
  `saveProofPoint`, `saveMantra`, `updateTask`, `removeTask`, `deleteItem` check the session
  first and say "sign in again" instead of "try again" forever.
- **Close from a stale tab after a highest change** (#24): `closeDayAction` re-reads the
  current highest on `response_*` errors and returns `highest_changed` ("Reload, then close
  the day") instead of copy that contradicts the form.
- **Serial round trips** (#26): `loadAreaKit` is one embedded read; the Area page starts
  every independent read with the active sprint; `loadPostmortem` batches its sprint row.
- **Assistive tech** (#7, #8, #27): the closed-day result and the review gate, the reviewed
  postmortem and a replaced vision take focus when they replace the pressed control
  (`AnnounceHeading`, `announce`); a backfilled row, the task draft, the "Also watching"
  list, the library title and the wizard's add-usage button take focus after a removal;
  `role="radio"` chips handle arrow keys (`radioKeys.ts`); the sidebar is a labelled `nav`
  whose hidden sub line stays in the accessibility tree; the theme toggle's name leads with
  its visible word; `aria-label`s no longer override visible labels; `TwoTap` announces its
  armed copy through a live region instead of `aria-pressed`; card kickers are `h2`s; the
  wizard shows "Step n of 4" as text.
- **Touch and contrast** (#9, #10, #28): 44px on the vision-alignment row, the two TwoTaps,
  the theme toggle, text-only links, mini actions, plan and task inputs, the ghost ×;
  the backfill modal no longer auto-focuses its number input, so the keypad does not
  cover Continue; Dusk on-accent text at .92, selected-row sub in ink, placeholders in
  `--muted`, control border at .5; `overflow-wrap: anywhere` on user text; the manifest
  follows the theme cookie.
- **Operator log** (`lib/observe.ts`, #29): a context value longer than an id is dropped,
  and `Failing row contains (…)` is redacted; unit-tested, mutation red.

## 2026-09-09 — A member removed and added back could never be reviewed, and counted twice

**Problem.** `remove_sprint_item` keeps the membership row as history and `add_sprint_item`
inserts a new one, so an item removed on day 3 and added back on day 6 is two
`sprint_cues` / `sprint_impediments` rows. Three readers took one row per membership row
instead of one per item. `finish_review` inserted one `review_decisions` row per membership
row, hit `review_decisions_review_id_kind_item_id_key`, rolled back, and the client read the
generic "That did not save — try again" on every attempt; rule 26 then refused every new
sprint in that Area. `insight_impediment_impact` and `insight_cue_usefulness` joined each
observation once per membership row, so present/absent/logged counts doubled ("Logged 4 of 2
closed days") and a row cleared n≥3 on two real days. `loadSprintMembers` rendered two
decision rows for one item. Reproduced live before the fix: two membership rows, `used_days
2` from one closed day, `finish_review → duplicate key value violates unique constraint`.

**Fix.** `0016_membership_history_and_verdict_predicate.sql`: the decision fill is `select
distinct kind, item_id`; the two functions' `members` CTE is one row per item with
`bool_or(is_highest | is_focus)`. `onePerItem` in `lib/data.ts` collapses the loader's rows
the same way. The history rows are untouched — one row per window is the record.

**Regression test.** `tests/db/completion.test.ts` "after a member is removed and added
back": closes a day with the cue used, removes and re-adds it, asserts two membership rows,
`used_days`/`logged_days` of 1, and one decision row after a successful `finish_review`.
`tests/unit/across.test.ts` "one row per item" for the loader. Mutations: the fill without
`distinct` turned the review test red; re-applying 0014's `members` turned the count test
red; `onePerItem` as a pass-through turned the unit test red. Each restored and green.

**Where found.** `/full-review` 2026-09-09, adversarial pass (grill C1 / H1); confirmed by a
live probe before any code changed.

## 2026-09-09 — Changing the highest impediment mid-sprint made the postmortem impossible to finish

**Problem.** `finish_review` demanded a verdict when ANY observation was `was_highest and
occurred = 'yes'`, while the postmortem decides whether to show the verdict chips from
`insight_response_followthrough`, which reads only the CURRENT highest
(`sprint_impediments.is_highest`) and joins on the day's snapshot `highest_impediment_id`.
Promote B after A occurred on day 2 and B never occurs: the card says "never showed up", the
UI sends `verdict: null`, the DB raises `verdict_required`, and nothing on screen can change
that. Rule 26 locks the Area. Reproduced live: follow-through `occurrences 0` for B,
`finish_review(null) → verdict_required`, `finish_review('worked') → OK` — a verdict the UI
never offers was the only way through.

**Fix.** 0016 keys `v_occurred` to the current highest with the follow-through function's
own predicate (effective day, `highest_impediment_id = current highest`, `was_highest and
occurred = 'yes'`). The SPEC (F10, `finish_review`) already said "the sprint's highest
impediment", singular. The earlier highest's answers stay on the day rows and are not shown
on that sprint's cards (BACKLOG).

**Regression test.** `tests/db/completion.test.ts` "verdict after the highest impediment
changed mid-sprint": A occurs on day 1, B is promoted, the sprint ends; asserts the
follow-through row is `[B, 0]`, a verdict is refused (`verdict_not_applicable`) and a
review without one succeeds. Mutation: dropping the `highest_impediment_id = v_highest`
clause turned it red; restored, green.

**Where found.** `/full-review` 2026-09-09 (correctness, architecture and grill passes all
named it; the correctness reviewer first); confirmed by a live probe before the fix.

## 2026-09-09 — The Across page's recovery note could contradict the rate beside it

**Problem.** `groupRecovery` voted a sprint into "Recovered at least half the time in k of
n" from `with_recovered + without_recovered`, but the SQL's displayed rate counts every
`recovered = 'yes'`, including days whose response answer was `unsure` — which the close-day
form allows. Three occurrences (unsure/yes, unsure/yes, yes/no) rendered the tail `67%
recovered` beside `Recovered at least half the time in 0 of 1 sprint`. Executed against
the real functions during the F11 review.

**Fix.** `lib/across.ts` votes from the row's own `rate` (null → no vote). Recovery therefore
votes only where the card shows a rate (3 answered), one step above the 2-day bar the other
tri-state note keeps; the row carries no yes-count below that bar, and adding one would have
meant new SQL. The SPEC's F11 recurring-note rule is amended to say so.

**Regression test.** `tests/unit/across.test.ts` "votes with the rate the tail shows" on the
exact three-occurrence input, and "does not vote below the bar". Mutation: restoring the
bucket arithmetic turned the first red; restored, green.

**Where found.** `/review-changes` on `9cd1325`, 2026-09-09.

## 2026-09-09 — The Suggested kit quoted another impediment's recovery rate

**Problem.** `suggestedKit` took the first `enough` recovery group in the scope and appended
its rate to the follow-through sentence, which names a different item's response whenever
the newest sprint's highest has a thin recovery and an older sprint's highest has a full one.
Executed: "The response for Starting late runs 75% of the time and recovers 60% of the
time", where 60% belonged to Doomscrolling.

**Fix.** `lib/acrossCards.ts` pairs the recovery group by `item_id` and Area with the
follow-through group it names; no match, no clause.

**Regression test.** `tests/unit/across.test.ts` "quotes a recovery rate only for the
response it just named" (the executed input) and "on All areas the same item in another
Area is a different response". Mutation: the unpaired `find` turned the first red.

**Where found.** `/review-changes` on `9cd1325`, 2026-09-09.

## 2026-09-09 — The postmortem's coverage line counted a day that could never be logged

**Problem.** The postmortem's "Logged n of m closed days" used `sprint_review_summary.
closed_days`, which includes a zero-target closed day, while observations only exist on
`sprint_days_effective` days (target > 0) and the Across page counts those. The same sprint
read "of 13" on one screen and "of 12" on the other.

**Fix.** `effectiveClosedDays(days)` in `lib/insightCards.ts` — closed, not cancelled,
positive target — feeds both coverage lines in `Postmortem.tsx`. The result card's "n days
closed" keeps the summary's count: a zero-target day was closed, it just could not speak.

**Regression test.** `tests/unit/insightCards.test.ts` "excludes a zero-target closed day".
Mutation: dropping the target clause turned it red.

**Where found.** `/review-changes` on `9cd1325`, 2026-09-09.

## 2026-09-08 — Ten new F10 functions were executable by `anon`

**Problem.** Postgres grants EXECUTE to PUBLIC on every newly created function, and PUBLIC
reaches the `anon` role. `0012_sprint_completion.sql` granted its ten entry points to
`authenticated` but never revoked the implicit grant, so `complete_sprint`,
`end_sprint_early`, `finish_sprint`, `finish_review`, `sprint_best_streak`, the four
insight calculations and `sprint_review_summary` were all callable by an unauthenticated
request. `0002_function_privileges.sql` records the same finding for 0001's functions —
the note was there and the new migration did not follow it. Found by the existing pin in
`tests/db/grants.test.ts` ("anon can execute no function in public") on the first run
after the migration applied.

**Fix.** `0013_f10_function_privileges.sql` revokes all ten from `public, anon` and
re-applies the `authenticated` grants (revoking from PUBLIC also drops what a role held
only through it). Nothing was exploitable in practice — every one of these raises
`not_authenticated` on a null `auth.uid()` — but the invariant is "anon can execute no
function in public", and a future function that forgets its own check would have had no
second line of defence.

**Regression test.** Already existed and is what caught it: `tests/db/grants.test.ts`
asserts the anon-executable set is empty and pins the authenticated set, which now names
the ten additions.

**Where found.** F10 build, first `npm run test:db` after `0012` applied.

---

## 2026-09-08 — The postmortem's "Reviewed" date was a day ahead of the sidebar's

**Problem.** The read-only postmortem rendered its stamp as
`formatIsoDate(review.completed_at.slice(0, 10))`. `completed_at` is a UTC timestamp, so
slicing the ISO string takes the **UTC** calendar date and prints it as if it were a local
one. The Insights sidebar used `stampDate`, which converts at the edge. Between 5pm and
midnight Pacific the same review therefore read "Reviewed September 8" on the page and
"Reviewed Sep 7" in the sidebar. Found in the Chrome desktop check, by reading the two
lines on one screen.

**Fix.** The postmortem uses `stampDate(review.completed_at)`, the same helper as every
other timestamp stamp in the app (the global rule: times are UTC in the database, convert
at the edge). `formatIsoDate` stays for `date` columns, which are calendar dates with no
zone.

**Regression test.** None added: the failure is a clock-dependent rendering difference
that a test would have to freeze the clock and the zone to catch, and the durable fix is
that no timestamp column is formatted with `formatIsoDate` anywhere. Recorded here so the
next `.slice(0, 10)` on a timestamptz is recognised on sight.

**Where found.** F10 build, Chrome desktop check of the finished postmortem.

---

## 2026-09-07 — Creating the vision's obstacle by name failed with the "main obstacle" copy

**Problem.** `setVisionObstacle` passed `p_impediment_id: undefined` when the user named a
new impediment instead of picking one. supabase-js drops an undefined key from the RPC
body, so PostgREST looked for `set_vision_obstacle(p_explanation, p_name)`, found no such
signature and answered with a schema-cache error. `friendlyError` then matched the code
`vision_obstacle` inside the function name in that message and showed "This impediment is
the vision's main obstacle" on an empty library. The DB tests passed because they send an
explicit `null`. Found by the F9 golden path (step 2, "Create the impediment").

**Fix.** The action sends `p_impediment_id: null` explicitly (the parameter has no default
in 0011, by design: exactly one of id / name is the rule).

**Regression test.** `e2e/golden-path.spec.ts` (both projects): step 2 with no global
impediments creates "Starting late" by name and must land on step 3.

**Where found.** `npm run test:e2e`, first F9 run.

## 2026-09-07 — A cue created inside the Today "Add cue" picker appeared twice

**Problem.** `SprintItemsRow`'s picker listed `[...candidates, ...created]`. `createItem`
revalidates the layout, so the fresh cue arrived in `candidates` from the server while
`created` still held the local copy: two identical rows, two radios with the same name.
Present since F2; no test had exercised the picker's create row.

**Fix.** `created` contributes only the ids `candidates` does not already carry.

**Regression test.** `e2e/golden-path.spec.ts` (both projects): after creating a cue in
the Today picker, `getByRole("radio", { name: /Close the laptop at nine/ })` must resolve
to one element (strict mode fails on two), be checked, and "Add to sprint" must bring the
cue count to 2. Found by the F6 e2e step that covers the picker's WHEN + REMIND row.

---

## 2026-09-06 — On a phone every form zoomed on focus, the plan grid overlapped itself, and the sidebar pushed Today off screen

**Problem.** Three rendering defects on a 390px viewport, confirmed in the phone e2e
capture: (1) `.input` / `.task-text` were 14.5px and eight components set inline sizes
of 13–15.5px on inputs, so iOS Safari zoomed on every focus and stayed zoomed; (2) the
14-day plan drew seven ~39px tracks with `minWidth: 56` cells, so cells overlapped,
D7/D14 clipped and an edit-mode tap on one day landed in the next; (3) the sidebar
rendered in full above the page, so "Today's target" began ~800px down an 844px
viewport.

**Fix.** 16px on the two classes and no inline size on any text field; the plan grid
became class-driven with five columns under 480px, free-shrinking cells at ≤940px and a
stacked cell header; the sidebar collapses to one scrolling chip row at ≤940px
(`SideNav` restyled through `.side-*` classes). See DECISIONS 2026-09-06 (phases 4–6).

**Regression test.** `e2e/golden-path.spec.ts` (phone project): after opening plan
edit mode, every `input`/`textarea` on Today must compute at ≥16px (would list the
plan-edit inputs at 13px before the fix); the existing sideways-overflow assertion and
the `[data-sidebar]` width check still hold; `test-results/today-phone.png` is the
visual record. The grid overlap has no automated assertion (overflow is inside the
strip); it was verified in the capture.

**Where found.** The full audit (`docs/audits/full-audit-2026-09-05.md`, mobile findings
#1–#3, the only auditor to catch them), verified in the phone render before the fix.

---

## 2026-09-06 — Designating a Highest Impediment wrote its Proof Point before the call that could reject it

**Problem.** `setHighestImpediment` (server action) updated `impediments.proof_when /
proof_then` first and called the `set_highest_impediment` RPC second. When the RPC
rejected the designation — `not_in_sprint`, `sprint_not_active`, a foreign sprint —
the user saw the error while the library row had already changed. Two individually
correct writes with no transaction between them.

**Fix.** Migration `0008_audit_remediation.sql` gives `set_highest_impediment` two
optional parameters (`p_proof_when`, `p_proof_then`); the function writes the proof and
flips the flag in one transaction, and rejects before writing. The action passes the
proof through and writes nothing itself.

**Regression test.** `tests/db/libraries.test.ts` "set_highest_impediment writes the
proof it is given in the same transaction; a rejected call writes nothing (0008)":
designates a proof-less member with a proof (row updated, flag set), then attempts a
removed impediment with a new proof (`not_in_sprint`, proof byte-identical before and
after), then a blank half (`proof_point_required`, proof unchanged). Against the 0004
function the first call fails on arity, so the test cannot pass without the fix.

**Where found.** The full audit (`docs/audits/full-audit-2026-09-05.md`, test-audit
finding #8), by reading the action; no test reached it.

**Rule.** A multi-row write that must succeed or fail together lives in one SQL
function, as `start_sprint` already does — never in two client calls.

---

## 2026-09-05 — A redefined trigger function dropped the columns a later migration had added

**Problem.** Migration 0007 had to add `closed_on_time` to the lock in
`sprint_days_immutable_after_close`. The first draft copied the function body from
0001, where it was created, and added the column — but 0004 had already redefined the
same function to lock the Highest Impediment snapshot (`highest_impediment_id`,
`proof_when`, `proof_then`). `create or replace` took the stale body whole, and a closed
day's snapshot became writable again. Nothing in the migration looked wrong on its own;
only the history made it wrong.

**Fix.** Rebuilt the function from the *latest* definition (`grep -n "function
public.<name>"` across every migration, take the last hit) and added the column to
that. Then a local `supabase db reset` so 0001–0007 applied from disk.

**Regression test.** Already existed: `tests/db/libraries.test.ts` "a closed day's
selections and snapshot are immutable" went red on the first run and green on the
second. That is the
check that could fail, and it did.

**Where found.** The DB suite, on the first run after applying the draft — before any
commit.

**Rule.** Before `create or replace function` in a migration, find the most recent
definition, not the first one. A lint that diffs the new body against the previous one
is in BACKLOG.

---

## 2026-08-25 — Governance was writable from the shell; the docs claimed otherwise

**Problem.** `write_guard.py` is registered for `Edit|Write|MultiEdit` only, so it
never sees a shell command. `CLAUDE.md` nonetheless stated, under a heading reading
"Guardrails (deterministic — do not weaken)", that "`.claude/`, `.githooks/`, and
this file change only via the human". Measured against the live guard, eight shell
forms rewrote or deleted governance at exit 0: `cp foo CLAUDE.md`,
`sed -i 's/a/b/' CLAUDE.md`, `echo hi > CLAUDE.md`,
`cat foo > .claude/settings.json`, `cp foo .claude/commands/interview.md`,
`rm CLAUDE.md`, `mv foo.md CLAUDE.md`, `tee CLAUDE.md < foo`. Controls in the same
run (`--no-verify`, `git push --force`, `cat .env`) returned exit 2, so the probe
could distinguish. Found while installing a human-approved `CLAUDE.md` change: the
copy succeeded through a layer that was documented as closed.

**Fix.** Added `check_governance()` to the user-level `~/.claude/hooks/shell_guard.py`,
called per segment beside `check_recursive_delete`. It is token-based rather than a
regex over the command string, for the same reason `strip_quoted()` exists: a commit
message may legitimately name `CLAUDE.md`, so only the operands of a verb that
actually writes are treated as targets. `cp`/`mv`/`install`/`ln` contribute only
their LAST operand, keeping `cp CLAUDE.md /tmp/backup` (a read) allowed. Paths are
resolved against `CLAUDE_PROJECT_DIR` exactly as `write_guard.py` resolves them, so
the two guards cannot drift about what is protected, and `docs/proposed/CLAUDE.md`
— the sanctioned route for drafting a governance change — stays writable. `import os`
was added with it: without it the `NameError` would have been swallowed by the
module's fail-open `except`, and the guard would have allowed everything silently.

**Also fixed the claim, not just the code.** The shell guard is user-level and
machine-local (handoff B2), so this protection does not travel with the template.
`CLAUDE.md` and `README.md` now separate what ships with the repo (`write_guard.py`,
write tools only) from what is machine-local (`shell_guard.py`, the shell route),
and say plainly that on a machine without `~/.claude` configured, governance is
freely rewritable from the shell.

**Regression test.** 27 cases in `~/.claude/hooks/test_shell_guard.py` (suite 249 →
276): 16 BLOCK covering every measured bypass in both shells plus the glued
redirect, quoted destination, `dd of=`, and a second-segment form; 11 ALLOW pinning
the over-block direction — reading, `cp` governance *out*, `git add CLAUDE.md`, a
commit message naming the file, `docs/proposed/CLAUDE.md`, `docs/CLAUDE.md`, and the
near-miss directory `.claudette/`. Mutation `d1-governance-off` disables the check
and asserts exactly those 16 turn red with no collateral — verified: 16 expected, 16
actual. The fix was confirmed against itself: `cp docs/proposed/CLAUDE.md CLAUDE.md`,
the exact command that exposed the hole earlier in the session, is now blocked.

## 2026-08-25 — `.githooks/pre-commit` has never run in this clone

**Problem.** `core.hooksPath` is unset at local, global and effective scope, and
`.git/hooks/` holds no non-sample hook, so `.githooks/pre-commit` is inert here —
including for the commits made in this session. `CLAUDE.md` listed it among the
guardrails with no indication that it requires per-clone wiring, which reads as an
active verification layer and is a false-green path for anyone trusting the list.

**Fix — documentation only, deliberately.** `README.md` setup step 2 and
`~/.claude/new-app.ps1` (Step 2, with a readback assertion) already wire it for real
apps, and `README.md` residual gap 5 already recorded that this clone is unwired;
the defect was that `CLAUDE.md` did not. It now describes the hook as a per-clone
layer that does nothing until `git config core.hooksPath .githooks` is run, and says
this template's own commits are not gated by it. This clone was deliberately left
unwired: it has no `package.json`, so the hook would allow every commit anyway, and
wiring it would buy no protection while adding a claim to maintain. No shell-guard
exemption was added for the wiring command — `git config core.hooksPath` stays
blocked in both directions.

**Regression test.** None, and that is the honest position: the defect was a false
claim in prose, and `test_pre_commit.py` already covers the script's logic while
explicitly not covering its installation (README residual gap 5). A test asserting
"this clone is unwired" would pin an accident rather than a requirement.

---

## 2026-08-24 — Deny rules blocked safe work: unstaging and single-file deletion

**Problem.** Two `permissions.deny` rules blocked legitimate operations that the
hook layer deliberately allowed. `Bash|PowerShell(git reset:*)` is a prefix
matcher, so it caught `git reset HEAD file` — the ordinary way to unstage —
along with `git reset` and `git reset --soft`. `PowerShell(Remove-Item:*)` caught
every single-file deletion. Neither over-block bought anything: the destructive
forms they were aimed at (`reset --hard`, recursive delete) are caught by
`shell_guard.py`, which parses flags and so is not fooled by order, position, or
alias. The handoff's kill criteria name a blocked safe action as a framework
defect in its own right, equal in weight to a missed destructive one, because an
over-block is what teaches an agent to route around the guard.

**Fix.** Narrowed to `Bash|PowerShell(git reset --hard:*)` and
`PowerShell(Remove-Item -Recurse:*)`. Dropped the redundant `Read(./.env)` /
`Read(./.env.*)` variants, which `Read(**/.env)` / `Read(**/.env.*)` already
subsume. The deny list now claims only what a prefix matcher can actually see;
the hook covers the rest, which was already true and is now also honest.

**Regression test.** Both directions asserted in `test_shell_guard.py`: six ALLOW
cases (`git reset HEAD file` in both shells, `git reset`, `--soft`, `--mixed`,
single-file `Remove-Item`/`ri`/`-Path`) and BLOCK cases for `reset --hard` bare,
with a ref, behind `-C`, and after `&&`. Because the deny rule narrowed, the hook
is now the ONLY layer catching `-Recurse` in non-leading position, so five cases
pin exactly that: `-Force -Recurse`, trailing `-Recurse`, `-Path … -Recurse`, and
the `rd` / `erase` aliases. Two named-set mutations (`b4-git-reset`,
`b4-ps-recursive`) prove those cases fail when the narrowing is reverted or the
flag scan is disabled, and that nothing outside the named set moves.

**Where found.** Recorded in BACKLOG during Session A; fixed in Session B.

---

## 2026-08-24 — Four layers disagreed about whether `.env.example` was a secret

**Problem.** `shell_guard.py` ALLOWED `.env.example` via an explicit
`(?!\.example|\.sample|\.template)` carve-out. `write_guard.py` BLOCKED it.
`.gitignore` carried a `!.env.example` negation implying the file should exist
and be committed. `permissions.deny` blocked `**/.env.*`, which includes it. So
the agent could read the file through the shell, could not create it with Write,
and git was told to commit a file two guards treated as secret. Every layer was
individually defensible and the set was incoherent — the failure mode of an
exception that has to be restated correctly in four places.

**Fix.** Deleted the exception instead of synchronising it. The non-secret
example file is now `env.example`, with no leading dot, which does not contain
the substring `.env` and therefore cannot match any secret rule in any layer.
`ENVFILE` in `shell_guard.py` is plain `\.env`; the `!.env.example` negation is
gone from `.gitignore`. Every `.env*` is secret, with nothing to keep in step.

**Regression test.** `test_shell_guard.py`: `.env.example`, `.env.sample` and
`.env.template` must now BLOCK (these three flipped from ALLOW, which is the
change); `env.example` must be readable and writable in both shells and in a
subdirectory; `cp env.example .env` must still block, so the rename cannot be
used as a laundering route. `test_write_guard.py` asserts the same file set from
the write side. `.gitignore` behaviour proven directly with `git check-ignore`:
`.env.example` ignored, `env.example` tracked. Mutation `b3-env-carveout`
restores the carve-out and turns exactly those three cases red.

**Where found.** Recorded in BACKLOG during Session A; fixed in Session B.

---

## 2026-08-23 — Guard rules were absent on the PowerShell tool entirely

**Problem.** `bash_guard.py` was registered with `"matcher": "Bash"`. On Windows
the PowerShell tool is the primary shell, so every protection in it — the
`--no-verify` block, the `core.hooksPath` block, the migration and `.env` rules,
and the evaluator read-only allowlist — did not run at all on the path most
likely to be used. The `permissions.deny` list had the same gap: `Bash(...)`
rules do not match PowerShell tool calls.

**Fix.** Renamed to `shell_guard.py`, registered `Bash|PowerShell`, and made it
shell-aware: PowerShell separators, alias canonicalization (so `gc`, `type`,
`rm`, `ri` resolve to their cmdlet before matching), and quote-stripping (so a
literal inside a commit message cannot fake a flag). PowerShell mirrors added to
`deny`, `ask`, and `allow` in `.claude/settings.json`.

**Regression test.** `scripts/hooks/test_shell_guard.py`, 61 cases, both
directions. Verified falsifiable: disabling the `core.hooksPath` rule turns it
59/61 red on exactly the two hooksPath cases, and restoring returns 61/61.

**Where found.** Config review of the template against `~/.claude`.

## 2026-08-23 — `.env.example` was blocked from being read

**Problem.** The `.env` rules matched `\.env(\.|$|\s)`, so `.env.example` —
committed on purpose, and explicitly re-included in `.gitignore` — was treated
as a secret file and blocked. Same for `.env.sample` and `.env.template`. This
was pre-existing in `bash_guard.py`, not introduced by the PowerShell work; it
surfaced only because the new test table includes must-ALLOW cases.

**Fix.** `ENVFILE = r"\.env(?!\.example|\.sample|\.template)"`, applied to every
env rule in both shells. `.env`, `.env.local`, and `.env.production` stay
blocked.

**Regression test.** Four cases in `test_shell_guard.py`: `.env.example` and
`.env.sample` must be allowed; `.env.local` and `.env.production` must stay
blocked. The last two are what stop this fix from becoming a hole.

**Where found.** First run of the new `shell_guard` test table — a
block-only test suite would not have caught it.

## 2026-08-23 — Recursive delete and force push were reachable around both layers

**Problem.** `permissions.deny` matches on a command *prefix*, so `Bash(rm -rf:*)`
covered `rm -rf x` and nothing else — not `rm -fr x`, not `rm -r -f x`, and not
`cd s ; rm -rf x`, where `rm` is not the first token. `shell_guard`'s own `rm`
rule did not close the gap: it only fired when the target was `/`, `~`, or
`$HOME`, so **project files were never protected by either layer**. Force push
had the same shape: the rule required `--force`/`-f` *and* an explicit
`main`/`master`, so `git push --force-with-lease` and the refspec form
`git push origin +main` both passed.

Found by a `/permissions` review in a scaffolded app, then reproduced against
the hook directly: seven commands that should have been blocked were allowed.

**Fix.** Recursive deletes now go through `check_recursive_delete()`, which walks
every command segment and reads the flags, so flag order, flag splitting,
abbreviation, aliasing, and position in the line all stop mattering. Force push
is matched on every spelling: `--force`, `-f`, `--force-with-lease`,
`--force-if-includes`, and `+ref` refspecs, on any branch rather than only
main/master.

Single-file deletes stay allowed in **both** shells — `rm file.txt` and
`Remove-Item one.txt`. The hook draws its line at the recursive case, which is
the data-loss event; blocking every delete would leave the ALLOW column proving
nothing and would fire constantly on temp files. The template's
`PowerShell(Remove-Item:*)` deny rule is still the stricter layer inside a
scaffolded app, and the `CLAUDE.md` hard stop ("show me what something is
before you delete it") governs single-file deletes behaviourally everywhere.
**Residual risk, stated plainly: a single-file delete is not mechanically
gated outside a template-derived project.**

**Regression test.** 23 new cases in `test_shell_guard.py` (84 total). Verified
falsifiable: removing the `check_recursive_delete()` call turns it 69/84 red on
exactly the delete cases, and restoring returns 84/84.

**Lesson for the next app.** A prefix-matched deny rule is a statement about one
spelling of a command, not about the capability. Anything genuinely destructive
needs the hook layer, where the command can be parsed.

## 2026-08-23 — Reading the hooks path was blocked as if it were a write

**Problem.** The rule matched any `git config` line mentioning the hooks path,
so reading the value was blocked along with setting it — including the bare
read that `/new-app` step 2 uses to verify the path took. An over-block on a
read is worse than a miss: it teaches the agent to route around the guard.
It fired for real mid-session, on a commit message that merely quoted the
command.

**Fix.** Split into write-only forms — a value following the key, or
`--unset` / `--unset-all` / `--replace-all` / `--add`. Reads pass.

**Regression test.** 9 cases (95 total): four write forms blocked, four read
forms allowed, plus the PowerShell mirror.

**Where found.** A real session, not a review.

## 2026-08-24 — Every destructive git command was reachable by adding a global option

**Problem.** The git rules matched the raw command line, so they only knew one
spelling of each command. Git accepts global options *before* the subcommand,
and every one of them defeated the guard. Measured against the shipped guard,
11 of 13 destructive forms exited 0 — through the hook AND through
`permissions.deny`, which is prefix-matched and misses the same forms:
`-C repo`, `-c color.ui=false`, `--git-dir=`, `--work-tree=`,
`--config-env=core.hooksPath=`, and `GIT_CONFIG_*`/`GIT_DIR` environment
prefixes, against `reset --hard`, `clean -fd`, `push --force`, `commit
--no-verify` and `checkout -- .`, in both shells.

The same line-oriented matching produced a false POSITIVE: the reset rule fired
on the path *text* in `--git-dir=/tmp/r/dotgit reset --hard` while missing the
identical command with `--git-dir=/srv/repo`. One bad mechanism, both error
directions.

**Fix.** Git handling became parse → normalize → match. Each segment is
tokenized, leading `NAME=VALUE` assignments and git global options are lifted
off, and the rules match the resulting `git <subcommand> ...` form — so one rule
now covers every spelling of its command class instead of one string. The lifted
globals are judged separately, because anything setting `core.hooksPath` IS the
bypass rather than a detail of it. An unknown global that swallows the
subcommand slot fails CLOSED rather than matching rules against a non-command.

The tokenizer is purpose-built, not `shlex`: `posix=False` splits
`--git-dir="C:\p with spaces\x"` into three tokens because it only honours a
quote that OPENS a token — which would have recreated the bypass — and
`posix=True` discards the quoted-ness needed to stop `-m "the -n flag"` from
faking a flag. Plain `.split()` fails the same way, which is why the handoff
forbade it.

**Regression test.** `scripts/hooks/test_shell_guard.py`, 172 cases (up from
95), both directions, including quoted Windows paths with spaces, chained and
substituted forms, and PowerShell mirrors. Verified falsifiable by
`--mutate`, which disables ONLY the global-option lifting and asserts that
exactly 22 named cases turn red and nothing else moves. That assertion caught a
real error while being written: three cases originally claimed as covered by
normalization survived the mutation, because a leading `NAME=VALUE` does not
break `git <verb>` adjacency and because `...\.git reset --hard` contains the
pattern by coincidence — the very false positive above. They were removed from
the claim and a discriminating variant added.

**Where found.** Reproduced against the shipped guard before any edit.

## 2026-08-24 — A secret in a MultiEdit was written with no hook objecting

**Problem.** Two hooks ran on every write. `protect_paths.py` read
`tool_input.file_path`, which MultiEdit has; `scan_secrets.py` read only the
flat content keys (`content`, `new_string`, `new_str`, `file_text`), which
MultiEdit does not use — its text lives in `edits[].new_string`. So an AWS key
in a MultiEdit exited 0 while the identical key in a `Write` exited 2. Two
processes on the hot path, and the hole was in the seam between them.

**Fix.** One `write_guard.py` on `Edit|Write|MultiEdit`, scanning every field a
write can carry text in, `edits[]` included. Secret classes extended with
`whsec_`, `(sk|rk)_(test|live)_`, `sntrys_`, and Postgres URLs carrying an inline
password; Stripe `pk_` publishable keys are deliberately NOT matched. The
Python Read hook was deleted outright — `permissions.deny` is the hard Read
layer, it is the only one that also covers `@file` mentions, and removing it
takes ordinary reads to zero custom processes.

**Regression test.** `scripts/hooks/test_write_guard.py`, 44 cases, both
directions — secrets in the first, middle and last `edits[]` entry (a
traversal that only checked `edits[0]` would pass two of three), `pk_` and
password-less Postgres URLs asserted ALLOWED, plus governance, forward-only
migrations and env files. Verified falsifiable by `--mutate`, which removes the
`edits[]` traversal and asserts exactly the four MultiEdit-secret cases turn
red.

**Where found.** Reproduced against the shipped hooks before any edit.

## 2026-08-24 — The evaluator graded a tree that never existed

**Problem.** `evaluator.md` carried `isolation: worktree`. Per the subagent
reference, that worktree is branched from the repository's DEFAULT BRANCH, not
from the parent session's `HEAD` — so the evaluator saw neither uncommitted work
nor, on a feature branch, committed work. It was grading something that had
never existed on anyone's disk, and reporting PASS/FAIL about it.

**Fix.** Removed `isolation: worktree`; the evaluator now inspects the real
working tree. Because that removes the sandbox, three things replace it: a
`git status --porcelain` invariant (main session before = evaluator first =
evaluator final, any difference invalidates the evaluation — and NOT
`--untracked-files=no`, which hides exactly the files being checked for); the
existing shell allowlist, extended to block reads of `PROGRESS.md`,
`session-context.md` and `docs/evals/` since the evaluator keeps `cat`; and a
new `evaluator_guard.py` on `Read|Grep|Glob`, registered in the agent's own
frontmatter `hooks:` so it runs ONLY for that subagent and ordinary sessions
keep zero processes on the Read path.

**Regression test.** `scripts/hooks/test_evaluator_guard.py` — 18 behaviour
cases (the three sources blocked, SPEC/source/migrations allowed, and the block
scoped to the evaluator rather than global) plus 11 contract checks asserting
`evaluator.md` still says what the guard assumes. Verified falsifiable: the
contract half fails 6/11 against the pre-fix `evaluator.md`.

**Verified live (2026-08-24), full dispatch.** A real evaluator session in a
purpose-built repo whose `HEAD` lacks the feature and whose working tree has it:
- sees the uncommitted work — read the working-tree file carrying a marker
  absent from `HEAD`, and graded the acceptance criterion PASS that the `HEAD`
  version FAILS. Under `isolation: worktree` the verdict inverts, so the removal
  is load-bearing and not cosmetic;
- reads of `PROGRESS.md`, `session-context.md` and a prior eval were all BLOCKED
  by the live frontmatter hook, returning `evaluator_guard.py`'s own message;
- a shell mutation (`echo mutated >> src/total.js`) was BLOCKED, and the target
  file contains no `mutated` line;
- `git rev-parse` was blocked by the git-history rule, incidentally confirming
  the evaluator branch is live;
- `git status --porcelain` byte-identical before and after, checked
  independently rather than taken from the agent's report.

Frontmatter hooks DO fire and `${CLAUDE_PROJECT_DIR}` IS expanded in the hook
command; the registration was changed from a bare relative path to the
`${CLAUDE_PROJECT_DIR}` form, since a relative path resolves against the hook
process's cwd rather than the project root.

**Discovered by that run — workspace trust gates the whole thing.** The first
dispatch, with the definition PROJECT-level in an untrusted folder, read all
three forbidden files without objection. Claude Code had silently skipped the
frontmatter hooks:

```
[ERROR] Skipping frontmatter hooks for main-thread agent 'evaluator': the folder
its definition file came from is not trusted (source: projectSettings).
```

The evaluator still ran — with no read isolation, and no signal outside the
debug log. Re-running with the identical definition from a trust-free source
(`~/.claude/agents/`) blocked all three. So the guard is correct and the gate is
trust. `-p` / non-interactive runs skip the trust dialog, so an evaluator
dispatched from CI in an untrusted folder has no read isolation at all. The
project shell guard is unaffected — it comes from `settings.json` and ran in
both cases, which is why mutation was blocked even in the untrusted run.

**Where found.** Handoff v2.2 A3; the default-branch detail confirmed in the
subagent reference, not assumed. The trust gate was found by the live run, not
by reading docs — the structural tests passed 11/11 while the read isolation was
entirely absent, which is exactly the failure mode structural tests cannot see.

## 2026-08-24 — A dead evaluator guard was indistinguishable from a live one

**Problem.** Follow-on from the trust finding above. From inside the evaluator,
"my read guard is running" and "my read guard is not running" look identical:
both present as reads that simply succeed. The untrusted live run produced a
full, confident, well-evidenced evaluation report while having read the build
log, the session context and a prior eval. Nothing in the harness noticed; the
only trace was one line in a debug log nobody reads on a green run.

**Fix.** A self-probe. `.claude/evaluator-hook-probe.txt` is a committed
sentinel containing no project information, added to `evaluator_guard.py`'s
denied set with its OWN message. The evaluator's Step 0 — before SPEC.md,
before any shell command — is to Read it:

- blocked → the guard is alive, say so and continue;
- succeeds → **P0 HARNESS FAILURE**, abort immediately, grade nothing;
- "does not exist" → also a harness failure; the sentinel was deleted and the
  probe can no longer tell you anything.

The sentinel is deliberately meaningless. Probing a real file such as
PROGRESS.md would be self-defeating: the probe only "fires" when the guard is
dead, which is exactly the moment the read succeeds and contaminates the
evaluator with the history it must be blind to. The file must also EXIST — a
missing file returns "does not exist", which reads like a block and would make
the probe lie in the one direction that matters.

`CLAUDE.md` now tells the main session that a P0 HARNESS FAILURE means no
evaluation happened: do not record it, do not act on any grade in it.

**Regression test.** 3 behaviour cases (sentinel blocked, absolute and
backslash spellings) and 6 contract checks: the sentinel exists, carries no
project tokens, returns a message distinguishable from the isolation block, and
the agent body performs the probe and defines the abort path. That last check
caught a real defect while being written — `P0 HARNESS FAILURE` was split across
a line wrap in the agent body and was not a contiguous string.

**Known limitation, not solved here.** Under `claude -p` / CI the trust dialog
is skipped entirely, so project-level frontmatter hooks cannot be assumed
active. The probe now makes that state loud instead of silent — the run aborts
with P0 rather than producing a clean-looking report — but it does not make the
hooks run. A headless trust mechanism is deliberately out of scope.

**Where found.** The live A3 verification run, not a review.

## 2026-08-24 — The secret scanner blocked its own documentation

**Problem.** The Postgres rule matched any `postgres://user:pass@host`, which
includes the canonical placeholder `postgres://user:password@host` — the exact
string that belongs in a README or `env.example`. Blocking a legitimate write is
a defect by the same standard as missing a real one, and this one would have
trained the obvious workaround: stop writing connection-string docs.

**Fix.** `check_postgres_urls()` captures user, password and host and exempts
only what cannot be a live credential:
- a TEMPLATED password (`<password>`, `${DB_PASSWORD}`, `{{pw}}`, `%VAR%`,
  `$VAR`, `****`) — exempt on its own, since it is not a literal;
- a literal placeholder word (`password`, `changeme`, …) — exempt ONLY when the
  username is also a placeholder, so the whole URL reads as illustrative.

`postgres://svc_billing:password@prod-db.internal/app` therefore still blocks: a
real service account beside a weak password is a leak, not documentation. This
is intentionally not a general database-URL bypass.

**Regression test.** 13 cases both directions — realistic credentials blocked
with placeholder-looking and real usernames, in docs, and in a later MultiEdit
entry; placeholders and templated forms allowed. Two cases pin the sharp edges:
a placeholder sitting beside a real credential does not launder it, and a
placeholder password with a real username still blocks. Verified falsifiable by
forcing the exemption on and off: ON turns 8 BLOCK cases red, OFF turns 7 ALLOW
cases red, with no overlap — so both the rule and its narrowness are
load-bearing.

**Where found.** Flagged as a disagreement when A2 was implemented to spec, then
fixed on instruction.
