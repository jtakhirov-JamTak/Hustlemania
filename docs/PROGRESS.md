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
