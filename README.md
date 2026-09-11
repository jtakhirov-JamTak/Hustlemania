# Hustlemania

A 14-day goal sprint app. You pick one measurable outcome, commit to a daily
target for 14 days, log the actual every evening, and name what got in the way.
After a sprint ends, the app shows which obstacles cost you the most and whether
your planned response to them actually ran. Live at https://hustlemania.app.

The behaviour is specified in `docs/SPEC.md`; the visual reference and the
original requirements are under `docs/references/` and `docs/mockups/`.

## Stack

Next.js (App Router) on Vercel, Supabase (Postgres, Auth by emailed magic link,
pg_cron for the evening reminder). Row-level security is deny-by-default and every
write goes through a database function; closed days and finished sprints are
immutable. There is no self-signup: accounts are created by the owner.

## Run it locally

Needs Node 22.12+, Python 3, Docker, and the Supabase CLI.

```
cp env.example .env          # hosted keys, optional for local work
git config core.hooksPath .githooks
npm install
supabase start               # local Postgres, Auth, mail inbox
npm run db:reset             # apply supabase/migrations
npm run dev                  # writes .env.local from the running stack, then starts :3000
```

There is no self-signup, locally either. Create a user first, in the local Studio
that `supabase start` prints (Authentication → Users) or with
`npx tsx --env-file=.env.local scripts/seed-f11-visual.mts`, which also seeds sprint
history. Then sign in at http://localhost:3000/login; the magic link lands in the local
inbox at http://localhost:54344.

## Check it

```
npm run verify   # typecheck, lint, hook tests, unit, DB, e2e (~4 min, stack must be up)
```

The pre-commit hook runs the same command. CI (`.github/workflows/ci.yml`) runs the
first four steps on every push and pull request; the DB and e2e halves need the
local stack and stay local. Every push to `main` deploys.

## Where things are

- `docs/SPEC.md` — what to build and why, feature by feature
- `docs/DECISIONS.md` — choices and the numbers that settled them
- `docs/FIX_LOG.md` — every defect, with its regression test
- `docs/RUNBOOK_RESTORE.md`, `docs/RUNBOOK_REMINDERS.md` — operations
- `docs/TEMPLATE_README.md` — the build template this repo was scaffolded from:
  guardrails, hooks, the evaluator, and how to check they hold
- `supabase/migrations/` — the schema, in order; never edit an applied one
