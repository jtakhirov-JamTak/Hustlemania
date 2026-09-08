# F10 Evaluation — Sprint completion, End Early, postmortem, kit, next-sprint gate

## ⚠️ Lead finding: working-tree divergence (evaluation integrity)

**My first and final `git status --porcelain` are NOT identical.** Three tracked doc files became modified during my run:

```
docs/BACKLOG.md   | 39 +++++++++++++++++++++++++------
docs/DECISIONS.md | 69 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
docs/FIX_LOG.md   | 51 ++++++++++++++++++++++++++++++++++++++++
3 files changed, 152 insertions(+), 7 deletions(-)
```

I did not and could not have written them: I hold no Write/Edit/MultiEdit tool, and every shell redirect/file-mutation I attempted was refused by `shell_guard.py` (three separate refusals logged). No command I ran touches `docs/`. The changes therefore originated outside this subagent — most plausibly the dispatching session writing its own records while I was running. **Per my instructions this difference invalidates the run's integrity guarantee; the main session must decide whether to accept the findings below.** I report them in full because every one is backed by a command and its output, but I cannot certify tree stability.

---

## Step 0 — containment probes

- **0a Read probe** — `Read .claude/evaluator-hook-probe.txt` → **BLOCKED** by `evaluator_guard.py` ("Evaluator hook self-probe: BLOCKED, which is the expected result"). Context isolation active.
- **0b Shell probe** — `python -c "print('evaluator shell probe')"` → **BLOCKED**: `Evaluator shell allowlist: 'python' is not permitted. Allowed: cat, curl, diff, echo, find, git, grep, head, jq, ls, node, npm, npx, pwd, sleep, tail, wc, which (git: status/diff only).` Shell containment active.

## Working tree

**First command (`git status --porcelain`):**
```
 M app/(app)/insights/page.tsx
 M app/(app)/sprints/[area]/page.tsx
 M app/(app)/sprints/layout.tsx
 M app/(app)/sprints/new/page.tsx
 M app/globals.css
 M components/NewSprintWizard.tsx
 M components/today/Journal.tsx
 M components/today/Rail.tsx
 M docs/PROGRESS.md
 M docs/SPEC.md
 M e2e/golden-path.spec.ts
 M lib/data.ts
 M lib/database.types.ts
 M lib/errors.ts
 M tests/db/grants.test.ts
 M tests/db/helpers.ts
 M tests/db/libraries.test.ts
 M tests/db/streaks.test.ts
 M tests/db/targets.test.ts
 M tests/support/sprints.ts
?? app/(app)/actions/review.ts
?? app/(app)/insights/layout.tsx
?? app/(app)/insights/reviews/
?? components/ReviewGate.tsx
?? components/insights/
?? components/today/FinishSprint.tsx
?? docs/mockups/f10-postmortem/
?? lib/insightCards.ts
?? lib/kit.ts
?? supabase/migrations/0012_sprint_completion.sql
?? supabase/migrations/0013_f10_function_privileges.sql
?? supabase/migrations/0014_insight_calculations_fix.sql
?? tests/db/completion.test.ts
?? tests/db/insights.test.ts
?? tests/unit/insightCards.test.ts
```

**Final command (`git status --porcelain`):** identical to the above **except** three added lines — `M docs/BACKLOG.md`, `M docs/DECISIONS.md`, `M docs/FIX_LOG.md`.

**Side effects I did cause, disclosed:** I ran `npm run db:reset` twice and wrote fixture rows into the **local database** (users `eval-a…d@x.test`, visions, sprints `aaaaaaaa-…`/`bbbbbbbb-…`, impediments/cues/observations/tasks, one `reviews` row and four `review_decisions`). The DB is therefore no longer "no users, no rows" as handed to me. No repo file was created or deleted by me. `npm run pretest:*` regenerated `.env.local` (gitignored).

## Scope tested

SPEC.md §F10 only. Method: black-box first (running app via Playwright against `localhost:3000`, PostgREST as `anon`, SQL as the `authenticated` role with a simulated `auth.uid()`), boundary tests, then source/schema inspection for what black-box could not reach.

## Evidence per acceptance criterion

### Migrations & schema — PASS
`npm run db:reset` applied 0001…0014 cleanly. Verified by query:
- `sprints.closed_at timestamptz` present; `sprints_status_check` = `status = ANY (ARRAY['active','completed','completed_early','ended','ended_early'])` — no `'review'`. An update to `'review'` is rejected (raises `sprint_finished` from the transition trigger before the CHECK is reached).
- `sprint_days.cancelled boolean not null default false` with `sprint_days_cancelled_not_closed_check CHECK (NOT (cancelled AND closed_at IS NOT NULL))`. Both directions rejected: cancelling a closed day and closing a cancelled day both raise the CHECK; un-cancelling raises `day_cancelled`.
- `sprints_status_transition` trigger: finished→active, finished→other-finished, second `closed_at` write, and `closed_at`→null all raise `sprint_finished`.
- Three triggers on `sprint_days` (`sprint_days_immutable_after_close`, `sprint_days_set_updated_at`, `sprint_days_target_locked`); full `tests/db` suite green (268 tests) including the streaks/libraries pins.
- `sprint_days_effective` exists with `reloptions = {security_invoker=true}`, filters `closed_at is not null AND NOT cancelled AND target > 0`, exposes `attainment = actual::numeric / target::numeric`.
- `reviews` / `review_decisions` columns, uniques and CHECKs match SPEC exactly (`reviews_sprint_id_key`, `reviews_lesson_check btrim(lesson) <> ''`, `review_decisions_review_id_kind_item_id_key`, the kind/decision compound CHECK). No kit table exists.

### RLS and grants — PASS
- `authenticated` holds **SELECT only** on `reviews` and `review_decisions`; policies `reviews_select_own` / `review_decisions_select_own` on `auth.uid() = user_id`.
- As user A (`eval-a`): `select count(*) from reviews` → `0`; from `review_decisions` → `0`. As the owner: `1`.
- Owner attempts: `update reviews set lesson='hacked'` → `permission denied for table reviews`; `delete from reviews` → denied; `insert into reviews` → denied; `update review_decisions` → denied. Lesson unchanged afterwards.
- Anon over REST: `GET /rest/v1/reviews` → `401`; `POST /rest/v1/rpc/finish_review` → `401 {"code":"42501","message":"permission denied for function finish_review"}`.
- Gate-bypass surface: `authenticated` has UPDATE only on `sprints.mantra` and `sprint_days.intention`. Direct `update sprints set status='active'`, `set closed_at=null`, `insert into sprints`, `update sprint_days set cancelled=false` → all `permission denied`. `start_sprint` is the sole insert path.
- No PUBLIC EXECUTE on any `public` function; all ten new functions are `SECURITY DEFINER`, `search_path=''`, granted to `authenticated` only (plus owner).

### Closure functions — PASS
Fixture sprints, called through the `authenticated` role:

| call | result |
|---|---|
| `complete_sprint` total 50 < goal 100 | `goal_not_reached` |
| `complete_sprint` on another user's sprint | `sprint_not_found` |
| `complete_sprint` at goal, mid-window | ok → `completed_early` |
| `end_sprint_early` before day 1 | ok → `ended_early`, 14 cancelled / 0 closed |
| `end_sprint_early` after the window | `window_passed` |
| `complete_sprint` after the window | `window_passed` |
| `finish_sprint` while running | `sprint_running` |
| `finish_sprint` total 120 ≥ 100 | ok → `completed` |
| `finish_sprint` total 50 < 100 | ok → `ended` |
| `close_day` on a finished sprint | `sprint_not_active` |

Closure-day handling verified explicitly: on the completed sprint, day 6 (today, already closed) stayed `cancelled=false, closed=true` while days 7–14 became `cancelled=true`.

### `sprint_streak_at`, `sprint_best_streak` — PASS (one latent inconsistency, see P2-5)
- Sprint completed on day 9 with days 1–9 on time, read on day 11 → **9** (the F5 defect is closed).
- Sprint with a cancelled day inside a run (1–3 on time, day 4 cancelled, 5–7 on time) → `sprint_streak_at` = **6**: a cancelled day does not break the run.
- `sprint_best_streak` with runs 4/2/3 → **4**. Called by another user → `sprint_not_found`.

### `start_sprint` rule-26 gate — PASS
User B with a finished, unreviewed `wealth` sprint: `start_sprint('wealth', …)` → `review_required`. Same user, `relationships` with an active sprint → `active_sprint_exists` (so the new check precedes the old one). After `finish_review`, the `wealth` call no longer returns `review_required` (it advances to the next validation, `no_cues`). All existing `start_sprint` tests remain green.

### `finish_review` — PASS
| input | result |
|---|---|
| active sprint | `sprint_running` |
| another user's sprint | `sprint_not_found` |
| lesson `'   '` / `null` | `lesson_required` |
| `p_moved` null | `vision_answer_required` |
| verdict given when highest never occurred | `verdict_not_applicable` |
| verdict omitted when it did occur | `verdict_required` |
| `'bogus'` when a verdict applies | `invalid_verdict` |
| `item_id` not a member | `item_not_in_sprint` |
| two impediments `'highest'` | `one_highest_only` |
| second review for the same sprint | `review_exists` |

`select count(*) from reviews` → `0` after all nine rejections (atomicity). On success with only `{Late nights: drop}` supplied, the stored set was four rows covering every member with `keep` defaulted.

### Insight calculations — PASS (numbers independently hand-computed)
I built my own 14-day fixture (10 closed days, attainments 1.2/0.8/1.4/0.6/1.0/1.6/0.4/2.0/1.2/0.9, 4 cancelled, one `unsure` day, plus a deliberate `occurred='yes'` observation on a **cancelled** day) and checked every figure against hand arithmetic. All matched, including:
- highest impediment: present 4 / absent 5, median 130% vs 100%, `+30 pts`, impact tally `1 a lot, 2 some, 1 nothing`;
- second impediment: present 3 / absent 7, `+50 pts`, `enough` true — and in a second fixture with present = 2, `enough` false and `delta_pts` null, so the flag flips at exactly 3;
- cue usefulness `+55` and `-20 pts` with the correct even-count medians (0.85 → 85%);
- follow-through 4 occurrences, 3 ran / 1 didn't, 75%;
- recovery 2 of 3 with the response, 0 of 1 without, medians 130% vs 120% shown only because each side had ≥ 2;
- `sprint_review_summary` total 111, 111%, met, 10 closed, 4 cancelled, best streak 10.

The cancelled-day observation did **not** move `present_days` (3, not 4) in the second fixture, and the `unsure` day was excluded from both denominators while counted in coverage.

### Journal & rail — PASS
- `complete-sprint` card renders only at goal: *"Goal reached · 120 calls of 100 calls. Remaining days are cancelled, not missed."* Celebration card reads *"Goal reached · Dinner"*.
- `end-sprint-early` two-tap: label goes `End sprint early` → `Tap again to end this sprint now` → sprint ends. Hidden once finished.
- `sprint-ended` slot after day 14 renders exactly the SPEC copy: *"All 14 days have passed. Add any missed day above, then finish the sprint. Unclosed days stay as they are once it is finished."* + `Finish the sprint`.
- `last-lesson` card on Day 1 quotes the review lesson.
- All three closure paths driven through the UI produced the right DB state: health → `completed_early` with day 7 (today, open) and 8–14 cancelled; relationships → `ended`, nothing cancelled (all dates past); new wealth sprint → `ended_early`, 14 cancelled / 0 closed.

### Review gate — PASS
`/sprints/wealth` with a finished unreviewed sprint renders `review-gate`: kicker `Wealth · completed early`, outcome, the exact v8 copy, `Open the postmortem`, meta `111 of 100 calls · met · 10 of 14 days closed`. Sidebar reads `Ended` / `Needs review`. After the review: gate gone, `empty-state` returns with the quiet `Read the last postmortem` link, sidebar flips to `Ready` / `No active sprint`.

### Postmortem — PASS with two gaps (P2-1, P2-2)
`/insights/reviews/[sprintId]` renders `postmortem` with the result card, the four insight cards with `HIGHEST` / `FOCUS` tags and coverage lines, the proof-point card, the lesson + vision chips, the carry-forward rows, and `Day by day` listing every closed day with `12 of 10` and both tasks (plus `Cancelled · not missed` rows). `Finish review` is `aria-disabled=true` with `aria-describedby="pm-hint"` until lesson **and** vision answer **and** verdict are all supplied — I confirmed it stays disabled after each of the first two. Read-only after finishing, `Reviewed …` stamp, kit card updated to drop the dropped impediment.

The "never showed up" branch also renders correctly on a sprint with no qualifying observation: *"It never showed up on a logged day. No verdict is asked."*

### Authorization on the postmortem route — PASS
As the signed-in user: another user's finished sprint id → **404**; a random UUID → **404**; own **active** sprint id → **404**. No data leak, no partial render.

### Insights sidebar — PASS
Finished sprints newest first, label = outcome, meta `Needs review` (accent) or `Reviewed Sep 7, 2026`, sub `Wealth · Aug 27 → Sep 9`, then an `Across sprints` section linking `/insights`, which keeps its F1 placeholder. The active health sprint never appeared.

### Wizard kit pre-fill — PASS
Walked the wizard to the library step for `wealth` after the review. It shows *"Pre-filled from your last Wealth review. Change anything you like."* above the impediment group; `Doomscrolling` (kept) is checked, `Late nights` (dropped) is not; both cues checked; no highest pre-selected (no decision was `highest`), and the step correctly blocks with *"Designate the highest impediment."* Unit coverage for `prefillFromKit` / `kitFrom` exists in `tests/unit/insightCards.test.ts`.

### Suites — PASS
`npm run typecheck` clean · `npm run lint` clean · `npm run test:unit` 80/80 · `npm run test:db` 268/268 · `npm run test:e2e` 10/10 (desktop + phone, including the F10 spec). No horizontal overflow at 390 px on the postmortem, the gate or the journal (`clientWidth = scrollWidth = bodyScrollWidth = 390` on all four pages checked).

---

## Findings

### P0 — none.

### P1 — none.

### P2

1. **The postmortem rail is missing the "Across n finished sprints" card.** SPEC: *"Rail: the accent Next {Area} sprint starts with kit card … and an **Across n finished sprints** card."* The rendered rail has the kit card and a `How to read this` card; nothing else. `rg "Across" **/*.tsx` finds the string only in `app/(app)/insights/page.tsx` and `app/(app)/insights/layout.tsx` (the sidebar section), never in `components/insights/`. Stated acceptance criterion not met.

2. **`sprint_review_summary` reads `public.sprint_days` directly, so the SPEC's "five insight functions" pin covers only four.** SPEC: *"Every insight function reads this view. Test: a `pg_get_functiondef` scan of the five insight functions finds no reference to `public.sprint_days`…"* My scan: the four card functions are clean; `sprint_review_summary` is not — its body joins `public.sprint_days` (it must, since it counts missed and cancelled days, which the view excludes by design). The shipped pin in `tests/db/insights.test.ts:327` asserts `toHaveLength(4)` and names only the four card functions. The numbers it produces are correct (I verified 111 / 111% / met / 10 / 4 / best streak 10 by hand); the gap is that the named guard is narrower than the SPEC claims.

3. **`insight_response_followthrough.answered` excludes `partially`, which the SPEC's stated rule does not.** SPEC: *"`unsure` and `unanswered` are excluded from every denominator but counted in coverage."* The body computes `answered = count(*) filter (where o.response in ('yes','no'))`. On my fixture with responses `yes / no / partially` over 3 occurrences it returned `occurrences 3, answered 2, ran 1, didnt 1, partially 1, unsure 0, enough false`. Consequence: a user who answers every day but often answers "partially" sees the comparison suppressed and, in the extreme, the proof-point line reads "response ran 0 of 0 answered".

4. **`Lesson from the last sprint` omits the Area.** SPEC: *"a **Lesson from the last {Area} sprint** card (testid `last-lesson`)"*. `components/today/Rail.tsx:62` renders the literal `Lesson from the last sprint`. Observed on Day 1 of the wealth sprint.

5. **`sprint_best_streak` and `sprint_streak_at` disagree about an interior cancelled day.** Same sprint (days 1–3 on time, day 4 cancelled, days 5–7 on time): `sprint_streak_at` → `6`, `sprint_best_streak` → `3`. `sprint_best_streak` groups by `day_index - row_number()` over non-cancelled on-time rows, so a skipped `day_index` breaks the run, whereas `sprint_streak_at` removes cancelled days from the sequence. SPEC describes best streak as *"the longest run of consecutive `closed_on_time = true` **among non-cancelled days**"*, which reads as the streak-function behaviour. **Latent only:** cancellation is only ever applied to days on/after the closure date, so an interior cancelled day is unreachable through the app — I had to insert it directly. Worth pinning either way, since the SPEC's own "a cancelled day never breaks a run" test is only meaningful for exactly this shape.

6. **`Reviewed {date}` can read a day behind the app's own "today".** The review row's `completed_at` is `2026-09-08T06:53:59Z`; the sidebar and the postmortem both render `Reviewed Sep 7, 2026`, while the journal on the same session labels the current day `Day 7 · today / Tuesday, September 8, 2026`. `stampDate` (`lib/dates.ts:2`) calls `toLocaleDateString` with no `timeZone`, so it uses the render host's zone, while sprint dates use UTC / the sprint `tz`. Pre-existing shared helper (also used by F9 `VisionOverview`), not introduced by F10, and the SPEC does not name a zone — but the e2e criterion "the sidebar row flips to `Reviewed {today}`" is only true for non-negative UTC offsets.

7. **Gate kicker copy for `ended` is `sprint ended`, not `ended`.** `lib/data.ts:409` `COMPLETION_LABEL` maps `completed → "sprint complete"`, `completed_early → "completed early"`, `ended → "sprint ended"`, `ended_early → "ended early"`; SPEC lists `sprint complete | completed early | ended early | ended`. Cosmetic; noting it only because the SPEC enumerates the four strings.

8. **`End sprint early` is absent once the window has passed but before the sprint is finished.** SPEC: *"the rail footer carries End sprint early as TwoTap …, hidden once the sprint is finished."* On the relationships sprint (still `active`, day 14 passed) `[data-testid=end-sprint-early]` count was `0` while `sprint-ended` was `1`. This is defensible — `end_sprint_early` would only raise `window_passed` there — but it is a divergence from the literal criterion, so flagging in case it was unintentional.

## Untested / unprovable

- **Visual match against the v8 artboard** (type sizes, the 44px result number, the 170px bar label column, kicker colours, the 14-cell strip, Dusk vs Night palettes). I verified copy, structure, testids and zero overflow at 390 px, but I did not compare pixels against `docs/mockups/f10-postmortem/`.
- **"error with every input preserved."** I could not reach a server-side `finish_review` rejection from the UI once the client-side gating is satisfied, so I never saw the error-with-preserved-input state.
- **The "live mutations" criterion** (each mutation turns a named test red). Verifying it requires editing migrations and source, which I must not do. I confirmed each mutation's *target* behaviour holds today, but not that the named test would actually go red.
- **Cross-origin dev artefact, not an app defect:** the dev server on port 3000 is bound for `localhost`. Driving it via `http://127.0.0.1:3000` renders correctly but client interactivity is dead — my first `Finish the sprint` click fired no request at all, and the HMR socket failed with `ERR_INVALID_HTTP_RESPONSE`. Everything worked on `http://localhost:3000`. Worth knowing if anyone else black-box tests this build.
- **Magic-link sign-in has a 2/hour cap** (`supabase/config.toml:198 email_sent = 2`), which cost me a `db:reset` cycle to clear. Not a finding, just a constraint on repeating this.

## Recommendation

**Continue** — no P0, no P1. Every F10 security boundary I could reach holds: the two new user-data tables are SELECT-own-only with no write grant, the ten new functions are definer/`search_path=''`/no-PUBLIC, `start_sprint` is the sole insert path so rule 26 cannot be routed around, and another user's postmortem is a flat 404. All five closure/review error paths, the atomicity of a rejected `finish_review`, and every insight number I hand-computed came out right.

Before release I would want P2-1 (missing rail card) and P2-2 (the pin is narrower than the SPEC says it is) either fixed or the SPEC amended to match, and P2-3 settled as a deliberate choice rather than an ambiguity.

**Caveat on this report's standing:** the working-tree invariant did not hold (three `docs/` files changed under me, from outside this subagent). Treat the grade accordingly.
