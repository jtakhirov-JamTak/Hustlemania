# Template handoff — findings for `~/dev/agentic-template-v4` and `~/.claude/new-app.ps1`

Found during the Hustlemania full audit on 2026-09-05. Apply in `~/dev/agentic-template-v4`
and in `~/.claude`, not here — the project's governance files are closed to the agent by
design.

> **Reviewed 2026-09-08.** The original header claimed *"every item below was verified in
> this clone against the template repo (clean, level with origin)."* That was not true of
> §3 bullets 2–3, and the claim itself is what made them credible — see
> `SELF-ANCHORED-CHECK` in `~/.claude/REVIEWER_CONVENTIONS.md` §6. What was actually
> checked, and against what, is now stated per item. Verified against
> `agentic-template-v4` @ `fcc7f5c` (log ends 2026-08-26, nothing landed since),
> `~/.claude` @ `6b48dba`, this repo @ `d293100`.

> ## STATUS — implemented. Historical record, not an open backlog.
>
> **Stamped 2026-09-08, after the fixes landed.** §1 and §3 are done:
> `agentic-template-v4` `8c681e0` (docs split, path citations, upstream pointers) and
> `~/.claude` `0519f0b` (Step 0 assertion, `CLAUDE.md` reworded, Hustlemania added to
> `PROJECTS.md`). Verified end to end: the Step 0 check ran red against the remote before
> the push (23 entry markers on `docs/FIX_LOG.md`) and green after it (0 markers).
>
> **§2 is only half done, and the first draft of this header wrongly said otherwise.** Its
> sub-item — the same duplication in `~/.claude/CLAUDE.md` — is resolved. Its *primary*
> item is not: the template's `CLAUDE.md:75` still carries the parenthetical
> "(`pure-eq`)". `8c681e0` touched `CLAUDE.md:145` only. Severity is LOW — see the
> correction in §2: the gate itself is already self-referential and behaves correctly in a
> generated app. What is left is a stale-fact duplication, not a mis-scoped gate.
>
> **Still open:** §2's production gate (above), the dangling canary in the "Scaffold ready"
> block (§1, last paragraph), and §4, which was never verified.
>
> Citations below were correct when written; several have since moved *because these fixes
> landed*, and each stale one is marked inline. That decay is what a `file:line` review doc
> does the moment someone acts on it — pin a commit, or stamp the doc.

## 1. `gh repo create --template` copies the template's own project history into every new app

**What happens.** `new-app.ps1` Step 1 runs `gh repo create $Name --template
jtakhirov-JamTak/agentic-template-v4 --clone`. GitHub's template mechanism copies the
whole tree, and the template repo commits its *own* working documents:

| File in template | What it holds | Lands in the new app as |
|---|---|---|
| `docs/BACKLOG.md` (**191 lines**) | Sections of template-development backlog dated **2026-08-24..26**, naming `pure-eq` (×3), `the-leaf-v2` (×2), `you-inc` (×3), `PurePath` (×2) | `docs/BACKLOG.md` lines 133–319 in Hustlemania, byte-identical (verified with `diff`), removed by hand today |
| `docs/FIX_LOG.md` (13 entries) | Guard/hook/evaluator defects fixed while building the template | 13 entries in Hustlemania's FIX_LOG; two cite `scripts/hooks/test_shell_guard.py`, which does not exist in the generated app (the shell guard's test lives in `~/.claude/hooks/`) |
| `docs/DECISIONS.md` (4 entries) | Template-design decisions | Entries from line 232 of Hustlemania's DECISIONS |
| `docs/evals/` | One tracked `README.md` (a one-line format note; **not** empty as originally stated) | fine — carries no history |
| `docs/PROGRESS.md` | Checked 2026-09-08: a clean scaffold, empty metric table, zero app names | fine — nothing to reset |

The result: a fresh app's backlog opens with 187 lines about other apps, and any
grep for a project name across the new repo hits the template's history. No step in
`new-app.ps1` resets them.

**Proposed change. Reviewed 2026-09-08: take A′ below, not A or B.**

**A′ (recommended).** The template's own history is guard/hook work, and that work lives in
`~/.claude` — which already keeps `FIX_LOG.md` and `DECISIONS.md` at its repo root, per the
recording rule in `~/.claude/CLAUDE.md`. So move the history *there*, and leave the
template's three docs as header-only scaffolds. There is then no `docs/template/` directory
in the clone, **nothing for `new-app.ps1` to delete, and no Step 5 at all** — which matters,
because of the preflight constraint recorded below.

The assertion still belongs in the script, but as a **Step 0 preflight** check — that the
template's three docs are header-only *before* `gh repo create` runs. `~/.claude/DECISIONS.md`
(2026-08-25 P0 pass) records why: *"`new-app.ps1` preflights the interpreter and template
before creating the repo. A failure after `gh repo create` leaves a real GitHub repo
behind."* A Step 5 that asserts-and-fails after the clone re-introduces exactly the failure
mode that decision exists to prevent.

*Original options, kept for the record:*

A. In the template repo, move the template's own history out of the files the app
   inherits:
   - `docs/BACKLOG.md`, `docs/FIX_LOG.md`, `docs/DECISIONS.md` become empty scaffolds
     (header + the one-line format note only).
   - The template's history moves to `docs/template/BACKLOG.md`, `FIX_LOG.md`,
     `DECISIONS.md` (or to the `~/.claude` repo, which already keeps `FIX_LOG.md` and
     `DECISIONS.md` at its root and is where the guard/hook work actually lives).
   - `new-app.ps1` gains a Step 5 that deletes `docs/template/` from the clone and
     asserts `git ls-files docs/template` is empty.

B. Keep the template repo as is and have `new-app.ps1` Step 5 truncate the three files
   to their headers after the clone, then `git add` them (staged, not committed, matching
   the script's existing settings.json convention). Weaker: the history still ships
   in the first commit's parent and anyone cloning the template directly gets it.

**The canary. Corrected 2026-09-08.** The original proposal — add "`grep -c pure-eq
docs/*.md` must print 0" to the "Scaffold ready" block — is a check that cannot fail: it
hard-codes one app name and goes green the moment the template's backlog names a different
app, or the next app is called something else. That is `VACUOUS-PASS`
(`~/.claude/REVIEWER_CONVENTIONS.md` §6).

Assert the **shape** instead: that the three inherited docs still match the header-only
scaffold (line count, or a hash of each). That fails on *any* leaked content, whatever it
names. Prove it non-vacuous by mutation before trusting it — plant a line in a scaffold
doc, confirm the check goes red, revert, confirm green.

Related, same pass: `new-app.ps1` already prints *"That is what the canary below is
for"* and then prints **no canary** — the `.env`-read check below it is a live-session
trust test, not a file canary. That dangling promise ships in the script's output today.
**Still open as of 2026-09-08**, and the only item in §1 that is. The Step 0 assertion
shipped in `0519f0b` but sits upstream of this block rather than in it. The line moved
from `:207` to **`:242`** in that same commit — cited here as a caution, not a pin.

## 2. `CLAUDE.md` line 75 names `pure-eq` as the app with real users

```
**Production gate — the one exception to zero build-time approvals.** For any app
with real users (`pure-eq`), before executing any operation that can modify
```

This is the template's *project* CLAUDE.md, so every generated app carries a
production gate that names a different app. In Hustlemania it reads as if `pure-eq`
were part of this project. Two fixes, both needed:

- ~~In the template's `CLAUDE.md`, make the gate self-referential~~ — **corrected
  2026-09-08: the gate already is.** It reads "For any app with real users … show it and
  wait", which keys on whether *this* app has users; in a generated app with none it
  correctly does not fire. `(`pure-eq`)` is only a parenthetical noting which app
  currently qualifies, so this was never a mis-scoped gate and the section heading
  overstates it. The real defect is narrower: a fact that changes, duplicated into a file
  that ships to every app. `~/.claude/PROJECTS.md` owns it, and the global
  `~/.claude/CLAUDE.md` already says "Read `~/.claude/PROJECTS.md` before judging risk".
  **The fix is deleting the parenthetical** — the sentence is complete and correct
  without it. Severity LOW; the case for doing it is consistency with the identical
  duplication already fixed at `~/.claude/CLAUDE.md:111-112`, not correctness.
- **Added 2026-09-08 — RESOLVED in `~/.claude` `0519f0b`.** The same defect existed one
  level up, in the file offered as the fix: `~/.claude/CLAUDE.md:111-112` pointed at
  `PROJECTS.md` as the source of truth and then restated *"`pure-eq` is the only app with
  real users"* — the very fact that goes stale. Fixing only the template instance would
  have left the class (`PATTERN-REPEATS`, `REVIEWER_CONVENTIONS.md` §6). Both now defer to
  `PROJECTS.md` and name no app; the quoted text no longer exists at that line.
- **Also stale — RESOLVED in the same commit:** `~/.claude/PROJECTS.md` did not list
  Hustlemania at all, though it is the app that produced this document.
- Optionally, `new-app.ps1` can stamp the app name into the gate with a `-replace` in
  the same BOM-less write path it uses for settings.json, so the sentence reads "For
  any app with real users (`hustlemania` once it launches)".

## 3. Smaller scaffold items found on the way

- `global/skills/solutioning/SKILL.md` is tracked in the template and therefore in
  every app; README step "copy to `~/.claude/skills/`" is a one-time install, and the
  copy in `~/.claude/skills/` is byte-identical. Move the install to `new-app.ps1` (or
  the `~/.claude` repo) and drop `global/` from the template.
- ~~`public/*.svg` and three `.gitkeep` files ship with the template's create-next-app
  base~~ — **RETRACTED 2026-09-08. Wrong repo, and already fixed.**
- ~~`vitest.config.mts` sets `passWithNoTests: true` and `package.json` uses
  `playwright test --pass-with-no-tests`~~ — **RETRACTED 2026-09-08. Wrong repo, and
  already fixed.**

  **What the two retracted bullets got wrong.** `agentic-template-v4` has no `public/`,
  zero `.svg`, zero `.gitkeep`, and **no `package.json` or `vitest.config.mts` in any
  commit** — it is a 23-file docs-and-hooks repo, and `new-app.ps1` does not run
  `create-next-app`. Those files entered *this* repo through its own scaffold commit
  `b83ef4d`, so the proposed template change is a no-op against a repo that has never
  contained the files.

  They were also **already fixed the same day this document was written**, in `1c43a77`
  (audit remediation 1–3, 2026-09-05): the five svgs and three `.gitkeep`s deleted,
  `passWithNoTests: true → false`, `--pass-with-no-tests` dropped from `test:e2e`, and
  `test:hooks` added to `verify`. The pointer to "the full audit, finding #4" leads to a
  finding closed hours later.

  **The durable finding underneath, which does belong here.** `create-next-app` ships
  those defaults, `new-app.ps1` does not scaffold the Next app, and nothing between the
  two carries the rule — so the next app scaffolded will reintroduce every one of them,
  and the vacuous test gate is the one that matters. `VACUOUS-PASS`
  (`~/.claude/REVIEWER_CONVENTIONS.md` §6) already names this exact case: *"a test runner
  that exits 0 having discovered zero test files."* The original bullet re-derived a
  codified rule without citing it, and proposed a weaker remedy than the codified one —
  keeping `--pass-with-no-tests` "only while `tests/**` is empty" leaves the gate unable
  to fail in precisely the state where it is the only thing looking. The codified remedy
  is that the gate must assert it found something to measure, and be proven non-vacuous
  by mutation.

  Kept from the original, because it is the right kind of evidence: the mutation proof
  `npx vitest run tests/does-not-exist` exits 0.
- The template's FIX_LOG entries cited `scripts/hooks/test_shell_guard.py` — confirmed
  2026-09-08 at what was then `docs/FIX_LOG.md:156` and `:269`. No such file existed in the
  template (`scripts/hooks/` holds the write- and evaluator-guard tests only) and none
  exists in a generated app. The real path is `~/.claude/hooks/test_shell_guard.py`.
  **RESOLVED in `8c681e0`:** both citations were corrected in place, and the file now lives
  at `docs/template/FIX_LOG.md` — `docs/FIX_LOG.md` is a header-only scaffold, so the line
  numbers above no longer resolve there. A third occurrence at
  `docs/template/DECISIONS.md:156` was deliberately left alone: it records a deletion at
  that path and is correct as history.

## 4. Not a template defect, but worth recording where the template's docs are read

The Supabase MCP plugin is OAuth-scoped to one organisation. An app whose hosted
project lives in a second org (Hustlemania: org `tlfaqzgduptciyxbkwdf`, project
`zcdvuhcslwalhziinfqz`) is invisible to it, and `list_projects` returning only
`pure-eq` reads exactly like "no project exists". The template's `engineering-
conventions` or `/interview` new-app flow could ask for the project ref and org at the
"create the Supabase project" step and write both into `docs/DECISIONS.md`, so the
next session verifies against the CLI (`npx supabase projects list`) instead of
trusting the MCP's view.

**Not verified (2026-09-08).** Unlike every other item here, this one was not re-checked
against a live MCP or CLI call — the org-scoping behaviour is taken from the original
session's observation, not confirmed. The recommendation is cheap and sound either way.

**If you act on it, record the ref and org only.** Never the `service_role` key or the
database password. `agentic-template-v4` and `~/.claude` are both **public** repos
(`~/.claude/PROJECTS.md`), and `docs/DECISIONS.md` is committed — a project ref and org id
are fine there (they are already the public API subdomain), a key is not, and once pushed
to a public repo it cannot be recalled.
