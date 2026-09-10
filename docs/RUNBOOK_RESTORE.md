# Runbook — backup and restore (F14)

Two layers, because they answer different failures.

| Layer | Answers | Where it lives | Who makes it |
|---|---|---|---|
| **Supabase daily backups** (Pro plan; 7-day retention) | "the hosted database is corrupt or a bad migration ran" — restore the project **in place** to a point before it | Supabase, Database → Backups | Supabase, automatically |
| **Logical dump files** (`supabase db dump`) | "the project, the organisation or the account is gone", and the restore drill | A folder the user owns, **outside this repo** — the files carry emails | The user, by hand, on the cadence below |

The hosted project runs Postgres 17, so its daily backups are *physical*. Supabase's
backups page (read 2026-09-10): "You can still use physical backups for restoration,
but they are not available for direct download." That is why the file layer exists:
nothing downloadable comes from the dashboard, and a restore drill needs a file.

## Cadence for the dump files

Weekly, and always before a migration is pushed to the hosted project. A dump is a
minute of the user's time; a missing one is the whole sprint history. Keep the last
four, delete older by hand (the files are the user's, never the agent's to remove).

## Take a dump

From this repo, linked to the hosted project (`supabase link --project-ref
zcdvuhcslwalhziinfqz`; the database password is read from `SUPABASE_DB_PASSWORD` in the
shell, or prompted — never pasted into a conversation).

```sh
# Windows: set D to a dated folder outside the repo, e.g. C:\Users\<you>\backups\hustlemania\2026-09-10
D=~/backups/hustlemania/$(date -u +%Y-%m-%d)
mkdir -p "$D"
npx supabase db dump --linked --role-only -f "$D/roles.sql"
npx supabase db dump --linked --schema auth,public --data-only --use-copy -f "$D/data.sql"
```

- `roles.sql` — cluster roles. Only needed when restoring into a brand-new project
  that lacks a custom role; this app defines none, so it is kept for completeness.
- `data.sql` — every row in `public` and `auth`: sprints, days, tasks, the vision,
  reminder log, and the users. **Contains emails. Never commit it, never share it.**
- No `schema.sql`: the schema is `supabase/migrations/0001…` and is recreated by
  `db push` (hosted) or `db reset` (local). A schema dump would only drift from them.

After the dump, confirm it holds the users and the sprints, or it is not a backup:

```sh
grep -c "COPY \"auth\".\"users\"" "$D/data.sql"     # 1
grep -c "COPY \"public\".\"sprints\"" "$D/data.sql" # 1
```

## Restore into the local stack (the drill)

The drill proves a file can become a running app again. It touches the local stack
only; `.env.local` and every test guard already refuse a non-loopback host.

```sh
npx supabase db reset            # blank local DB + migrations 0001…0018 (schema, functions, job)
docker exec -i supabase_db_Hustlemania psql -U supabase_admin -d postgres \
  -v ON_ERROR_STOP=1 --single-transaction -f - < "$D/data.sql"
```

The dump's first line is `SET session_replication_role = replica`, which silences the
triggers during the load so immutability guards on closed days and the `updated_at`
triggers do not rewrite or reject history; that setting needs a superuser, hence
`supabase_admin` (the local stack's), not `postgres`. Then compare counts with the
hosted project, which must match exactly (a read-only query on the hosted side, run
from the SQL editor):

```sql
select
  (select count(*) from auth.users)         as users,
  (select count(*) from public.sprints)     as sprints,
  (select count(*) from public.sprint_days) as sprint_days,
  (select count(*) from public.reminder_log) as reminder_log;
```

Run the same query locally:

```sh
docker exec supabase_db_Hustlemania psql -U postgres -At -c "select (select count(*) from auth.users), (select count(*) from public.sprints), (select count(*) from public.sprint_days), (select count(*) from public.reminder_log);"
```

Then `npm run dev` and open `http://localhost:3000/login`: the page renders. A restored
user cannot receive a magic link locally (Mailpit catches it; open
`http://127.0.0.1:54344`), which is enough to walk into `/sprints` and see the
restored sprint.

## Restore into a new hosted project (the real disaster)

1. Create the project (Postgres 17), `supabase link` to it, `supabase db push` — all
   migrations, no data.
2. `supabase config push` for the auth settings (`[remotes.production]` in
   `supabase/config.toml`; update its `project_id` first).
3. Load `data.sql` with `psql` against the new project's connection string, exactly as
   in the drill (`--single-transaction`, `ON_ERROR_STOP=1`; the dump's own first line
   sets `session_replication_role = replica`). **Not yet verified:** whether the
   hosted `postgres` role may set that parameter (it is not a superuser there). If
   the load refuses it, delete the dump's first line and load with triggers live —
   closed-day immutability then rejects nothing on a first load, because every row is
   an insert, and `updated_at` values are simply re-stamped.
4. Re-create what a dump cannot carry: the two Vault secrets
   (`docs/RUNBOOK_REMINDERS.md` step 4); the Vercel environment variables pointing at
   the new project's URL and keys; a redeploy.
5. Run the count query above on both sides. Sign in as the owner.

## Restore in place from a Supabase daily backup

Dashboard → Database → Backups → pick the day → Restore. This rewinds the whole
database to that snapshot; anything written after it is lost, so take a dump first if
those hours matter. Vault secrets and the cron job are part of the database and come
back with it.

## Drill record

| Date (UTC) | Dump folder | Hosted counts (users / sprints / sprint_days / reminder_log) | Local counts after restore | `/login` served | Notes |
|---|---|---|---|---|---|
| 2026-09-10 06:10 | `C:\Users\jtakh\backups\hustlemania\2026-09-10` (`roles.sql` 370 B, `data.sql` 19 KB) | 1 / 1 / 14 / 1 (also visions 1, tasks 2, cues 2, impediments 2) | identical, all eight | 200 in 2 s; `/sprints` → 307 `/login` | First drill, F14. `db dump --linked` needed no password (the CLI's login role). The dump carried every `auth` table (users, sessions, refresh tokens, …) and all fourteen `public` tables. Loaded as `supabase_admin` in one transaction, exit 0. Local stack reset to blank afterwards so no production copy lingers. |
