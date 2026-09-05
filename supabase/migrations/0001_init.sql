-- 0001_init — Hustlemania F1: visions, sprints, sprint_days; start_sprint, close_day.
--
-- Access model: deny by default.
--   * Default privileges for objects the postgres role creates in `public` are revoked,
--     so a table added by a later migration is unreachable through the API until that
--     migration grants access. This mirrors the hosted project's "automatically expose
--     new tables = off" so a missing grant fails locally, not in production.
--   * All writes that carry an invariant go through SECURITY DEFINER functions that take
--     identity from auth.uid(). The authenticated role gets SELECT plus column-level
--     UPDATE on the few free-text columns a user may edit directly.
--   * RLS is enabled on every table in the migration that creates it.
--
-- Amounts are BIGINT in base units: money in minor units, hours in minutes, quantity
-- whole (docs/DECISIONS.md 2026-09-05).

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared trigger function
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- visions — one active 1-year vision per area; replacing archives (PRD §2)
-- ---------------------------------------------------------------------------
create table public.visions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  area        text not null check (area in ('health', 'wealth', 'relationships')),
  body        text not null check (btrim(body) <> ''),  -- private user text
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- archived_at: a replaced vision is archived, never deleted. Every list and the
  -- start_sprint lookup filter on it; the SELECT policy returns archived rows so the
  -- owner can still see "archived visions (n)".
  archived_at timestamptz
);

create index visions_user_id_idx on public.visions (user_id);
create unique index visions_one_active_per_area
  on public.visions (user_id, area) where archived_at is null;

create trigger visions_set_updated_at
  before update on public.visions
  for each row execute function public.set_updated_at();

alter table public.visions enable row level security;

create policy visions_select on public.visions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy visions_insert on public.visions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and archived_at is null);

create policy visions_update on public.visions
  for update to authenticated
  using ((select auth.uid()) = user_id and archived_at is null)
  with check ((select auth.uid()) = user_id);

grant select, insert (user_id, area, body), update (body) on public.visions to authenticated;
grant all on public.visions to service_role;

-- ---------------------------------------------------------------------------
-- sprints — one active per area; goal/measurement/dates/tz lock at start (rules 1, 8, 9)
-- ---------------------------------------------------------------------------
create table public.sprints (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  vision_id      uuid not null references public.visions(id),
  area           text not null check (area in ('health', 'wealth', 'relationships')),
  outcome        text not null check (btrim(outcome) <> ''),
  measurement    text not null check (measurement in ('money', 'hours', 'quantity')),
  currency       text check (currency ~ '^[A-Z]{3}$'),
  unit           text check (btrim(unit) <> ''),
  amount         bigint not null check (amount > 0),
  confidence     smallint not null check (confidence between 1 and 10),
  why            text not null check (btrim(why) <> ''),
  celebration    text not null check (btrim(celebration) <> ''),
  mantra         text not null check (btrim(mantra) <> ''),
  usage_of_funds jsonb not null default '[]'::jsonb check (jsonb_typeof(usage_of_funds) = 'array'),
  target_mode    text not null default 'same' check (target_mode in ('same', 'custom')),
  tz             text not null,
  start_date     date not null,
  end_date       date not null,
  status         text not null default 'active'
                 check (status in ('active', 'review', 'completed', 'completed_early', 'ended_early')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint sprints_end_date_check check (end_date = start_date + 13),
  constraint sprints_measurement_fields_check check (
       (measurement = 'money'    and currency is not null and unit is null)
    or (measurement = 'hours'    and currency is null     and unit is null)
    or (measurement = 'quantity' and unit is not null     and currency is null)
  )
);

create index sprints_user_id_idx on public.sprints (user_id);
create index sprints_vision_id_idx on public.sprints (vision_id);
create unique index sprints_one_active_per_area
  on public.sprints (user_id, area) where status = 'active';

create trigger sprints_set_updated_at
  before update on public.sprints
  for each row execute function public.set_updated_at();

create or replace function public.sprints_lock_after_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id     is distinct from old.user_id
  or new.vision_id   is distinct from old.vision_id
  or new.area        is distinct from old.area
  or new.measurement is distinct from old.measurement
  or new.currency    is distinct from old.currency
  or new.unit        is distinct from old.unit
  or new.amount      is distinct from old.amount
  or new.start_date  is distinct from old.start_date
  or new.end_date    is distinct from old.end_date
  or new.tz          is distinct from old.tz
  then
    raise exception 'sprint_locked';
  end if;
  return new;
end
$$;

create trigger sprints_lock_after_start
  before update on public.sprints
  for each row execute function public.sprints_lock_after_start();

alter table public.sprints enable row level security;

create policy sprints_select on public.sprints
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy sprints_update on public.sprints
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, update (mantra) on public.sprints to authenticated;
grant all on public.sprints to service_role;

-- ---------------------------------------------------------------------------
-- sprint_days — 14 rows per sprint; a closed day is immutable (rule 17)
-- ---------------------------------------------------------------------------
create table public.sprint_days (
  id         uuid primary key default gen_random_uuid(),
  sprint_id  uuid not null references public.sprints(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  day_index  smallint not null check (day_index between 1 and 14),
  date       date not null,
  target     bigint not null check (target >= 0),
  actual     bigint check (actual >= 0),
  intention  text,  -- private user text
  notes      text,  -- private user text
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sprint_id, day_index),
  unique (sprint_id, date),
  constraint sprint_days_actual_iff_closed_check check ((closed_at is null) = (actual is null))
);

create index sprint_days_user_id_idx on public.sprint_days (user_id);
create index sprint_days_sprint_id_date_idx on public.sprint_days (sprint_id, date);

create trigger sprint_days_set_updated_at
  before update on public.sprint_days
  for each row execute function public.set_updated_at();

create or replace function public.sprint_days_immutable_after_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sprint_id is distinct from old.sprint_id
  or new.user_id   is distinct from old.user_id
  or new.day_index is distinct from old.day_index
  or new.date      is distinct from old.date
  then
    raise exception 'sprint_day_locked';
  end if;

  if old.closed_at is not null and (
       new.actual    is distinct from old.actual
    or new.intention is distinct from old.intention
    or new.notes     is distinct from old.notes
    or new.closed_at is distinct from old.closed_at
    or new.target    is distinct from old.target
  ) then
    raise exception 'day_closed';
  end if;
  return new;
end
$$;

create trigger sprint_days_immutable_after_close
  before update on public.sprint_days
  for each row execute function public.sprint_days_immutable_after_close();

alter table public.sprint_days enable row level security;

create policy sprint_days_select on public.sprint_days
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy sprint_days_update on public.sprint_days
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, update (intention) on public.sprint_days to authenticated;
grant all on public.sprint_days to service_role;

-- ---------------------------------------------------------------------------
-- same_daily_targets — Goal ÷ 14 with the remainder spread as whole base units
-- over the first days, so the 14 targets always sum to the Goal (PRD §6, rule 11)
-- ---------------------------------------------------------------------------
create or replace function public.same_daily_targets(p_amount bigint)
returns bigint[]
language sql
immutable
set search_path = ''
as $$
  select array_agg(p_amount / 14 + case when i <= p_amount % 14 then 1 else 0 end order by i)
  from generate_series(1, 14) as i
$$;

-- ---------------------------------------------------------------------------
-- start_sprint — creates the sprint and its 14 days atomically (rules 1, 2, 7, 11)
-- ---------------------------------------------------------------------------
create or replace function public.start_sprint(
  p_area           text,
  p_outcome        text,
  p_measurement    text,
  p_currency       text,
  p_unit           text,
  p_amount         bigint,
  p_confidence     int,
  p_why            text,
  p_celebration    text,
  p_mantra         text,
  p_usage_of_funds jsonb,
  p_tz             text,
  p_start_date     date,
  p_intention      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_vision  uuid;
  v_sprint  uuid;
  v_today   date;
  v_targets bigint[];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_vision
  from public.visions
  where user_id = v_uid and area = p_area and archived_at is null;
  if v_vision is null then
    raise exception 'no_active_vision';
  end if;

  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception 'invalid_tz';
  end if;

  v_today := (now() at time zone p_tz)::date;
  if p_start_date is null or p_start_date not in (v_today, v_today + 1) then
    raise exception 'invalid_start_date';
  end if;

  if exists (
    select 1 from public.sprints
    where user_id = v_uid and area = p_area and status = 'active'
  ) then
    raise exception 'active_sprint_exists';
  end if;

  insert into public.sprints (
    user_id, vision_id, area, outcome, measurement, currency, unit, amount, confidence,
    why, celebration, mantra, usage_of_funds, target_mode, tz, start_date, end_date
  ) values (
    v_uid, v_vision, p_area, p_outcome, p_measurement, p_currency, p_unit, p_amount, p_confidence,
    p_why, p_celebration, p_mantra, coalesce(p_usage_of_funds, '[]'::jsonb), 'same', p_tz,
    p_start_date, p_start_date + 13
  )
  returning id into v_sprint;

  v_targets := public.same_daily_targets(p_amount);

  insert into public.sprint_days (sprint_id, user_id, day_index, date, target, intention)
  select v_sprint, v_uid, i, p_start_date + (i - 1), v_targets[i],
         case when i = 1 then nullif(btrim(p_intention), '') end
  from generate_series(1, 14) as i;

  return v_sprint;
exception
  when unique_violation then
    raise exception 'active_sprint_exists';
end
$$;

revoke all on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, text)
  from public, anon;
grant execute on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- close_day — records the Actual and locks the day (rule 17)
-- ---------------------------------------------------------------------------
create or replace function public.close_day(
  p_sprint_day_id uuid,
  p_actual        bigint,
  p_notes         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_day record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_actual is null or p_actual < 0 then
    raise exception 'invalid_actual';
  end if;

  select d.id, d.date, d.closed_at, s.tz, s.status
  into v_day
  from public.sprint_days d
  join public.sprints s on s.id = d.sprint_id
  where d.id = p_sprint_day_id and d.user_id = v_uid
  for update of d;

  if v_day.id is null then
    raise exception 'day_not_found';
  end if;
  if v_day.closed_at is not null then
    raise exception 'day_closed';
  end if;
  if v_day.status <> 'active' then
    raise exception 'sprint_not_active';
  end if;
  if v_day.date > (now() at time zone v_day.tz)::date then
    raise exception 'day_in_future';
  end if;

  update public.sprint_days
  set actual = p_actual,
      notes = nullif(btrim(p_notes), ''),
      closed_at = now()
  where id = p_sprint_day_id;
end
$$;

revoke all on function public.close_day(uuid, bigint, text) from public, anon;
grant execute on function public.close_day(uuid, bigint, text) to authenticated, service_role;
