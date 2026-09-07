-- 0009_libraries_v2 — F6: a cue is a WHEN → REMIND pair, an impediment's Proof Point
-- gains RECOVERED WHEN, and rule 6 / rule 22 cover all three parts.
--
-- Additive: two nullable text columns, no row touched. `cues.cue_when` stays nullable
-- by decision D5 (the WHEN requirement is enforced by every create path in the UI;
-- cues saved before this feature show a prompt until edited). `impediments.proof_recover`
-- is nullable like `proof_when` / `proof_then`: only the Highest Impediment of an
-- active sprint needs all three, and the functions below are what enforce that.
--
-- Every function redefined here is rebuilt from its latest definer — `start_sprint`
-- from 0005, `set_highest_impediment` and `sprint_invalid_reason` from 0008, the three
-- trigger functions from 0004 — and tests/db/libraries.test.ts pins one marker per body
-- that only that version carries, so a stale copy turns the suite red.
--
-- `sprint_days` is untouched: the day-row snapshot of RECOVERED WHEN lands with F7,
-- which rewrites `close_day` and its immutability trigger.

alter table public.cues        add column cue_when      text; -- private user text
alter table public.impediments add column proof_recover text; -- private user text

grant insert (cue_when),      update (cue_when)      on public.cues        to authenticated;
grant insert (proof_recover), update (proof_recover) on public.impediments to authenticated;

-- ---------------------------------------------------------------------------
-- library_item_usage — `used` (rule 19: has ever been a member of any sprint) and
-- `active` (a live membership in an active sprint) per library item, computed in
-- SQL so a page reads O(library) rows and never the membership history. RLS of the
-- underlying tables applies to the caller (security_invoker).
-- ---------------------------------------------------------------------------
create view public.library_item_usage
with (security_invoker = true)
as
select 'cue'::text as kind,
       c.id        as item_id,
       count(m.id) > 0 as used,
       coalesce(bool_or(m.removed_at is null and s.status = 'active'), false) as active
from public.cues c
left join public.sprint_cues m on m.cue_id = c.id
left join public.sprints s on s.id = m.sprint_id
group by c.id
union all
select 'impediment'::text,
       i.id,
       count(m.id) > 0,
       coalesce(bool_or(m.removed_at is null and s.status = 'active'), false)
from public.impediments i
left join public.sprint_impediments m on m.impediment_id = i.id
left join public.sprints s on s.id = m.sprint_id
group by i.id;

grant select on public.library_item_usage to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- library_item_before_insert — the 0004 body plus the two new columns.
-- ---------------------------------------------------------------------------
create or replace function public.library_item_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rank is null then
    execute format('select coalesce(max(rank), 0) + 1 from public.%I where user_id = $1', tg_table_name)
      into new.rank using new.user_id;
  end if;
  new.explanation := nullif(btrim(new.explanation), '');
  if tg_table_name = 'cues' then
    new.cue_when := nullif(btrim(new.cue_when), '');
  end if;
  if tg_table_name = 'impediments' then
    new.proof_when := nullif(btrim(new.proof_when), '');
    new.proof_then := nullif(btrim(new.proof_then), '');
    new.proof_recover := nullif(btrim(new.proof_recover), '');
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- cues_before_update — the 0004 body plus cue_when.
-- ---------------------------------------------------------------------------
create or replace function public.cues_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.explanation := nullif(btrim(new.explanation), '');
  new.cue_when := nullif(btrim(new.cue_when), '');
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- impediments_before_update — rule 22 extended to RECOVERED WHEN and narrowed to
-- proof edits: the trigger raises only when a proof column changed and any of the
-- three parts is null afterwards while the row is the Highest Impediment of an
-- active sprint. Rank and scope are not proof, so move_item and set_item_scope on a
-- pre-F6 highest whose recover is still null go through.
-- ---------------------------------------------------------------------------
create or replace function public.impediments_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.explanation := nullif(btrim(new.explanation), '');
  new.proof_when := nullif(btrim(new.proof_when), '');
  new.proof_then := nullif(btrim(new.proof_then), '');
  new.proof_recover := nullif(btrim(new.proof_recover), '');
  if (new.proof_when, new.proof_then, new.proof_recover)
       is distinct from (old.proof_when, old.proof_then, old.proof_recover)
     and (new.proof_when is null or new.proof_then is null or new.proof_recover is null)
     and exists (
       select 1
       from public.sprint_impediments m
       join public.sprints s on s.id = m.sprint_id
       where m.impediment_id = new.id and m.is_highest and m.removed_at is null and s.status = 'active'
     ) then
    raise exception 'proof_point_required';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- sprint_invalid_reason — the 0008 body (null-safe exclusion) plus the recover check,
-- so archive_item / set_item_scope report a highest that lacks RECOVERED WHEN.
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
-- set_highest_impediment — the 0008 body plus p_proof_recover. Each part that arrives
-- non-blank is written; a blank or null part keeps the column's current value
-- (coalesce), so a call passing only the recover completes a WHEN → THEN already on
-- the row. The proof check then reads the row, and a rejected call writes nothing.
-- The 0008 four-argument form is dropped: two overloads would make the RPC ambiguous.
-- ---------------------------------------------------------------------------
drop function public.set_highest_impediment(uuid, uuid, text, text);

create function public.set_highest_impediment(
  p_sprint_id uuid,
  p_impediment_id uuid,
  p_proof_when text default null,
  p_proof_then text default null,
  p_proof_recover text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_sprint record;
  v_proof  record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id, status into v_sprint from public.sprints
  where id = p_sprint_id and user_id = v_uid for update;
  if v_sprint.id is null then raise exception 'sprint_not_found'; end if;
  if v_sprint.status <> 'active' then raise exception 'sprint_not_active'; end if;

  if not exists (
    select 1 from public.sprint_impediments
    where sprint_id = p_sprint_id and impediment_id = p_impediment_id and removed_at is null
  ) then raise exception 'not_in_sprint'; end if;

  if nullif(btrim(p_proof_when), '') is not null
     or nullif(btrim(p_proof_then), '') is not null
     or nullif(btrim(p_proof_recover), '') is not null then
    update public.impediments
    set proof_when    = coalesce(nullif(btrim(p_proof_when), ''), proof_when),
        proof_then    = coalesce(nullif(btrim(p_proof_then), ''), proof_then),
        proof_recover = coalesce(nullif(btrim(p_proof_recover), ''), proof_recover)
    where id = p_impediment_id and user_id = v_uid;
    if not found then raise exception 'item_not_found'; end if;
  end if;

  select i.proof_when, i.proof_then, i.proof_recover into v_proof
  from public.impediments i
  where i.id = p_impediment_id;
  if v_proof.proof_when is null or v_proof.proof_then is null or v_proof.proof_recover is null then
    raise exception 'proof_point_required';
  end if;

  update public.sprint_impediments set is_highest = false
  where sprint_id = p_sprint_id and is_highest and impediment_id <> p_impediment_id;
  update public.sprint_impediments set is_highest = true
  where sprint_id = p_sprint_id and impediment_id = p_impediment_id and removed_at is null;
end
$$;

revoke all on function public.set_highest_impediment(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.set_highest_impediment(uuid, uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- start_sprint — the 0005 body plus `p_proof_recover text default null` after
-- `p_proof_then`. The inline-proof write fires when any of the three parts is
-- non-blank and coalesces per column; rule 6 then requires all three on the highest.
-- The 0005 signature is dropped so there is one entry point.
-- ---------------------------------------------------------------------------
drop function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, text, text, text, bigint[], text[]);

create or replace function public.start_sprint(
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

  insert into public.sprint_cues (sprint_id, user_id, cue_id)
  select v_sprint, v_uid, x from unnest(v_cues) as x;

  insert into public.sprint_impediments (sprint_id, user_id, impediment_id, is_highest)
  select v_sprint, v_uid, x, x = p_highest_impediment_id from unnest(v_imps) as x;

  return v_sprint;
exception
  when unique_violation then
    raise exception 'active_sprint_exists';
end
$$;

revoke all on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, text, text, text, text, bigint[], text[])
  from public, anon;
grant execute on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, text, text, text, text, bigint[], text[])
  to authenticated, service_role;
