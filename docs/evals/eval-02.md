# eval-02 — F2 Cue and Impediment libraries; Highest Impediment; Day Close selections (2026-09-05)

Saved verbatim from the evaluator subagent. The only edit: the transport HTML-escaped
`<`, `>` and `&` in the agent's output (`&lt;`, `&gt;`, `&amp;`); they are restored to
the characters the agent wrote.

Main-session `git status --porcelain` immediately before dispatch: 28 lines (19 ` M`,
9 `??`), identical to the two quoted in the report.

---

# Evaluation report — F2: Execution Cue and Impediment libraries; Highest Impediment; Day Close selections

**Most severe finding: none above P2. No P0, no P1. Every F2 acceptance criterion reproduced as PASS.**

## Step 0 — containment probes

- **0a Read probe** (`.claude/evaluator-hook-probe.txt`): BLOCKED by `evaluator_guard.py` ("Evaluator hook self-probe: BLOCKED, which is the expected result"). Read containment active.
- **0b Shell probe** (`python -c "print('evaluator shell probe')"`): BLOCKED by `C:/Users/jtakh/.claude/hooks/shell_guard.py` ("'python' is not permitted. Allowed: cat, curl, diff, echo, find, git, grep, head, jq, ls, node, npm, npx, pwd, sleep, tail, wc, which"). Shell containment active.

Guard notes for the harness (reported, not worked around): `cd` is not on the allowlist (used `npm --prefix`); `2>&1` and any `>`/`->`/`|` character in a command body are refused as redirection; bash `-c` bodies over roughly 8 KB were truncated by the shell layer ("unexpected EOF while looking for matching `''"), so probes were split into smaller scripts.

## Working-tree integrity

First command `git status --porcelain`:
```
 M app/(app)/actions.ts
 M app/(app)/sprints/[area]/page.tsx
 M app/(app)/sprints/new/page.tsx
 M app/(app)/vision/layout.tsx
 M app/globals.css
 M components/NewSprintWizard.tsx
 M components/SideNav.tsx
 M components/today/CloseCard.tsx
 M components/today/TodayView.tsx
 M docs/PROGRESS.md
 M e2e/golden-path.spec.ts
 M lib/data.ts
 M lib/database.types.ts
 M lib/errors.ts
 M tests/db/grants.test.ts
 M tests/db/helpers.ts
 M tests/db/locks.test.ts
 M tests/db/rls.test.ts
 M tests/db/start_sprint.test.ts
?? app/(app)/vision/cues/
?? app/(app)/vision/impediments/
?? components/ItemPicker.tsx
?? components/LibraryPage.tsx
?? components/OptionRow.tsx
?? components/today/HighestImpedimentCard.tsx
?? components/today/SprintItemsRow.tsx
?? supabase/migrations/0004_libraries.sql
?? tests/db/libraries.test.ts
```

Final command `git status --porcelain`: byte-identical to the above (same 19 ` M` and 9 `??` entries).

Side effects outside the tree, declared: the test scripts rewrote the gitignored, pre-existing `.env.local`; Next wrote gitignored `.next/`, `next-env.d.ts`; six screenshots were written to `%TEMP%` (`eval-*.png`); a `next dev` server I started on port 3000 is still running in the background (no `kill` on the allowlist); the local database now holds two users `eval-a@test.local` / `eval-b@test.local` with three sprints and their library data (database state, not tree state — the evaluator did not delete anything).

## Scope tested

`docs/SPEC.md` ### F2 — all ten acceptance criteria, Behavior, Non-goals, Risks. F1 touched only where F2 changes it (Today page cards, Close dialog, `start_sprint` signature). Stack: local Supabase (migrations 0001–0004 applied, confirmed from `supabase_migrations.schema_migrations`), `next dev` on :3000, Chromium via `node` + `playwright`, DB via `postgres` (superuser for assertions/synthetic rows) and `@supabase/supabase-js` (RLS-scoped users).

Project checks run first, all green: `npm run test:db` → 5 files, **94 passed**; `npm run test:unit` → **19 passed**; `npm run typecheck` ✓; `npm run lint` ✓; `npm run test:e2e` → **6 passed** (desktop + phone; golden path now drives the wizard's inline creation, the `wizard-highest` radio and both `close-step` labels).

## Evidence per acceptance criterion

**AC1 — Tables + RLS in the same migration; two-user denial per table.** PASS.
`pg_class`: `cues, impediments, sprint_cues, sprint_impediments, day_cue_helped, day_impediment_hurt` all `relrowsecurity = true`; all policies present in `0004_libraries.sql`. Grants: `authenticated` has column-level INSERT/UPDATE only on `cues`/`impediments` (`scope`, `rank`, `archived_at` not writable — confirmed `permission denied for table cues` on direct update of each), SELECT-only on the four membership/selection tables (direct insert/update/delete → `42501`). As user B against A's rows: `select … eq('user_id', A)` on all six tables → `rows=0`, by A's ids → `rows=0`; B calling `archive_item / set_item_scope / restore_item / move_item` on A's items → `item_not_found`; `add_sprint_item / remove_sprint_item / set_highest_impediment` on A's sprint → `sprint_not_found`; `close_day` on A's day → `day_not_found`; `day_offered_items(A day)` → `[]`; B update/delete of A's rows → `[]`. Anon → `permission denied`. md5 of all A rows across seven tables identical before and after the B/anon attempts (`true`). The suite's own header states the RLS-disabled falsifiability run.

**AC2 — `start_sprint` rejects cue ∉[1,3], impediment ∉[1,5], no highest, blank proof (rules 3–6).** PASS.
`p_cue_ids:[]` → `no_cues`; 4 cues → `too_many_cues`; `[]` impediments → `no_impediments`; 6 → `too_many_impediments`; highest `null` → `no_highest_impediment`; highest not in list → `no_highest_impediment`; highest with null proof → `proof_point_required`; `proof_when:'   '` → `proof_point_required`; inline `p_proof_then:'  '` → `proof_point_required`. Boundary extras: B's cue → `item_not_found`; health-scoped cue in a wealth sprint → `item_out_of_scope`; `sprints`/`sprint_cues`/`sprint_impediments` counts unchanged after every rejection. Each rule has a named failing test in `tests/db/libraries.test.ts` lines 148–177.

**AC3 — Trigger rejects clearing `proof_when`/`proof_then` on a highest in an active sprint (rule 22).** PASS.
As owner, `update impediments set proof_when=''` / `null` / `proof_then='  '` on the highest → `proof_point_required` each time; row afterwards `{"proof_when":"when 1","proof_then":"then 1"}`. Renaming the highest → `rows=1`; clearing proof on a non-member impediment → `rows=1` (allowed, as specified).

**AC4 — `archive_item` / `set_item_scope`: return failing sprints and change nothing, else set `removed_at` + archive/rescope atomically (rule 20).** PASS both branches.
Blocked: archiving the sole cue → `{"ok":false,"failing":[{"area":"wealth","reason":"no_cues","outcome":"Save 8000",…}]}`, item `archived:false`, membership `removed:false`; archiving the highest → reason `no_highest_impediment`, unchanged; narrowing the sole cue to `health` → `no_cues`, scope still `global`. Allowed: archiving a cue while a second is active → `{"ok":true,"removed_from":1}`, `archived:true`, membership `removed:true`; `set_item_scope(imp, 'health')` on a wealth sprint with impediments to spare → `removed_from:1`, scope `health`, membership `removed:true`; widening to `wealth` → `removed_from:0`, membership intact. `bogus` scope → `invalid_scope`. UI: clicking Archive on "Imp 3" rendered "Archive is blocked — fix these sprints first, then retry. Wealth · “Save 8000”: this is its highest impediment." and the item stayed listed (renders the DB result; no client re-implementation, per the Risk).

**AC5 — Permanent delete only with no membership row (rule 19).** PASS.
`cues_delete` policy `USING (auth.uid() = user_id AND NOT EXISTS (select 1 from sprint_cues m where m.cue_id = cues.id))` confirmed in `pg_policies`. Owner delete of a cue with a (removed) membership → `data:[]`, row still present (`count 1`); delete of an unused cue → returns the id, `count 0`. B delete of A's cue → `[]`. UI shows "Delete" only on "Unused" items and "Archive" on "In sprint history" items.

**AC6 — Restore sets `archived_at = NULL`, creates no membership (rule 21).** PASS.
`restore_item('cue', c0)` → `archived:false`; `sprint_cues` count before === after (`true`); its old membership still `removed:true`. UI "Show archived (1)" → Restore moved "Imp 4" back to the main list.

**AC7 — Day Close offers exactly the items whose membership overlapped the day's date, incl. later-archived (rule 23).** PASS.
Synthetic membership on a UTC sprint: removed yesterday → offered for day 1? `false`; removed today → `true` (and not offered for day 2); added tomorrow → `false` for day 1, `true` for day 2. Items removed via `remove_sprint_item` earlier the same day (`Imp 2`, `Cue 2`) were still offered and were accepted by `close_day` (`hurt`/`helped` rows written). Midnight-in-sprint-tz check (Risk): on an `America/Los_Angeles` sprint a cue with `added_at = 2026-09-06T03:00Z` (20:00 PDT on day 1) → offered for day 1 `true`; `day_offered_items` uses `at time zone s.tz` (migration lines 537–547). Suite line 493 has the table test. `close_day` rejects anything outside the offered set (`item_not_offered`, incl. B's cue and non-member impediments) and enforces `most_damaging_required` / `most_useful_required` for missing, not-in-set, or dangling picks; day left unclosed and selection counts `0` after each rejection.

**AC8 — Lists, selection lists and filters exclude archived; collapsed Archived section includes them; filters keep rank order (rule 24).** PASS.
Library page listed 9 active impediments in rank order with "Show archived (1)"; expanding showed "Imp 4 · Global / Restore". Wizard impediment options excluded archived "Imp 4" and out-of-scope "Imp 5 (Health)"; Today's "Add impediment/Add cue" pickers and the Change dialog draw from the same active library. Move-down via UI reordered `["Imp 1 renamed","Imp 2",…]` → `["Imp 2","Imp 1 renamed",…]`; `↑` is disabled at the top; `move_item` `left` → `invalid_direction`. Filtered view shows "Nothing in this scope. Filters keep the rank order of the full list." (see Untested for the filter semantics question).

**AC9 — At most one `is_highest` per sprint; changing it modifies no `sprint_days` row.** PASS.
Partial unique index `sprint_impediments_one_highest ON (sprint_id) WHERE is_highest` confirmed. md5 over `row_to_json` of all closed `sprint_days` rows: `5615defea4135372b0c283871c85e1a0` before `set_highest_impediment` → identical after (`same= true`); flag flipped (`Imp 3` highest, `Imp 1` not). `set_highest_impediment` to a non-member → `not_in_sprint`; to an impediment with blank proof → `proof_point_required`; removing the current highest → `no_highest_impediment`.

**AC10 — Close Day snapshots `highest_impediment_id`, `proof_when`, `proof_then` on the day row.** PASS.
After closing wealth day 1: `{"highest_impediment_id":"6217e74d…","proof_when":"when 1","proof_then":"then 1"}`. Then highest changed and the former highest's proof edited to `EDITED LATER` → day row still `"when 1"/"then 1"`. Second `close_day` → `day_closed`; postgres-role update of `day_impediment_hurt` / `day_cue_helped` → `day_closed` (trigger). Full UI run on the relationships sprint (Actual `1`, hurt = Wizard imp + Imp 6, "Which hurt most?" → Imp 6, step 2 helped = Wizard cue, notes) produced `actual:"1", notes:"UI close notes", closed:true`, hurt rows `[Imp 6 most_damaging:true, Wizard imp false]`, helped `[Wizard cue most_useful:true]`, snapshot = "Wizard imp" with its wizard-entered WHEN/THEN.

**Behavior block — Today page & wizard.** PASS. Screenshot at 1280 shows, in SPEC order: Highest impediment card (name, WHEN/THEN rows, "Change", "Edit proof point") → collapsed "▸ Other impediments (2) · Execution cues (1)" expanding to two columns with Remove / Add impediment / Add cue → Mantra → Close card; no HIT/MISS text (`false`); phone 390 renders the same cards. Wizard: inline "Create" saved `Wizard imp` and `Wizard cue` to the library (`rank 11` / `rank 9`, scope global), auto-selected them; "Start sprint" disabled with hint "The highest impediment needs a WHEN → THEN." until WHEN/THEN filled; `start_sprint` wrote the proof onto the impediment.

## Findings by severity

**P0** — none.
**P1** — none.

**P2**
1. While the result screen is shown, the Close dialog stays mounted underneath it: two `role="dialog" aria-modal="true"` elements exist at once (`components/today/CloseCard.tsx` lines 87–108; Playwright strict-mode error `getByRole('dialog') resolved to 2 elements`). Visually fine, but assistive tech gets two modals.
2. SPEC says "most-damaging radio when ≥1 chosen". Implementation (`CloseCard.tsx` line 274 `hurt.length > 1`) auto-assigns the single selection and only shows the radio at ≥2. Functionally equivalent (DB still receives `most_damaging`), noted as a wording deviation.
3. Passing duplicate ids (`p_cue_ids:[c0,c0]`, `p_hurt:[x,x]`) is silently de-duplicated rather than rejected; the resulting sprint/day is valid. Observation only.

## Untested or unprovable

- Scope filter semantics: "Wealth" chip lists only `scope = wealth` items, not `global + wealth`. SPEC does not define the filter, so not graded.
- The e2e suite's "Which hurt most?" radio path is covered only by my manual Playwright run, not by `golden-path.spec.ts` (which selects a single impediment).
- Concurrency (two simultaneous `add_sprint_item` calls at the cap) not exercised; source shows `for update` on the sprint row.
- Rank gaps after delete (e.g. 1,2,3,4,6,7…) are hidden by the UI's positional numbering; not a SPEC criterion.

## Recommendation

**Continue.** F2 meets every acceptance criterion in `docs/SPEC.md` with reproduced evidence; RLS and function ownership checks hold under a second user and anon; the two P2s are backlog items. Working tree unchanged; evaluation valid provided the main session's pre-dispatch `git status --porcelain` matches the output quoted above.

---

**Amendment from the evaluator (same run, sent after the report):** the background
`next dev` server it started exited on its own (exit code 127 after serving the last
request); `curl http://localhost:3000/login` → connection refused. Port 3000 free;
nothing left running. All other statements stand: `.env.local` (gitignored,
pre-existing) rewritten by the test scripts, screenshots only in `%TEMP%`, and the local
database held the `eval-a@test.local` / `eval-b@test.local` data. The final
`git status --porcelain` was taken after the server's last request and remains identical
to the first; the recommendation (**Continue**, no P0/P1) is unchanged.

Main-session note: the two eval users were deleted from the local database afterwards.
