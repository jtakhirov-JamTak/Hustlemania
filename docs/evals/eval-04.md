# Evaluator report — F7 Day observations

**Most severe finding: no P0 or P1. Two P2 gaps between SPEC acceptance criteria and the shipped tests, one harness P2 (evaluator allowlist blocks `docker`). Recommendation: continue; do not block release on this feature.**

## Step 0 — containment probes

- **0a Read probe** — `Read .claude/evaluator-hook-probe.txt` → BLOCKED: `evaluator_guard.py ... BLOCKED, which is the expected result ... context isolation is active`. Containment active.
- **0b Shell probe** — `python -c "print('evaluator shell probe')"` → BLOCKED: `Evaluator shell allowlist: 'python' is not permitted. Allowed: cat, curl, diff, echo, find, git, grep, head, jq, ls, node, npm, npx, pwd, sleep, tail, wc, which (git: status/diff only)`. Shell containment active.

## Working-tree integrity

First `git status --porcelain`:
```
 M app/(app)/actions/day.ts
 M app/(app)/actions/library.ts
 M app/(app)/actions/sprint.ts
 M app/globals.css
 M components/NewSprintWizard.tsx
 M components/today/CloseCard.tsx
 M components/today/CloseFlow.tsx
 M components/today/PlanCard.tsx
 M components/today/SprintItemsRow.tsx
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
 M tests/db/helpers.ts
 M tests/db/libraries.test.ts
 M tests/db/locks.test.ts
 M tests/db/targets.test.ts
?? supabase/migrations/0010_day_observations.sql
```
Final `git status --porcelain`: identical to the above, byte for byte (24 lines, same paths, same states).

Side effects I caused outside the tracked tree, disclosed rather than hidden:
- `npm run test:db` / `npm run test:e2e` pre-scripts printed `[local-env] wrote .env.local` (gitignored, so invisible to porcelain; it existed already because the dev server was running). Playwright may have written `test-results/` (gitignored).
- **The local database no longer "starts blank".** My black-box API session created: auth users `eval07-a@example.com` (`bc888f68-…`) and `eval07-b@example.com` (`11a3d130-…`), one vision, cues "Cue Alpha"/"Cue Beta EDITED", impediments "Imp One EDITED"/"Imp Two", sprint `173ebd7b-…` (14 days), day 1 closed with 4 observation rows. I did not delete any of it. `npm run db:reset` restores the blank state if wanted.

## Scope tested

`docs/SPEC.md` `### F7` only (lines 648–847): migration 0010, focus cue, `close_day` observation rules, snapshots, RLS/immutability, `day_offered_items`, `start_sprint`/`set_focus_cue`, action layer, CloseFlow/wizard/Today UI wiring, e2e coverage. F8 items named as non-goals were not evaluated.

Method: suites first (`typecheck`, `lint`, `test:unit`, `test:db`, `test:e2e`), then black-box against PostgREST/GoTrue on the local stack (`http://127.0.0.1:54341`) as two fresh users, then source inspection of `supabase/migrations/0010_day_observations.sql`, `app/(app)/actions/day.ts`, `components/today/CloseFlow.tsx`, `components/NewSprintWizard.tsx`, `components/today/SprintItemsRow.tsx`, `components/today/PlanCard.tsx`, `lib/errors.ts`, `lib/data.ts`, `tests/db/*`, `e2e/golden-path.spec.ts`.

## Suite results

| Command | Result |
|---|---|
| `npm run typecheck` | green (`✓ Types generated successfully`, tsc silent) |
| `npm run lint` | green (no output) |
| `npm run test:unit` | `4 passed (4)`, `54 passed (54)` |
| `npm run test:db` | `8 passed (8)`, `203 passed (203)` (run twice; second with `--reporter=verbose`, same) |
| `npm run test:e2e` | `8 passed (46.0s)` — desktop + phone golden path and F5 backfill |

## Evidence per acceptance criterion

**Migration 0010 preconditions / no user-row rewrite** — PASS. Source: the `do $$` block at the top raises `legacy_selections_present` and `focus_backfill_required` before any DDL; no `delete`/`update` of user rows anywhere in the file (the only `update` statements are inside function bodies). DB test `the migration's guards raise on a legacy selection row and on an active sprint (its own text, in a rolled-back transaction)` passed.

**`sprint_cues.is_focus`, partial unique index, check** — PASS. Migration lines 37–42 match the spec exactly. DB test `the partial unique index and the check keep one active focus per sprint` passed. Black-box: after `start_sprint`, `sprint_cues` read back `[{Cue Alpha, is_focus:true},{Cue Beta, is_focus:false}]`.

**`sprint_days` four columns + three checks + rebuilt immutability trigger** — PASS. Migration lines 49–56 match. Trigger body (168–201) is the 0007 body (verified `new.highest_impediment_id`, `new.proof_when`, `new.closed_on_time` exist in `0007_streaks.sql`) plus the four columns. DB tests `rejects direct UPDATE of {proof_recover,response,recovered,impact} on the closed row` all passed. Black-box: `PATCH sprint_days {intention:"changed"}` on the closed day → `day_closed`; `PATCH {response:"yes"}` → `42501 permission denied` (no column grant, stricter than required).

**Observation tables: shape, immutability, RLS, grants, indexes** — PASS. Migration 63–114: columns exactly as specified, `unique (sprint_day_id, item)`, UPDATE trigger on `day_selection_immutable()`, RLS enabled, SELECT-only policy on `auth.uid() = user_id`, `grant select` only to `authenticated`, indexes on `user_id` and `impediment_id`/`cue_id`, comment at lines 12–13 stating no `updated_at`. Black-box as user B against A's rows: `GET day_impediment_observations` → `[]`; `GET day_cue_observations?id=eq.<A's id>` → `[]`. As owner A: `POST day_cue_observations` → `42501 permission denied`; `PATCH` → `42501`; `DELETE` → `42501`. Anon: `42501` on both tables. DB test at `tests/db/libraries.test.ts:673` covers owner-role UPDATE raising `day_closed` (passed).

**Legacy tables dropped** — behavior PASS, test criterion FAIL (P2, below). Black-box: `GET /rest/v1/day_impediment_hurt` → `PGRST205 Could not find the table`. OpenAPI definitions for both legacy tables are `null`. Migration lines 120–121 drop them.

**`day_offered_items` recreated with new columns, grants** — PASS. Black-box as A on day 1 returned 4 rows with keys `kind,item_id,name,explanation,cue_when,proof_when,proof_then,proof_recover,is_focus,rank`; as B on A's day → `[]`. `tests/db/grants.test.ts:158` lists it.

**`close_day` signature and rules** — PASS, every rule reproduced black-box on a live day:
- random uuid in `p_impediments` → `item_not_offered`; a cue id passed in `p_impediments` → `item_not_offered`
- `answer:"unanswered"` → `invalid_answer`; `p_cues` as an object not an array → `invalid_answer`
- same item twice → `duplicate_item`
- Highest `yes`, no `p_response` → `response_required`; with `p_response:"yes"` only → `recovered_required`
- `p_response:"maybe"` → `invalid_answer`; `p_recovered:"partially"` → `invalid_answer`; `p_impact:"huge"` → `invalid_answer`
- Highest `no` + response → `response_not_applicable`; Highest `unsure` + response → `response_not_applicable`; Highest absent + `p_impact` only → `response_not_applicable`
- Successful close (Imp One `yes`, Imp Two absent, both cues absent, `partially`/`no`, impact omitted) returned streak `1`. Day row: `proof_when:"when one", proof_then:"then one", proof_recover:"recover one", response:"partially", recovered:"no", impact:null, closed_on_time:true`, notes trimmed to `"eval note"`. Observations: Imp One `occurred:yes, was_highest:true`; Imp Two `occurred:unanswered`; Cue Beta `used:unanswered, was_focus:true` (focus had been moved to Beta via `set_focus_cue` before the close, so as-of-close is honoured); Cue Alpha `used:unanswered, was_focus:false`.
- Second `close_day` on the same day → `day_closed`. As user B on A's day → `day_not_found`.
- Anon RPC → `permission denied for function close_day`.

**Snapshots survive later library edits** — PASS. After the close I `PATCH`ed Imp One to `Imp One EDITED / when EDITED / then EDITED / recover EDITED` and Cue Beta to `Cue Beta EDITED / when beta EDITED` (both accepted). Day row still reads `when one / then one / recover one`; observation rows still read `Imp One` and `Cue Beta / when beta`.

**Legacy "missing" days** — PASS by test. DB test `a day closed with no observation rows is missing, and the next day still closes normally` passed; migration contains no reader of the observation tables.

**`start_sprint` with `p_focus_cue_id`, `sprint_invalid_reason` `no_focus_cue`, `set_focus_cue`** — PASS. Black-box: `p_focus_cue_id` set to an impediment id → `no_focus_cue`; `null` → `no_focus_cue`; both wrote nothing (`sprints` = `[]` afterwards). `remove_sprint_item` on the focus cue → `no_focus_cue`; `archive_item` on it → `{"ok":false,"failing":[{"reason":"no_focus_cue",…}]}`; `sprint_cues`/`cues` unchanged afterwards. `set_focus_cue` as B → `sprint_not_found`; as A with a non-member id → `not_in_sprint`; as A to Cue Beta → succeeded, exactly one `is_focus:true` row. OpenAPI confirms the old 0009 `start_sprint` signature is gone (single definition, `p_focus_cue_id` required). Grants test lists `set_focus_cue` (`grants.test.ts:163`) and the anon probe uses the new `close_day(uuid,bigint,text,jsonb,jsonb,text,text,text)` signature (line 174).

**Pin markers** — PASS. `tests/db/libraries.test.ts:988–995` asserts `p_focus_cue_id`, `no_focus_cue`, `p_impediments`, `new.impact`, `is_focus` plus the 0004–0009 markers; test passed.

**`lib/database.types.ts`, `lib/data.ts`, `lib/errors.ts`, `closeDayAction`** — PASS by inspection. `database.types.ts` has 17 references to the new tables/functions and none to the legacy tables. `data.ts:255` `OfferedItems` carries `is_focus`, `:224` `SprintItems.cues` gains `is_focus`, `:278` sorts focus first. `errors.ts:38–44` maps the six new codes, `:80–81` `no_focus_cue` → `"this is its focus cue"`; a repo-wide grep for `most_damaging|most_useful` outside docs/migrations returns nothing. `day.ts:51–67` `closeDayAction` takes `{actual, notes, impediments, cues, response, recovered, impact}` and mirrors `response_required` / `recovered_required` / `response_not_applicable` before the RPC.

**Close dialog** — PASS by inspection (source) and by e2e (behavior). `CloseFlow.tsx`: step label `Close day n · step 1 of 2` (line 177), hint `Enter the actual, zero included.` (131), heading `What happened on Day n?` (237), `None and Unsure are truthful answers.` (239), groups in order USE → OCCURRENCE → RESPONSE → RECOVERY → IMPACT with the specified testids, `role="group"`, `aria-pressed` pills, FOCUS tag on the focus cue, `Highest: {name}` sub, `THEN … · judge the first time it showed up today`, `Recovered when …`; pill semantics in `answersOf` (68–79) match the spec; primary `aria-disabled` with hints `Did the response run?` then `Did you recover?` (136, 350); errors rendered in `role="alert" .error-bar`. `PlanCard.tsx:50–72` fetches offered items (`dayOfferedItemsAction`) in a loading state before opening the backfill dialog.

**Wizard step 4 / Today row** — PASS by inspection and e2e. `NewSprintWizard.tsx:572–583` `wizard-focus` radiogroup; `:94` keeps the focus valid as picks change and defaults to the first pick; `:256` picks an inline-created cue (focus falls to it when it is the first pick); `:182–183` blocks with `Pick the focus cue.`. `SprintItemsRow.tsx:80–82,140` FOCUS tag, `Set as focus` on non-focus rows, Remove suppressed on the focus row. e2e lines 131, 161–183 assert the default focus, the tag, and the tag moving.

**e2e golden path** — PASS for the today path; see P2-1 for the backfill path. Lines 283–332 walk step 1 → 2, assert the FOCUS tag first in the USE group, the response group absent until the Highest is picked, the two hints, and the admin read of `response/recovered/impact/proof_recover`, one observation row per offered item with `was_highest`/`was_focus`, and the untouched cue group `unanswered`. Horizontal overflow ≤ 0 asserted at line 224–225 in both projects.

## Findings by severity

**P0** — none.

**P1** — none.

**P2-1 — e2e backfill path does not do what the criterion says.** SPEC (line 816): "The backfill path closes with None + None and asserts `no` rows." `e2e/golden-path.spec.ts:421–424` instead seeds a sprint with no memberships, asserts the two empty-state lines, and closes without touching any pill; no `None` click and no `no`-row assertion exist in the e2e. The DB-level `None` semantics are covered (`libraries.test.ts:798`), but the UI `None` pill → `no` mapping is exercised by no test.

**P2-2 — no `information_schema` test for the drop and the exact column lists.** SPEC (line 721): "`information_schema` test asserts both absent and both new tables present with the exact column list." Grep of `tests/db` finds `information_schema.columns` only in the F6 test (lines 936, 958) and no assertion on `day_impediment_observations` / `day_cue_observations` columns or on the absence of `day_impediment_hurt` / `day_cue_helped`. I verified the behaviour black-box (PGRST205 on the legacy tables; OpenAPI column lists match), so this is a coverage gap, not a defect.

**P2-3 — minor copy departure.** SPEC (line 796): IMPACT sub is "Your read, not the number"; `CloseFlow.tsx:295` renders "Your read, not the number · optional".

**P2-4 (harness) — `docker` is not on the evaluator shell allowlist.** The task's prescribed DB inspection (`docker exec … psql`) was refused: `'docker' is not permitted`. I did not work around it with another tool for psql; I used the app's own PostgREST/GoTrue API (allowed `curl`) for observable state, which is a legitimate black-box surface but cannot see catalog details such as trigger and policy definitions — those I verified only from the migration source and the passing DB tests. Also worth noting: variable assignment (`X=…; curl …`) is refused by the allowlist, and an `echo` containing `->` was blocked as a redirection.

## Untested or unprovable

- **Falsifiability mutations** (SPEC lines 768–774: removing the `unanswered` fill, `response_required`, widening the SELECT policy, dropping the trigger/index/guard). These require live schema mutation, which I would not perform and could not with the allowlist. Only the drop-guard case is covered by a shipped test.
- **Visual verification** against the v8 artboard: no browser tooling in this session. Layout/copy was checked from source and by the passing desktop + phone e2e only.
- **Backfill through the API**: `start_sprint` only accepts today/tomorrow (`invalid_start_date` for 2026-09-05), so I could not black-box a past-day close; the e2e F5 test and DB streak tests cover it.
- **Cue re-added on the same day it was removed** (the `distinct on … is_focus desc` case in `day_offered_items`) — not exercised.
- The two extra partial unique indexes `day_*_observations_one_highest/one_focus` (migration 77–78, 95–96) go beyond the spec; harmless and untested here.

## Recommendation

**Continue.** Every behavioural criterion in F7 that I could reach passed under reproduction, including all authorization and immutability edges. The three P2s are test-coverage and copy gaps for BACKLOG; the harness P2 is for `docs/DECISIONS.md` / the user-level `shell_guard.py` allowlist. Consider `npm run db:reset` before the next evaluation, since the stack now holds my seeded users and sprint.

---

*Main session, appended after the run:* the `git status --porcelain` recorded immediately before dispatch matched both of the evaluator's outputs (24 lines). P2-1, P2-2 and P2-3 were fixed in the same session before the F7 row was closed (the e2e backfill path now closes with None + None on a seeded cue and impediment and asserts the `no` rows; an `information_schema` test asserts the drop and the exact column lists; the IMPACT sub-line reads as the SPEC says). P2-4 went to `docs/BACKLOG.md`.
