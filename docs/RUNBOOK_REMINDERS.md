# Runbook — evening reminder (F13)

The reminder runs inside the database: a `pg_cron` job fires at five past every hour
and POSTs to the app's `/api/cron/reminders` route through `pg_net`, presenting a
bearer. The route asks the database who is 20:00 or later in their sprint's zone with
today still open, claims those days in `reminder_log`, sends one email per user
through Resend, and records the outcome. Nothing here is reachable from a browser:
the route has no session and the three `reminders_*` functions are `service_role`
only (`tests/db/grants.test.ts`).

Migration `0018` installs the extensions, the table, the functions and the job. The
job does nothing until the two Vault secrets below exist — so a fresh project and the
local stack run it harmlessly (`tests/db/reminders.test.ts` pins that).

## One-time setup on the hosted project

1. **Verify the sending domain in Resend.** Resend delivers nothing from an
   unverified domain. Dashboard → Domains → add the domain → create the DNS records
   it shows → wait for "Verified".
2. **Create an API key in Resend** with sending permission.
3. **Set the environment variables on Vercel** (Project → Settings → Environment
   Variables, Production):
   - `CRON_SECRET` — a long random value (`openssl rand -hex 32`). The bearer.
   - `RESEND_API_KEY` — the key from step 2.
   - `REMINDER_FROM` — the sender on the verified domain, e.g.
     `Sprint <sprint@example.com>`.
   Redeploy so the route picks them up. `SUPABASE_SERVICE_ROLE_KEY` is already set
   for the app.
4. **Create the two Vault secrets** in the Supabase SQL editor (Vault is enabled on
   every project). Replace both values; `reminders_secret` must equal `CRON_SECRET`.

   ```sql
   select vault.create_secret('https://<your-app-domain>/api/cron/reminders', 'reminders_url');
   select vault.create_secret('<the CRON_SECRET value>', 'reminders_secret');
   ```

   To rotate, `select vault.update_secret(id, '<new value>') from vault.secrets
   where name = 'reminders_secret'`, then change `CRON_SECRET` on Vercel and
   redeploy. The next hourly run uses the new pair.
5. **Confirm the extensions and the job exist** (0018 creates them; on the hosted
   project the `postgres` role may create both, as it does on the local stack):

   ```sql
   select extname from pg_extension where extname in ('pg_cron', 'pg_net');
   select jobname, schedule, active from cron.job where jobname = 'reminders-hourly';
   ```

   Two extension rows, one active job on `5 * * * *`.

## Prove a run happened

After the next :05 past the hour:

```sql
-- The job fired and the request was issued (status succeeded; one row per hour).
select start_time, status, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'reminders-hourly')
order by start_time desc limit 5;

-- The request reached the app (pg_net keeps recent responses).
select created, status_code, error_msg
from net._http_response
order by created desc limit 5;

-- What the app did: one row per reminded sprint day.
select user_id, sprint_day_id, created_at, sent_at, attempts, error
from public.reminder_log
order by created_at desc limit 20;
```

Every route call also writes one `reminder.run` line to the Vercel runtime log
with `due / users / sent / failed` counts, and `reminder.send_failed` (ids only)
for each user whose send failed.

## When something is wrong

| Symptom | Where to look | Likely cause |
|---|---|---|
| No `cron.job_run_details` rows | step 5 | pg_cron not installed, or the job missing (re-run the `cron.schedule` block of 0018). |
| Runs succeed, no `_http_response` rows | step 4 | A Vault secret is missing or misnamed: the job selects zero rows and never calls out. |
| `_http_response` shows 401 | steps 3–4 | `reminders_secret` and `CRON_SECRET` differ. |
| `_http_response` shows 503 | step 3 | `CRON_SECRET` or `RESEND_API_KEY` / `REMINDER_FROM` unset on Vercel: the route refuses to run rather than log-and-pretend. |
| `reminder_log.error` like `resend 4xx …` | steps 1–2 | Domain unverified or key invalid. Rows retry hourly, three attempts, then stay with the error. |
| Someone got no email at 20:00 | `reminder_log`, then the sprint's `tz` | Due-ness is 20:00 in the sprint's own zone; a run at :05 means the first send is ~20:05 local. A closed day or a finished sprint is never due. |

## Limits

- Resend free tier: 100 emails/day, 3,000/month (pricing page, read 2026-09-10).
  Under ten users at one email a day is far inside it.
- Vercel Hobby cron cannot run hourly; that is why the scheduler is pg_cron
  (`docs/DECISIONS.md` 2026-09-10).
- No per-user hour, off switch or unsubscribe link yet (`docs/BACKLOG.md`).
