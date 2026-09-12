# Evaluation report — F15 Situations (docs/SPEC.md)

**Most severe finding: none above P2.** Every acceptance criterion I could exercise passed; two P2 observations and a few unprovable areas are listed below. Recommendation: **continue** (see the end).

## Step 0 — containment probes

- **0a Read probe** — `Read .claude/evaluator-hook-probe.txt` → **BLOCKED** by `evaluator_guard.py` ("Evaluator hook self-probe: BLOCKED, which is the expected result"). Read containment active.
- **0b Shell probe** — `python -c "print('evaluator shell probe')"` → **BLOCKED** by `shell_guard.py` ("Evaluator shell allowlist: 'python' is not permitted"). Shell containment active.

## Working-tree integrity

First command, `git status --porcelain`:

```
 M app/(app)/actions/day.ts
 M app/(app)/actions/library.ts
 M app/(app)/actions/sprint.ts
 M app/(app)/insights/page.tsx
 M app/(app)/sprints/[area]/page.tsx
 M app/(app)/sprints/new/page.tsx
 M app/(app)/vision/cues/page.tsx
 M app/(app)/vision/impediments/page.tsx
 M app/(app)/vision/layout.tsx
 M app/globals.css
 M components/ItemPicker.tsx
 M components/LibraryPage.tsx
 M components/NewSprintWizard.tsx
 M components/ProofInputs.tsx
 M components/VisionOverview.tsx
 M components/VisionSetup.tsx
 M components/insights/InsightCard.tsx
 M components/insights/Postmortem.tsx
 M components/today/AddItemPicker.tsx
 M components/today/CloseFlow.tsx
 M components/today/DayQuestions.tsx
 M components/today/Journal.tsx
 M components/today/Rail.tsx
 M components/today/TodayCard.tsx
 M docs/BACKLOG.md
 M docs/DECISIONS.md
 M docs/FIX_LOG.md
 M docs/PROGRESS.md
 M docs/SPEC.md
 M e2e/golden-path.spec.ts
 M lib/across.ts
 M lib/acrossCards.ts
 M lib/data.ts
 M lib/database.types.ts
 M lib/daySummary.ts
 M lib/errors.ts
 M lib/insightCards.ts
 M lib/kit.ts
 M tests/db/completion.test.ts
 M tests/db/grants.test.ts
 M tests/db/helpers.ts
 M tests/db/insights.test.ts
 M tests/db/libraries.test.ts
 M tests/db/rls.test.ts
 M tests/db/vision.test.ts
 M tests/unit/across.test.ts
 M tests/unit/daySummary.test.ts
 M tests/unit/insightCards.test.ts
?? app/(app)/vision/cue-situations/
?? app/(app)/vision/impediment-situations/
?? components/SituationLibraryPage.tsx
?? components/SituationPicker.tsx
?? lib/dayAnswers.ts
?? scripts/delete-user-rows.sql
?? scripts/rehearse-0019.mjs
?? scripts/seed-f15-visual.mts
?? supabase/migrations/0019_situations.sql
?? tests/unit/dayAnswers.test.ts
```

Last command, `git status --porcelain`: **identical to the above, line for line** (59 lines; 48 ` M`, 11 `??`).

Files written during the evaluation, all gitignored so they do not appear above: `.env.local` (rewritten by `pretest:db` / `pretest:e2e` / `predev`), `.next/`, `test-results/`. No tracked file was modified, no tracked file deleted, no new untracked file left behind.

**Side effects outside the tree the main session should know about:**
- I started `npm run dev` in the background (port 3000) for the UI checks. No process-kill command is on my allowlist, so **it may still be holding :3000**.
- The local DB was reset by `scripts/rehearse-0019.mjs` (0018 → seed → 0019 → reset to HEAD), so the two eval users I created (`eval-a@test.local`, `eval-b@test.local`) and all their rows are gone; the stack is at 0019, empty.

## Scope tested

F15 only: migration 0019 (DDL, RLS, grants, conversion), the rebuilt functions (`start_sprint`, `sprint_invalid_reason`, `add_sprint_item`, `remove_sprint_item`, `archive_item('situation')`, `set_item_situations`, `day_offered_items`, `close_day`), the three insight functions, the app pages (`/vision/impediments`, `/vision/cues`, `/vision/impediment-situations`, `/vision/cue-situations`, `/sprints/[area]`, `/sprints/new`, `/insights`), the test suites, and the rehearsal script.

Method: black-box first through PostgREST as two freshly created users (password grant), then server-rendered pages via a crafted `@supabase/ssr` session cookie, then the suites, then source inspection of the migration and test files.

## Evidence per acceptance criterion

### 1. Migration 0019 — schema, RLS, grants
| Check | Evidence | Result |
|---|---|---|
| Tables `situations`, `impediment_situations`, `cue_situations`, `day_impediment_situation_observations`, `day_cue_situation_observations` exist with the spec'd columns; `day_impediment_observations` has `proof_then`/`proof_recover`; `impediments.proof_when` gone; six legacy `sprint_days` columns remain | PostgREST OpenAPI (`GET /rest/v1/`) — column lists match; `impediments` keys: `archived_at, created_at, explanation, id, name, proof_recover, proof_then, rank, scope, updated_at, user_id`; `sprint_days` still has `proof_when, proof_then, proof_recover, response, recovered, impact` | PASS |
| `kind` check | insert `kind:"bogus"` → `23514 situations_kind_check` | PASS |
| `unique (id, kind)` + composite FK | migration lines 53, 110, 124; RPC attach of a cue situation to an impediment → `situation_not_found` (function guard sits in front of the FK); DB test "the composite FK refuses a cue situation on an impediment even for the postgres role" passed | PASS |
| `check (occurred or recovered is null)` | service-role insert with `occurred:false, recovered:"yes"` → `23514 …_recovered_needs_occurred` | PASS |
| RLS: SELECT own on every new table | user B `GET situations`, `impediment_situations`, `day_impediment_situation_observations`, `day_cue_situation_observations` → `[]` each, while A had rows | PASS |
| situations INSERT `(user_id, kind, name, scope)` only | insert with `rank:99` → `42501 permission denied`; insert as A with B's `user_id` → `new row violates row-level security policy` | PASS |
| situations UPDATE `(name)` only | PATCH `scope` → 42501; PATCH `archived_at` → 42501; PATCH `name` → 200 with the new name; B's PATCH on A's row → `[]` | PASS |
| situations DELETE own while unattached | DELETE attached `Late meetings` → `[]` (0 rows); DELETE unattached `Throwaway` → 1 row returned | PASS |
| Join / observation tables written only by definer functions | authenticated POST `impediment_situations` → 42501; authenticated POST/PATCH `day_impediment_situation_observations` → 42501; service-role PATCH of a situation-observation row → `P0001 day_closed` (immutability trigger holds even for the bypass role) | PASS |
| Legacy day columns never written, out of `sprint_days_effective`, still locked | after both closes: `proof_when/proof_then/proof_recover/response/recovered/impact` all `null` on the closed day; `GET sprint_days_effective` keys = `actual, attainment, closed_on_time, date, day_index, highest_impediment_id, id, sprint_id, target, user_id`; authenticated PATCH `response` on an open day → 42501 (no UPDATE grant at all) | PASS |

### 2. Conversion + rehearsal
`npx --no-install tsx --env-file=.env.local scripts/rehearse-0019.mjs` — exit 0. Output (abridged):
```
ok   situations = impediments + cues: 5
ok   items without a situation: 0
ok   impediment names (WHEN moved in; the bare one kept its name): ["I notice delaying","Phone distraction"]
ok   A's situations (old SITUATION names; a cue's WHEN or REMIND): [...]
ok   legacy day → situation rows (highest recovered 'no' copied, other not occurred): [["Phone distraction",false,null],["Starting late",true,"no"]]
ok   legacy cue rows → applied follows used: [...]
ok   proof snapshot copied onto the highest's observation row: ["timer","running in 10"]
ok   legacy day columns untouched: ["yes","no","some"]
ok   impediments.proof_when dropped: 0
ok   legacy recovery feeds the new card: [1,1,0]
all assertions passed
```
Source (migration 233–290): set-based inserts with the item's id as the situation id, `coalesce(nullif(btrim(proof_when),''), name)` into `impediments.name`, `coalesce(nullif(btrim(cue_when),''), name)` for cue situations, per-observation situation rows with the Highest's `recovered` copied from the day row, proof snapshot onto `was_highest` rows, and a `do $$` block raising `conversion_incomplete` on either count mismatch. **PASS.** (Hosted-dump rehearsal is a release-time step; not testable here.)

### 3. Rebuilt functions (black-box via RPC as user A)
| Call | Result |
|---|---|
| `start_sprint` 4 impediments | `too_many_impediments` |
| 0 impediments | `no_impediments` |
| 4 cues | `too_many_cues` |
| 2 impediments, highest null | `no_highest_impediment` |
| 2 cues, focus null | `no_focus_cue` |
| non-highest member with blank THEN/RECOVERED | `proof_point_required` |
| impediment with THEN+RECOVERED but no situation | `no_situations` |
| 1 impediment + 1 cue, highest null, focus null | sprint created; `sprint_impediments.is_highest=true`, `sprint_cues.is_focus=true` (auto-pick) |
| 1 impediment, **0 cues** | sprint created (wealth sprint after the cue removal stayed valid; DB test "starts with 0 cues" passed) |
| `set_item_situations` cue-kind situation on impediment | `situation_not_found` |
| … as user B on A's item | `item_not_found` |
| … `[]` on an active member | `no_situations` |
| … archived situation | `situation_archived` |
| `add_sprint_item` impediment without situation | `no_situations`; without THEN/RECOVERED → `proof_point_required` |
| `add_sprint_item` first cue after the last was removed | new cue has `is_focus=true` |
| `remove_sprint_item` last (focus) cue | allowed; row `removed_at` set **and** `is_focus=false` in the same row |
| `archive_item('situation', only live situation of an active cue)` | `{"ok": false, "failing": [{"reason": "no_situations", ...}]}` |
| `archive_item('situation', one of two on an active impediment)` | `{"ok": true, "removed_from": 0}`; the rail then lists only the remaining one |
| `day_offered_items` | each item carries `situations: [{id,name,rank}]`; as user B → `[]` |
| `close_day` yes + `situations: []` | `situations_required` |
| no + situations | `situations_not_applicable` |
| situation of another item | `situation_not_offered` |
| same situation twice | `duplicate_situation` |
| `recovered:"kinda"` / `recovered` on a cue situation / impediment `answer:"maybe"` | `invalid_answer` ×3 |
| as user B on A's day | `day_not_found` |
| valid close (Third yes [Slack pings recovered yes], Fourth no, Cue two yes [Morning start], Cue three untouched) | `1`; `day_impediment_observations`: Third `occurred=yes, was_highest=true, proof_then=T3, proof_recover=R3`, Fourth `no`; situation rows: one per offered situation of every offered item (`Slack pings` under Third `occurred=true, recovered=yes`; under Fourth `false,null`); `day_cue_observations`: Cue two `yes`, Cue three `unanswered`; cue-situation rows `applied=true/false` accordingly; null `recovered` accepted on the earlier close |
| snapshots survive renames | renamed situation → `Slack pings RENAMED`, item → `Third RENAMED` / THEN `T3 changed`; observation rows still read `Slack pings`, `Third`, `T3` |

`sprint_invalid_reason` order verified in source (migration 493–541): `too_many_cues` → `no_focus_cue` (only if `v_cues &gt;= 1`) → `no_impediments` / `too_many_impediments` → `no_highest_impediment` → `no_situations` → `proof_point_required`. **PASS.**

### 4. Insights
`insight_response_recovery(health)` → one row per impediment with `(occurrences, verdict_occurrences, answered, recovered, didnt, rate, enough)`; `insight_impediment_impact` → no `felt_*` fields; `insight_situations` → one row per (kind, item, situation) with `(occurrences, asked_days, recovered_yes, recovered_answered, rate, enough)`. `insight_response_followthrough*` absent from the RPC list and dropped in migration 1486–1487. DB test "no calculation reads sprint_days directly — the effective-days view is the only source" (`tests/db/insights.test.ts:385`) and the promote-away `verdict_occurrences` test (`tests/db/completion.test.ts:720–725`) passed. **PASS.**

### 5. DB tests
`npm run test:db` → **12 files, 313 tests passed** (37.97 s). Coverage cross-checked against the SPEC list in `tests/db/libraries.test.ts`: `TABLES` (lines 71–83) includes all five new tables for the owner-sees / B-gets-0 / **disable-enable leak** tests; rules 3–6 each with a failing input (183–219); composite FK for postgres (1425); direct-write denial on kind/scope/rank/archived_at (1433); delete policy (1447); last-cue focus clear (436, 547); five payload errors (684); snapshots and immutability (702, 762); legacy columns never written (743–767); pin markers (1104). `tests/db/grants.test.ts` ran green. **PASS.**

### 6. App
`npm run test:unit` → **13 files, 167 tests passed** (includes `tests/unit/dayAnswers.test.ts`). Server-rendered pages as user A:
- `/vision/impediments`: guidance copy present **verbatim** ("Name the moment you will recognise (WHEN), … one response usually covers several."), hint "WHEN and at least one situation are needed.", labels INTERFERES / RECOVERED WHEN / APPLIES TO, cards without a live situation (`NoSit`, and `Bare one` after its only situation was archived) carry `data-blocked="true"` and usage line "Blocked · no situation".
- `/vision/cues`: copy verbatim ("A good cue names a moment you will recognise (WHEN) … one cue can cover several."), hint "WHEN, REMIND and at least one situation are needed.", REMIND / NOTE / APPLIES TO.
- `/vision/impediment-situations`, `/vision/cue-situations`: `situations-page`, `library-count`, `situation-item`, `usage-line`, Archive present; user B sees `library-count` 0, `library-empty`, "No impediment situations yet. Name the first one above, then tick it under an impediment." — no leakage of A's names.
- `/sprints/wealth` rail: Traffic WHEN → "Take the train" → RECOVERED WHEN "At desk by 9" → APPLIES TO "Slack pings RENAMED" (archived one omitted), "Edit response", cue row `Cue four` FOCUS with APPLIES TO and Remove.
- `/sprints/health` journal summary line: **`Showed up: Third (Slack pings; recovered 1 of 1) · Cues used: Cue two (Morning start)`**.
- `lib/errors.ts` has copy for every new code (lines 16–22, 51–62). `lib/kit.ts` slices to 3 (lines 57, 60).
- Unauthenticated `/vision/impediment-situations` → 307.

### 7. e2e
`npm run test:e2e` → **12 passed, 6 skipped** (phone reminders + `deployed` project skip by design), 2.1 min, desktop + phone golden path green. The spec asserts the F15 items the SPEC names (`data-blocked`, "Blocked · no situation", "Tick at least one situation for …", "4 occurrences · 50% recovered", "applied on 4 days", the kit sentence at line 905, the wizard hint ladder at 200–255). **PASS.**

### 8. Falsifiability mutations
Not re-run by me (they require editing source). The rehearsal script's own assertions and the named DB tests exist; I did not verify each mutation turns its test red. **Unproven.**

## Findings by severity

**P0** — none.
**P1** — none.

**P2-1 — `insight_situations` mixes live and snapshot names.** `item_name` reads the current library name (`"Third RENAMED"`) while `situation_name` reads the observation snapshot (`"Slack pings"`, not `"Slack pings RENAMED"`). The SPEC does not pin which name the breakdown line shows, so this is not a spec failure, but a renamed situation will read differently from its parent card in Insights. Evidence: `insight_situations` output above.

**P2-2 — `rate` is `null` until `enough`.** `insight_response_recovery` and `insight_situations` return `rate: null` with `answered: 1, recovered: 1`. The SPEC lists `rate` and `enough` as separate fields; whether a thin-data rate should be shown or hidden is unstated. Noted for the "Insights breakdown with thin data" UI state, which I could not render (see below).

**Observation (not a finding):** `service_role` holds INSERT on the situation-observation tables (its insert reached the check/unique constraints rather than a grant error). The SPEC's "API-role insert denied" is satisfied for `anon`/`authenticated`; the immutability trigger still blocks service-role updates. Standard Supabase posture; recorded for completeness.

**Observation:** the e2e run logged `Error: The destination stream closed early` for `/sprints/wealth?_rsc=…` twice (desktop and phone) during the F5/F10 tests without failing them — looks like a cancelled RSC navigation, not F15.

## Untested or unprovable
- Client-only wizard states (hint ladder text, "n of 3", disabled rows) and the close dialog's live flow: not visible in server HTML; covered only by the passing e2e spec.
- Insights page with real data: the account had no finished sprint, so `/insights` rendered its empty state; recovery card `{recovered} of {answered}`, `situation-line`s and kit sentences are covered only by the e2e F10 seed assertions.
- Hosted-dump rehearsal and the production gate.
- The eight named falsifiability mutations.
- Visual verification at 1138 px / 390 px (no browser tooling available to me).

## Recommendation
**Continue.** No P0/P1. Everything in scope that I could exercise matched the SPEC; the two P2 items are BACKLOG-grade. Before release, the hosted-dump rehearsal and a visual pass on the close at 390 px remain the SPEC's own open steps.

Closing `git status --porcelain` — identical to the opening output quoted above.

---

*Main-session note (not part of the evaluator's text): `git status --porcelain` was recorded immediately before dispatch and again after the report arrived; the two outputs are byte-identical (`cmp`), and match the listing above. The orphaned `next dev` on :3000 was stopped afterwards.*
