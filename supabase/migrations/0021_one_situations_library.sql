-- 0021_one_situations_library — F17: one situations library, a real delete, and two
-- columns the owner dropped (DECISIONS 2026-09-12 F17; docs/SPEC.md F17).
--
-- Situations lose their `kind` axis: one list per user, ranked once, attachable to a
-- cue and an impediment alike (F15 call 1 reversed through its own re-open clause). The
-- two composite FKs and the `situation_kind` anchors go; a plain FK guards each join
-- table; ranks are renumbered per user — impediment situations first, each list in
-- its old order (the tie rule is written on the UPDATE below). Same-name rows across
-- the two old kinds are NOT merged: repointing immutable observation rows is not worth
-- the risk on a blank hosted app, and the new Delete lets the owner drop one.
--
-- Delete: the RLS DELETE policy and grant go; every delete runs through
-- `delete_situation`, which detaches and deletes, ARCHIVES instead when a closed day
-- ever asked about the situation (the global no-delete rule for history rows), and
-- refuses (`no_situations`, the archive_item shape) when an item in an active sprint
-- would be left without one.
--
-- Data-transforming on a live project, at the owner's explicit call (the second, so the
-- global "archive, never delete" rule yields as it did for F16): `sprints.why` (written
-- once by the wizard, never read anywhere) and `cues.explanation` (the cue's NOTE) are
-- dropped. Their hosted values do not survive the push; the dump taken before `db push`
-- is the only copy. The notice at the top puts the counts in the push log.
--
-- Every function redefined here is rebuilt from its latest definer:
--   situations_before_insert   0019 (without the kind filter)
--   set_item_situations        0019 (without `and kind = p_kind`)
--   move_item                  0019 (situation branch without v_kind)
--   cues_before_update         0009 (without the explanation trim)
--   library_item_before_insert 0020 (cues branch without the explanation trim)
--   day_offered_items          0020 (return type without `explanation`: drop + recreate)
--   start_sprint               0020 (without p_why / p_intentions: 22 → 20 arguments,
--                              drop + recreate; day-1 `p_intention` kept)
-- New: create_situations(text[], text), delete_situation(uuid).
-- tests/db/libraries.test.ts pins one marker per body; tests/db/vision.test.ts runs the
-- assertion block at the end on its own.

-- ---------------------------------------------------------------------------
-- 0. What the push erases, in the log next to the dump.
-- ---------------------------------------------------------------------------
do $$
declare
  v_why   int;
  v_notes int;
begin
  select count(*) into v_why from public.sprints where btrim(coalesce(why, '')) <> '';
  select count(*) into v_notes from public.cues where explanation is not null;
  raise notice '0021: dropping sprints.why (% rows carry one) and cues.explanation (% rows carry one); the pre-push dump is the only copy', v_why, v_notes;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Situations become one list. Dependency order: the composite FKs depend on the
-- (id, kind) unique constraint, so they go first; the anchors next; a plain FK per
-- join table; then the unique, the index, the renumbering, and the column.
-- ---------------------------------------------------------------------------
alter table public.impediment_situations drop constraint impediment_situations_situation_id_situation_kind_fkey;
alter table public.cue_situations        drop constraint cue_situations_situation_id_situation_kind_fkey;

alter table public.impediment_situations drop column situation_kind;
alter table public.cue_situations        drop column situation_kind;

-- NO ACTION like the observation tables: a referenced situation is not deletable behind
-- delete_situation's back.
alter table public.impediment_situations
  add constraint impediment_situations_situation_id_fkey foreign key (situation_id) references public.situations (id);
alter table public.cue_situations
  add constraint cue_situations_situation_id_fkey foreign key (situation_id) references public.situations (id);

alter table public.situations drop constraint situations_id_kind_key;

drop index public.situations_user_id_kind_rank_idx;
create index situations_user_id_rank_idx on public.situations (user_id, rank);

-- Renumber: one sequence per user. Impediment situations first (every sprint needs an
-- impediment; cues are optional), each list keeping its own order, ties by creation.
with ranked as (
  select id,
         row_number() over (partition by user_id order by (kind = 'impediment') desc, rank, created_at, id) as rn
  from public.situations
)
update public.situations s
set rank = r.rn
from ranked r
where r.id = s.id and s.rank <> r.rn;

-- The check constraint and the INSERT column grant (0019) go with the column.
alter table public.situations drop column kind;

create or replace function public.situations_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rank is null then
    select coalesce(max(rank), 0) + 1 into new.rank
    from public.situations where user_id = new.user_id;
  end if;
  new.name := btrim(new.name);
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Every delete goes through delete_situation (below): the direct path closes.
-- ---------------------------------------------------------------------------
drop policy situations_delete on public.situations;
revoke delete on public.situations from authenticated;

-- ---------------------------------------------------------------------------
-- 3. The cue NOTE. The two triggers stop trimming it; day_offered_items loses the
-- output column (a return-type change: drop, then recreate after the column is gone —
-- a SQL-language body is catalog-checked at creation); then the column goes.
-- ---------------------------------------------------------------------------
create or replace function public.cues_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cue_when := nullif(btrim(new.cue_when), '');
  return new;
end
$$;

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
    new.cue_when := nullif(btrim(new.cue_when), '');
  end if;
  if tg_table_name = 'impediments' then
    new.proof_then := nullif(btrim(new.proof_then), '');
    new.proof_recover := nullif(btrim(new.proof_recover), '');
  end if;
  return new;
end
$$;

drop function public.day_offered_items(uuid);

alter table public.cues drop column explanation;

create function public.day_offered_items(p_sprint_day_id uuid)
returns table (kind text, item_id uuid, name text, cue_when text, proof_then text, proof_recover text, is_focus boolean, rank integer, situations jsonb)
language sql
stable
set search_path = ''
as $$
  select distinct on (kind, item_id) *
  from (
    select 'impediment'::text as kind, i.id as item_id, i.name, null::text as cue_when,
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
    select 'cue', c.id, c.name, c.cue_when, null, null, m.is_focus, c.rank,
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

revoke all on function public.day_offered_items(uuid) from public, anon;
grant execute on function public.day_offered_items(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. "Why this sprint matters" and the days 2–14 pre-planning leave start_sprint; the
-- 22-argument form is dropped so PostgREST resolves exactly one. The 0020 body
-- otherwise unchanged: the F16 gate, rules 3–6 (F15), the day rows from p_targets or
-- the even split, day 1's intention from p_intention.
-- ---------------------------------------------------------------------------
drop function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, bigint[], text[]);

create function public.start_sprint(
  p_area                   text,
  p_outcome                text,
  p_measurement            text,
  p_currency               text,
  p_unit                   text,
  p_amount                 bigint,
  p_confidence             int,
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
  p_targets                bigint[] default null
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
    celebration, mantra, usage_of_funds, target_mode, tz, start_date, end_date
  ) values (
    v_uid, v_vision.id, p_area, p_outcome, p_measurement, p_currency, p_unit, p_amount, p_confidence,
    p_celebration, p_mantra, coalesce(p_usage_of_funds, '[]'::jsonb),
    case when p_targets is null then 'same' else 'custom' end, p_tz,
    p_start_date, p_start_date + 13
  )
  returning id into v_sprint;

  -- F17: day 1 may carry an intention from the wizard's day-1 box; days 2–14 start blank
  -- (the pre-planning left with the wizard).
  insert into public.sprint_days (sprint_id, user_id, day_index, date, target, intention)
  select v_sprint, v_uid, i, p_start_date + (i - 1), v_targets[i],
         case when i = 1 then nullif(btrim(p_intention), '') end
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

revoke all on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, bigint[])
  from public, anon;
grant execute on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, bigint[])
  to authenticated, service_role;

-- The check constraint goes with the column.
alter table public.sprints drop column why;

-- ---------------------------------------------------------------------------
-- 5. set_item_situations — the 0019 body without the kind filter: one situation may
-- apply to a cue and an impediment at once. `situation_not_found` still covers a
-- stranger's row; `no_situations` still guards a live member of an active sprint.
-- ---------------------------------------------------------------------------
create or replace function public.set_item_situations(p_kind text, p_item_id uuid, p_situation_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_situation_ids, '{}')) as x);
  v_live int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('cue', 'impediment') then raise exception 'invalid_kind'; end if;

  if p_kind = 'cue' then
    perform 1 from public.cues where id = p_item_id and user_id = v_uid for update;
  else
    perform 1 from public.impediments where id = p_item_id and user_id = v_uid for update;
  end if;
  if not found then raise exception 'item_not_found'; end if;

  if (select count(*) from public.situations where id = any(v_ids) and user_id = v_uid) <> cardinality(v_ids) then
    raise exception 'situation_not_found';
  end if;
  if exists (select 1 from public.situations where id = any(v_ids) and archived_at is not null) then
    raise exception 'situation_archived';
  end if;

  v_live := cardinality(v_ids);
  if v_live = 0 and (
    (p_kind = 'cue' and exists (
      select 1 from public.sprint_cues m join public.sprints s on s.id = m.sprint_id
      where m.cue_id = p_item_id and m.removed_at is null and s.status = 'active'))
    or (p_kind = 'impediment' and exists (
      select 1 from public.sprint_impediments m join public.sprints s on s.id = m.sprint_id
      where m.impediment_id = p_item_id and m.removed_at is null and s.status = 'active'))
  ) then
    raise exception 'no_situations';
  end if;

  if p_kind = 'cue' then
    delete from public.cue_situations where cue_id = p_item_id and not (situation_id = any(v_ids));
    insert into public.cue_situations (user_id, cue_id, situation_id)
    select v_uid, p_item_id, x from unnest(v_ids) as x
    on conflict (cue_id, situation_id) do nothing;
  else
    delete from public.impediment_situations where impediment_id = p_item_id and not (situation_id = any(v_ids));
    insert into public.impediment_situations (user_id, impediment_id, situation_id)
    select v_uid, p_item_id, x from unnest(v_ids) as x
    on conflict (impediment_id, situation_id) do nothing;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. move_item — the 0019 body; the situation branch no longer filters neighbours by
-- kind (there is one list). Cue and impediment branches unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.move_item(p_kind text, p_item_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_rank     integer;
  v_other_id uuid;
  v_other    integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('cue', 'impediment', 'situation') then raise exception 'invalid_kind'; end if;
  if p_direction not in ('up', 'down') then raise exception 'invalid_direction'; end if;

  if p_kind = 'cue' then
    select rank into v_rank from public.cues where id = p_item_id and user_id = v_uid and archived_at is null for update;
    if v_rank is null then raise exception 'item_not_found'; end if;
    if p_direction = 'up' then
      select id, rank into v_other_id, v_other from public.cues
      where user_id = v_uid and archived_at is null and (rank, id) < (v_rank, p_item_id)
      order by rank desc, id desc limit 1 for update;
    else
      select id, rank into v_other_id, v_other from public.cues
      where user_id = v_uid and archived_at is null and (rank, id) > (v_rank, p_item_id)
      order by rank asc, id asc limit 1 for update;
    end if;
    if v_other_id is null then return; end if;
    if v_other = v_rank then
      -- Equal ranks (concurrent inserts): give the pair distinct ranks in the new order.
      if p_direction = 'up' then v_other := v_rank + 1; else v_rank := v_other + 1; end if;
    end if;
    update public.cues set rank = case id when p_item_id then v_other else v_rank end where id in (p_item_id, v_other_id);
  elsif p_kind = 'impediment' then
    select rank into v_rank from public.impediments where id = p_item_id and user_id = v_uid and archived_at is null for update;
    if v_rank is null then raise exception 'item_not_found'; end if;
    if p_direction = 'up' then
      select id, rank into v_other_id, v_other from public.impediments
      where user_id = v_uid and archived_at is null and (rank, id) < (v_rank, p_item_id)
      order by rank desc, id desc limit 1 for update;
    else
      select id, rank into v_other_id, v_other from public.impediments
      where user_id = v_uid and archived_at is null and (rank, id) > (v_rank, p_item_id)
      order by rank asc, id asc limit 1 for update;
    end if;
    if v_other_id is null then return; end if;
    if v_other = v_rank then
      if p_direction = 'up' then v_other := v_rank + 1; else v_rank := v_other + 1; end if;
    end if;
    update public.impediments set rank = case id when p_item_id then v_other else v_rank end where id in (p_item_id, v_other_id);
  else
    select rank into v_rank from public.situations where id = p_item_id and user_id = v_uid and archived_at is null for update;
    if v_rank is null then raise exception 'item_not_found'; end if;
    if p_direction = 'up' then
      select id, rank into v_other_id, v_other from public.situations
      where user_id = v_uid and archived_at is null and (rank, id) < (v_rank, p_item_id)
      order by rank desc, id desc limit 1 for update;
    else
      select id, rank into v_other_id, v_other from public.situations
      where user_id = v_uid and archived_at is null and (rank, id) > (v_rank, p_item_id)
      order by rank asc, id asc limit 1 for update;
    end if;
    if v_other_id is null then return; end if;
    if v_other = v_rank then
      if p_direction = 'up' then v_other := v_rank + 1; else v_rank := v_other + 1; end if;
    end if;
    update public.situations set rank = case id when p_item_id then v_other else v_rank end where id in (p_item_id, v_other_id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. create_situations — a dictated list lands as rows in the order it was spoken. A
-- multi-row INSERT cannot do that: the BEFORE trigger's max(rank) never sees its
-- sibling rows, so every row would get the same rank. Names are trimmed, blanks
-- dropped, duplicates within the list skipped (case-insensitive), a live same-name row
-- reused rather than duplicated (a dictated list repeats what the user already has),
-- the rest inserted at max(rank) + position under the user's row lock. Returns the ids
-- in input order, one per surviving name.
-- ---------------------------------------------------------------------------
create function public.create_situations(p_names text[], p_scope text default 'global')
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_max  int;
  v_out  uuid[] := '{}';
  v_seen text[] := '{}';
  v_key  text;
  v_id   uuid;
  r      record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_scope is null or p_scope not in ('global', 'health', 'wealth', 'relationships') then
    raise exception 'invalid_scope';
  end if;

  perform 1 from public.situations where user_id = v_uid for update;
  select coalesce(max(rank), 0) into v_max from public.situations where user_id = v_uid;

  for r in
    select btrim(regexp_replace(coalesce(n, ''), '\s+', ' ', 'g')) as name, ord
    from unnest(coalesce(p_names, '{}')) with ordinality as t(n, ord)
    order by ord
  loop
    if r.name = '' then continue; end if;
    v_key := lower(r.name);
    if v_key = any(v_seen) then continue; end if;
    v_seen := v_seen || v_key;

    select id into v_id from public.situations
    where user_id = v_uid and archived_at is null and lower(name) = v_key
    order by rank, id limit 1;
    if v_id is null then
      v_max := v_max + 1;
      insert into public.situations (user_id, name, scope, rank)
      values (v_uid, r.name, p_scope, v_max)
      returning id into v_id;
    end if;
    v_out := v_out || v_id;
  end loop;
  return v_out;
end
$$;

revoke all on function public.create_situations(text[], text) from public, anon;
grant execute on function public.create_situations(text[], text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. delete_situation — the one delete path. Own row, else item_not_found. An active
-- sprint whose member would be left without a live situation refuses in the
-- archive_item shape ({ok:false, failing:[{…, reason:'no_situations'}]}). A situation a
-- closed day ever asked about is archived instead (attachments kept, so restore_item
-- brings it back as it was) — history is never deleted. Otherwise the attachments and
-- the row go. `detached_from` names the items it applied to, for the confirmation line.
-- ---------------------------------------------------------------------------
create function public.delete_situation(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_check jsonb;
  v_names jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select user_id into v_owner from public.situations where id = p_id and user_id = v_uid for update;
  if v_owner is null then raise exception 'item_not_found'; end if;

  v_check := public.affected_sprints_check('situation', p_id, null);
  if jsonb_array_length(v_check -> 'failing') > 0 then
    return jsonb_build_object('ok', false, 'failing', v_check -> 'failing');
  end if;

  select coalesce(jsonb_agg(name order by name), '[]'::jsonb) into v_names
  from (
    select i.name from public.impediment_situations a join public.impediments i on i.id = a.impediment_id where a.situation_id = p_id
    union all
    select c.name from public.cue_situations a join public.cues c on c.id = a.cue_id where a.situation_id = p_id
  ) t;

  if exists (select 1 from public.day_impediment_situation_observations where situation_id = p_id)
     or exists (select 1 from public.day_cue_situation_observations where situation_id = p_id) then
    update public.situations set archived_at = coalesce(archived_at, now()) where id = p_id;
    return jsonb_build_object('ok', true, 'outcome', 'archived', 'detached_from', v_names);
  end if;

  delete from public.impediment_situations where situation_id = p_id;
  delete from public.cue_situations where situation_id = p_id;
  delete from public.situations where id = p_id;
  return jsonb_build_object('ok', true, 'outcome', 'deleted', 'detached_from', v_names);
end
$$;

revoke all on function public.delete_situation(uuid) from public, anon;
grant execute on function public.delete_situation(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. The assertion: refuse to commit a schema or a row set that does not match.
-- tests/db/vision.test.ts runs this block on its own and proves every branch can fail.
-- The 0020 branches (visions columns, impediments.explanation) are carried forward.
-- ---------------------------------------------------------------------------
-- assert:begin
do $$
declare
  v_cols text;
  v_n    int;
begin
  select string_agg(column_name, ',' order by column_name) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'situations';
  if v_cols <> 'archived_at,created_at,id,name,rank,scope,updated_at,user_id' then
    raise exception 'schema_unexpected: situations columns are %', v_cols;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name in ('impediment_situations', 'cue_situations') and column_name = 'situation_kind') then
    raise exception 'schema_unexpected: situation_kind still present';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sprints' and column_name = 'why') then
    raise exception 'schema_unexpected: sprints.why still present';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'cues' and column_name = 'explanation') then
    raise exception 'schema_unexpected: cues.explanation still present';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'impediments' and column_name = 'explanation') then
    raise exception 'schema_unexpected: impediments.explanation still present';
  end if;
  select string_agg(column_name, ',' order by column_name) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'visions';
  if v_cols <> 'archived_at,body,confidence,confidence_reason,created_at,deadline,id,obstacle_id,picture,proof,updated_at,user_id' then
    raise exception 'schema_unexpected: visions columns are %', v_cols;
  end if;
  select count(*) into v_n
  from (select user_id, rank from public.situations group by user_id, rank having count(*) > 1) d;
  if v_n > 0 then
    raise exception 'data_unexpected: % duplicate situation ranks', v_n;
  end if;
  select count(*) into v_n from pg_proc where pronamespace = 'public'::regnamespace and proname = 'start_sprint';
  if v_n <> 1 then
    raise exception 'schema_unexpected: % start_sprint overloads', v_n;
  end if;
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'start_sprint' and pronargs = 20) then
    raise exception 'schema_unexpected: start_sprint does not take 20 arguments';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('delete_situation', 'create_situations')) <> 2 then
    raise exception 'schema_unexpected: delete_situation or create_situations missing';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'situations' and policyname = 'situations_delete') then
    raise exception 'schema_unexpected: situations_delete policy still present';
  end if;
end
$$;
-- assert:end
