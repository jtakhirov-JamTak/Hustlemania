# DECISIONS

(Important decisions, approved exceptions, RCA notes. Date each entry.
Inclusion test: record it only if a future session would reasonably ask
"why did we do this?" — otherwise don't.)

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
remains open") — the UI and the DB agree on what "open" means, and F6 closes both at
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
