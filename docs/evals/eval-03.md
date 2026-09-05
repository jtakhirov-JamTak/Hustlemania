# Evaluation report — F4 Tasks

**Most severe finding: none above P2.** Every F4 acceptance criterion in `docs/SPEC.md` passed under black-box testing, boundary testing, and source inspection. Recommendation: **continue** (F4 can be marked green).

## Step 0 — containment probes

- **0a Read probe** (`C:\Users\jtakh\dev\Hustlemania\.claude\evaluator-hook-probe.txt`): **BLOCKED** by `evaluator_guard.py` ("Evaluator hook self-probe: BLOCKED, which is the expected result"). Read isolation active.
- **0b Shell probe** (`python -c "print('evaluator shell probe')"`): **BLOCKED** by `shell_guard.py` ("Evaluator shell allowlist: 'python' is not permitted"). Shell containment active. The guard also refused `cd` and `2>&1`; I worked around neither (used absolute paths and `--workdir`).

## Working-tree integrity

First `git status --porcelain`:
```
 M app/(app)/actions.ts
 M app/(app)/sprints/[area]/page.tsx
 M app/globals.css
 M components/today/TodayView.tsx
 M docs/BACKLOG.md
 M docs/DECISIONS.md
 M docs/PROGRESS.md
 M docs/SPEC.md
 M e2e/golden-path.spec.ts
 M lib/data.ts
 M lib/database.types.ts
 M lib/errors.ts
 M tests/db/grants.test.ts
?? components/today/TasksCard.tsx
?? supabase/migrations/0006_tasks.sql
?? tests/db/tasks.test.ts
```
Final `git status --porcelain`: byte-identical to the above (same 13 modified, same 3 untracked).

Side effects I did cause, none visible to git: `npx playwright test` wrote `C:\Users\jtakh\dev\Hustlemania\test-results\` (`.last-run.json`, `today-desktop.png`, `today-phone.png`; path is in `.gitignore`). I created two local auth users plus one sprint and ~9 task rows in the local Supabase DB and deleted both users at the end (cascade; `tasks` count afterwards = 0, user list empty). I deliberately called `npx vitest`/`npx playwright` directly rather than `npm run test:*` so the `pretest:*` hook would not rewrite `.env.local`.

## Scope

`### F4 — Tasks` only (behavior, acceptance criteria, non-goals; PRD §13 rules 15, 16, 17 from `docs/references/14-Day-Goal-Sprint-Req.md` lines 195–197). Criteria taken from the Behavior/Acceptance lines (SPEC.md 355–362). Note: SPEC.md 365–404 contains an "As built" narrative for F4; I did not use it as a source of criteria, but its presence inside the spec file means the evaluator cannot avoid seeing implementation notes — flagged below as a P2 process point.

Stack used: local Supabase (API 127.0.0.1:54341, migrations 0001–0006 confirmed applied via `npx supabase migration list --local`), running dev server at localhost:3000, headless Chromium via `@playwright/test`, PostgREST via `@supabase/supabase-js` as user A, user B, anon, and service role.

## Evidence per acceptance criterion

### AC1 — Table `tasks` with RLS; denial test — **PASS**
Black-box via PostgREST (user B, anon), user A owns sprint/day:
```
B select tasks                    => {"data":[]}
B select task by id               => {"data":[]}
B insert into As day (user_id=B)  => {"error":"day_not_found","code":"P0001"}
B insert into As day (user_id=A)  => {"error":"day_not_found","code":"P0001"}
B update As task                  => {"data":[]}               (0 rows, no leak)
B delete As task                  => {"error":"permission denied for table tasks","code":"42501"}
anon select tasks                 => {"error":"permission denied for table tasks","code":"42501"}
anon insert                       => {"error":"permission denied for table tasks","code":"42501"}
A insert with forged user_id=B    => {"error":"day_not_found","code":"P0001"}
A reassign user_id to B           => {"error":"permission denied for table tasks","code":"42501"}
```
Source confirms (`supabase/migrations/0006_tasks.sql` 78–95): RLS enabled, select/insert/update policies on `auth.uid() = user_id`, column-restricted grants, no DELETE grant, trigger function revoked from anon/authenticated. App's own suite: `npx vitest run tests/db` → 7 files, **147 passed** (includes the RLS-off falsifiability test at `tests/db/tasks.test.ts:157`).

### AC2 — Insert/update rejected when the parent day is closed (rule 17) — **PASS**
After `close_day` on day 1 (as A):
```
A insert on closed day            => {"error":"day_closed"}
A update text on closed day       => {"error":"day_closed"}
A toggle done on closed day       => {"error":"day_closed"}
A archive on closed day           => {"error":"day_closed"}
A un-archive on closed day        => {"error":"day_closed"}
A no-op update (same text)        => {"error":"day_closed"}
A delete on closed day            => {"error":"permission denied"}   (42501)
A move day2 task into closed day1 => {"error":"permission denied"}   (column not granted)
A move closed-day task to day2    => {"error":"permission denied"}
A upsert existing closed-day id   => {"error":"permission denied"}
```
UI after close (headless Chromium, 1280×900): hint text "Locked with the closed day"; all 4 `Task N` inputs `disabled:true`; all done-marks `disabled:true`; `Add task` button count 0; `New task` input count 0; no Remove buttons. A forced `fill()` on the disabled input did not change the value after reload ("Edited via blur" before and after). App's e2e (`npx playwright test`): **6 passed** desktop + phone, including the locked-after-reload assertions at `e2e/golden-path.spec.ts:263–269`.

### AC3 — No job or code path copies tasks between days (rule 16) — **PASS**
- Closing day 1 with one task left undone ("Blur-saved task", done=false): task rows byte-identical across `close_day` (`true`), day 2 task list after close: `[]`. After adding one day-2 task the day-2 list was exactly `[{"text":"day2 task"}]`.
- Grep of `app/`, `lib/`, `components/`, `supabase/migrations/` for `tasks`: the only writers are `createTask` / `updateTask` / `removeTask` in `C:\Users\jtakh\dev\Hustlemania\app\(app)\actions.ts:140–174`, each scoped to one row/one `dayId`. No migration other than 0006 mentions `tasks`; 0006 defines no copying function. `scripts/` holds only `hooks/` and `local-env.mjs`; no `supabase/functions`. PostgREST OpenAPI lists no `/rpc/` paths for anon.
- App's DB suite scans `pg_proc`, `pg_trigger`, and `cron.job` for tasks references (`tests/db/tasks.test.ts:197–239`) — green.

### AC4 — Task completion has no effect on `sprint.status` or any total (rule 15) — **PASS**
DB: completed every task on day 1 (`A complete all` → 3 rows `done:true`), then compared full `sprints` row and all 14 `sprint_days` rows as JSON: `rule15 sprint unchanged: true days unchanged: true`. UI: hero "Cumulative actual 0 USD 0% of goal" before and after checking every box; `sprint_days` day 1 `{"actual":null,"closed_at":null}`, `sprints.status` = `"active"`.

### AC5 — Autosave on blur; refresh preserves — **PASS**
Headless Chromium against `/sprints/wealth`, each step followed by `page.reload()`:
```
1 add via blur    → rows [..., "Blur-saved task"]
2 add via Enter   → draft cleared (""), draft refocused (true); rows [..., "Enter-saved task"]
3 edit text, blur → Task 1 "Call the bank today" → "Edited via blur"
4 toggle done     → aria-checked true → false, persisted
5 remove (×)      → gone from UI; DB row kept with archived_at set (archive, not delete)
6 Enter then immediate blur on same draft → exactly 1 "Dup check" row (no double submit)
7 empty text + blur → saved text restored ("Edited via blur"), no row lost
9 phone 390×844   → tasks heading and New task input visible
```

### Behavior line — "one blank row offered; nothing rolls over; tasks lock with the day" — **PASS**
Blank `New task` row present on open day (control dump), absent on closed day; rollover and lock covered above.

### Non-goals (ordering, due times, quadrants) — not implemented, as required
`tasks` columns observed: `id, sprint_day_id, user_id, text, done, created_at, updated_at, archived_at`. No position/due/quadrant column.

## Findings by severity

**P0** — none.
**P1** — none.

**P2**
1. **SPEC.md carries an implementation narrative.** Lines 365–404 ("As built") describe migration internals, trigger names and the falsifiability run. This is the file the evaluator is required to read, so it leaks build choices into an evaluation that is meant to be independent of them. Process/documentation issue, not a product defect.
2. **No upper bound on task text.** A 5,000-character task was accepted (`A insert 5000-char text => data`) and is rendered in full into `aria-label="Done: xxxx…"` and `aria-label="Remove task: xxxx…"`. SPEC states no limit ("unlimited" refers to row count), so this is informational only — not graded as a failure.
3. **Archived tasks remain writable on an open day.** `update ... set done=true where sprint_day_id=day1` also flipped the archived "Second" row. No UI path does this and the SPEC is silent; noted for History/Insights semantics later.

## Untested or unprovable

- "The sprint window has ended" locked state (`sprintOver`) — needs a sprint past day 14; `start_sprint` date rules made it impractical to construct. Not an F4 acceptance criterion.
- Error bar / Retry path when a write fails mid-session — not an acceptance criterion; not exercised.
- Calling the Next.js server actions directly without a session — not exercised (action IDs are opaque); `updateTask`/`removeTask` rely on RLS returning 0 rows rather than an explicit auth check (`actions.ts:151–174`). The RLS boundary itself was verified via PostgREST as anon and as user B.
- Behavior at the midnight day boundary is F5 scope.

## Recommendation

**Continue.** All five F4 acceptance criteria pass with reproduced evidence; no P0/P1. P2 items are candidates for `docs/BACKLOG.md`.
