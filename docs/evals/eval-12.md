# eval-12 — F19 "Today's entry as one box: the intention and the tasks" (incl. As built and U7)

**Most severe finding: P2. No P0, no P1.** Every F19 acceptance criterion I could exercise passed; the two P2s are a same-tick multi-submit that duplicates task rows (not reachable by a human click sequence I could produce) and an empty intention line on production-shaped days that hold tasks but no intention.

## Step 0 — containment probes
- **0a Read probe** (`.claude/evaluator-hook-probe.txt`): **BLOCKED** — "Evaluator hook self-probe: BLOCKED, which is the expected result. evaluator_guard.py is registered and running". Read containment active.
- **0b Shell probe** (`python -c "print('evaluator shell probe')"`): **BLOCKED** — "Evaluator shell allowlist: 'python' is not permitted. Allowed: cat, curl, diff, echo, find, git, grep, head, jq, ls, node, npm, npx, pwd, sleep, tail, wc, which (git: status/diff only)". Shell containment active.

## Working-tree integrity
First command `git status --porcelain`:
```
 M app/(app)/actions/tasks.ts
 M app/globals.css
 M components/today/TaskList.tsx
 M components/today/TodayCard.tsx
 M docs/DECISIONS.md
 M docs/FIX_LOG.md
 M docs/PROGRESS.md
 M docs/SPEC.md
 M e2e/golden-path.spec.ts
 M tests/db/grants.test.ts
 M tests/db/tasks.test.ts
?? components/today/TodayEntry.tsx
?? docs/audits/full-audit-2026-09-13.md
?? docs/mockups/f19-today-box/
?? lib/todayEntry.ts
?? supabase/migrations/0023_tasks_client_id.sql
?? tests/unit/todayEntry.test.ts
```
Last command `git status --porcelain`:
```
 M app/(app)/actions/tasks.ts
 M app/globals.css
 M components/today/TaskList.tsx
 M components/today/TodayCard.tsx
 M docs/DECISIONS.md
 M docs/FIX_LOG.md
 M docs/PROGRESS.md
 M docs/SPEC.md
 M e2e/golden-path.spec.ts
 M tests/db/grants.test.ts
 M tests/db/tasks.test.ts
?? components/today/TodayEntry.tsx
?? docs/audits/full-audit-2026-09-13.md
?? docs/mockups/f19-today-box/
?? lib/todayEntry.ts
?? supabase/migrations/0023_tasks_client_id.sql
?? tests/unit/todayEntry.test.ts
```
Identical. Files written outside the porcelain view, disclosed: `npm run test:db`'s `pretest:db` rewrote the git-ignored `.env.local` (without `PARSE_STUB`; the running dev server kept its own process env and the stub stayed active — every later sort was deterministic); the e2e runs wrote under the git-ignored `/test-results/`; my Playwright screenshots went to the session scratchpad (`C:\Users\jtakh\AppData\Local\Temp\claude\...\scratchpad\s1.png`, `s2.png`, `s6-phone-box.png`), outside the repo. Every test user I seeded was deleted at the end of its script.

## Scope tested
SPEC.md F19 (lines 2761–2848): the box on a fresh day, the preview fields, Save order and partial-failure Retry, the saved state (intention line + TaskList + Re-record), Re-record semantics (done kept by id, undone archived, new rows in order), locked/closed states, e2e desktop + phone, visual captures, the U7 client-named id and migration 0023. Black-box first (suites + my own Playwright/Supabase scenarios against the running dev server), then boundaries, then source.

## Evidence per acceptance criterion

| Criterion | Result | Evidence |
|---|---|---|
| `capture-box[data-kind=today]` on a planning day with no intention and no live tasks; placeholder "Today I will … My tasks are …" | PASS | e2e lines 579–585 green (desktop 42.5 s, phone 49.0 s). My S6: sprint started yesterday, day 1 holding an intention and a task, day 2 today at 390 px → `{"state":"box","intentionLine":"(absent)","todayBox":1,"taskRows":0,"rerecordButtons":0}`, day-label "Day 2 of 14", horizontal overflow 0 px — nothing from day 1 leaks. |
| Preview "Daily intention" and "Task n" (remove ×, Add another; tasks optional) | PASS | e2e 595–596, 616–621 (Task 3 added and removed); the intention alone saved with `dbTasks() == []` (603). My S2: tasks-only sentence → intention field `""`, hint "Say what you intend to do today.", Save `aria-disabled=true`; a forced click changed nothing (intention still "ship the draft", the one live task not archived). |
| Save → `saveIntention` then `createTask` per task in order; mid-list failure keeps created rows and offers Retry; `router.refresh()` after | PASS | e2e 626–655: third action POST's response dropped → alert "The intention and 1 of 2 tasks are saved.", two rows before Retry, still two after, `actionPosts == 4`, rows in order. Source (`components/today/TodayEntry.tsx:48–77`) runs steps sequentially and calls `router.refresh()` on completion. |
| Afterwards: `intention-line` + TaskList (edit/check/remove/draft unchanged) + Re-record; line "Done tasks stay; the rest are replaced." | PASS | e2e 648–670 (tick, draft row Enter-add, "Saved" hint, DB order), 676. My S2 with a wizard-style preset intention: `{"state":"saved","intentionLine":"ship the draft","todayBox":0,"rerecordButtons":1}`; Re-record prefills "Today I will ship the draft." and later "Today I will ship the draft. My tasks are Keep me."; Cancel returns to saved with the live rows. |
| Re-record Save: intention replaced, every DONE task keeps its id, each undone gains `archived_at` (`removeTask`), new rows in order | PASS | e2e 683–698: done row id unchanged (`bankAfter.id == bankRow.id`), "move the $600" and "Pay the fee" archived, new rows appended in order; same after reload (700–707). Unit `tests/unit/todayEntry.test.ts` pins the plan (4 tests, in the 216 passing). |
| Blur-saving `Intention` textarea gone | PASS | `git diff HEAD -- components/today/TodayCard.tsx` removes the `Intention` component and the `saveIntention` import; e2e 601/606/649/702 assert no "Today's entry" textbox in the saved state. |
| Locked (`intention-locked`) and closed states unchanged; no task cap; `close_day` and insight paths untouched | PASS | e2e 803–817: after close `intention-locked` = "move the $600 before lunch", `today-entry` count 0, tasks "Locked with the closed day", inputs disabled. `git diff HEAD --stat` touches only `tests/db/tasks.test.ts` (+21) and `grants.test.ts` (+2) among DB tests; no streak/close/insight test changed. No cap in `TodayEntry`/`planEntrySteps`; "Add another" has no limit (`CaptureBox.tsx:185`). Note: the parser's F17 `LIST_MAX = 40` still trims a *sorted* list at 40 items — a parser bound, not a save-time cap. |
| e2e desktop + phone green, visual captures, `npm run verify` | PASS (partial, see untested) | `npx playwright test e2e/golden-path.spec.ts --project=desktop` → 5 passed (60.0 s); `--project=phone` → 5 passed (1.1 m). `npm run test:unit` → 216 passed, 3 skipped. `npm run test:db` → 327 passed (13 files). 16 captures present in `docs/mockups/f19-today-box/` (box / sorted / saved / rerecord × desktop, phone × dusk, night). I did not run the full `npm run verify` (typecheck/lint/hooks) — see below. |
| Live mutations (done-kept removed, creates parallel, box shown with intention) | NOT REPRODUCED | Mutations are the builder's falsifiability drill; I do not mutate source. The tests that would catch them exist at the cited lines (e2e 591, 631, 688; unit line 25). |
| U7: client-named id; `createTask(dayId, text, id?)` returns the existing row on a PK replay; migration 0023 widens the INSERT grant only; user B cannot claim A's id | PASS | `tests/db/tasks.test.ts:130,141` (in the 327 green): owner's replay leaves one row; B's insert with A's id hits the key, A's row unchanged, B reads nothing. `supabase/migrations/0023_tasks_client_id.sql` is a single `grant insert (id)` plus a self-check pinning the four INSERT columns. Source `app/(app)/actions/tasks.ts:32–36`: the replay select runs under RLS and is additionally scoped to `sprint_day_id = dayId`, so a foreign or cross-day collision returns a plain failure, no row leaks. e2e 622–647 exercises the lost-response replay end to end. |

## Findings by severity

### P2-1 — Same-tick repeated Save submits the plan again with fresh ids; six task rows for two tasks
`components/today/TodayEntry.tsx:80` guards with `if (pending) return;` — `pending` is `useTransition` state, so clicks that land before React re-renders all pass, and each `save()` builds a new plan with new `crypto.randomUUID()` ids (the U7 replay protection only covers the *same* id). Reproduced (scenario S3): after "Sort into parts" on "Today I will finish the deck. My tasks are outline it and send it.", `el.click(); el.click(); el.click();` inside one `evaluate` → DB: `[["outline it",false,false],["outline it",false,false],["outline it",false,false],["send it",false,false],["send it",false,false],["send it",false,false]]` while the list showed 2 rows (six after a reload). Human-speed presses are guarded: a second click at 60 ms and a third at 180 ms (S3c) produced exactly two rows, and my timeline shows `aria-disabled="true"` within 20 ms of the first click. Not reachable by an ordinary double-tap as far as I could reproduce; it is a duplication path the SPEC's risk (2) says should not exist.

### P2-2 — A day with live tasks but no intention shows an empty intention line and no prompt
`showBox = rerecording || (!current.intention && rows.length === 0)` (`TodayEntry.tsx:45`). Reproduced (S1): day 1 today, `intention` null, one task inserted directly → `{"state":"saved","intentionLine":"","todayBox":0,"taskRows":1,"rerecordButtons":1}`; the card shows the task list under a blank line, no placeholder, no hint (`#today-hint` absent). Re-record still works and prefills "My tasks are Pre-existing task." (S1b). This is exactly the shape a pre-F19 production day has (tasks added through the old list, intention never typed), so existing users' open day may render this way after deploy. SPEC says the box shows "only while both are empty", so the hide is as specified; the blank line with nothing pointing at Re-record is the usability gap.

### Notes (not defects)
- Without the "Today I will" lead-in ("Move the $600. My tasks are …") the stub takes "Move the $600" as the intention and Save is enabled (S4) — reasonable, and F17's parser is out of F19 scope.
- The builder's captures in `docs/mockups/f19-today-box/` (e.g. `desktop-dusk-saved.png`, `phone-night-rerecord.png`) show the sticky header painted mid-page — a full-page screenshot artefact; my own full-page shots at 1280 and 390 show the header at the top. Content of the captures matches the claimed states.
- After a mid-list failure in Re-record mode, Cancel is hidden (`rerecording && !run`) and the box is locked until Retry succeeds or the page reloads; a reload lands in a consistent saved state. Within spec ("offers Retry for the rest").

## Untested or unprovable
- `npm run verify` as a whole (typecheck, lint, `test:hooks` — the hooks tests need `python`, which is off my allowlist). I ran unit, DB, and both e2e projects individually; all green.
- Dictation with real audio; the model parser (`PARSE_STUB=1` was on throughout).
- The live mutations named in the SPEC (I never mutate source).
- A Re-record while a tick or edit is still in flight in the list; the plan reads `rows` as last reported by `onRows`.
- Shell-guard note: `execSync`/`2>&1`/`cd` are blocked for the evaluator; I worked from `node -e` with the local stack's documented demo keys taken from `supabase status` (allowed) rather than `.env.local`.

## Recommendation
**Continue.** F19 meets its acceptance criteria on every path I could exercise; both P2s belong in `docs/BACKLOG.md`. If real users have open days with tasks and no intention, P2-2 is the one to look at before the deploy that ships F19, since it is what they will see first.
