# PROGRESS

Shipped milestones and the metric log.

**This is not a handoff file.** In-flight session state has one owner:
`session-context.md`, written by `/save-context` and read by `/resume-context`. Do not
duplicate next-actions or working state here.

## Metric log

The governing metric is time from request to a correct, green, usable feature. One row
per SPEC feature. Times are UTC (`date -u +%Y-%m-%dT%H:%MZ`, or in PowerShell
`(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mmZ")`) — read the clock, never
estimate it.

**A row is opened when the work starts and closed when it is verified green. It is
never written in one go after the fact**, because a row reconstructed at the end
measures nothing but memory.

| Feature | started_at | green_at | cycle_time | human_stops | rework | defects_after_green |
|---|---|---|---|---|---|---|
| F1 — Walking skeleton: sign in → Vision → start Sprint → Today → Close Day | 2026-09-05T04:15Z | 2026-09-05T17:27Z | 13h12m | 2 (Docker Desktop not running before `supabase start`; commit-scope approval for the `mockup/today` branch and the fast-forward to main) | 0 | 0 |
| F2 — Cue and Impediment libraries; Highest Impediment; Day Close selections | 2026-09-05T18:05Z | 2026-09-05T19:16Z | 1h11m | 0 | 0 | 0 |
| F3 — Custom daily targets; reconciliation; target locking; intention pre-planning | 2026-09-05T19:25Z | 2026-09-05T19:55Z | 0h30m | 0 | 0 | 0 |
| F4 — Tasks: per-day optional task list, locks with the day, no roll-over | 2026-09-05T20:08Z | 2026-09-05T20:46Z | 0h38m | 0 | 0 | 0 |
| F5 — Day boundaries, streaks, missed days, backfill | 2026-09-05T20:56Z | 2026-09-05T21:33Z | 0h37m | 2 (both to remove an unapplied `0007` draft so it could be rewritten — the write and shell guards block any change to a migration file once it exists) | 1 (first 0007 draft rebuilt the immutability trigger from its 0001 body and lost 0004's snapshot columns; caught by the existing DB suite before commit) | 0 |
| Audit remediation — buckets A + B of `docs/audits/full-audit-2026-09-05.md` (not a SPEC feature; user-approved fix pass; #43 wizard split and bucket D to BACKLOG) | 2026-09-06T00:51Z | 2026-09-06T02:14Z (phases 1–3 green at 01:14Z, user stopped there and resumed; 4–6 green at 02:14Z: verify hooks 115 / unit 54 / DB 178 / e2e 8, build green, phone and desktop captures inspected) | 1h23m | 1 (user: "stop after phase 3 completes") | 0 | 0 |
| Enabling pass — shell inline styles to classes, Tailwind dropped, no visible change (not a SPEC feature; direct build approved 2026-09-06 in `docs/RECONCILIATION-2026-09-06.md`; scope narrowed to the shell on the user's call) | 2026-09-07T05:11Z | 2026-09-07T05:39Z (typecheck, lint, build without PostCSS, verify: hooks / unit / DB / golden path 8 green on desktop + phone; 22 full-page captures pixel-identical to the pre-change baseline, check proven to fail on a 1px mutation; the temp capture spec's phone dialog shot is scroll-position fragile inside the full suite and is deleted) | 0h28m | 1 (scope narrowed to the shell on the user's call after the 372-style inventory) | 0 | 0 |
| F6 — Libraries v2: cue trigger, RECOVERED WHEN, relabelled editors | 2026-09-07T17:17Z | 2026-09-07T18:33Z (0009 applied by `db reset`; DB 191 incl. the F6 block and the pin test, six live mutations each red then restored green; verify: hooks 115 / unit 54 / DB 191 / e2e 8 on desktop + phone; Chrome desktop check of Cues, Impediments (view, Edit, rule-22 rejection) and the Today card against the v8 Libraries artboard; phone rests on the Playwright phone project) | 1h16m | 1 (user: after the spec review and the gate, build deferred to the next session) | 0 | 0 |
| F7 — Day observations: what showed up, what was used, did the response run | 2026-09-07T18:48Z | 2026-09-07T20:18Z (0010 applied by `db reset` twice, the second for the blank start; DB 204 incl. the three F7 blocks, the guard test and the pin markers; eight live mutations each red then restored green; verify: hooks 115 / unit 54 / DB 204 / e2e 8 on desktop + phone; Chrome desktop check of the Today cue rows and the close dialog's two steps against the v8 artboard, the Chrome close wrote the expected five rows; eval-04: no P0/P1, three P2 gaps fixed before green, the harness P2 to BACKLOG; phone rests on the Playwright phone project) | 1h30m | 0 | 1 (eval-04 found the backfill e2e and the information_schema test short of their SPEC lines, plus one copy departure; fixed and re-run before green) | 0 |
| F8 — Journal restyle: timeline, rail, Dusk, night mode | 2026-09-07T23:11Z | 2026-09-08T00:05Z (no migration; unit 60 incl. the six daySummary tests, DB 204 unchanged, e2e 8 on desktop + phone rewritten around the journal with the pins moved (64/16/30, result 78 on backfill only) and the night-mode cookie round trip; verify green: hooks 115 / unit 60 / DB 204 / e2e 8; four live mutations each red then restored (recovery word dropped, quietItems offering the highest, the highest-first tail, the theme action ignoring the mode); Chrome desktop check of Day 9 in Dusk and Night against the v8 artboard: folds, closed and missed rows, the inline close through Confirm close, the Closed card with Set up tomorrow, the toggle both ways; phone rests on the Playwright phone project) | 0h54m | 0 | 1 (the phone capture showed the brand overlapping the Sprints tab once the toggle was in; fixed before green) | 0 |
| F9 — Vision v2: one vision, three annual steps, obstacle link, dated reviews | 2026-09-08T00:16Z | 2026-09-08T03:38Z (0011 applied by `db reset`; DB 224 incl. the 20-test F9 file: the collapse run from the migration's own marked block with a flipped-order companion, RLS-disabled leak check on `vision_reviews`, the five functions, the shared-row trigger case and the obstacle guard; four live function mutations each red then restored green; verify: hooks 60/21/23 / unit 64 / DB 224 / e2e 8 on desktop + phone; Chrome desktop check of the overview with the review card, step 2 and Night step 3 against the f9-vision captures, pick-clears-name exercised, wizard step 1 with zero inline styles; eval-05: no P0/P1, two P2 fixed before green, observations to BACKLOG; phone rests on the Playwright phone project incl. overflow checks on every Vision view and wizard step) | 3h22m | 1 (user: fresh session for the build after the gate) | 1 (the first e2e run found the step-2 create path dropping `p_impediment_id` — FIX_LOG 2026-09-07; eval-05's two P2s — the deadline `min` vs UTC and the `no_active_vision` copy — fixed and re-run before green) | 0 |
| F10 — Sprint completion, End Early, postmortem, kit, next-sprint gate | 2026-09-08T04:17Z | 2026-09-08T07:44Z (0012–0015 applied by `db reset`; DB 270 incl. `completion.test.ts` 34 — the three closure windows, the transition trigger, the cancellation predicate, rule 26, ten `finish_review` rejections with atomicity, RLS on both new tables with the disable/enable check, and the F5 streak defect closed — and `insights.test.ts` 12 on a hand-computed 14-day fixture carrying a zero-target day and a cancelled day; unit 84 incl. `insightCards.test.ts` 16 and the celebration thresholds; e2e 10 on desktop + phone, the F10 walk running finish → gate → postmortem → finish review → kit pre-fill with DB assertions and zero overflow at 390px; ten live mutations each turned a named test red and were restored from disk; Chrome desktop check of the Finish card, the gate, the postmortem and the rail in Dusk and Night; eval-06: no P0/P1, four of the eight P2s fixed before green, three were wrong criteria and the SPEC is amended, one to BACKLOG) | 3h27m | 1 (mid-build the user asked where F9 and F10 stood; work resumed on their go-ahead) | 9 (all found and fixed before green: the implicit PUBLIC execute grant on ten functions, caught by the grants pin — FIX_LOG · the `Reviewed` stamp a day ahead of the sidebar's, caught in the Chrome check — FIX_LOG · the Sprints sidebar reading `Ready` for an unreviewed area, caught in the Chrome check · the `.across` styles never added, so the stat row stacked · and five from eval-06: the missing Across card, `partially` left out of `answered`, `sprint_best_streak` disagreeing with `sprint_streak_at`, the lesson card not naming its Area, and the celebration's missing 80% state) | 0 |

### Who opens the row

- **`/interview` opens it**, as its first workflow action, for any feature that goes
  through it — so the clock includes the feature's own planning, not just its code.
- **BUILD opens it** for a direct build that skipped `/interview` (the one-sentence
  reversible change), immediately before implementation begins.
- **New app:** `/interview` opens **F1** when the new-app interview begins. F1's
  `cycle_time` therefore covers request → interview → design → approval →
  fresh-session handoff → implementation → verification → green, which is the number
  worth knowing. F2 onward start when work on that feature starts.

**At most one row may be open at a time** (`green_at` = `—`). If a second feature is
about to start while a row is still open, the previous one never went green: resolve
that row first. If planning ends with nothing to build, delete the row it opened.

### Who closes the row

**BUILD closes it, always.** `green_at` is written only after all required and
available verification passes — acceptance checks, visual verification when UI changed,
the evaluator pass when a trigger applied. If a required check fails or is skipped, the
row stays open and records why. Tooling unavailability blocks green only when that
verification is required by the acceptance criteria or the release boundary. A
`green_at` ahead of its evidence is the one failure this log cannot survive.

Then record `cycle_time` = `green_at` − `started_at` as elapsed time (`1h40m`, `2d3h`).

### Columns

- **cycle_time** — the metric. Real elapsed time from the moment work began to
  verified green.
- **human_stops** — how many times the build loop stopped for the human. An ordinary
  feature should be 0; the BUILD section lists the only legitimate reasons. Anything
  above 0 carries its reason in the row.
- **rework** — how many times work already believed finished had to be reopened
  *before* green, evaluator P1 fixes included. The evaluator pass runs inside the
  feature's own loop, so a finding it raises there is rework, not an escaped defect.
- **defects_after_green** — the escaped-defect counter: defects found in use after
  `green_at` was written. A later defect does **not** reopen the row — `cycle_time`
  already happened and cannot be un-measured. It increments this column and gets a
  dated `docs/FIX_LOG.md` entry with its regression test.

A row that never gets filled in is itself the signal: the loop is not being followed,
and the metric cannot be read.

## Shipped milestones

(Newest first. One line per shipped milestone, dated.)

- 2026-09-05 — **F5 streaks green** (no evaluator trigger; nine DB mutations each turned
  their tests red, six more after the review rewrite; visual check in Chrome;
  `/full-review` 0 CRITICAL / 0 HIGH / 8 MEDIUM all fixed; `npm run verify` green:
  unit 45, DB 169, Playwright 8). Migration `0007_streaks.sql` — `closed_on_time`
  written by `close_day`, which returns the streak; `sprint_streaks()` for the sidebar
  and Today in one read; backfill of missed days that counts but never repairs — and
  the streak under Day N / 14, in the sidebar and on the result screen, with the whole
  missed plan-grid cell as the Backfill button.
- 2026-09-05 — **F4 tasks green** (eval-03: 5/5 criteria PASS, 0 P0/P1, 3 P2 → BACKLOG;
  eight DB mutations each turned their tests red; visual check in Chrome; `npm run verify`
  green: unit 43, DB 147, Playwright 6). Migration `0006_tasks.sql` — `tasks` table with
  RLS, column grants, archive-not-delete, `tasks_lock_with_day` trigger — and the Tasks
  card on Today with autosave rows, blank row offered, locked with the closed day.
- 2026-09-05 — **F3 custom targets green** (no evaluator trigger; six DB mutations and one UI
  mutation each turned their test red; visual check in Chrome; `npm run verify` green:
  unit 43, DB 120, Playwright 6). Migration `0005_targets.sql`, `save_targets`, the
  rule-10 row trigger, wizard custom mode with per-day intentions, Today plan card.
- 2026-09-05 — **F2 libraries green** (eval-02: 10/10 criteria PASS, 0 P0/P1, 3 P2 →
  BACKLOG). Cue and Impediment libraries with rank/scope/archive/restore, sprint
  membership (date-ranged, 1–3 / 1–5), Highest Impediment with WHEN → THEN, two-step
  Day Close with hurt/helped selections; migration 0004 with RLS, seven live mutations
  each turning a test red; verify = typecheck, lint, 19 unit, 94 DB, 6 e2e.
- 2026-09-05 — **F1 walking skeleton green** (eval-01: 14/14 criteria PASS, 0 P0/P1,
  6 P2 → BACKLOG). Magic-link sign-in, Vision, sprint wizard, Today, Close Day, on
  three migrations with RLS + deny-by-default grants; verify = typecheck, lint, 19
  unit, 51 DB, 6 e2e.
