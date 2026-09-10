# Evaluation — F13 Evening email reminder

**Most severe finding: none above P2.** Every acceptance criterion in `docs/SPEC.md` F13 that could be exercised passed, including the ones I reproduced independently of the shipped tests (route gate, two-sprint grouping, idempotent rerun, four concurrent POSTs, anon access to the function and table, the local pg_cron job firing as a no-op). One criterion (`CRON_SECRET` unset → 503) could not be black-boxed under my shell allowlist. Two P2 documentation/path mismatches.

## Step 0 — containment
- 0a Read probe on `.claude/evaluator-hook-probe.txt`: **BLOCKED** by `evaluator_guard.py` ("self-probe: BLOCKED, which is the expected result").
- 0b Shell probe `python -c "print('evaluator shell probe')"`: **BLOCKED** by `C:/Users/jtakh/.claude/hooks/shell_guard.py` ("Evaluator shell allowlist: 'python' is not permitted").

Both containment layers active.

## Working-tree integrity
First `git status --porcelain`:
```
 M docs/BACKLOG.md
 M docs/DECISIONS.md
 M docs/PROGRESS.md
 M docs/SPEC.md
 M env.example
 M lib/database.types.ts
 M lib/observe.ts
 M package-lock.json
 M package.json
 M scripts/local-env.mjs
 M tests/db/grants.test.ts
 M tests/support/zones.ts
 M tests/unit/zones.test.ts
?? app/api/
?? docs/RUNBOOK_REMINDERS.md
?? e2e/reminders.spec.ts
?? lib/reminders/
?? lib/supabase/admin.ts
?? supabase/migrations/0018_evening_reminder.sql
?? tests/db/reminders.test.ts
?? tests/unit/reminders.test.ts
```
Final `git status --porcelain`: identical, byte for byte (same 13 modified, same 8 untracked).

Side effects I caused that are outside git's view, stated for the record: `pretest:db` / `pretest:e2e` / `predev` rewrote the gitignored `.env.local` (same content each time); `next dev` and `next typegen` wrote under the gitignored `.next/`; a `next dev` server I started on :3000 (background task `bfcg1jmsk`) is still running — my allowlist has no `kill`. Two auth users I seeded (`eval-f13-two@example.com`, `eval-f13-race@example.com`) were deleted at the end of each script (HTTP 200, cascade left 0 `reminder_log` rows). `public.reminder_log` held 0 rows before and after.

## Scope
`docs/SPEC.md` F13 (lines 1784–1880) only. Local stack at 127.0.0.1:54341/54342 with 0018 applied; dev server on http://localhost:3000; transport `log`.

## Evidence per acceptance criterion

### Migration 0018 — PASS
Live catalog queries (via `node` + the `postgres` driver against `DB_URL`):
- `pg_extension` contains `pg_cron` and `pg_net`.
- `public.reminder_log` columns: `id uuid pk default gen_random_uuid()`, `user_id uuid not null`, `sprint_day_id uuid not null`, `created_at`, `updated_at`, `sent_at` nullable, `attempts smallint not null default 1` with `CHECK (attempts between 1 and 3)`, `error text`. FKs: `user_id → auth.users(id) ON DELETE CASCADE`, `sprint_day_id → sprint_days(id) ON DELETE CASCADE`, `UNIQUE (sprint_day_id)`. Index `reminder_log_user_id_idx`. `relrowsecurity = true`, zero policies. Table grants: `postgres` (all) and `service_role` (SELECT, INSERT, UPDATE) only — no `anon`, no `authenticated`.
- `reminders_due(p_now timestamptz)` returns `TABLE(user_id uuid, email text, sprint_id uuid, sprint_day_id uuid, area text, day_index smallint, tz text)`; `prosecdef = true`; `proconfig = search_path=""`; `proacl = {postgres=X/postgres,service_role=X/postgres}` (PUBLIC revoked); `has_function_privilege` anon=false, authenticated=false, service_role=true. Same for `reminders_claim(uuid[])` and `reminders_mark(uuid[], text)`.
- Only reader of `auth.users` in `public`: `select proname from pg_proc … where prosrc ilike '%auth.users%'` → `reminders_due` alone; `pg_views` with `auth.users` in the definition → none.
- `cron.job`: one row, `jobname = reminders-hourly`, `schedule = 5 * * * *`, `active = true`, command names `net.http_post`, reads `vault.decrypted_secrets` for `reminders_url` and `reminders_secret`, mentions neither `sprint_days` nor `tasks`. `vault.decrypted_secrets` has no `reminders_*` rows.
- The job really runs and really no-ops locally: `cron.job_run_details` at 03:08 UTC showed one row `status = succeeded`, `return_message = "0 rows"`, `start_time = 2026-09-10T03:05:00.022Z`; `net._http_response` count = 0.
- Live PostgREST as `anon`: `POST /rest/v1/rpc/reminders_due` → 401 `42501 permission denied for function reminders_due`; `GET /rest/v1/reminder_log` → 401 `42501 permission denied for table reminder_log`.
- `tests/db/grants.test.ts` "F13: reminder_log and the reminders_* functions are service-role only" passed; `targets.test.ts` "no scheduled job exists that could touch a plan" and `tasks.test.ts` "no scheduled job touches tasks" passed with the job present (i.e. they now scan a real row).

### `reminders_due` cases — PASS
`npm run test:db` → 12 files, 293 tests passed. `tests/db/reminders.test.ts` (verbose run, 15/15) covers, with explicit `p_now`: 19:59 PDT → 0 / 20:00 → 1 row with email, area, day_index; 23:59 due, local midnight not; DST end (`America/Los_Angeles`, Oct 30 PDT, Nov 1 PST transition day, Nov 2 PST) at 19:59/20:00 each; before day 1 and after day 14 → 0; closed day → 0; `ended_early` → 0; `sent_at` set → 0; unsent touched 5 min ago → 0; 11 min ago with attempts 1 and 2 → returned; attempts 3 → 0; two sprints in two areas → two rows one user; body scanned for INSERT/UPDATE/DELETE → none. I read the assertions; they match the SPEC cases rather than a weaker paraphrase. Independently, my own seeded user at local 20:1x in `Etc/GMT+7` produced `reminders_due(now())` → `[{health,3},{wealth,3}]`.

### Route handler — PASS (503 path: see untested)
Black-box with `curl` against :3000:
- `GET` → `405 Method Not Allowed`, `allow: POST`.
- `POST` no header → `401`, no body.
- `POST` bearer wrong in last hex char → `401`. Right secret under `Basic` scheme → `401`.
- `POST` right bearer → `200`, `content-type: application/json`, body `{"due":0,"users":0,"sent":0,"failed":0}`.
- `PUT` right bearer → `405`.
The secret used was derived exactly as `scripts/local-env.mjs` does (sha256 of `<SERVICE_ROLE_KEY>:reminders`) from `npx supabase status` output, not read from `.env*`.
Unit tests `authorizeCron` (3 tests: unset → unconfigured, missing/non-bearer/wrong/truncated/appended → unauthorized, right value any scheme case → ok) passed. Source: `lib/reminders/authorize.ts` hashes both sides and uses `timingSafeEqual`; `lib/supabase/admin.ts` line 1 `import "server-only"`, key from `process.env.SUPABASE_SERVICE_ROLE_KEY`; repo grep finds no `NEXT_PUBLIC_*SERVICE*` name anywhere.

### Claim-then-send lifecycle, response counts, events — PASS
- DB tests: claim once → refuse while in flight → `mark(error)` → refuse at 9 min → reclaim at 11 min with attempts 2 and error cleared → attempts 3 refused; `mark(null)` sets `sent_at`, a sent row is never reclaimed or overwritten and is not due; unknown id claims nothing; claim carries the day's own `user_id`. All passed.
- My two-sprint scenario: `POST` → `{"due":2,"users":1,"sent":1,"failed":0}`; `reminder_log` two rows, both `attempts 1`, same `sent_at 2026-09-10T03:09:39.790Z`, `error null`; second `POST` → `{"due":0,…}` and rows byte-identical; `reminders_due(now())` afterwards → `[]`.
- Race: seeded one due user, fired four `POST`s with `Promise.all` → results `sent` = 0,0,0,1 (total 1), one log row `attempts 1, sent true`. The UNIQUE + `on conflict do nothing` claim held under real concurrency.
- Dev-server log lines: `{"event":"reminder.run",…,"due":2,"users":1,"sent":1,"failed":0,"transport":"log"}` and `{"event":"reminder.logged",…,"subject":"2 sprint days are still open"}`. `grep eval-f13` on the log → no match: the recipient address never reached the log.

### Transport — PASS
Unit tests: resend posts to `https://api.resend.com/emails` with `Authorization: Bearer re_key`, body `{from,to:[…],subject,text,html}`; 422 → `{ok:false,error:"resend 422: Invalid \`from\` field"}`; thrown fetch → failure not crash; log transport logs subject only; `selectTransport`: resend when both set, `log` in development/test, `null` in production without key, blank key treated as unset. Route maps `null` transport to 503 before creating the admin client (source read).

### Message body — PASS
Unit fixture carries outcome, mantra, amount 800000, target 57143, actual, intention, notes; asserts subject `Health · Day 6 is still open`, text/html contain `/sprints` link, and none of nine private strings appear in subject, text or html. Two-day fixture: one subject, both lines. Passed.

### e2e — PASS
`npm run test:e2e` → 12 passed, 2 skipped (the two reminder tests on the phone project, by design), 2.8 min. Desktop `e2e/reminders.spec.ts`: wrong/missing bearer 401 with empty body, GET 405, no rows; right bearer 200, `sent ≥ 1`, `failed 0`, exactly one row for the open day with `sent_at`, `attempts 1`; closed-day user has no row; rerun leaves rows unchanged.

### env.example / local-env / runbook — PASS
`env.example` has `CRON_SECRET=`, `RESEND_API_KEY=`, `REMINDER_FROM=` (all empty). `scripts/local-env.mjs` derives `CRON_SECRET` from the stack's service key (sha256), no literal. `docs/RUNBOOK_REMINDERS.md` covers extensions, the two Vault secrets, Resend domain verification, the three Vercel vars, the `cron.job_run_details` / `net._http_response` / `reminder_log` proof queries, and the free-tier numbers.

### `npm run verify` — PASS (run as its parts)
`typecheck` ✓ · `lint` ✓ (no output) · `test:hooks` 60/60, 21/21, 23/23, 6/6, 5/5 · `test:unit` 147/147 · `test:db` 293/293 · `test:e2e` 12 passed / 2 skipped. Visual verification n/a (no screen).

## Findings by severity

**P0** — none.

**P1** — none.

**P2**
1. SPEC F13 names the e2e file `tests/e2e/reminders.spec.ts`; it lives at `C:\Users\jtakh\dev\Hustlemania\e2e\reminders.spec.ts` (Playwright `testDir: "./e2e"`, same as the existing golden path). Path in the SPEC does not match the tree.
2. SPEC's `reminder_log` column list omits `updated_at`, yet its own in-flight rule ("touched (`updated_at`) under 10 minutes ago") depends on it; the table has it with a `set_updated_at` trigger. Text-only inconsistency in the SPEC entry.

## Untested or unprovable here
- **`CRON_SECRET` unset → 503, nothing claimed.** My attempt to start a second dev server with the variable forced empty (`CRON_SECRET= npx next dev -p 3001`) was refused by the shell allowlist (`'cron_secret=' is not permitted`), and the running server always has the secret from `.env.local`. Evidence is the unit test (`authorizeCron(…, undefined|"") === "unconfigured"`) plus the route source returning `new NextResponse(null, {status: 503})` before any DB call. Not reproduced over HTTP.
- **Production 503 when `RESEND_API_KEY`/`REMINDER_FROM` are unset**: same situation — unit test on `selectTransport` plus source; no production-mode server run.
- **A real Resend send / a real non-2xx through the route**: no key locally by design; the failure branch (`reminders_mark` with an error string via PostgREST, `reminder.send_failed` event) is covered by unit tests with a stubbed fetch and by the SQL-level DB test, not end to end.
- **`server-only` failing a client-side import at build time**: not exercised (would need a deliberate bad import and `next build`).
- **Hosted pg_cron/pg_net/Vault behaviour**: local only; the runbook's proof queries were verified to be well-formed against the local catalog (they returned rows), not against the hosted project.

## Recommendation
**Continue.** F13 meets every SPEC acceptance criterion that can be verified on the local stack, with the authorization surface (function EXECUTE, table grants, bearer gate, constant-time compare, service-role-only key) confirmed live rather than by reading. The two P2 items are SPEC-text corrections for `docs/BACKLOG.md` or a one-line SPEC touch-up; nothing blocks proceeding to F14.
