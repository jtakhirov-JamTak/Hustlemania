# Evaluation — F14 Pre-release (docs/SPEC.md "### F14 — Pre-release")

**Most severe finding: none at P0/P1.** Every externally checkable F14 criterion passed. Two P2s (a spec-mandated command my shell guard cannot run; `~/.claude/PROJECTS.md` still says "No users"), and a block of hosted-DB / inbox criteria that cannot be proven from this seat and rest on the builder's own records.

## Step 0 — containment probes
- 0a Read `.claude/evaluator-hook-probe.txt` → **BLOCKED** by `evaluator_guard.py` ("self-probe: BLOCKED, which is the expected result"). Read containment active.
- 0b `python -c "print('evaluator shell probe')"` → **BLOCKED** by `shell_guard.py` ("Evaluator shell allowlist: 'python' is not permitted"). Shell containment active.

## Working-tree integrity
First `git status --porcelain`:
```
 M docs/DECISIONS.md
 M docs/FIX_LOG.md
 M docs/PROGRESS.md
 M docs/SPEC.md
 M lib/supabase/server.ts
 M playwright.config.ts
 M supabase/config.toml
?? docs/RUNBOOK_RESTORE.md
?? e2e/deployed.spec.ts
?? lib/supabase/skew.ts
?? tests/unit/skew.test.ts
```
Final `git status --porcelain`:
```
 M docs/DECISIONS.md
 M docs/FIX_LOG.md
 M docs/PROGRESS.md
 M docs/SPEC.md
 M lib/supabase/server.ts
 M playwright.config.ts
 M supabase/config.toml
?? docs/RUNBOOK_RESTORE.md
?? e2e/deployed.spec.ts
?? lib/supabase/skew.ts
?? tests/unit/skew.test.ts
```
Identical. `npm run verify` wrote only gitignored paths (`.env.local`, `.next/`, `test-results/`); nothing new appears in status. No dev server was left on :3000 (curl → connection refused after the run). The backup folder was read only (`ls`, `grep`, `head`, `cat roles.sql`); no row data from `data.sql` was printed.

## Scope tested
F14 acceptance criteria as written at `C:\Users\jtakh\dev\Hustlemania\docs\SPEC.md:1978-2014`, against the deployed origin `https://hustlemania.app` (and the `hustlemania.vercel.app` alias), the repo files F14 names (`supabase/config.toml`, `playwright.config.ts`, `e2e/deployed.spec.ts`, `docs/RUNBOOK_RESTORE.md`, `scripts/check-build-env.mjs`), the backup folder `C:\Users\jtakh\backups\hustlemania\2026-09-10`, and `npm run verify`. Hosted Supabase was not touched; no sign-in attempted.

## Evidence per acceptance criterion

**1. Hosted database (`/db-check`, `db diff --linked` clean, `auth.users` count = 1 + friends)** — **UNPROVABLE from this seat.** Needs the linked CLI with `SUPABASE_DB_PASSWORD` (in `.env`, deny-listed) or the dashboard. Not graded.

**2. Auth config (two-address probe; owner's link from `sprint@hustlemania.app`)** — **NOT TESTED.** The owner half sends a real email to a real user (out of bounds). The uninvited half via the deployed login form (`POST /login` with the `$ACTION_ID_401a92dc…` field and `evaluator-probe-7c1e@example.invalid`) was denied by the auto-mode classifier; not retried. Source-level only: `app/login/actions.ts:27-30` passes `shouldCreateUser: false` and maps `otp_disabled`/`signup_disabled` to `not_invited`; `supabase/config.toml:420-457` declares `[remotes.production.auth] enable_signup = false`, `site_url = "https://hustlemania.app"`, both `/auth/callback` redirect URLs, and the SMTP block with `pass = "env(RESEND_API_KEY)"` (no secret literal). Whether that config is actually applied on the hosted project I have not verified.

**3. `e2e/deployed.spec.ts` assertions on the origin** — **PASS by manual reproduction of every assertion** (the spec-named command itself could not be run, see P2-1):
- `curl -i https://hustlemania.app/manifest.webmanifest` → `200`, `Content-Type: application/manifest+json`, body `{"name":"Hustlemania",…,"start_url":"/sprints","display":"standalone","icons":[{192x192 png},{512x512 png},{512x512 png,"purpose":"maskable"}]}`.
- `curl -I /icon-192.png` → `200 image/png` (3118 B); `/icon-512.png` → `200 image/png` (11868 B).
- `curl /login | grep -o 'rel="manifest" href="[^"]*"'` → `rel="manifest" href="/manifest.webmanifest"`; `/login` → 200 on both origins.
- `curl -I /sprints` → `307`, `Location: /login` on `hustlemania.app` and `hustlemania.vercel.app`.
- Headers on every response observed (`/login`, `/sprints`, manifest, icons, cron route): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`; no `X-Powered-By`.
- `curl -X POST /api/cron/reminders` (no bearer) → `401`, `Content-Length: 0`; with `Bearer wrong` → `401`; `GET` → `405`, `Allow: POST`.
- Config: `playwright.config.ts:35-44` — `deployed` project `testMatch: /deployed\.spec\.ts$/`, `desktop`/`phone` carry `testIgnore` for it, `webServer: DEPLOY_URL ? undefined : {...}`. `npx playwright test --project=deployed --list` (no `DEPLOY_URL`) → 4 tests in 1 file; inside `npm run verify` those 4 report `skipped`. The spec file makes no DB call and imports only `@playwright/test`.

**4. Sign-in (`last_sign_in_at` not null + screenshot)** — **UNPROVABLE** (hosted read query; screenshot is the builder's). Not graded.

**5. Reminder (`reminder_log` row with `sent_at`, `cron.job_run_details` succeeded, user confirms email)** — **UNPROVABLE on the hosted side.** Indirect evidence only: the 2026-09-10 dump's `public.reminder_log` COPY block holds exactly 1 row (lines 286→288), consistent with the runbook's "1" but not proof of `sent_at`. Not graded.

**6. Install (Chrome Install control; user confirmation + manifest test)** — manifest half **PASS** (criterion 3). User-confirmation half is the user's, not mine.

**7. Restore runbook and drill** — **PASS.**
- `docs/RUNBOOK_RESTORE.md` names both layers (Pro daily backups, 7-day retention, restore-in-place; weekly `supabase db dump` files outside the repo), cites the backups doc, gives the two dump commands, the `grep -c "COPY \"auth\".\"users\""` check, the local restore steps (`db reset`, `psql … --single-transaction`), the count query on both sides, and a drill record row dated 2026-09-10 06:10 with folder, counts 1/1/14/1, and `/login` 200.
- Backup folder: `C:\Users\jtakh\backups\hustlemania\2026-09-10\data.sql` (19140 B) and `roles.sql` (370 B) exist.
- `grep -c 'COPY "auth"."users"' data.sql` → `1`; `grep -c 'COPY "public"."sprints"'` → `1`; the line after the `auth.users` COPY header is not the `\.` terminator (block has rows). First line is `SET session_replication_role = replica;` as the runbook states.
- Row counts derived from COPY/terminator line numbers, no data printed: `auth.users` 53→55 = **1**, `sprints` 239→241 = **1**, `sprint_days` 248→263 = **14**, `reminder_log` 286→288 = **1** — matches the drill record exactly. The dump carries all 22 `auth` and all 14 `public` tables.
- Drill-never-touches-hosted: `tests/support/local.ts:11` and `scripts/local-env.mjs:43` refuse non-loopback hosts. I did not re-run the drill (it writes to the local DB).

**8. `docs/evals/eval-08.md` 0 P0 / 0 P1** — this report; I did not read `docs/evals/`.

**9. `npm run verify` green** — **PASS.** Exit code 0: typecheck and lint clean; hook tests 60/60 + 21/21 + 23/23 + 6/6 + 5/5; unit `Tests 152 passed (152)`; db `Tests 293 passed (293)`; e2e `12 passed, 6 skipped (2.0m)`. Visual verification is the builder's two screenshots; not reproducible here.

## Findings by severity

**P0** — none.

**P1** — none reproduced.

**P2-1 — The spec's own verification command cannot be run under the evaluator shell guard.** `DEPLOY_URL=https://hustlemania.app npx playwright test --project=deployed` is rejected ("'deploy_url=https://hustlemania.app' is not permitted") because the allowlist treats the env-prefix as a command; `env` is not on the list either. The criterion was verified assertion-by-assertion with curl instead. If future pre-release evals should run the file as written, the guard needs a read-only way to set an env var (report only; not worked around).

**P2-2 — `~/.claude/PROJECTS.md` still reads "No users" for this app** (`grep -n Hustlemania` → line 18: "In build; F1-F10 shipped … F11-F14 stubs. No users."). F14 step 10 says it moves to "live, owner is a real user" (asked first). This file is what the production gate in CLAUDE.md reads to decide whether hosted writes need confirmation; the gate falls closed when unsure, so it is not a breach, but the record is wrong now that the owner has signed in on production.

**Observation (not a spec criterion):** HSTS differs by origin — `hustlemania.app` sends `max-age=63072000`; the Vercel alias sends `max-age=63072000; includeSubDomains; preload`. Vercel's default for custom domains; noting only.

**Observation:** `lib/supabase/skew.ts` (untracked, new) adds a one-shot retry on `401 "JWT issued at future"` to the server client's fetch (`lib/supabase/server.ts:20`). Not in F14's criteria; unit-tested (5 tests, in the 152 passing). The retry re-sends the identical request including non-idempotent POSTs, but only after a 401 that PostgREST refused before executing anything, so no double-write path is opened. No finding.

## Untested or unprovable
- All hosted-DB reads (migration count, extensions, cron schedule, RLS on every table, `reminder_log` grants, `auth.users` count and `last_sign_in_at`, `cron.job_run_details`), the Vault secrets, and whether the config push actually applied — no credentialed read path from this seat.
- Both halves of the two-address auth probe (classifier denial on the uninvited half; the owner half would send a real email).
- The Chrome Install control, the two screenshots, the received reminder email.
- Re-running the restore drill (mutates the local DB).
- Whether `npx playwright test --project=deployed` without `DEPLOY_URL` starts `npm run dev` (config defines `webServer` in that branch; tests skip either way). Not run because verify was using :3000.

## Recommendation
**Continue / release from the outside-in view.** Everything F14 makes checkable from outside the hosted project passed exactly as specified, the dump is a real backup with matching counts, and verify is green. Before calling F14 green, the builder's own evidence for the hosted-DB, sign-in, and reminder criteria (which this report cannot replace) should be on file, and `~/.claude/PROJECTS.md` should be updated per step 10.
