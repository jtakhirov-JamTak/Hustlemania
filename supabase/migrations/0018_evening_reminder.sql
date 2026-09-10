-- ---------------------------------------------------------------------------
-- 0018 — F13 evening email reminder (docs/SPEC.md F13, interviewed 2026-09-10).
--
-- The scheduler is pg_cron inside the database, not Vercel Cron: a Hobby project may
-- run a cron job once per day with ±59 min drift, and the reminder is "20:00 in the
-- sprint's own zone", which needs an hourly pass. The job POSTs to the app's route via
-- pg_net; the URL and bearer come from Vault, so this file holds no secret and the job
-- is a no-op wherever the two secrets have not been created (the local stack, a fresh
-- hosted project). docs/RUNBOOK_REMINDERS.md is the operator's side.
--
-- Three functions, all service_role only — the route runs with the service key and no
-- session, so nothing here is reachable from a browser:
--   reminders_due(p_now)     read-only: who is due at p_now (20:00–23:59 local, today's
--                            day open, sprint active, not already reminded / in flight).
--   reminders_claim(ids[])   marks the days about to be mailed so a second run inside
--                            the same window sends nothing; a retry bumps `attempts`.
--   reminders_mark(ids, err) the outcome: sent_at on success, the provider's error text
--                            otherwise (operator text, never user text).
-- `reminder_log` is one row per reminded sprint day (UNIQUE), which is the idempotency
-- key the SPEC asks for. The API roles have no grant on it and no policy: RLS is on for
-- deny-by-default parity, and only the service role reads or writes it.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------

create table public.reminder_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  sprint_day_id uuid not null unique references public.sprint_days(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz,
  attempts      smallint not null default 1 check (attempts between 1 and 3),
  error         text  -- operator text from the email provider (status + message), never user text
);

comment on table public.reminder_log is
  'F13: one row per sprint day a reminder was attempted for. sent_at null + attempts < 3 = retryable.';

create index reminder_log_user_id_idx on public.reminder_log (user_id);

alter table public.reminder_log enable row level security;
-- No policy on purpose: the API roles never touch this table. The service role bypasses RLS.

create trigger reminder_log_set_updated_at
  before update on public.reminder_log
  for each row execute function public.set_updated_at();

grant select, insert, update on public.reminder_log to service_role;

-- ---------------------------------------------------------------------------
-- Who is due at p_now. The clock is a parameter (like sprint_streak_at) so every case
-- is a deterministic test. Local time is `p_now at time zone s.tz`; the day row's own
-- date must equal that local date, which also keeps the sprint window (rows exist only
-- for days 1–14). A log row blocks the day unless it is a failed attempt older than ten
-- minutes with attempts left; a row touched within ten minutes is in flight.

create function public.reminders_due(p_now timestamptz)
returns table (
  user_id       uuid,
  email         text,
  sprint_id     uuid,
  sprint_day_id uuid,
  area          text,
  day_index     smallint,
  tz            text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id,
         u.email::text,
         s.id,
         d.id,
         s.area,
         d.day_index,
         s.tz
  from public.sprints s
  join public.sprint_days d on d.sprint_id = s.id
  join auth.users u on u.id = s.user_id
  left join public.reminder_log l on l.sprint_day_id = d.id
  where s.status = 'active'
    and d.date = (p_now at time zone s.tz)::date
    and extract(hour from (p_now at time zone s.tz)) >= 20
    and d.closed_at is null
    and not d.cancelled
    and u.email is not null
    and (l.id is null
         or (l.sent_at is null and l.attempts < 3 and l.updated_at < p_now - interval '10 minutes'))
  order by s.user_id, s.area;
$$;

-- ---------------------------------------------------------------------------
-- Claim the days about to be mailed. Returns the ids actually claimed: a new row, or an
-- existing failed row that is retryable (same predicate as reminders_due, re-checked
-- here so two overlapping runs cannot both mail the same day — the UNIQUE index refuses
-- the second insert and the ten-minute window refuses the second update).

create function public.reminders_claim(p_sprint_day_ids uuid[])
returns setof uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  foreach v_id in array p_sprint_day_ids loop
    if exists (select 1 from public.reminder_log l where l.sprint_day_id = v_id) then
      update public.reminder_log l
      set attempts = l.attempts + 1, error = null
      where l.sprint_day_id = v_id
        and l.sent_at is null
        and l.attempts < 3
        and l.updated_at < now() - interval '10 minutes';
      if found then
        return next v_id;
      end if;
    else
      insert into public.reminder_log (user_id, sprint_day_id)
      select d.user_id, d.id from public.sprint_days d where d.id = v_id
      on conflict (sprint_day_id) do nothing;
      if found then
        return next v_id;
      end if;
    end if;
  end loop;
  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- The outcome of one send for the claimed days: sent (p_error null) or the provider's
-- error, truncated. Only rows still unsent are touched.

create function public.reminders_mark(p_sprint_day_ids uuid[], p_error text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.reminder_log l
  set sent_at = case when p_error is null then now() else null end,
      error   = left(p_error, 200)
  where l.sprint_day_id = any (p_sprint_day_ids)
    and l.sent_at is null;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function (0002, 0013): revoke first.
revoke all on function public.reminders_due(timestamptz)      from public, anon, authenticated;
revoke all on function public.reminders_claim(uuid[])         from public, anon, authenticated;
revoke all on function public.reminders_mark(uuid[], text)    from public, anon, authenticated;
grant execute on function public.reminders_due(timestamptz)   to service_role;
grant execute on function public.reminders_claim(uuid[])      to service_role;
grant execute on function public.reminders_mark(uuid[], text) to service_role;

-- ---------------------------------------------------------------------------
-- The hourly job. `cron.schedule(name, …)` overwrites a job of the same name, so a
-- re-run of this statement is idempotent. The command reads both secrets from Vault
-- and selects zero rows — no request, no error — until both exist. It names neither
-- sprint_days nor tasks: the rule-12 / rule-16 guards in tests/db scan cron.job for
-- those and, from this migration on, actually run instead of early-returning.

select cron.schedule(
  'reminders-hourly',
  '5 * * * *',
  $job$
    select net.http_post(
      url                  := u.decrypted_secret,
      headers              := jsonb_build_object(
                                'Authorization', 'Bearer ' || s.decrypted_secret,
                                'Content-Type', 'application/json'),
      body                 := '{}'::jsonb,
      timeout_milliseconds := 30000)
    from vault.decrypted_secrets u
    join vault.decrypted_secrets s on s.name = 'reminders_secret'
    where u.name = 'reminders_url'
  $job$
);
