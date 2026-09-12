-- 0020_vision_v3 — F16: the Vision in three steps that each save something real.
--
-- Step 1 "Visualize one year from today" is one saved text (`visions.picture`) and
-- creates the row. Step 2 "Define your one-year goal" is the goal (`body`), the
-- observable proof (`proof`), a confidence 0–10 (`confidence`) and, at 6 or below, the
-- main reason (`confidence_reason`); the deadline is no longer typed — it is set to
-- twelve months from the first goal save and never by the user. Step 3 "Plan for your
-- main obstacle" picks or names a global impediment and writes WHEN (its `name`, F15) →
-- THEN → RECOVERED WHEN in one call. A sprint now needs all three steps
-- (`vision_incomplete`), not the vision text alone (DECISIONS 2026-09-08 reversed,
-- DECISIONS 2026-09-12 F16).
--
-- Data-transforming on a live project (hosted rows are few since the 2026-09-12 wipe,
-- treated as production): `visions.meaning`, `visions.baseline` and
-- `impediments.explanation` (INTERFERES) are dropped at the owner's explicit call — their
-- values do not survive the push; the dump taken before `db push` is the only copy.
-- Existing visions keep body / proof / deadline / obstacle; picture, confidence and
-- reason start null and the UI computes the step count. `body` and `deadline` become
-- nullable (a step-1 row has neither); `visions_body_check` is restated to allow null
-- and still reject blank. An assertion at the end refuses to commit a schema or a row
-- set that does not match.
--
-- Write path: `save_vision(text,date,text,text,text)`, `set_vision_obstacle(uuid,text,text)`
-- and `set_vision_rule(text,text,text)` are dropped (PostgREST resolves by named
-- arguments, FIX_LOG 2026-09-07) and replaced by `save_vision_picture`, `save_vision_goal`
-- and the atomic `set_vision_obstacle(uuid,text,text,text)`. `replace_vision` and
-- `review_vision` are unchanged; the `vision_obstacle` guards in `archive_item` /
-- `set_item_scope` are unchanged.
--
-- Every function redefined here is rebuilt from its latest definer — `start_sprint`,
-- `library_item_before_insert`, `impediments_before_update` and `day_offered_items` from
-- 0019 (`day_offered_items` keeps its return type: the impediment branch selects
-- `null::text` for explanation, so no drop / re-grant) — and tests/db/libraries.test.ts
-- pins one marker per body. `cues_before_update` (0009) is NOT touched: cues keep their
-- explanation (their optional NOTE).

-- ---------------------------------------------------------------------------
-- 1. The old entry points go first, so no function body names a column that is
-- about to vanish and PostgREST has exactly one `set_vision_obstacle`.
-- ---------------------------------------------------------------------------
drop function public.save_vision(text, date, text, text, text);
drop function public.set_vision_obstacle(uuid, text, text);
drop function public.set_vision_rule(text, text, text);

-- ---------------------------------------------------------------------------
-- 2. visions: the new columns (named constraints — an auto-named CHECK failed reset in
-- F15), body and deadline nullable, the two optional prompts dropped.
-- ---------------------------------------------------------------------------
alter table public.visions
  add column picture           text,                                    -- private user text
  add column confidence        smallint,
  add column confidence_reason text,                                    -- private user text
  add constraint visions_confidence_check check (confidence between 0 and 10),
  add constraint visions_confidence_reason_check check (confidence_reason is null or confidence <= 6);

alter table public.visions alter column body drop not null;
alter table public.visions drop constraint visions_body_check;
alter table public.visions add constraint visions_body_check check (body is null or btrim(body) <> '');
alter table public.visions alter column deadline drop not null;

-- The owner's call (DECISIONS 2026-09-12 F16): the values do not survive.
alter table public.visions drop column meaning, drop column baseline;

-- ---------------------------------------------------------------------------
-- 3. The bodies that read impediments.explanation, rebuilt before the column goes.
-- library_item_before_insert — the 0019 body; the explanation trim now runs for cues
-- only (the trigger is attached to both tables, 0004).
-- impediments_before_update — the 0019 body without the explanation line.
-- day_offered_items — the 0019 body; a SQL-language function is checked against the
-- catalog when created, so it is rebuilt here, with `null::text` for the impediment's
-- explanation and the cue's kept. Same return type: `create or replace`, grants survive.
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
  if tg_table_name = 'cues' then
    new.explanation := nullif(btrim(new.explanation), '');
    new.cue_when := nullif(btrim(new.cue_when), '');
  end if;
  if tg_table_name = 'impediments' then
    new.proof_then := nullif(btrim(new.proof_then), '');
    new.proof_recover := nullif(btrim(new.proof_recover), '');
  end if;
  return new;
end
$$;

create or replace function public.impediments_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.proof_then := nullif(btrim(new.proof_then), '');
  new.proof_recover := nullif(btrim(new.proof_recover), '');
  if (new.proof_then, new.proof_recover) is distinct from (old.proof_then, old.proof_recover)
     and (new.proof_then is null or new.proof_recover is null)
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

create or replace function public.day_offered_items(p_sprint_day_id uuid)
returns table (kind text, item_id uuid, name text, explanation text, cue_when text, proof_then text, proof_recover text, is_focus boolean, rank integer, situations jsonb)
language sql
stable
set search_path = ''
as $$
  select distinct on (kind, item_id) *
  from (
    select 'impediment'::text as kind, i.id as item_id, i.name, null::text as explanation, null::text as cue_when,
           i.proof_then, i.proof_recover, false as is_focus, i.rank,
           coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'rank', t.rank) order by t.rank, t.id)
                     from public.impediment_situations a join public.situations t on t.id = a.situation_id
                     where a.impediment_id = i.id and t.archived_at is null), '[]'::jsonb) as situations
    from public.sprint_days d
    join public.sprints s on s.id = d.sprint_id
    join public.sprint_impediments m on m.sprint_id = s.id
    join public.impediments i on i.id = m.impediment_id
    where d.id = p_sprint_day_id
      and (m.added_at at time zone s.tz)::date <= d.date
      and (m.removed_at is null or (m.removed_at at time zone s.tz)::date >= d.date)
    union all
    select 'cue', c.id, c.name, c.explanation, c.cue_when, null, null, m.is_focus, c.rank,
           coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'rank', t.rank) order by t.rank, t.id)
                     from public.cue_situations a join public.situations t on t.id = a.situation_id
                     where a.cue_id = c.id and t.archived_at is null), '[]'::jsonb)
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

-- ---------------------------------------------------------------------------
-- 4. INTERFERES goes; the column grant (0004) goes with the column. cues.explanation stays.
-- ---------------------------------------------------------------------------
alter table public.impediments drop column explanation;

-- ---------------------------------------------------------------------------
-- 5. save_vision_picture — step 1. Inserts the active vision or edits its picture in
-- place (same id, same created_at); touches nothing else.
-- ---------------------------------------------------------------------------
create function public.save_vision_picture(p_picture text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_id      uuid;
  v_picture text := nullif(btrim(p_picture), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_picture is null then raise exception 'vision_picture_required'; end if;

  insert into public.visions (user_id, picture)
  values (v_uid, v_picture)
  on conflict (user_id) where archived_at is null do update
    set picture = excluded.picture
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- save_vision_goal — step 2. Needs the step-1 row. Writes the goal, the proof, the
-- confidence and (at 6 or below) the reason; a reason above 6 is dropped, not refused,
-- because the UI hides the box there. The deadline is set once, twelve months from
-- the first goal save in the database's date (UTC), and never overwritten.
-- ---------------------------------------------------------------------------
create function public.save_vision_goal(p_body text, p_proof text, p_confidence int, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_body   text := nullif(btrim(p_body), '');
  v_proof  text := nullif(btrim(p_proof), '');
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id into v_id from public.visions where user_id = v_uid and archived_at is null for update;
  if v_id is null then raise exception 'no_active_vision'; end if;

  if v_body is null then raise exception 'vision_body_required'; end if;
  if v_proof is null then raise exception 'vision_proof_required'; end if;
  if p_confidence is null or p_confidence < 0 or p_confidence > 10 then raise exception 'confidence_out_of_range'; end if;
  if p_confidence <= 6 and v_reason is null then raise exception 'confidence_reason_required'; end if;
  if p_confidence > 6 then v_reason := null; end if;

  update public.visions
  set body              = v_body,
      proof             = v_proof,
      confidence        = p_confidence,
      confidence_reason = v_reason,
      deadline          = coalesce(deadline, (current_date + interval '12 months')::date)
  where id = v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- set_vision_obstacle — step 3, atomic. A pick (the caller's, unarchived, global) is
-- renamed to WHEN and gets THEN + RECOVERED WHEN; no pick inserts a global impediment
-- with the three parts. Any blank part is refused before anything is written. No
-- parameter defaults: a dropped key fails at PostgREST resolution instead of becoming
-- null silently (FIX_LOG 2026-09-07).
-- ---------------------------------------------------------------------------
create function public.set_vision_obstacle(p_impediment_id uuid, p_when text, p_then text, p_recover text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_vision  uuid;
  v_imp     uuid;
  v_when    text := nullif(btrim(p_when), '');
  v_then    text := nullif(btrim(p_then), '');
  v_recover text := nullif(btrim(p_recover), '');
  v_row     record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id into v_vision from public.visions where user_id = v_uid and archived_at is null for update;
  if v_vision is null then raise exception 'no_active_vision'; end if;
  if v_when is null or v_then is null or v_recover is null then raise exception 'rule_incomplete'; end if;

  if p_impediment_id is not null then
    select scope, archived_at into v_row from public.impediments where id = p_impediment_id and user_id = v_uid for update;
    if not found then raise exception 'item_not_found'; end if;
    if v_row.archived_at is not null then raise exception 'item_archived'; end if;
    if v_row.scope <> 'global' then raise exception 'obstacle_not_global'; end if;
    update public.impediments
    set name = v_when, proof_then = v_then, proof_recover = v_recover
    where id = p_impediment_id;
    v_imp := p_impediment_id;
  else
    insert into public.impediments (user_id, name, scope, proof_then, proof_recover)
    values (v_uid, v_when, 'global', v_then, v_recover)
    returning id into v_imp;
  end if;

  update public.visions set obstacle_id = v_imp where id = v_vision;
  return v_imp;
end
$$;

-- ---------------------------------------------------------------------------
-- start_sprint — the 0019 body; the vision lookup now joins the obstacle and refuses
-- `vision_incomplete` unless all three steps are saved (picture, goal, obstacle with
-- THEN + RECOVERED WHEN). Same signature: `create or replace`, grants restated.
-- ---------------------------------------------------------------------------
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
  p_focus_cue_id           uuid,
  p_intention              text default null,
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
  v_vision  record;
  v_sprint  uuid;
  v_today   date;
  v_step    bigint;
  v_targets bigint[];
  v_cues    uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_cue_ids, '{}')) as x);
  v_imps    uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_impediment_ids, '{}')) as x);
  v_focus   uuid := p_focus_cue_id;
  v_highest uuid := p_highest_impediment_id;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select v.id, v.picture, v.body, v.obstacle_id, i.proof_then, i.proof_recover
  into v_vision
  from public.visions v
  left join public.impediments i on i.id = v.obstacle_id
  where v.user_id = v_uid and v.archived_at is null;
  if v_vision.id is null then
    raise exception 'no_active_vision';
  end if;
  -- F16: all three steps unlock the sprints.
  if v_vision.picture is null or v_vision.body is null or v_vision.obstacle_id is null
     or nullif(btrim(v_vision.proof_then), '') is null or nullif(btrim(v_vision.proof_recover), '') is null then
    raise exception 'vision_incomplete';
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

  -- Rule 26 (F10): a finished sprint in this Area blocks the next one until its
  -- postmortem is written.
  if exists (
    select 1 from public.sprints s
    where s.user_id = v_uid and s.area = p_area and s.status <> 'active'
      and not exists (select 1 from public.reviews r where r.sprint_id = s.id)
      -- A sprint that never closed a day has nothing to review (2026-09-09 review, #25).
      and exists (select 1 from public.sprint_days d where d.sprint_id = s.id and d.closed_at is not null)
  ) then
    raise exception 'review_required';
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

  -- Rules 3–4 (F15): 0–3 cues, 1–3 impediments; all owned, active and in scope.
  if cardinality(v_cues) > 3 then raise exception 'too_many_cues'; end if;
  if cardinality(v_imps) < 1 then raise exception 'no_impediments'; end if;
  if cardinality(v_imps) > 3 then raise exception 'too_many_impediments'; end if;

  if (select count(*) from public.cues where id = any(v_cues) and user_id = v_uid) <> cardinality(v_cues) then
    raise exception 'item_not_found';
  end if;
  if exists (select 1 from public.cues where id = any(v_cues) and archived_at is not null) then
    raise exception 'item_archived';
  end if;
  if exists (select 1 from public.cues where id = any(v_cues) and scope not in ('global', p_area)) then
    raise exception 'item_out_of_scope';
  end if;
  -- F7 / F15: a focus cue while the sprint has cues; the only cue is the focus by default.
  if cardinality(v_cues) = 1 and v_focus is null then v_focus := v_cues[1]; end if;
  if cardinality(v_cues) >= 1 and (v_focus is null or not (v_focus = any(v_cues))) then
    raise exception 'no_focus_cue';
  end if;
  if cardinality(v_cues) = 0 then v_focus := null; end if;

  if (select count(*) from public.impediments where id = any(v_imps) and user_id = v_uid) <> cardinality(v_imps) then
    raise exception 'item_not_found';
  end if;
  if exists (select 1 from public.impediments where id = any(v_imps) and archived_at is not null) then
    raise exception 'item_archived';
  end if;
  if exists (select 1 from public.impediments where id = any(v_imps) and scope not in ('global', p_area)) then
    raise exception 'item_out_of_scope';
  end if;

  -- F15: every member applies to at least one live situation.
  if exists (
    select 1 from unnest(v_cues) as c(id)
    where not exists (select 1 from public.cue_situations a join public.situations t on t.id = a.situation_id
                      where a.cue_id = c.id and t.archived_at is null)
  ) or exists (
    select 1 from unnest(v_imps) as i(id)
    where not exists (select 1 from public.impediment_situations a join public.situations t on t.id = a.situation_id
                      where a.impediment_id = i.id and t.archived_at is null)
  ) then
    raise exception 'no_situations';
  end if;

  -- Rules 5–6 (F15): a Highest among the selected (the only impediment by default) and a
  -- THEN + RECOVERED WHEN on every selected impediment; the inline parts complete the
  -- Highest's.
  if cardinality(v_imps) = 1 and v_highest is null then v_highest := v_imps[1]; end if;
  if v_highest is null or not (v_highest = any(v_imps)) then
    raise exception 'no_highest_impediment';
  end if;
  if nullif(btrim(p_proof_then), '') is not null
     or nullif(btrim(p_proof_recover), '') is not null then
    update public.impediments
    set proof_then    = coalesce(nullif(btrim(p_proof_then), ''), proof_then),
        proof_recover = coalesce(nullif(btrim(p_proof_recover), ''), proof_recover)
    where id = v_highest;
  end if;
  if exists (
    select 1 from public.impediments
    where id = any(v_imps) and (proof_then is null or proof_recover is null)
  ) then
    raise exception 'proof_point_required';
  end if;

  insert into public.sprints (
    user_id, vision_id, area, outcome, measurement, currency, unit, amount, confidence,
    why, celebration, mantra, usage_of_funds, target_mode, tz, start_date, end_date
  ) values (
    v_uid, v_vision.id, p_area, p_outcome, p_measurement, p_currency, p_unit, p_amount, p_confidence,
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
  select v_sprint, v_uid, x, x = v_focus from unnest(v_cues) as x;

  insert into public.sprint_impediments (sprint_id, user_id, impediment_id, is_highest)
  select v_sprint, v_uid, x, x = v_highest from unnest(v_imps) as x;

  return v_sprint;
exception
  when unique_violation then
    raise exception 'active_sprint_exists';
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Privileges: nothing callable by anon or PUBLIC (the 0013 lesson).
-- ---------------------------------------------------------------------------
revoke all on function public.save_vision_picture(text) from public, anon;
revoke all on function public.save_vision_goal(text, text, int, text) from public, anon;
revoke all on function public.set_vision_obstacle(uuid, text, text, text) from public, anon;
revoke all on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, bigint[], text[])
  from public, anon;

grant execute on function public.save_vision_picture(text) to authenticated, service_role;
grant execute on function public.save_vision_goal(text, text, int, text) to authenticated, service_role;
grant execute on function public.set_vision_obstacle(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, bigint[], text[])
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. The assertion: refuse to commit a schema or a row set that does not match.
-- tests/db/vision.test.ts runs this block on its own and proves every branch can fail.
-- ---------------------------------------------------------------------------
-- assert:begin
do $$
declare
  v_cols text;
  v_n    int;
begin
  select string_agg(column_name, ',' order by column_name) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'visions';
  if v_cols <> 'archived_at,body,confidence,confidence_reason,created_at,deadline,id,obstacle_id,picture,proof,updated_at,user_id' then
    raise exception 'schema_unexpected: visions columns are %', v_cols;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'impediments' and column_name = 'explanation') then
    raise exception 'schema_unexpected: impediments.explanation still present';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'cues' and column_name = 'explanation') then
    raise exception 'schema_unexpected: cues.explanation missing';
  end if;
  -- A row is created by step 1 (picture) or pre-dates 0020 (body); never neither.
  select count(*) into v_n from public.visions where body is null and picture is null;
  if v_n > 0 then
    raise exception 'data_unexpected: % vision rows with neither picture nor goal', v_n;
  end if;
  if exists (select 1 from public.visions where confidence_reason is not null and (confidence is null or confidence > 6)) then
    raise exception 'data_unexpected: a reason without a low confidence';
  end if;
end
$$;
-- assert:end
