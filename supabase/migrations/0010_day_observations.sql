-- 0010_day_observations — F7: Day Close records observations, not judgments. Which
-- impediments occurred, which cues were used, and — when the Highest occurred — did
-- the response run, did the user recover, how much it cost. Each sprint carries one
-- focus cue (`sprint_cues.is_focus`), required like the highest impediment.
--
-- Destructive: `day_impediment_hurt` and `day_cue_helped` are dropped. Two guards run
-- first and abort the whole migration: a row in either legacy table, or an active
-- sprint (none can carry a focus cue yet). No statement here deletes or rewrites a
-- user row — the blank start is `supabase db reset` on the local stack, and the hosted
-- project has never been migrated (DECISIONS 2026-09-05).
--
-- Observation rows are immutable (UPDATE trigger; DELETE stays open for the
-- auth.users cascade, as 0004 recorded), so they carry no `updated_at`. `unanswered`
-- is a stored value: a group the user never touched gets one row per offered item
-- saying so. A day closed before this migration has no rows at all — that is
-- "missing", and no function here derives an answer from an absent row.
--
-- Every function redefined here is rebuilt from its latest definer —
-- `sprint_days_immutable_after_close` and `close_day` from 0007, `day_offered_items`
-- from 0004, `start_sprint` and `sprint_invalid_reason` from 0009 — and
-- tests/db/libraries.test.ts pins one marker per body that only this version carries.

do $$
begin
  if exists (select 1 from public.day_impediment_hurt) or exists (select 1 from public.day_cue_helped) then
    raise exception 'legacy_selections_present';
  end if;
  if exists (select 1 from public.sprints where status = 'active') then
    raise exception 'focus_backfill_required';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- sprint_cues.is_focus — one focus cue per sprint, same shape as is_highest.
-- ---------------------------------------------------------------------------
alter table public.sprint_cues
  add column is_focus boolean not null default false,
  add constraint sprint_cues_focus_active_check check (not is_focus or removed_at is null);

create unique index sprint_cues_one_focus
  on public.sprint_cues (sprint_id) where is_focus;

-- ---------------------------------------------------------------------------
-- sprint_days — the RECOVERED WHEN snapshot (moved here from F6) and the Highest's
-- three answers. Null = not asked: the Highest did not occur, or the day closed before
-- this migration. Only close_day writes them; the immutability trigger locks them.
-- ---------------------------------------------------------------------------
alter table public.sprint_days
  add column proof_recover text,  -- private user text (snapshot)
  add column response  text check (response  in ('yes', 'no', 'partially', 'unsure')),
  add column recovered text check (recovered in ('yes', 'no', 'unsure')),
  add column impact    text check (impact    in ('nothing', 'some', 'a_lot', 'unsure')),
  add constraint sprint_days_response_recovered_check check ((response is null) = (recovered is null)),
  add constraint sprint_days_impact_needs_response_check check (impact is null or response is not null),
  add constraint sprint_days_response_closed_check check (response is null or closed_at is not null);

-- ---------------------------------------------------------------------------
-- day_impediment_observations / day_cue_observations — one row per item Day Close
-- offered, written by close_day at close. Wording is snapshotted (name, cue_when);
-- which item was the highest / the focus is snapshotted too, as of the close.
-- ---------------------------------------------------------------------------
create table public.day_impediment_observations (
  id            uuid primary key default gen_random_uuid(),
  sprint_day_id uuid not null references public.sprint_days(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  impediment_id uuid not null references public.impediments(id),
  name          text not null,  -- private user text (snapshot)
  occurred      text not null check (occurred in ('yes', 'no', 'unsure', 'unanswered')),
  was_highest   boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (sprint_day_id, impediment_id)
);

create index day_impediment_observations_user_id_idx on public.day_impediment_observations (user_id);
create index day_impediment_observations_impediment_id_idx on public.day_impediment_observations (impediment_id);
create unique index day_impediment_observations_one_highest
  on public.day_impediment_observations (sprint_day_id) where was_highest;

create table public.day_cue_observations (
  id            uuid primary key default gen_random_uuid(),
  sprint_day_id uuid not null references public.sprint_days(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  cue_id        uuid not null references public.cues(id),
  name          text not null,  -- private user text (snapshot)
  cue_when      text,           -- private user text (snapshot)
  used          text not null check (used in ('yes', 'no', 'unsure', 'unanswered')),
  was_focus     boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (sprint_day_id, cue_id)
);

create index day_cue_observations_user_id_idx on public.day_cue_observations (user_id);
create index day_cue_observations_cue_id_idx on public.day_cue_observations (cue_id);
create unique index day_cue_observations_one_focus
  on public.day_cue_observations (sprint_day_id) where was_focus;

create trigger day_impediment_observations_immutable
  before update on public.day_impediment_observations
  for each row execute function public.day_selection_immutable();
create trigger day_cue_observations_immutable
  before update on public.day_cue_observations
  for each row execute function public.day_selection_immutable();

alter table public.day_impediment_observations enable row level security;
alter table public.day_cue_observations        enable row level security;

create policy day_impediment_observations_select on public.day_impediment_observations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy day_cue_observations_select on public.day_cue_observations
  for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.day_impediment_observations, public.day_cue_observations to authenticated;
grant all on public.day_impediment_observations, public.day_cue_observations to service_role;

-- ---------------------------------------------------------------------------
-- The hurt / helped selections are gone (user, 2026-09-06). The guard above proved
-- both tables empty; the drop takes their triggers, policies and indexes with it.
-- ---------------------------------------------------------------------------
drop table public.day_impediment_hurt;
drop table public.day_cue_helped;

-- ---------------------------------------------------------------------------
-- day_offered_items — the 0004 body (same date-range rule, SECURITY INVOKER) returning
-- the F6 columns and the focus flag as of the call. The return type changes, so it is
-- dropped and recreated with the grants re-applied. A cue re-added on the day it was
-- removed has two overlapping rows; the focus one wins the distinct.
-- ---------------------------------------------------------------------------
drop function public.day_offered_items(uuid);

create function public.day_offered_items(p_sprint_day_id uuid)
returns table (kind text, item_id uuid, name text, explanation text, cue_when text, proof_when text, proof_then text, proof_recover text, is_focus boolean, rank integer)
language sql
stable
set search_path = ''
as $$
  select distinct on (kind, item_id) *
  from (
    select 'impediment'::text as kind, i.id as item_id, i.name, i.explanation, null::text as cue_when,
           i.proof_when, i.proof_then, i.proof_recover, false as is_focus, i.rank
    from public.sprint_days d
    join public.sprints s on s.id = d.sprint_id
    join public.sprint_impediments m on m.sprint_id = s.id
    join public.impediments i on i.id = m.impediment_id
    where d.id = p_sprint_day_id
      and (m.added_at at time zone s.tz)::date <= d.date
      and (m.removed_at is null or (m.removed_at at time zone s.tz)::date >= d.date)
    union all
    select 'cue', c.id, c.name, c.explanation, c.cue_when, null, null, null, m.is_focus, c.rank
    from public.sprint_days d
    join public.sprints s on s.id = d.sprint_id
    join public.sprint_cues m on m.sprint_id = s.id
    join public.cues c on c.id = m.cue_id
    where d.id = p_sprint_day_id
      and (m.added_at at time zone s.tz)::date <= d.date
      and (m.removed_at is null or (m.removed_at at time zone s.tz)::date >= d.date)
  ) x
  order by kind, item_id, is_focus desc
$$;

revoke all on function public.day_offered_items(uuid) from public, anon;
grant execute on function public.day_offered_items(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sprint_days_immutable_after_close — the 0007 lock plus proof_recover and the
-- Highest's three answers.
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
    or new.proof_recover         is distinct from old.proof_recover
    or new.response              is distinct from old.response
    or new.recovered             is distinct from old.recovered
    or new.impact                is distinct from old.impact
  ) then
    raise exception 'day_closed';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- close_day — the 0007 body (lock, future / backfill logic, closed_on_time, streak
-- return) with the observations in place of the hurt / helped selections.
-- p_impediments / p_cues: JSON arrays of { "item_id", "answer" }, answer in yes / no /
-- unsure. Every item Day Close offered gets a row; one absent from the array is
-- `unanswered`. The Highest's response, recovery and impact are required exactly when
-- its own answer is `yes`, and must be absent otherwise. The 0007 signature is dropped
-- so there is one entry point.
-- ---------------------------------------------------------------------------
drop function public.close_day(uuid, bigint, text, uuid[], uuid, uuid[], uuid);

create function public.close_day(
  p_sprint_day_id  uuid,
  p_actual         bigint,
  p_notes          text default null,
  p_impediments    jsonb default '[]',
  p_cues           jsonb default '[]',
  p_response       text default null,
  p_recovered      text default null,
  p_impact         text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_day       record;
  v_today     date;
  v_imps      jsonb := coalesce(p_impediments, '[]'::jsonb);
  v_cues      jsonb := coalesce(p_cues, '[]'::jsonb);
  v_highest   record;
  v_occurred  text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_actual is null or p_actual < 0 then
    raise exception 'invalid_actual';
  end if;
  if jsonb_typeof(v_imps) <> 'array' or jsonb_typeof(v_cues) <> 'array' then
    raise exception 'invalid_answer';
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

  -- Answers: on the scale, one per item, and only for what this day offered (rule 23).
  if exists (
    select 1 from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text)
    where x.item_id is null or x.answer is null or x.answer not in ('yes', 'no', 'unsure')
  ) or exists (
    select 1 from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text)
    where x.item_id is null or x.answer is null or x.answer not in ('yes', 'no', 'unsure')
  ) then
    raise exception 'invalid_answer';
  end if;
  if (select count(*) - count(distinct item_id) from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text)) > 0
  or (select count(*) - count(distinct item_id) from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text)) > 0 then
    raise exception 'duplicate_item';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text)
    where x.item_id not in (select item_id from public.day_offered_items(p_sprint_day_id) where kind = 'impediment')
  ) or exists (
    select 1 from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text)
    where x.item_id not in (select item_id from public.day_offered_items(p_sprint_day_id) where kind = 'cue')
  ) then
    raise exception 'item_not_offered';
  end if;

  select i.id, i.proof_when, i.proof_then, i.proof_recover into v_highest
  from public.sprint_impediments m
  join public.impediments i on i.id = m.impediment_id
  where m.sprint_id = v_day.sprint_id and m.is_highest and m.removed_at is null;

  -- The Highest's answer decides whether the response questions apply at all.
  select x.answer into v_occurred
  from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text)
  where x.item_id = v_highest.id;

  if v_occurred = 'yes' then
    if p_response is null then raise exception 'response_required'; end if;
    if p_recovered is null then raise exception 'recovered_required'; end if;
    if p_response not in ('yes', 'no', 'partially', 'unsure')
    or p_recovered not in ('yes', 'no', 'unsure')
    or (p_impact is not null and p_impact not in ('nothing', 'some', 'a_lot', 'unsure')) then
      raise exception 'invalid_answer';
    end if;
  elsif p_response is not null or p_recovered is not null or p_impact is not null then
    raise exception 'response_not_applicable';
  end if;

  -- On time = closed on the day's own date in the sprint's zone (PRD §9). Any later
  -- date is a backfill: it counts, it never repairs the streak (rule 18).
  update public.sprint_days
  set actual = p_actual,
      notes = nullif(btrim(p_notes), ''),
      closed_at = now(),
      closed_on_time = v_today <= v_day.date,
      highest_impediment_id = v_highest.id,
      proof_when = v_highest.proof_when,
      proof_then = v_highest.proof_then,
      proof_recover = v_highest.proof_recover,
      response = p_response,
      recovered = p_recovered,
      impact = p_impact
  where id = p_sprint_day_id;

  insert into public.day_impediment_observations (sprint_day_id, user_id, impediment_id, name, occurred, was_highest)
  select p_sprint_day_id, v_uid, o.item_id, o.name, coalesce(x.answer, 'unanswered'), coalesce(o.item_id = v_highest.id, false)
  from public.day_offered_items(p_sprint_day_id) o
  left join jsonb_to_recordset(v_imps) as x(item_id uuid, answer text) on x.item_id = o.item_id
  where o.kind = 'impediment';

  insert into public.day_cue_observations (sprint_day_id, user_id, cue_id, name, cue_when, used, was_focus)
  select p_sprint_day_id, v_uid, o.item_id, o.name, o.cue_when, coalesce(x.answer, 'unanswered'), o.is_focus
  from public.day_offered_items(p_sprint_day_id) o
  left join jsonb_to_recordset(v_cues) as x(item_id uuid, answer text) on x.item_id = o.item_id
  where o.kind = 'cue';

  return public.sprint_streak_at(v_day.sprint_id, now());
end
$$;

revoke all on function public.close_day(uuid, bigint, text, jsonb, jsonb, text, text, text) from public, anon;
grant execute on function public.close_day(uuid, bigint, text, jsonb, jsonb, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sprint_invalid_reason — the 0009 body plus `no_focus_cue`, placed after the cue
-- counts, so remove_sprint_item / archive_item / set_item_scope refuse the focus cue
-- through the one owner of "would this sprint become invalid".
-- ---------------------------------------------------------------------------
create or replace function public.sprint_invalid_reason(p_sprint_id uuid, p_kind text default null, p_exclude_item uuid default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cues int;
  v_imps int;
  v_highest record;
begin
  select count(*) into v_cues
  from public.sprint_cues
  where sprint_id = p_sprint_id and removed_at is null
    and not coalesce(p_kind = 'cue' and cue_id = p_exclude_item, false);
  if v_cues < 1 then return 'no_cues'; end if;
  if v_cues > 3 then return 'too_many_cues'; end if;
  if not exists (
    select 1 from public.sprint_cues
    where sprint_id = p_sprint_id and removed_at is null and is_focus
      and not coalesce(p_kind = 'cue' and cue_id = p_exclude_item, false)
  ) then return 'no_focus_cue'; end if;

  select count(*) into v_imps
  from public.sprint_impediments
  where sprint_id = p_sprint_id and removed_at is null
    and not coalesce(p_kind = 'impediment' and impediment_id = p_exclude_item, false);
  if v_imps < 1 then return 'no_impediments'; end if;
  if v_imps > 5 then return 'too_many_impediments'; end if;

  select i.proof_when, i.proof_then, i.proof_recover into v_highest
  from public.sprint_impediments m
  join public.impediments i on i.id = m.impediment_id
  where m.sprint_id = p_sprint_id and m.is_highest and m.removed_at is null
    and not coalesce(p_kind = 'impediment' and m.impediment_id = p_exclude_item, false);
  if not found then return 'no_highest_impediment'; end if;
  if v_highest.proof_when is null or v_highest.proof_then is null or v_highest.proof_recover is null then
    return 'proof_point_required';
  end if;

  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- set_focus_cue — moves the focus flag to another active member, atomically. The
-- sprint row is locked so two calls cannot race the partial unique index.
-- ---------------------------------------------------------------------------
create function public.set_focus_cue(p_sprint_id uuid, p_cue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_sprint record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id, status into v_sprint from public.sprints
  where id = p_sprint_id and user_id = v_uid for update;
  if v_sprint.id is null then raise exception 'sprint_not_found'; end if;
  if v_sprint.status <> 'active' then raise exception 'sprint_not_active'; end if;

  if not exists (
    select 1 from public.sprint_cues
    where sprint_id = p_sprint_id and cue_id = p_cue_id and removed_at is null
  ) then
    raise exception 'not_in_sprint';
  end if;

  update public.sprint_cues set is_focus = false
  where sprint_id = p_sprint_id and is_focus and cue_id <> p_cue_id;
  update public.sprint_cues set is_focus = true
  where sprint_id = p_sprint_id and cue_id = p_cue_id and removed_at is null;
end
$$;

revoke all on function public.set_focus_cue(uuid, uuid) from public, anon;
grant execute on function public.set_focus_cue(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- start_sprint — the 0009 body plus `p_focus_cue_id uuid` after
-- `p_highest_impediment_id`: it must be one of the cues, and the membership insert
-- writes the flag. The 0009 signature is dropped so there is one entry point.
-- ---------------------------------------------------------------------------
drop function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, text, text, text, text, bigint[], text[]);

create function public.start_sprint(
  p_area                   text,
  p_outcome                text,
  p_measurement            text,
  p_currency               text,
  p_unit                   text,
  p_amount                 bigint,
  p_confidence             int,
  p_why                    text,
  p_celebration            text,
  p_mantra                 text,
  p_usage_of_funds         jsonb,
  p_tz                     text,
  p_start_date             date,
  p_cue_ids                uuid[],
  p_impediment_ids         uuid[],
  p_highest_impediment_id  uuid,
  p_focus_cue_id           uuid,
  p_intention              text default null,
  p_proof_when             text default null,
  p_proof_then             text default null,
  p_proof_recover          text default null,
  p_targets                bigint[] default null,
  p_intentions             text[] default null
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
  v_cues    uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_cue_ids, '{}')) as x);
  v_imps    uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_impediment_ids, '{}')) as x);
  v_proof   record;
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

  -- Rule 11 at setup: a custom plan starts only when it already totals the goal.
  if p_targets is not null then
    perform public.validate_targets(p_measurement, p_amount, p_targets);
    v_targets := p_targets;
  else
    v_targets := public.same_daily_targets(p_amount, v_step);
  end if;

  -- Rules 3–4: 1–3 cues, 1–5 impediments; all owned, active and in scope.
  if cardinality(v_cues) < 1 then raise exception 'no_cues'; end if;
  if cardinality(v_cues) > 3 then raise exception 'too_many_cues'; end if;
  if cardinality(v_imps) < 1 then raise exception 'no_impediments'; end if;
  if cardinality(v_imps) > 5 then raise exception 'too_many_impediments'; end if;

  if (select count(*) from public.cues where id = any(v_cues) and user_id = v_uid) <> cardinality(v_cues) then
    raise exception 'item_not_found';
  end if;
  if exists (select 1 from public.cues where id = any(v_cues) and archived_at is not null) then
    raise exception 'item_archived';
  end if;
  if exists (select 1 from public.cues where id = any(v_cues) and scope not in ('global', p_area)) then
    raise exception 'item_out_of_scope';
  end if;
  -- F7: exactly one focus cue, among the sprint's cues.
  if p_focus_cue_id is null or not (p_focus_cue_id = any(v_cues)) then
    raise exception 'no_focus_cue';
  end if;

  if (select count(*) from public.impediments where id = any(v_imps) and user_id = v_uid) <> cardinality(v_imps) then
    raise exception 'item_not_found';
  end if;
  if exists (select 1 from public.impediments where id = any(v_imps) and archived_at is not null) then
    raise exception 'item_archived';
  end if;
  if exists (select 1 from public.impediments where id = any(v_imps) and scope not in ('global', p_area)) then
    raise exception 'item_out_of_scope';
  end if;

  -- Rules 5–6: a Highest Impediment among the selected, with a complete Proof Point
  -- (WHEN, THEN and RECOVERED WHEN).
  if p_highest_impediment_id is null or not (p_highest_impediment_id = any(v_imps)) then
    raise exception 'no_highest_impediment';
  end if;
  if nullif(btrim(p_proof_when), '') is not null
     or nullif(btrim(p_proof_then), '') is not null
     or nullif(btrim(p_proof_recover), '') is not null then
    update public.impediments
    set proof_when    = coalesce(nullif(btrim(p_proof_when), ''), proof_when),
        proof_then    = coalesce(nullif(btrim(p_proof_then), ''), proof_then),
        proof_recover = coalesce(nullif(btrim(p_proof_recover), ''), proof_recover)
    where id = p_highest_impediment_id;
  end if;
  select proof_when, proof_then, proof_recover into v_proof from public.impediments where id = p_highest_impediment_id;
  if v_proof.proof_when is null or v_proof.proof_then is null or v_proof.proof_recover is null then
    raise exception 'proof_point_required';
  end if;

  insert into public.sprints (
    user_id, vision_id, area, outcome, measurement, currency, unit, amount, confidence,
    why, celebration, mantra, usage_of_funds, target_mode, tz, start_date, end_date
  ) values (
    v_uid, v_vision, p_area, p_outcome, p_measurement, p_currency, p_unit, p_amount, p_confidence,
    p_why, p_celebration, p_mantra, coalesce(p_usage_of_funds, '[]'::jsonb),
    case when p_targets is null then 'same' else 'custom' end, p_tz,
    p_start_date, p_start_date + 13
  )
  returning id into v_sprint;

  insert into public.sprint_days (sprint_id, user_id, day_index, date, target, intention)
  select v_sprint, v_uid, i, p_start_date + (i - 1), v_targets[i],
         nullif(btrim(coalesce(p_intentions[i], case when i = 1 then p_intention end)), '')
  from generate_series(1, 14) as i;

  insert into public.sprint_cues (sprint_id, user_id, cue_id, is_focus)
  select v_sprint, v_uid, x, x = p_focus_cue_id from unnest(v_cues) as x;

  insert into public.sprint_impediments (sprint_id, user_id, impediment_id, is_highest)
  select v_sprint, v_uid, x, x = p_highest_impediment_id from unnest(v_imps) as x;

  return v_sprint;
exception
  when unique_violation then
    raise exception 'active_sprint_exists';
end
$$;

revoke all on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, text, bigint[], text[])
  from public, anon;
grant execute on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, text, bigint[], text[])
  to authenticated, service_role;
