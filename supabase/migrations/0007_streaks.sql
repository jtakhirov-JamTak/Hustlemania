-- 0007_streaks — F5: day boundaries, streaks, missed days, backfill (PRD §9, rule 18).
--
-- A day is closed "on time" when the close lands on the day's own date in the sprint's
-- zone; close_day records that in `closed_on_time`. A close on a later date is a
-- backfill: the Actual counts toward every total exactly like any other closed day, but
-- closed_on_time is false and nothing ever flips it — the immutability trigger locks the
-- column with the day, and no function repairs a streak (rule 18). A day whose date is
-- still in the future in the sprint's zone cannot be closed (unchanged from 0001).
--
-- The streak is computed, never stored. `sprint_streak_at` takes the sprint's closable
-- days (date on or before "today" in the sprint's zone), ignores today's day while it is
-- still open (not yet missed, not yet earned), and counts the trailing run of on-time
-- closes ending at the latest of them. A missed day and a backfilled day both end that
-- run. Two entry points read it: `close_day` returns the streak it just produced, and
-- `sprint_streaks()` returns one row per active sprint of the caller, so a page reads
-- every streak in one call. The `_at` variant takes the clock as a parameter so the
-- suite can test fixed instants (a DST change included) and is not callable by the API
-- roles.
--
-- Existing closed rows get closed_on_time from their closed_at, read in the sprint's
-- zone, before the column is constrained. The immutability trigger did not yet know the
-- column, so that one update is allowed; it is redefined right after.

alter table public.sprint_days
  add column closed_on_time boolean;

update public.sprint_days d
set closed_on_time = (d.closed_at at time zone s.tz)::date <= d.date
from public.sprints s
where s.id = d.sprint_id and d.closed_at is not null;

alter table public.sprint_days
  add constraint sprint_days_on_time_iff_closed_check check ((closed_at is null) = (closed_on_time is null));

-- ---------------------------------------------------------------------------
-- sprint_days_immutable_after_close — the 0004 lock (actual, intention, notes,
-- closed_at, target and the Highest Impediment snapshot) plus closed_on_time.
-- ---------------------------------------------------------------------------
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
       new.actual                is distinct from old.actual
    or new.intention             is distinct from old.intention
    or new.notes                 is distinct from old.notes
    or new.closed_at             is distinct from old.closed_at
    or new.closed_on_time        is distinct from old.closed_on_time
    or new.target                is distinct from old.target
    or new.highest_impediment_id is distinct from old.highest_impediment_id
    or new.proof_when            is distinct from old.proof_when
    or new.proof_then            is distinct from old.proof_then
  ) then
    raise exception 'day_closed';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- sprint_streak_at — the streak as of one instant. Reads the rows as its caller: the
-- suite runs it as the superuser with fixed clocks; the API roles cannot call it.
-- Defined before close_day, which returns it.
-- ---------------------------------------------------------------------------
create or replace function public.sprint_streak_at(p_sprint_id uuid, p_asof timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  with today as (
    select (p_asof at time zone s.tz)::date as d
    from public.sprints s
    where s.id = p_sprint_id
  ),
  counted as (
    select d.day_index, d.closed_on_time
    from public.sprint_days d, today
    where d.sprint_id = p_sprint_id
      and (d.date < today.d or (d.date = today.d and d.closed_at is not null))
  )
  select count(*)::integer
  from counted
  where day_index > coalesce((select max(day_index) from counted where closed_on_time is not true), 0);
$$;

revoke all on function public.sprint_streak_at(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- close_day — as 0004, plus closed_on_time, and it returns the streak after the close.
-- The return type changes, so the void version is dropped and the grants re-applied.
-- ---------------------------------------------------------------------------
drop function public.close_day(uuid, bigint, text, uuid[], uuid, uuid[], uuid);

create function public.close_day(
  p_sprint_day_id  uuid,
  p_actual         bigint,
  p_notes          text default null,
  p_hurt           uuid[] default '{}',
  p_most_damaging  uuid default null,
  p_helped         uuid[] default '{}',
  p_most_useful    uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_day     record;
  v_today   date;
  v_hurt    uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_hurt, '{}')) as x);
  v_helped  uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_helped, '{}')) as x);
  v_highest record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_actual is null or p_actual < 0 then
    raise exception 'invalid_actual';
  end if;

  select d.id, d.date, d.closed_at, d.sprint_id, s.tz, s.status
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

  v_today := (now() at time zone v_day.tz)::date;
  if v_day.date > v_today then
    raise exception 'day_in_future';
  end if;

  -- Selections must come from what this day offered (rule 23), and a most-damaging /
  -- most-useful pick is required exactly when at least one item is selected (PRD §8).
  if exists (
    select 1 from unnest(v_hurt) as x
    where x not in (select item_id from public.day_offered_items(p_sprint_day_id) where kind = 'impediment')
  ) then
    raise exception 'item_not_offered';
  end if;
  if exists (
    select 1 from unnest(v_helped) as x
    where x not in (select item_id from public.day_offered_items(p_sprint_day_id) where kind = 'cue')
  ) then
    raise exception 'item_not_offered';
  end if;
  if (cardinality(v_hurt) > 0) <> (p_most_damaging is not null) or (p_most_damaging is not null and not (p_most_damaging = any(v_hurt))) then
    raise exception 'most_damaging_required';
  end if;
  if (cardinality(v_helped) > 0) <> (p_most_useful is not null) or (p_most_useful is not null and not (p_most_useful = any(v_helped))) then
    raise exception 'most_useful_required';
  end if;

  select i.id, i.proof_when, i.proof_then into v_highest
  from public.sprint_impediments m
  join public.impediments i on i.id = m.impediment_id
  where m.sprint_id = v_day.sprint_id and m.is_highest and m.removed_at is null;

  -- On time = closed on the day's own date in the sprint's zone (PRD §9). Any later
  -- date is a backfill: it counts, it never repairs the streak (rule 18).
  update public.sprint_days
  set actual = p_actual,
      notes = nullif(btrim(p_notes), ''),
      closed_at = now(),
      closed_on_time = v_today <= v_day.date,
      highest_impediment_id = v_highest.id,
      proof_when = v_highest.proof_when,
      proof_then = v_highest.proof_then
  where id = p_sprint_day_id;

  insert into public.day_impediment_hurt (sprint_day_id, user_id, impediment_id, is_most_damaging)
  select p_sprint_day_id, v_uid, x, x = p_most_damaging from unnest(v_hurt) as x;

  insert into public.day_cue_helped (sprint_day_id, user_id, cue_id, is_most_useful)
  select p_sprint_day_id, v_uid, x, x = p_most_useful from unnest(v_helped) as x;

  return public.sprint_streak_at(v_day.sprint_id, now());
end
$$;

revoke all on function public.close_day(uuid, bigint, text, uuid[], uuid, uuid[], uuid) from public, anon;
grant execute on function public.close_day(uuid, bigint, text, uuid[], uuid, uuid[], uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sprint_streaks — the streak of every active sprint of the caller, right now, in one
-- call. Definer rights so it may call the inner function; the auth.uid() filter stands
-- in for RLS, and a caller with no active sprint gets no rows.
-- ---------------------------------------------------------------------------
create or replace function public.sprint_streaks()
returns table (sprint_id uuid, streak integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id as sprint_id, public.sprint_streak_at(s.id, now()) as streak
  from public.sprints s
  where s.user_id = auth.uid() and s.status = 'active'
  order by s.id;
$$;

revoke all on function public.sprint_streaks() from public, anon;
grant execute on function public.sprint_streaks() to authenticated, service_role;
