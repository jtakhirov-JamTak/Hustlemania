-- 0003_targets_step — same-daily distribution respects the measurement's whole unit.
--
-- PRD §6: "Distribute whole-unit or minute remainders". Money is stored in minor units
-- but entered and planned in whole currency units, so its remainder must be spread in
-- steps of 100 minor units; hours (minutes) and quantity use a step of 1. Without this a
-- USD 8,000 goal would plan 571.43 / 571.42 days — cents the user never typed.

drop function public.same_daily_targets(bigint);

create or replace function public.same_daily_targets(p_amount bigint, p_step bigint default 1)
returns bigint[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_step < 1 or p_amount < 0 or p_amount % p_step <> 0 then null
    else (
      select array_agg(
               (p_amount / p_step) / 14 * p_step
               + case when i <= (p_amount / p_step) % 14 then p_step else 0 end
               order by i)
      from generate_series(1, 14) as i)
  end
$$;

revoke all on function public.same_daily_targets(bigint, bigint) from public, anon, authenticated;

create or replace function public.measurement_step(p_measurement text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_measurement when 'money' then 100::bigint else 1::bigint end
$$;

revoke all on function public.measurement_step(text) from public, anon, authenticated;

-- start_sprint: same signature; now validates whole-unit amounts and distributes by step.
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
  v_step    bigint;
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

  v_step := public.measurement_step(p_measurement);
  if p_amount is null or p_amount <= 0 or p_amount % v_step <> 0 then
    raise exception 'invalid_amount';
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

  v_targets := public.same_daily_targets(p_amount, v_step);

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
