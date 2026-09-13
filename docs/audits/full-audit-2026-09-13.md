# Full audit — 2026-09-13

Whole-repo sweep of F1–F19 at commit `e08f894` plus the uncommitted F19 work (eleven
paths: `components/today/TodayEntry.tsx`, `lib/todayEntry.ts`, `TaskList.onRows`, the
rewritten e2e day-1 section, the docs) via `/full-audit`: ten parallel report-only
auditors plus a live schema check against the **hosted** project. Nothing was fixed; the
working tree read identical before and after (`git status --porcelain`, eleven entries).
Severities below are the synthesizer's; where an auditor rated differently, the original
rating is noted. `.claude/exceptions.md` does not exist, so nothing was suppressed.

## Phase 0 — verification gate

`npm run verify` green at 01:15Z on this tree: typecheck, lint, hooks 60/21+23/6+5, unit
215 + 3 skipped, DB 325, e2e 12 + 6 skipped (the deployed project, no `DEPLOY_URL`).
`npm run build` green: compiled, 19 routes. The `.next` directory was **not** cleared
first — the shell guard blocks recursive deletes — so this was a warm build; the verify
script itself starts from `next typegen`.

## Phase 2 — live DB (hosted project `zcdvuhcslwalhziinfqz`, read-only)

The expected set is the local database built by `db reset` from migrations 0001–0022
(the source), compared object-for-object against the hosted database over a direct
connection. Identical: 20 tables, 200 columns (type, nullability, default), 78 indexes
(definition hash), RLS enabled on all 20, 30 policies (command, roles, `using`,
`with check`), 62 functions (identity, security, definition hash), 3 views (definition
hash), 23 triggers, 83 check/unique/primary constraints, 28 foreign keys to `auth.users`
with the same delete rule (`pg_constraint`, not `information_schema`), zero `anon` table
grants, 23 `authenticated` table grants, 40 function grant sets. The only hosted extras
are the platform's `rls_auto_enable()` and its `ensure_rls` event trigger — the same
residue `supabase db diff --linked` reports at every release, and it reported nothing else
today. `cron.job` holds `reminders-hourly` at `5 * * * *`, active; the Vault holds
`reminders_secret` and `reminders_url`; `auth.users` holds 7 rows. The tracker also lists
0001–0022 remote, which was not relied on. **VERIFIED.**

Not inspected: hosted Auth settings (site URL, redirect allow-list, `email_sent` rate,
signup toggle, SMTP) — they are not in the database.

## Phase 1 — what each auditor returned

| Skill | Verdict | Count |
| --- | --- | --- |
| check-access | no cross-user path, no authorization defect | 0 HIGH · 4 MED · 6 LOW |
| privacy-audit | 5 must-have open (notice, deletion, three processors) | 5 must · 2 regulated · 3 should · 1 low |
| perf-check | WATCH — one path multiplies with users | 1 HIGH · 4 MED · 5 LOW |
| dep-audit | SUPPLY CHAIN OK — 0 advisories, 415/415 signatures | 0 HIGH · 2 MED · 6 LOW |
| techdebt | scan only | 0 HIGH · 3 MED · 12 LOW |
| test (audit) | one invariant with zero tests | 1 HIGH · 5 MED · 5 LOW |
| observability-check | emission solid, delivery absent | 3 HIGH · 4 MED · 2 LOW |
| a11y-check | WCAG AA gaps, 0 must-fix | 0 must · 7 should · 10 minor |
| mobile-check | needs work, 1 must-fix | 1 must · 6 should · 13 nice |
| launch-residue | READY on its slice | 0 HIGH · 2 MED · 6 LOW |

## Phase 3 — deduplicated findings, severity-ranked

Merged rows: the privacy notice (privacy-audit #1 and launch-residue #1) and the
magic-link redirect origin (check-access #9 and launch-residue #5). The reminder send→mark
pair is kept as three rows because three auditors examined three properties (duplicate
mail · timeout drops the tail · no signal).

### HIGH

| # | Finding | Where | Caught by |
| --- | --- | --- | --- |
| H1 | No error sink and no alert route: every structured event is a `console.error` line in the Vercel runtime log; nothing pages anyone. Every other signal finding inherits this. | `lib/observe.ts:46,57`, `docs/DECISIONS.md:929` | observability only |
| H2 | The reminder cron has no heartbeat: a rotated secret, a paused pg_cron, a deleted job or a stuck pg_net queue produce zero lines, indistinguishable from "nobody due". | `app/api/cron/reminders/route.ts:23,53` | observability only |
| H3 | Parser key absent is silent: a blank `ANTHROPIC_API_KEY` makes every sort answer "fill the parts by hand" with no event; `shouldCapture` has zero callers, so the cooldown latch is dead code. | `lib/capture.server.ts:113`, `lib/observe.ts:63` | observability only |
| H4 | The hourly reminder pass is a strict per-user loop (claim → send → mark, ~350 ms each) with no `maxDuration`; at ~300 users due it times out mid-loop and the tail is silently unmailed every evening. | `lib/reminders/run.ts:40-55` | perf only |
| H5 | The auth-outage branch ("an outage must never look like signed out") has zero tests at any layer; drop `isAuthUnavailable` and every suite stays green while an Auth outage bounces every user to `/login`. | `proxy.ts:36-45`, `lib/supabase/server.ts:50-53` | test only |
| H6 | No privacy notice, no terms, no link to either — while every sort ships the user's own words to Anthropic and reminders ship their email to Resend. Open since the 2026-09-05 audit. (privacy: must-have; residue: MEDIUM) | `app/` (no route), live `/privacy` 404 | privacy + launch-residue |
| H7 | No user-facing or documented deletion path. The DB cascade is sound (28/28 cascade, verified on hosted today), but the request-to-done procedure — identity check, `auth.audit_log_entries`, the owner-held dump files — is not written down. (privacy: must-have) | `docs/SPEC.md:2844`, no `docs/RUNBOOK_DSR.md` | privacy only |
| H8 | Anthropic is an undisclosed processor of verbatim user text, sent automatically when a dictation ends, not only on the button; the account's retention posture (default vs zero-data-retention) is unverified. (privacy: must-have) | `lib/capture.server.ts:92-105`, `components/CaptureBox.tsx:26` | privacy only |
| H9 | The rail's two "Edit" menu buttons are 28 px tall on a phone: `.menu-button` overrides the 44 px coarse-pointer rule for `.j-link` at equal specificity. MOBILE-FLOOR bullet 2 broken on F18's cards. (mobile: must-fix) | `app/globals.css:4227`, `components/Menu.tsx:56` | mobile only |

### MEDIUM

| # | Finding | Where | Caught by |
| --- | --- | --- | --- |
| M1 | **F19, uncommitted.** Retry can duplicate a task: the e2e aborts the third POST *before* the server; a create that commits and loses its response is re-run from the same step and `createTask` has no idempotency key. The SPEC's "nothing is duplicated" is proven only for the pre-server abort. | `components/today/TodayEntry.tsx:59-66`, `app/(app)/actions/tasks.ts:13-21` | test only |
| M2 | **F19, uncommitted.** One Save is 1 + A + C sequential server-action POSTs, each paying claims + `requireUser` + one write, then a `router.refresh()` that re-issues ~25 reads (M9). A 30-task re-record is ~61 POSTs with the box locked. DECISIONS pins "creates made parallel" as a red mutation, so the direction is one ordered batch, which needs the decision amended first. | `components/today/TodayEntry.tsx:48-77` | perf only |
| M3 | Cross-user isolation is tested on 4 of 22 RLS tables; `grants.test.ts` proves RLS is *enabled*, not that each predicate is `user_id`. A future `using (true)` on `tasks_select` stays green. | `tests/db/rls.test.ts:55-108` | check-access only |
| M4 | Two session-gate variants coexist by comment-only convention (`requireUser()` + inline null check for direct-table writes at 12 sites; bare `createClient()` for RPCs) and nothing enforces which an action must use — the exact FIX_LOG 2026-09-09 #23 defect can recur silently. | `app/(app)/actions/*.ts` | check-access (test #5 pins the same gap from the test side) |
| M5 | No rate limit on any authenticated write (37 actions; only the parser is capped) and no app-level cap on the unauthenticated magic-link action; the hosted `email_sent` hourly limit has never been read back. DECISIONS records the limiter as deliberately untouched. | `app/(app)/actions/*.ts`, `app/login/actions.ts:12-38` | check-access only |
| M6 | CSP is `frame-ancestors 'none'` alone; `base-uri 'none'`, `form-action 'self'`, `object-src 'none'` need no nonce and are absent (confirmed on the live headers). | `next.config.ts:7` | launch-residue only |
| M7 | The `parseCapture` action's cap→model seam has no test: reorder the permit below the model call and every suite passes while a rate-limited user reaches the paid model. | `app/(app)/actions/capture.ts:28-52` | test only |
| M8 | `friendlyError` substring mapping is untested and still live for the FIX_LOG 2026-09-07 class: a schema-cache message naming `set_vision_obstacle` renders the obstacle copy; `item_not_in_sprint` matches `not_in_sprint` first. | `lib/errors.ts:69-105` | test only |
| M9 | The area page issues ~25 PostgREST requests per render across four sequential depth levels; `loadSprintObservations` alone is 2+2 and `loadActiveSituations` 4. | `app/(app)/sprints/[area]/page.tsx:41-116`, `lib/data.ts:528` | perf only |
| M10 | The "active" library and situation loaders read every row including archived (with joins the area page never uses) and filter in JS. | `lib/data.ts:379-436` | perf only |
| M11 | The whole eligible library plus all situations travel as client props on every render and every `router.refresh()`. | `app/(app)/sprints/[area]/page.tsx:117-132` | perf only |
| M12 | Magic-link `emailRedirectTo` is built from request `Origin`/`Host`; the two backstops (Next's Origin check, Supabase's redirect allow-list) hold today, but the hosted allow-list has never been read back. (both auditors LOW; raised because the control is out of repo and unverified) | `app/login/actions.ts:23-29` | check-access + launch-residue |
| M13 | Dictation audio goes to the browser vendor's speech servers (Chrome → Google); DECISIONS records "audio never leaves the device", which is wrong on the fact and would poison the privacy notice. (privacy: must-have) | `components/Dictate.tsx:73-80`, `docs/DECISIONS.md:143-146` | privacy only |
| M14 | Resend (and the hosted Auth mailer) are undisclosed processors of every user's email. (privacy: must-have) | `lib/reminders/transport.ts:22-26` | privacy only |
| M15 | No data export (Art. 15/20) and no lawful basis or consent for health-area text that is plausibly special-category data (Art. 9). (privacy: required for the regulated cohort; founder decisions) | `docs/SPEC.md:59-60, 2846`, `0001_init.sql:40-44` | privacy only |
| M16 | `request.error` logs the full URL including `?email=` on the login round-trip; `safeContext`'s 64-char drop lets a 36-char address through. BACKLOG:425 tracks half. | `instrumentation.ts`, `app/login/actions.ts` | privacy only |
| M17 | The magic-link landing has no test at any layer: flip `failed` or drop the `type` allow-list and nothing goes red. | `app/auth/callback/route.ts:19-31` | test only |
| M18 | Two exported server actions have no caller (`setItemSituations`, `createSituation`) — POST-reachable surface that drifts unaudited. | `app/(app)/actions/library.ts:114,123` | techdebt only |
| M19 | `Rail.tsx` (706 lines, eight components) and `lib/data.ts` (1084 lines, 39 functions, one fully dead `observationsOf`) are the two plan-first splits. | `components/today/Rail.tsx`, `lib/data.ts:563` | techdebt only |
| M20 | The empty list row ("Task 1" / "Situation 1") lives in a different child slot from the keyed rows; the first keystroke remounts the input and focus drops to `<body>`. Reached on the F19 box, the wizard, the libraries. Not runtime-verified. | `components/CaptureBox.tsx:163-185` | a11y only |
| M21 | **F19, uncommitted.** Save, Re-record and Cancel each unmount the focused control and announce nothing; the Reviewing/Closed branches of the same card already focus their first field. Sort completion is likewise silent (the status region is emptied). | `components/today/TodayEntry.tsx:69-114`, `CaptureBox.tsx:88-156` | a11y only |
| M22 | Focus is invisible in two places a keyboard user must pass: `.menu-item:focus-visible` (≈1.1:1 on the panel) and the accent-filled empty-area poster where the ring is drawn accent-on-accent. | `app/globals.css:4261, 307-310, 2261-2280` | a11y only |
| M23 | The Today card's title is a span, not a heading; heading navigation skips the page's primary task. Same pattern on wizard step 5 and the vision overview. | `components/today/TodayCard.tsx:76-81` | a11y only |
| M24 | Menu items 40 px with no gap; confidence chips 40 px on one axis at 6 px gaps — the "thumb hits two" case. | `app/globals.css:4245, 4057, 2937` | mobile only |
| M25 | No `interactiveWidget` in the viewport; the dialog footer sits under the soft keyboard on iOS and Chrome Android ≥108 while a textarea is focused. Not device-verified. | `app/layout.tsx:24`, `app/globals.css:795-850` | mobile only |
| M26 | A backdrop tap — the phone reflex for closing the keyboard — discards a half-answered backfill or picker with no confirmation. | `components/Modal.tsx:63-68`, `CloseFlow.tsx:106` | mobile only |
| M27 | The manifest reads the theme cookie but Next emits `<link rel="manifest">` without `crossOrigin`, so the cookie never arrives and a Night install gets the Dusk splash — the fix from full-review 2026-09-09 #28 does not take effect. Not install-verified. | `app/manifest.ts:7-10` | mobile only |
| M28 | No AI-spend signal (cap hits and successes log nothing, no global ceiling); auth has events but `auth.claims_failed` floods with no cooldown; no health probe; browser-side `action.threw` never reaches the server. | `app/(app)/actions/capture.ts:38`, `proxy.ts:38`, `lib/callAction.ts:18` | observability only |
| M29 | eslint 9.39.5 is EOL (registry deprecation, latest 10.x, peers already allow it); TypeScript 5.9 is two majors behind, blocked by typescript-eslint. Dev-only; 0 advisories, lockfile clean, all signatures verified. | `package.json:40,44` | dep-audit only |
| M30 | No retention policy and the owner-held weekly dumps carry emails with no purge step after a deletion; the reminder has no opt-out. (privacy: should-have) | `docs/RUNBOOK_RESTORE.md:17-19`, `docs/RUNBOOK_REMINDERS.md:93` | privacy only |

### LOW (summarised)

`full()` truncation guard on 5 of ~14 list reads · no request-schema parser (hand
validation; RLS backstops) · `sprint_streaks()` lacks the `not_authenticated` raise its
siblings carry · signout POST without Origin check (cookie is SameSite=Lax by library
default, not verified) · invite-list enumerable via `not_invited` (accepted in DECISIONS)
· `revalidatePath("/", "layout")` on 13 library writes · five embeddable sequential awaits
in `lib/data.ts` · `sprints` has no `status` index for the cross-user `reminders_due`
scan · one unused font weight, a 56 KB render-blocking stylesheet · seven dead CSS
selectors, five JSX class names with no rule, ~12 needless exports, `isWeekend` and
`shouldCapture` unused, `global/skills/solutioning` a never-loaded copy, `docs/mockups/
New.zip` a duplicate archive, a stray `.docx` draft · cron 503 branches and the string
error rpc untested · FIX_LOG 2026-09-08/-11 regressions pinned only outside the gate ·
hook runners pass on an empty case table · reminder send→mark not atomic (one duplicate
mail at most, bounded by 3 attempts) · parser kill switch is "unset the key and redeploy",
cron kill switch undocumented · `check-build-env` warns only for the parser key ·
`env.example` declares an unread `DATABASE_URL` and omits `DEPLOY_URL` /
`PARSE_LIVE_SMOKE` · HSTS without `includeSubDomains` · theme cookie without `secure` ·
maskable icon has transparent corners and an off-brand colour · fold-row long dates wrap
four lines at 390 px · `.j-fold` and `.option-row` 1–2 px under 44 · no `:active` tap
feedback with the tap highlight removed · no `loading.tsx` for the area or insights
routes · no service worker (offline install shows the browser error) · a11y minors:
"Backfill day N" vs visible "add", Dictate name vs "Listening…", `aria-pressed` groups
where siblings use `role="radio"`, placeholder-only labels on the close inputs,
Re-record's consequence line not `aria-describedby`-linked, rank arrows' 24 px circles
overlap on fine pointers, `aria-label` on a `div`, the shared `close-hint` id.

## Unique-coverage callouts

Every skill caught something no other skill saw, which is the argument for keeping all
ten: observability (H1–H3, the whole delivery layer) · perf (H4, the only cost that
multiplies with users) · test audit (H5, and M1 — the F19 duplicate-on-lost-response gap
that the feature's own live mutations could not expose because the e2e fails the request
before the server) · privacy (H7, H8, M13's wrong design record) · mobile (H9, the one
must-fix) · check-access (M3, the RLS test coverage that would let a policy regression
through green) · launch-residue (M6, three CSP directives) · a11y (M20–M23, focus and
headings) · techdebt (M18, dead POST-reachable actions) · dep-audit (a clean bill nobody
else can issue: 0 advisories, 415/415 signatures, lockfile in sync).

## Collective blind spots

- Vendor dashboards: Vercel env scoping, log retention, drains and alert rules; the
  Anthropic console's retention (ZDR or default) and spend cap; Resend's retention and
  bounce handling; Supabase hosted Auth (site URL, redirect allow-list, `email_sent`
  rate, signup toggle, SMTP). Phase 2 read the hosted *database*, not these.
- Measured contrast — every ratio is arithmetic from the tokens; M22 and mobile #7
  (`.option-tag` on a selected row, ≈4.6:1) need a real sample.
- Real devices and assistive tech: the soft-keyboard claims (M25, M26), the Night
  install (M27), live-region timing (M21), the empty-row remount (M20) are all inferred
  from code and captures, not observed.
- Query plans: no `EXPLAIN` was run; index use under the `security_invoker` views is
  inferred from the migrations.
- Runtime failure modes the tests do not reach: a committed write with a lost response
  (M1), an Auth outage (H5), a partial magic-link landing (M17).

## Triaged action buckets

**(A) Safe code fixes** — each a contained change with an obvious red test:
M6 (three CSP directives) · H9 + M24 (four `min-height` rules) · M22 (a visible focus
style for `.menu-item` and an on-accent ring on the poster) · M23 (heading elements) ·
M21 (focus the intention line after Save, the first parsed field after a sort; the
Reviewing pattern) · M16 (strip `email=` in `safeContext`, or stop round-tripping it) ·
M13 (correct the DECISIONS line) · M10 (`.is("archived_at", null)` in the active
loaders) · the LOW `revalidatePath` narrowing · M3 (an `it.each` over all 22 tables in
`rls.test.ts`) · M4 + M7 + M8 + M17 + H5 (the unit and request-level tests the test
audit specified, each with its named red input) · M18 and the dead code in techdebt ·
the hook runners' minimum-case check.

**(B) Bigger code work** — a plan first:
H1 + H2 + H3 + M28 as one piece: a sink with an alert route (a log drain or a DSN,
`report` behind `shouldCapture`), a dead-man ping from the cron's success path, and an
event when the parser key is absent · H4 (batch the reminder pass: one claim, bounded
concurrency, one mark per outcome, `maxDuration`) · M1 + M2 together (a client-generated
task id so a re-run is idempotent, or one ordered batch RPC — either way the DECISIONS
mutation "creates made parallel" has to be reworded before the code moves) · M9 + M11
(fold the observation reads into one embed; picker candidates on demand) · M19 (the
`Rail.tsx` and `lib/data.ts` splits) · M20 (one slot for the list rows) · M25 + M26 + M27
(viewport `interactiveWidget`, a confirm on a dirty backdrop dismiss, `crossOrigin` on
the manifest link or theme-independent colours).

**(C) Founder must do** — not code:
H6 (privacy notice and terms — the longest lead item; needs M13/M14/H8 settled first so
the text is true) · H7 (a deletion runbook and a purge step for the owner-held dumps) ·
H8 (read the Anthropic account's retention setting, set a spend cap) · M14 (Resend and
the hosted mailer named) · M12 + M5 (read back the hosted Auth allow-list and email rate;
decide the limiter) · H1's vendor half (Vercel retention, drain or alert destination) ·
M29 (schedule the eslint 10 and TypeScript majors) · M30 (a retention line and a dump
purge step).

**(D) Needs a design decision:**
M15 (data export; an Art. 9 basis or consent line for health text) · M30's reminder
opt-out (currently "cannot be turned off") · the LOW login enumeration (accepted, restate
or revisit) · M5's scope (per-user write caps or none) · M2's shape (batch create vs the
existing one-write-per-row convention).

## Verdict

**GO for committing F19 and continuing; NO-GO for launch beyond the invited cohort.**
The core holds: no cross-user path, every definer bound to `auth.uid()`, every policy
`user_id`-scoped and identical on hosted, no secret in the bundle, no open redirect, the
cron gate fail-closed, zero dependency advisories, hosted schema verified object-for-object.
What blocks launch is the same trio as 2026-09-05, still open: nothing pages anyone when
it breaks (H1–H3), no privacy notice while user text goes to three processors (H6–H8,
M13–M14), and one mobile must-fix (H9). New since then and worth settling **before the
F19 commit**: M1 — a lost response after a committed insert duplicates a task on Retry,
which the SPEC says cannot happen; the fix is small (a client-generated id) but it changes
`createTask` and a DECISIONS line.

- **Highest-leverage fix:** one error sink with an alert route and a dead-man ping from
  the cron (H1 + H2 + H3 + M28) — it turns nine silent findings into pages.
- **Longest-lead-time fix:** the privacy notice and terms (H6), because it cannot be
  written truthfully until the three processor facts (H8, M13, M14) and the deletion
  path (H7) are settled.
