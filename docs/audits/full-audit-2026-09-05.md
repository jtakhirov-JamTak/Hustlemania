# Full audit — 2026-09-05

Whole-repo sweep of F1–F5 at commit `51d027e` (clean tree) via `/full-audit`: ten
parallel report-only auditors plus a live schema check on the local stack. Nothing was
fixed. Severities below are the synthesizer's; where an auditor rated higher, the
original rating is noted.

## Phase 0 — verification gate

`npm run verify` green from a clean tree: typecheck, lint, unit 45/45, DB 169/169,
Playwright 8/8 (desktop + phone). `npm run build` green (the verify script does not
include a production build). Two `Error: The destination stream closed early` lines in
the dev-server log during e2e teardown, already in BACKLOG.

## Phase 2 — live DB (local stack; hosted project has no migrations)

Expected objects were extracted from migrations 0001–0007, not from the DB. Every count
matched: 10 tables (RLS enabled on all 10, and no other public table), 4 added columns,
27 indexes, 22 policies, 16 triggers, 27 functions with exactly one overload each of
`start_sprint` / `close_day` / `same_daily_targets`, 7 named CHECK constraints,
`close_day` returns integer, tracker lists 0001–0007. `anon` holds zero table, column or
function privileges. All 10 public tables cascade on delete from `auth.users`
(`pg_constraint`, not `information_schema`). **VERIFIED.**

The hosted Supabase project was not inspected. Correction after the user's follow-up:
the project exists (`hustlemania`, ref `zcdvuhcslwalhziinfqz`, created 2026-09-05T13:29Z)
in a **different organisation** from `pure-eq`; the Supabase MCP plugin is OAuth-scoped
to the `pure-eq` org and therefore lists one project, while the CLI login sees both.
Its migrations and auth settings remain unverified (no `supabase link` from this clone).

## Verdict

**NO-GO for launch, GO for continuing to F6.** No cross-user read/write path, no
authorization defect, no secret in the bundle, no reachable dependency advisory. What
blocks launch is everything around the core: no privacy notice, no operator signal when
anything fails, the mobile floor broken on every form, and a verify gate that would stay
green with a test layer missing.

- **Highest-leverage fix:** `.input` / `.task-text` to 16px in `app/globals.css` and
  delete the inline `fontSize` overrides — two lines that remove the iOS zoom from every
  form on the primary device.
- **Longest lead time:** the privacy policy / terms text and the health-data consent
  decision (founder work, not code).

## Deduplicated findings (severity-ranked)

Sev = synthesizer's rating. Src = which auditors found it (A access, P privacy,
F perf, D dep, T techdebt, S test, O observability, Y a11y, M mobile, L launch-residue).
★ = only one auditor caught it.

| # | Sev | Src | Finding | Where | Direction |
|---|---|---|---|---|---|
| 1 | HIGH | M★ (rated CRITICAL) | 39 of 40 inputs below 16px → iOS zooms on focus and stays zoomed. Verified: `.input` 14.5px, `.task-text` 14.5px, inline 13–15.5px overrides in 8 components. | `app/globals.css:176,331`; `ItemPicker`, `LibraryPage`, `NewSprintWizard`, `PlanGrid`, `IntentionCard`, `MantraCard`, `VisionForm`, `HighestImpedimentCard` | 16px on the two classes; delete overrides |
| 2 | HIGH | M★ | Plan grid at 390px: 7 tracks of ~39px with `minWidth: 56` cells → cells overlap, D7/D14 clipped, edit-mode inputs overlap so a tap on D2 lands in D3. **Confirmed in the e2e phone render.** The phone e2e overflow assertion cannot catch it (overflow is inside `[data-strip]`). | `components/PlanGrid.tsx:56,82`; same in wizard | `minWidth: 0` at ≤940px or 4–5 columns |
| 3 | HIGH | M★ | Sidebar renders in full above page content on phone; "Today's target" starts ~800px down on an 844px viewport. **Confirmed in render.** | `app/globals.css:427-437`, `components/SideNav.tsx` | collapse to chip row / select at ≤940px |
| 4 | HIGH | S, L | Verify gate is vacuous: `passWithNoTests: true` (unit + DB) and `--pass-with-no-tests` (e2e). Proven: `npx vitest run tests/does-not-exist` exits 0. A renamed spec or testDir typo leaves verify green. | `vitest.config.mts:15`, `package.json:16` | drop both; fail on 0 files |
| 5 | HIGH | O★ (rated CRITICAL) | `auth.getUser()` error is dropped in the proxy and collapsed into "no user"; an Auth outage or wrong anon key bounces everyone to `/login` with zero log lines. Downgraded: fails safe, no users yet. | `proxy.ts:29-38`, `lib/supabase/server.ts:37` | branch on `error`; structured event; "sign-in unavailable" state |
| 6 | HIGH | O★ | 22 `friendlyError(res.error.message)` sites discard the DB error; no structured event anywhere; no error sink. First `db push` grant miss on `close_day` = "That did not save" for everyone, first report from a user. | `app/(app)/actions.ts` (22 sites) | one `reportActionError(tag, err, ctx)` in `lib/errors.ts`, cooldown-latched |
| 7 | HIGH | O★ | No `app/error.tsx`, `global-error.tsx` or `instrumentation.ts onRequestError`; read-loader throws land on Next's default page, recorded nowhere. | `lib/data.ts` throws → `sprints/layout.tsx`, `[area]/page.tsx` | `instrumentation.ts` + `app/(app)/error.tsx` |
| 8 | HIGH | O★ | 23 of 24 client call sites await a server action with no try/catch; a *thrown* action (deploy mid-dialog → "Failed to find Server Action") replaces the Close Day dialog and discards the typed actual/notes. Not exercised in a browser. Touches the global "never discard input" hard stop. | `CloseFlow.tsx:114`, `TasksCard.tsx:26`, `NewSprintWizard.tsx:197,207`, +19 | one `callAction()` wrapper keeping form state |
| 9 | HIGH | F, A | `loadLibrary` reads the user's entire `sprint_cues` / `sprint_impediments` history (no filter, no limit) on every Today and wizard render, only to compute `used`, which those pages never read. PostgREST `max_rows=1000` truncates silently → `used=false` → Delete offered on a used item. Verified in Kong log: 13 REST + 2 auth calls per render. | `lib/data.ts:121-129`, `[area]/page.tsx:47` | drop from hot path; compute `used` in SQL for the library page |
| 10 | HIGH | P, L | No privacy policy or terms page, nothing links to one; app stores health/wealth/relationship vision text. | no `app/privacy` route; `app/login/page.tsx` | static `/privacy` + `/terms`, linked from login |
| 11 | HIGH | P★ | No user-facing or documented deletion path; only a dashboard `auth.users` delete. Cascade itself verified 10/10 on live DB. | `docs/SPEC.md:566-572` | `docs/RUNBOOK_DSR.md` + service-role script asserting zero rows across all tables |
| 12 | HIGH | Y★ | All three dialogs declare `role="dialog" aria-modal` but have no Escape, no focus trap, no focus return; result screen never receives focus so the 78px actual and streak are silent to AT. | `ItemPicker.tsx:62`, `CloseFlow.tsx:136,358` | native `<dialog>.showModal()` |
| 13 | HIGH | Y★ | Wizard chip groups (area, measurement, Today/Tomorrow, confidence 1–10) expose selection only by class; no `aria-pressed`/`role=radio`. | `NewSprintWizard.tsx:251-374` | reuse `ScopeChips` pattern |
| 14 | HIGH | Y★ | Validation model is "disable the primary + print a `.hint`"; hint never associated or live; disabled button leaves Tab order. 9 sites. | `VisionForm`, `LibraryPage`, `ItemPicker`, `NewSprintWizard`, `CloseFlow`, `PlanCard`, `HighestImpedimentCard`, `MantraCard`, `CloseCard` | `aria-disabled` + `aria-describedby` + live region |
| 15 | HIGH | Y, M | Placeholder is the only visible label on 10 inputs, at 2.43:1; control borders (`--divider`, 1.29:1) are the only field boundary on a white-on-white input. | `app/globals.css:51-58,172,198,241,270` | visible labels; `--control-border` ≈ 0.45 alpha |
| 16 | HIGH | M, Y | `--muted` (0.62 alpha) computes 4.2–4.4:1 on the page gradient and ~4.0:1 on `--faint`; accent on faint 4.02:1 for 9px D-labels. Computed from tokens, not measured. | `app/globals.css:8,12,14`; `TodayView`, `DayStrip`, `PlanGrid`, `LibraryPage`, `NewSprintWizard` | `--muted` → 0.70; `--accent-ink` for small labels |
| 17 | HIGH | M★ | Tap targets below 44pt as a class: `.chip` ~31px (the app's radio, incl. ten 40×31 confidence chips 6px apart), `.link-quiet` ~18px (Sign out, Edit/Archive/Delete 12px apart, reorder arrows 3px apart, dialog ×), task checkbox 18×18 outside a label, wizard alignment checkbox 18×18 whose label toggles nothing. | `globals.css:116-164,214-224`; `LibraryPage:300-332`; `TasksCard:128-152`; `NewSprintWizard:529-552` | min-height 44 / inflated hit boxes at ≤940px |
| 18 | MED | S★ | `setHighestImpediment` writes the proof point to `impediments` *before* the RPC that can reject (`not_in_sprint`, `sprint_not_active`); on rejection the user sees an error but the library row changed. Verified in source. No test at any layer reaches this action. | `app/(app)/actions.ts:388-404` | move the proof write into the SQL function (as `start_sprint` does) |
| 19 | MED | S★ | 0007 backfill expression `(closed_at at time zone tz)::date <= date` ran on zero rows and has no test; the CHECK now forbids inserting such a row directly. Becomes HIGH once production holds a closed row. | `supabase/migrations/0007_streaks.sql:27-31` | rolled-back DB test: drop CHECK, seed LA 23:30/00:30 rows, run the UPDATE verbatim |
| 20 | MED | S★ | Cross-user UPDATE denial untested on `visions.body` and `impediments`; SELECT denial is complete on all 10. | `tests/db/rls.test.ts:60-73` | B updates A's row → 0 rows + superuser readback |
| 21 | MED | S★ | Live-clock sprint-zone assertions only discriminate part of the day (Kiritimati vs UTC 10h/day, LA 16h/day); a `now() at time zone 'UTC'` regression in `close_day`/`save_targets` passes CI most hours. 4 instances. | `targets.test.ts:171`, `start_sprint.test.ts:44`, `streaks.test.ts:99`, `libraries.test.ts:580` | pick a zone whose date differs from UTC at suite start |
| 22 | MED | S★ | Under-target red state never asserted (only `at-or-above`); `>=` → `>` would ship green. Derived totals (`remaining`, `perDay`, `% of goal`) asserted for day-1 values only. | `e2e/golden-path.spec.ts:248-260,352`; `TodayView.tsx:45-49` | assert `data-state="under"` in the backfill test; extract `remainingPlan()` with a unit table |
| 23 | MED | A★ | `token_hash`+`type` callback branch sets a session with no browser-bound secret (PKCE `code` path requires the verifier cookie). Login-CSRF is possible only if the email template exposes `{{ .TokenHash }}`; `type` is cast unvalidated. | `app/auth/callback/route.ts:18-20` | drop the branch if PKCE suffices |
| 24 | MED | A★ | No rate limiter anywhere; `requestMagicLink` unbounded; only cap is the Supabase email quota (dashboard-enforced). | `app/login/actions.ts:26` | limiter at the action boundary, or record the accepted gap |
| 25 | MED | A, P | Login distinguishes `not_invited` from `sent` → account enumeration against a private-data app; with #24, scriptable. | `app/login/actions.ts:31-33` | uniform "sent" response, or accept given <10 invitees |
| 26 | MED | P★ | User's email placed in the URL query on every magic-link request (`/login?sent=1&email=…`) → host access logs, browser history. | `app/login/actions.ts:16-18`, `app/login/page.tsx:15` | `useActionState` or short-lived cookie |
| 27 | MED | L★ | No security headers at all; `X-Powered-By` on; `/sprints/<area>` frameable (clickjack "Close Day"). | `next.config.ts` | `headers()` with `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy; `poweredByHeader:false` |
| 28 | MED | L★ | `next build` inlines whatever `.env.local` holds and `scripts/local-env.mjs` leaves the local-stack one on disk; the build on disk targets `127.0.0.1:54341`. | `lib/env.ts:3-4` | `prebuild` guard refusing a non-`supabase.co` URL when `VERCEL=1` |
| 29 | MED | F★ | Two serial `GET /auth/v1/user` per request (proxy + layout); verified 2,700 vs 589 page anchors in Kong log. | `proxy.ts:31`, `app/(app)/layout.tsx:7` | `getClaims()` in proxy and layout |
| 30 | MED | F★ | Hot-path waterfall: sprint → days sequential; layout awaits `loadOverview` then `loadStreaks` though independent; dialog-only data (full active library, offered items) fetched and serialized on every render. | `lib/data.ts:70-73`, `sprints/layout.tsx:9-12`, `[area]/page.tsx:47-48` | embed `sprint_days(*)`, `Promise.all`, load picker data on open |
| 31 | MED | O★ | Callback / OTP-send failures collapse to booleans; the `unhandledRejection: permission denied` class (SQLSTATE 42501 = grant drift) is caught nowhere and filed as teardown noise. | `app/auth/callback/route.ts:13-23`, `app/login/actions.ts:31`, `[area]/page.tsx:45-51` | log `auth.callback_failed` with code; `Promise.allSettled` + `db.permission_denied` tag |
| 32 | MED | O★ | "Closed but not refreshed" branch is a bare `catch {}`; a `sprint_days` SELECT regression reads as a UI glitch while the read path is dead. | `app/(app)/actions.ts:221-225`, `PlanCard.tsx:56-72` | bind and report the error before returning `closed:true` |
| 33 | MED | P★ | Cascade test sums only 4 of 10 tables; F8 `profiles` without cascade would ship green. Live DB is 10/10 today. | `tests/db/libraries.test.ts:606-611` | assert from `pg_constraint` that every `user_id` table cascades |
| 34 | MED | P★ | Health-area free text is likely GDPR Art. 9 special-category data; no lawful basis or consent captured. | `visions.body`, `sprint_days.notes`, `impediments.*` | founder decision; consent checkbox recorded at first sign-in (F8 `profiles`) |
| 35 | MED | Y★ | Every route titled "Hustlemania"; no `<h2>` on Today or library pages; step changes in wizard/close flow announce nothing. | `app/layout.tsx:11`; `TodayView`, `PlanCard`, `CloseCard`, `TasksCard`; `NewSprintWizard:234`, `CloseFlow:158` | per-page metadata; card titles as h2; focus the new heading |
| 36 | MED | Y★ | `role="radio"` on `OptionRow` single mode without roving tabindex/arrow keys; wizard alignment checkbox is a `<span role=checkbox>` whose Space scrolls the page. | `OptionRow.tsx:27-35`, `NewSprintWizard.tsx:528-553` | real `<input type=checkbox>`; `aria-pressed` buttons or full radio pattern |
| 37 | MED | Y★ | Status text not live (Saved, task added, item auto-selected); focus dropped to body after Move/Save/Remove unmounts. 12+ sites. | `VisionForm`, `IntentionCard`, `TasksCard`, `LibraryPage`, `MantraCard`, `HighestImpedimentCard` | `aria-live` span per card; explicit focus moves |
| 38 | MED | M★ | Dialog scrim has no body scroll lock / `overscroll-behavior`; footer buttons sit under the iOS keyboard; scrim dismiss on `onMouseDown` misfires after a scroll on iOS. Day strip D10–D14 off-screen with no cue and no scroll-into-view (confirmed in render). | `globals.css:374-383`, `CloseFlow.tsx:136,300`, `ItemPicker.tsx:62,110`, `DayStrip.tsx:20` | `overscroll-behavior: contain`, sticky footer, `onPointerDown`, `scrollIntoView` on focus day |
| 39 | MED | M★ | No PWA surface: no manifest, theme-color, apple-touch-icon; `public/` holds only create-next-app SVGs. | `app/layout.tsx:11-14`, `public/` | `app/manifest.ts`, icons, `viewport.themeColor` |
| 40 | MED | M★ | `.btn` ~38px, `.btn-ghost` ~28px on every primary/secondary action; 9–10.5px labels including "Backfill", "missed", "locked". | `globals.css:86-143`; `PlanGrid:71-128`; `DayStrip:30-31` | `min-height:44px` at ≤940px; 11–12px floor for action labels |
| 41 | MED | T★ | Five test-support duplications: `requireLocal`, admin client, `seedUser`/`createTestUser`, hand-rolled `insertSprintRows`, `day()` vs `addDays`. Two seeders must learn every F6 column separately. | `e2e/helpers.ts:4-28`, `e2e/golden-path.spec.ts:309-336`, `tests/db/helpers.ts` | one `tests/support/` module |
| 42 | MED | T★ | UI duplication: proof-point WHEN/THEN grid ×4 (an unexported `ProofInputs` exists); 15 `role="alert" error-bar` blocks; `SaveStatus` shape ×4; `planDelta`/`effectivePlan` exported and tested but every call site inlines the maths. | `ItemPicker:79`, `LibraryPage:137`, `NewSprintWizard:465`, `HighestImpedimentCard:110`; `lib/targets.ts:34`; `PlanGrid:49-52` | export `ProofInputs`; `ErrorBar`; call the helper or delete it |
| 43 | MED | T★ | Tailwind + PostCSS + `@theme` token block carried for two utilities (`h-full`, `min-h-full`); Preflight relied on implicitly. `NewSprintWizard.tsx` 592 lines / `actions.ts` 419 mixing domains. | `app/globals.css:1-30`, `package.json` | decide once: drop or commit; split wizard by step, actions by domain |
| 44 | MED | T★ | Three dead `friendlyError` entries (`Signups not allowed`, `otp_disabled`, `signup_disabled`) — login has its own regex and copy table; three sources for one sentence. | `lib/errors.ts:52-54`, `app/login/actions.ts:32`, `app/login/page.tsx:3-8` | route login errors through `friendlyError` or delete the entries |
| 45 | MED | D★ | `eslint@9.39.5` marked deprecated on the registry; `typescript@5.9.3` two majors behind (7.0.2). Dev-only, no advisory. | `package.json` | plan eslint 10 (peer range allows); TS 6→7 after compatibility check |
| 46 | MED | S★ | `docs/FIX_LOG.md:184,297` name `scripts/hooks/test_shell_guard.py`, which is not in this repo; the three repo hook test suites run only by hand, outside `verify`. | `docs/FIX_LOG.md`, `package.json:19` | `test:hooks` step; correct the paths |
| 47 | MED | P, L | Data export is a SPEC requirement with no route until F10; `emailRedirectTo` built from request `Origin` so the safe target lives in the Supabase dashboard allowlist (out-of-repo). | `docs/SPEC.md:43`, `app/login/actions.ts:22-28` | generate export table list from `pg_constraint`; `NEXT_PUBLIC_SITE_URL` |

### LOW (34 across auditors, listed by theme)

- **Access/launch:** signout route has no Origin check (SameSite=lax only); no request-schema parser (`table(kind)` maps any string to impediments, no length caps on text/jsonb); 7 actions rely on RLS 0-rows and show the generic error for an expired session while 3 call `getUser()`; no maintenance mode / kill switch.
- **Privacy:** deleted user's email persists in `auth.audit_log_entries` (66 rows live); `lib/data.ts` throws the raw PostgREST message (17 sites); no HSTS from the app; cookie flags unverified at runtime.
- **Perf:** `/sprints` index runs auth + overview only to redirect, and `loadOverview` is not `cache()`d; `sprint_days_sprint_id_date_idx` duplicates the unique key (live); `pg_timezone_names` scan in `start_sprint` measured 33ms; `affected_sprints_check` has no `user_id` predicate; `CloseFlow`+`PlanGrid` in initial JS (~10KB gz).
- **Deps:** vitest 5.0.0 two days old; no `engines`; Playwright installs in prod via optional peer; sharp LGPL binaries (no `next/image` use); lockfile reproducibility not enforced (no CI).
- **Techdebt quick wins:** `StartSprintInput.intention` always null; five create-next-app SVGs; three `.gitkeep` in populated dirs; `byRank` defined twice; `docs/mockups/UI mockups.zip` duplicates the extracted tree; `global/skills/solutioning` is template residue; 0002's comment claims only 2 callable RPCs (now 12); SPEC:93 "placeholders" stale; BACKLOG eval-02 points at `CloseCard.tsx` (moved to `CloseFlow.tsx`); scope predicate and focus day derived twice; nine single-consumer exports; literal `14` ×10.
- **Tests:** `MESSAGES` not pinned to migration raise codes (3 unmapped; substring-order fragile); `expect(res.error).not.toBeNull()` passes for any error (3 sites); "allows direct UPDATE of a future target" sets `target = target` so the trigger branch never runs; SPEC criteria with no assertion (F1 card order, accent, result strip, "creates no user" by count; F2 archived section, rank order; F3 pre-planned intention rendered; F5 non-UTC "Day N" at page level); no test compares `schema_migrations` to disk.
- **Observability:** signout error ignored; `.filter(m => m.cues)` silently drops orphan memberships; `streaks.get(id) ?? 0` hides a missing RPC row.
- **a11y:** `aria-label` on role-less divs (4); `<aside>` for the section nav, no `<main>` on login; duplicate "Remove row" names, "▾/▸" glyphs read aloud, `aria-label` overriding visible text (4); `.task-text:focus` is the only `outline:none`; `.task-remove` 23px and reorder arrows 17px below WCAG 24×24; no `prefers-reduced-motion`; `title`-only information.
- **Mobile:** textareas `rows={2}`; missing `autoCapitalize`/`enterKeyHint`; date only in hover `title`; placeholders at 40% carry the instructive example; 64px/78px numerals overflow a seven-figure target; wizard submit has no in-flight ref.

## Unique-coverage callouts

Every auditor produced at least one finding nothing else caught: mobile (input zoom,
grid overlap, sidebar, targets), a11y (dialogs, chips, disabled-button model, control
contrast), observability (all seven signal gaps), perf (the unbounded history read, the
double auth call, the duplicate index), test (backfill untested, non-atomic proof write,
live-clock windows, vacuous gate proven by execution), privacy (deletion runbook, email
in URL, Art. 9), access (token_hash branch, rate limiter), launch (headers, `.env.local`
build, `X-Powered-By`), dep (deprecated eslint), techdebt (five-way seeder duplication).
Only two findings were reached by two auditors on the same property (legal page,
vacuous gate) and two more overlapped on contrast and enumeration.

## Collective blind spots (need a human or a different tool)

- The hosted Supabase project: existence, migrations, auth settings (signup off, redirect
  allowlist, SMTP sender, email rate limit), at-rest/backup tier. Not reachable from this
  session's MCP.
- Rendered behaviour beyond one Chromium phone screenshot: real iOS (zoom, keyboard,
  `mousedown` timing), screen readers, keyboard walks, a thrown server action mid-dialog,
  Vercel's handling of unhandled rejections and HSTS.
- Measured contrast on a device panel (all ratios computed from tokens).
- Planner choice at 10× data (all tables at 0 rows; only index-path existence proven).
- Vendor dashboards: Vercel alerts/log drains, any future error-sink scrub and alert
  rules, AI-vendor toggles (none yet).

## Action buckets

**A — safe code fixes (mechanical, verify-guarded):** #1 input 16px · #2 grid columns ·
#4 remove both pass-with-no-tests flags · #5 branch on auth error · #9 drop membership
read from hot path · #18 proof write after/inside RPC · #26 email out of URL · #27
headers + `poweredByHeader` · #28 prebuild guard · #29 `getClaims()` · #30 `Promise.all`
+ embed · #32 bind the caught error · #17/#40 min-heights · #12 native `<dialog>` · LOW
quick wins (SVGs, gitkeeps, zip, `byRank`, dup index migration).

**B — bigger code work:** #6/#7/#8/#31 observability layer (`reportActionError`,
`instrumentation.ts`, `error.tsx`, `callAction`) · #3 phone sidebar · #13–#16, #35–#37
a11y batch · #38 dialog scroll/keyboard model · #19–#22, #33, #46 test additions · #41–#44
consolidation · #45 eslint 10 · #39 PWA manifest.

**C — founder must do:** #10 privacy/terms text · #11 DSR runbook decision · #34 health-
data lawful basis · hosted Supabase dashboard (allowlist, SMTP, rate limits, signup off) ·
Vercel alert/uptime ping · re-authorise the Supabase MCP plugin against the Hustlemania
organisation so sessions can read the hosted project.

**D — needs a design decision:** #23 keep or drop `token_hash` branch · #24 rate limiter
vs recorded exception · #25 uniform "sent" response vs SPEC copy · #43 Tailwind keep or
drop · #47 export shape (F10) · whether the a11y/mobile batch lands before F6 or after.

## Remediation status (2026-09-06, phases 1–3 of the A + B pass; user stopped there)

Fixed and verified (`npm run verify` green: hooks 115, unit 45, DB 173, e2e 8; build
green): #4 vacuous gate · #5 auth error masked · #6 action errors discarded · #7 no
error boundary / instrumentation · #8 thrown action discards input (`callAction`) · #9
unbounded membership read · #18 proof written before the RPC (FIX_LOG 2026-09-06) · #27
security headers · #28 local build guard · #29 double `getUser` · #30 waterfall
(embed + `Promise.all`) · #31 callback/OTP/rejection signal · #32 bare catch · #46
hook suites in `verify` (paths in FIX_LOG not yet corrected) · LOW: duplicate index,
`sprint_invalid_reason` null default, `StartSprintInput.intention`, `byRank` ×2,
`eligibleFor`, template SVGs and `.gitkeep`s, orphan-membership and missing-streak
signals, signout error, `engines.node`, unvalidated OTP `type`.

Phases 4–6 (2026-09-06, after the user's "continue"; `npm run verify` green: hooks 115,
unit 54, DB 178, e2e 8; DECISIONS 2026-09-06 phases 4–6): #1 16px inputs · #2 plan grid
· #3 phone sidebar · #12 native `<dialog>` · #13 chip groups · #14 validation model ·
#15 visible labels + control border · #16 `--muted` 0.70, accent-ink labels · #17/#40
44px targets and label floor · #19 0007 backfill test · #20 cross-user UPDATE · #21
off-UTC zones · #22 under state, derived totals, `remainingPlan()` · #33 cascade from
`pg_constraint` · #35 titles, h2s, step focus · #36 real checkbox, arrow keys · #37 live
status, focus return · #38 scroll lock, sticky footer, pointer dismissal, strip
scroll-into-view · #39 manifest + icons · #41 `tests/support/` · #42 `ProofInputs`,
`ErrorBar`, `planDelta` · #44 dead entries.

Still open from A + B: #43 (wizard split; Tailwind is bucket D), #45 (eslint 10 blocked
by `eslint-config-next`), #46's FIX_LOG paths, #47 (F10). Bucket C and D untouched.


## Counts

Auditor totals before dedup: 2 CRITICAL, 20 HIGH, 46 MEDIUM, 51 LOW. After synthesis:
0 CRITICAL, 17 HIGH, 30 MEDIUM, ~34 LOW. Exceptions applied: 0 (`.claude/exceptions.md`
does not exist). Two auditor CRITICALs (#1, #5) ranked HIGH here: neither exposes data or
breaks auth, and both fail safe.
