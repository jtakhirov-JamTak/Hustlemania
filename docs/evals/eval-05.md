# Evaluation report — F9 Vision v2 (one vision, three annual steps, obstacle link, dated reviews)

**Most severe finding: P2.** No P0, no P1. Every acceptance criterion I could exercise passed; the two P2s are a client/server date disagreement on the step-1 deadline and a misleading error message on the Vision tab.

## Step 0 — containment probes

- **0a Read probe** (`.claude/evaluator-hook-probe.txt`): **BLOCKED** — `evaluator_guard.py` reported "Evaluator hook self-probe: BLOCKED, which is the expected result." Read isolation active.
- **0b Shell probe** (`python -c "print('evaluator shell probe')"`): **BLOCKED** — `shell_guard.py`: "Evaluator shell allowlist: 'python' is not permitted." Shell containment active.

## Working-tree integrity

First command and last command, both `git status --porcelain`, identical output:

```
 M app/(app)/actions/vision.ts
 M app/(app)/sprints/[area]/page.tsx
 M app/(app)/sprints/layout.tsx
 M app/(app)/sprints/new/page.tsx
 M app/(app)/sprints/page.tsx
D  app/(app)/vision/[area]/page.tsx
 M app/(app)/vision/layout.tsx
D  app/(app)/vision/page.tsx
 M app/globals.css
 M components/NewSprintWizard.tsx
D  components/VisionForm.tsx
 M docs/BACKLOG.md
 M docs/FIX_LOG.md
 M e2e/golden-path.spec.ts
 M lib/data.ts
 M lib/database.types.ts
 M lib/dates.ts
 M lib/errors.ts
 M tests/db/grants.test.ts
 M tests/db/helpers.ts
 M tests/db/libraries.test.ts
 M tests/db/locks.test.ts
 M tests/db/rls.test.ts
 M tests/db/start_sprint.test.ts
 M tests/db/targets.test.ts
 M tests/db/tasks.test.ts
 M tests/support/sprints.ts
?? app/(app)/vision/(overview)/
?? components/TwoTap.tsx
?? components/VisionOverview.tsx
?? components/VisionSetup.tsx
?? lib/twoTap.ts
?? supabase/migrations/0011_vision_v2.sql
?? tests/db/vision.test.ts
?? tests/unit/twoTap.test.ts
```

Files written outside `git status` visibility, disclosed: `pretest:db` / `pretest:e2e` rewrote `.env.local` (gitignored); Playwright wrote `test-results/*.png` (gitignored); my own captures and a Playwright storage-state file went to the session scratchpad only. Local DB: I created three throwaway users (`evalf9-*@test.local`) and deleted all three at the end; leftover rows for each = 0. The pre-existing `chrome-1788836848250@test.local` user and its rows were not touched.

## Scope tested

SPEC F9 only (`docs/SPEC.md` lines 1038–1242). Method: test suites, then black-box UI via Playwright (desktop 1440 and phone 390) and DB via the `postgres` driver / supabase-js as authenticated users, boundary probes, then source inspection of the migration, actions, layout, loading, TwoTap and CSS.

## Evidence per acceptance criterion

| Criterion | Result | Evidence |
|---|---|---|
| Migration 0011: columns, `area` dropped, partial unique index, deadline backfill / not null, proof nullable, collapse keeps newest per user, sprints' `vision_id` untouched, unique index rejects 2nd active | PASS | Live schema query: `visions` has `deadline date NOT NULL`, `proof/meaning/baseline` nullable, `obstacle_id`, no `area`; index `visions_one_active_per_user ... WHERE archived_at IS NULL`. `npm run test:db` → 224 passed; `tests/db/vision.test.ts` seeds 2+3 active per-Area visions with sprints, runs the `collapse:begin/end` block, asserts newest kept, 3 archived, sprints unchanged, plus a self-falsifying flipped-order check. |
| `vision_reviews` RLS, SELECT-only, append-only | PASS | Migration: RLS enabled, `vision_reviews_select` policy, `grant select` only. Live as user B: `select` → `[]` while A has a row; `insert/update/delete` → `permission denied for table vision_reviews`. Test file covers RLS-disabled leak check and count-only-grows across three calls. |
| Grants on `visions` revoked; grants test pins sets | PASS | `pg_policies` for `visions`: only `visions_select`. Live as user B: direct insert/update/delete on `visions` → `permission denied for table visions`. `tests/db/grants.test.ts` lists no `visions` INSERT/UPDATE columns and pins the five new functions. |
| `save_vision` rejections, trim, blank optionals null, edit keeps id/created_at | PASS | DB tests cover all three rejections incl. null and UTC-today. UI Edit: DB before/after `same id: true same created_at: true`, body and deadline updated. |
| `set_vision_obstacle` exactly-one, ownership, global-only, atomic create | PASS | Live as B: `null,null` and `id+name` → `obstacle_pick_or_name`; A's impediment id → `item_not_found`; new name creates `scope='global'` and links it. DB test covers Area-scoped → `obstacle_not_global`, archived → `item_archived`, whitespace name changes nothing. |
| `set_vision_rule` all three parts, F6 highest trigger shared-row | PASS | Live: `p_then:'   '` → `rule_incomplete`; ok call writes trimmed `w/t/r`. DB test writes rule when obstacle is an active sprint's highest, then proves the trigger still rejects a partial direct update. |
| `replace_vision` archives, sprint keeps ref, obstacle untouched, `start_sprint` rejects until re-saved | PASS | UI Replace second tap: DB `archived: true, same_obstacle: true`, `sprints still on old vision: 3`, obstacle `archived_at: null, scope: global`; second call → `no_active_vision` (live). DB test covers `start_sprint` → `no_active_vision` then success after `save_vision`. |
| `review_vision` inserts, rejects unknown verdict / no vision | PASS | Live B: no vision → `no_active_vision`; DB test `maybe` → `invalid_verdict`; UI Still true + Needs changes each produced one row (`[{needs_changes, "Lost a client this month."}]`, e2e asserts `still_true` row). |
| `start_sprint` area-less lookup; step-1-only vision starts a sprint | PASS | Migration lines 432–437; DB test "a user with only a step-1 vision (no obstacle) can start a sprint". |
| `archive_item` / `set_item_scope(≠global)` raise `vision_obstacle`; allowed after Replace | PASS | Live user C on the real obstacle: both → `vision_obstacle`; DB test covers post-Replace. Bonus: direct `DELETE` of the obstacle row is refused by FK `visions_obstacle_id_fkey` (no action). |
| Reads: overview one vision, `loadVision` with obstacle/review/counts/previous, `loadVisionSprints` statuses and Met/Under | PASS | Seeded 3 sprints by SQL: card showed `Starts tomorrow`, `Met · 15.40 of 14`, `Under · 7 of 14` (money in minor units — my seed was 14.00 USD), header count 3; rows are `<a href="/sprints/{area}">`, tap landed on `/sprints/health`; previous fold: `Sep 2026 – Sep 2026 · replaced Sep 7, 2026 · 3 sprints ran behind it`. |
| `/vision/[area]` removed; `/vision/health` 404s; grep clean | PASS | Authenticated `page.goto('/vision/health')` → status 404. Grep `/vision/(health|wealth|relationships)` over `app/`, `components/`, `e2e/` → no matches. |
| Sidebar rows (Vision `n of 3`, accent until 3, sub line; Execution cues; Impediments; no Data & export) | PASS | Observed `0 of 3 / Not written yet`, `1 of 3 / Not reviewed yet` (meta `rgb(91,91,214)`), `3 of 3 / Reviewed Sep 7, 2026` (meta muted). Layout source has three rows only. |
| Setup step 1 fields, min tomorrow, 30px title, 4 rows/16px, 720px card, footer rules | PASS (see P2-1) | Title 30px, textarea rows 4 / 16px, `min=2026-09-08`, card renders 720px inside a 960px wrapper; first step 1 has no Back/Cancel; Edit step 1 has `Cancel -> /vision`; hints "The vision unlocks every sprint." / "The deadline must be in the future." / "Name what would prove it happened." with `aria-disabled` primary. |
| Step 2 radio rows, global only, `has WHEN → THEN` tag, pick/name interplay | PASS | Listed `Doomscrolling (has WHEN → THEN)`, `Late nights`; the `wealth`-scoped impediment absent; typing then picking cleared the name (`""`), picking then typing unchecked the radio; primary disabled again when name cleared. |
| Step 3 pre-filled from impediment, all three required | PASS | Prefill `I open the feed / I close it and stand up / Laptop open within 5 minutes`; blanking THEN → Save `aria-disabled=true` with the hint; Save wrote all three to `impediments`. |
| Failed save shows error bar with Retry and keeps inputs | PASS (see P2-2) | Step 1 (server-rejected deadline): alert + Retry, vision text kept, 0 rows written. Step 3 (vision archived server-side before Save): alert + Retry, all three inputs kept, impediment unchanged. |
| Overview: kicker, meta incl. `Deadline passed` in under colour, h1 26px/600 max 34ch, Edit / Review vision / Replace TwoTap, `n of 3 steps` green at 3, three cards, Library card, Sprints card, previous fold | PASS | h1 `26px/600 maxw=632.944px` (=34ch); `3 of 3 steps` `rgb(47,125,82)`; `Deadline passed Jan 1, 2026` `rgb(192,57,43)`; Replace armed text "Tap again to archive it and start over" in `rgb(192,57,43)`, DB unchanged after one tap, e2e proves blur disarms; empty obstacle card "What most often pulls you off course?" → `/vision?step=2`; rule card "Name the obstacle first."; `?step=3` without obstacle redirected to step 2. |
| Review card copy, 1.5px accent, note optional, Still true / Needs changes → step 1 | PASS | Card text `Proof you named: Four retainers signed. 3 sprints have run behind it. 495 days to the deadline.` (arithmetic correct); with passed deadline: `The deadline passed 249 days ago.`; CSS `.v-review { border: 1.5px solid var(--accent) }`; Needs changes landed on `/vision?step=1` with Cancel. |
| Loading skeleton | PASS (source only) | `app/(app)/vision/(overview)/loading.tsx` renders kicker, two title lines, two buttons, three cards. Not observable black-box. |
| Copy never uses HIT/MISS | PASS | Grep over vision/sprints/components: none; body text regex on the overview: `false`; e2e asserts on the journal. |
| Sprints tab: `Locked` + "Vision not written yet", empty card copy and link, then `Ready` | PASS | Sidebar `Locked ×3` with sub line; card text matches SPEC verbatim; link `href=/vision`; after step 1: `Ready ×3`. |
| Wizard: vision block, gate only on active sprint, blocked note without vision, alignment copy, no inline style, `[data-cols]` gone, phone no overflow | PASS | `wizard-vision` shows the text; no vision → "A sprint has to advance the vision, and none is written yet…" with a `/vision` link; alignment row `This outcome meaningfully advances my vision.`; `main [style]` count 0 on steps 1 and 4; grep `data-cols` → none; overflow 0 at 1440 and 390 on all four steps and both Vision views. |
| TwoTap component + unit test | PASS | `npm run test:unit` → 64 passed; `tests/unit/twoTap.test.ts` covers arm / fire / blur-disarm. |
| e2e desktop + phone | PASS | `npm run test:e2e` → 8 passed (1.4 m); spec walks every listed step incl. `Reviewed {today}` stamp and DB assertions; night-mode round trip present. |
| Live mutations turn named tests red | NOT PROVEN by me | Read-only role; I did not mutate. The test file does contain two self-falsifying checks (collapse order flipped; RLS disabled) that ran green. |
| Visual match, Dusk and Night, desktop + phone | PASS | Compared my captures against `docs/mockups/f9-vision/desktop-dusk-overview-review.png`, `desktop-dusk-step2.png`, `desktop-night-step3.png`, `phone-dusk-overview-review.png`: same structure, hierarchy, copy, palettes. |
| `npm run verify` green | NOT RUN | Ran the four test scripts individually (all green); did not run `typecheck`/`lint`/`test:hooks` (hooks need `python`, which my shell cannot run). |

## Findings by severity

### P2

**P2-1 — Step-1 deadline `min` is local tomorrow, the server compares against UTC today.**
`components/VisionSetup.tsx:36` computes `minDeadline = addDays(localDateIn(tz, new Date()), 1)`; `save_vision` rejects `p_deadline <= current_date` (migration line 117, DB in UTC). Reproduced at 20:20 PDT on 2026-09-07 (DB `current_date` = 2026-09-08): the date input accepted `2026-09-08`, the primary was enabled (`aria-disabled=false`), submit went to the server and came back `The deadline must be in the future.` with Retry; inputs preserved, nothing written. Graceful, but for a US user the earliest date the UI offers is rejected for several hours every evening. SPEC says "min tomorrow" and "`p_deadline <= current_date`" without saying whose day; the two disagree.

**P2-2 — `no_active_vision` on the Vision tab reads as a sprint message.**
`lib/errors.ts:7` maps `no_active_vision` to "Write the vision before starting a sprint." Reproduced on setup step 3 after the vision was archived server-side: the error bar showed that sentence on a screen with no sprint involved.

### Observations (not graded against F9; recorded for the owner)

- The library's free-text UPDATE grant on `impediments.proof_*` lets the user blank one part of the vision's guiding rule outside `set_vision_rule` (live user C: `update({proof_then: null})` succeeded → `proof_when: w, proof_then: null`). F6's trigger only guards an active sprint's highest. Not a SPEC F9 requirement.
- Two impediments with the same name can be created via `set_vision_obstacle` (`Dup`, `Dup`), the second becoming the obstacle. No uniqueness rule in SPEC.
- With sprints whose `end_date` has passed but `status='active'` (no F10 yet), the wizard shows every area as `· active` / disabled ("Every area already has a sprint running.") while the Sprints sidebar reads `Ended`. Status transitions are F10's.
- `tests/support/sprints.ts` seeds a vision by direct `admin.from("visions").insert`, not `save_vision`; the SPEC's risk note (3) expected the helper to move to `save_vision`. Works because service_role bypasses the revoked grants.
- `save_vision` accepted a 20,000-character body; no length limit is specified.

## Untested or unprovable

- Live mutations (read-only evaluator).
- `npm run verify` as a whole (`test:hooks` needs `python`, blocked by my allowlist; `typecheck`/`lint` not run).
- Loading skeleton behaviour (source read only; not observable at localhost latency).
- A user who was on the hosted project before 0011 (no such data exists; the collapse is only exercised by the seeded test).

## Recommendation

**Continue.** F9's required behaviour is present and verified end-to-end; the migration, RLS and write-path guards hold under cross-user and direct-write probes. The two P2s belong in `docs/BACKLOG.md`; neither blocks the feature.

Relevant paths: `C:\Users\jtakh\dev\Hustlemania\supabase\migrations\0011_vision_v2.sql`, `C:\Users\jtakh\dev\Hustlemania\components\VisionSetup.tsx` (line 36), `C:\Users\jtakh\dev\Hustlemania\lib\errors.ts` (line 7), `C:\Users\jtakh\dev\Hustlemania\tests\db\vision.test.ts`, `C:\Users\jtakh\dev\Hustlemania\e2e\golden-path.spec.ts`.
