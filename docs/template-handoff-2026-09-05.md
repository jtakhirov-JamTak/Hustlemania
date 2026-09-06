# Template handoff — findings for `~/dev/agentic-template-v4` and `~/.claude/new-app.ps1`

Found during the Hustlemania full audit on 2026-09-05. Every item below was verified in
this clone against the template repo at `~/dev/agentic-template-v4` (clean, level with
origin). Apply in that repo and in `~/.claude`, not here — the project's governance
files are closed to the agent by design.

## 1. `gh repo create --template` copies the template's own project history into every new app

**What happens.** `new-app.ps1` Step 1 runs `gh repo create $Name --template
jtakhirov-JamTak/agentic-template-v4 --clone`. GitHub's template mechanism copies the
whole tree, and the template repo commits its *own* working documents:

| File in template | What it holds | Lands in the new app as |
|---|---|---|
| `docs/BACKLOG.md` (163 lines) | Four sections of template-development backlog dated 2026-08-23..25, naming `pure-eq`, `the-leaf-v2`, `you-inc`, `PurePath` | `docs/BACKLOG.md` lines 133–319 in Hustlemania, byte-identical (verified with `diff`), removed by hand today |
| `docs/FIX_LOG.md` (13 entries) | Guard/hook/evaluator defects fixed while building the template | 13 entries in Hustlemania's FIX_LOG; two cite `scripts/hooks/test_shell_guard.py`, which does not exist in the generated app (the shell guard's test lives in `~/.claude/hooks/`) |
| `docs/DECISIONS.md` (4 entries) | Template-design decisions | Entries from line 232 of Hustlemania's DECISIONS |
| `docs/evals/` | (empty in template; fine) | fine |

The result: a fresh app's backlog opens with 187 lines about other apps, and any
grep for a project name across the new repo hits the template's history. No step in
`new-app.ps1` resets them.

**Proposed change (pick one; the first is cleaner).**

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

Either way, add the canary to the script's "Scaffold ready" block: "`grep -c pure-eq
docs/*.md` must print 0".

## 2. `CLAUDE.md` line 75 names `pure-eq` as the app with real users

```
**Production gate — the one exception to zero build-time approvals.** For any app
with real users (`pure-eq`), before executing any operation that can modify
```

This is the template's *project* CLAUDE.md, so every generated app carries a
production gate that names a different app. In Hustlemania it reads as if `pure-eq`
were part of this project. Two fixes, both needed:

- In the template's `CLAUDE.md`, make the gate self-referential: "For any app with real
  users — this one, once it has any — before executing…". The list of which apps have
  users already lives in `~/.claude/PROJECTS.md` (`pure-eq` is the only shipped app),
  and the global `~/.claude/CLAUDE.md` already says "Read `~/.claude/PROJECTS.md`
  before judging risk". The project file should not duplicate a fact that changes.
- Optionally, `new-app.ps1` can stamp the app name into the gate with a `-replace` in
  the same BOM-less write path it uses for settings.json, so the sentence reads "For
  any app with real users (`hustlemania` once it launches)".

## 3. Smaller scaffold items found on the way

- `global/skills/solutioning/SKILL.md` is tracked in the template and therefore in
  every app; README step "copy to `~/.claude/skills/`" is a one-time install, and the
  copy in `~/.claude/skills/` is byte-identical. Move the install to `new-app.ps1` (or
  the `~/.claude` repo) and drop `global/` from the template.
- `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` and three
  `.gitkeep` files in populated test directories ship with the template's
  create-next-app base; nothing references them.
- `vitest.config.mts` sets `passWithNoTests: true` and `package.json` uses
  `playwright test --pass-with-no-tests`, so `npm run verify` is green when a test
  layer discovers zero files (proven: `npx vitest run tests/does-not-exist` exits 0).
  If the flag exists so a brand-new app's empty `tests/` passes on day one, gate that
  explicitly (a `--pass-with-no-tests` only while `tests/**` is empty) rather than
  leaving it on for the life of the app. See the full audit, finding #4.
- The template's FIX_LOG entries cite `scripts/hooks/test_shell_guard.py`; if the
  history stays in the app-facing FIX_LOG (option B above), correct the path to
  `~/.claude/hooks/test_shell_guard.py`.

## 4. Not a template defect, but worth recording where the template's docs are read

The Supabase MCP plugin is OAuth-scoped to one organisation. An app whose hosted
project lives in a second org (Hustlemania: org `tlfaqzgduptciyxbkwdf`, project
`zcdvuhcslwalhziinfqz`) is invisible to it, and `list_projects` returning only
`pure-eq` reads exactly like "no project exists". The template's `engineering-
conventions` or `/interview` new-app flow could ask for the project ref and org at the
"create the Supabase project" step and write both into `docs/DECISIONS.md`, so the
next session verifies against the CLI (`npx supabase projects list`) instead of
trusting the MCP's view.
