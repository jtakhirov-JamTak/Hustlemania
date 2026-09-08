-- 0011_vision_v2 — F9: one vision for the account, three annual steps (vision → main
-- obstacle → guiding rule), an obstacle link into the impediments library, dated reviews.
--
-- Data-transforming: the per-Area visions collapse to one active vision per user. The
-- most recently updated active vision stays active; every other active one is archived
-- with `archived_at = now()`, and every sprint keeps the `vision_id` it was started with
-- (history intact). No user data exists at the time of writing (the local stack starts
-- blank, the hosted project has never been migrated), so the survivor rule is chosen for
-- correctness in principle and pinned by tests/db/vision.test.ts, which runs the block
-- between the `collapse:begin` / `collapse:end` markers against seeded rows.
--
-- Write path: every vision write goes through a SECURITY DEFINER function below and the
-- direct INSERT / UPDATE grants on `visions` are revoked. `start_sprint` is redefined
-- with the same signature (its body is the 0010 one; only the vision lookup changes).
-- `archive_item` and `set_item_scope` are the 0004 bodies plus the `vision_obstacle`
-- guard. `vision_reviews` is append-only: SELECT own rows, no write grant.

-- ---------------------------------------------------------------------------
-- visions — new columns, the collapse, the index swap, `area` dropped
-- ---------------------------------------------------------------------------
alter table public.visions
  add column deadline    date,
  add column proof       text,  -- private user text
  add column meaning     text,  -- private user text
  add column baseline    text,  -- private user text
  add column obstacle_id uuid references public.impediments(id);

create index visions_obstacle_id_idx on public.visions (obstacle_id);

-- The set_updated_at trigger would stamp every row the backfill and the collapse touch,
-- and the collapse ranks on updated_at. Off for the transform, on again after it.
alter table public.visions disable trigger visions_set_updated_at;

-- collapse:begin
with ranked as (
  select id,
         row_number() over (partition by user_id order by updated_at desc, created_at desc, id desc) as rn
  from public.visions
  where archived_at is null
)
update public.visions v
set archived_at = now()
from ranked r
where r.id = v.id and r.rn > 1;
-- collapse:end

update public.visions
set deadline = (created_at + interval '1 year')::date
where deadline is null;

alter table public.visions enable trigger visions_set_updated_at;

alter table public.visions alter column deadline set not null;

drop index public.visions_one_active_per_area;
create unique index visions_one_active_per_user
  on public.visions (user_id) where archived_at is null;

alter table public.visions drop column area;

-- ---------------------------------------------------------------------------
-- vision_reviews — one dated row per review, never updated or deleted by a user
-- ---------------------------------------------------------------------------
create table public.vision_reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  vision_id  uuid not null references public.visions(id) on delete cascade,
  verdict    text not null check (verdict in ('still_true', 'needs_changes')),
  note       text,  -- private user text
  created_at timestamptz not null default now()
);

create index vision_reviews_user_id_idx on public.vision_reviews (user_id);
create index vision_reviews_vision_id_created_at_idx on public.vision_reviews (vision_id, created_at desc);

alter table public.vision_reviews enable row level security;

create policy vision_reviews_select on public.vision_reviews
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.vision_reviews to authenticated;
grant all on public.vision_reviews to service_role;

-- ---------------------------------------------------------------------------
-- Direct writes on visions end here: the policies go, the grants go.
-- ---------------------------------------------------------------------------
drop policy visions_insert on public.visions;
drop policy visions_update on public.visions;
revoke insert, update on public.visions from authenticated;

-- ---------------------------------------------------------------------------
-- save_vision — step 1. Inserts the active vision or updates it in place (same id,
-- same created_at). The deadline is compared with the database's date (UTC).
-- ---------------------------------------------------------------------------
create function public.save_vision(
  p_body     text,
  p_deadline date,
  p_proof    text,
  p_meaning  text default null,
  p_baseline text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_body  text := nullif(btrim(p_body), '');
  v_proof text := nullif(btrim(p_proof), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_body is null then raise exception 'vision_body_required'; end if;
  if v_proof is null then raise exception 'vision_proof_required'; end if;
  if p_deadline is null or p_deadline <= current_date then raise exception 'vision_deadline_past'; end if;

  insert into public.visions (user_id, body, deadline, proof, meaning, baseline)
  values (v_uid, v_body, p_deadline, v_proof, nullif(btrim(p_meaning), ''), nullif(btrim(p_baseline), ''))
  on conflict (user_id) where archived_at is null do update
    set body     = excluded.body,
        deadline = excluded.deadline,
        proof    = excluded.proof,
        meaning  = excluded.meaning,
        baseline = excluded.baseline
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- set_vision_obstacle — step 2. Exactly one of an existing impediment (the caller's,
-- unarchived, global) or a new name; a new impediment is created global in the same
-- transaction, so a rejected call changes nothing.
-- ---------------------------------------------------------------------------
create function public.set_vision_obstacle(
  p_impediment_id uuid,
  p_name          text default null,
  p_explanation   text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_vision uuid;
  v_imp    uuid;
  v_name   text := nullif(btrim(p_name), '');
  v_row    record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id into v_vision from public.visions where user_id = v_uid and archived_at is null for update;
  if v_vision is null then raise exception 'no_active_vision'; end if;

  if (p_impediment_id is null) = (v_name is null) then raise exception 'obstacle_pick_or_name'; end if;

  if p_impediment_id is not null then
    select scope, archived_at into v_row from public.impediments where id = p_impediment_id and user_id = v_uid;
    if not found then raise exception 'item_not_found'; end if;
    if v_row.archived_at is not null then raise exception 'item_archived'; end if;
    if v_row.scope <> 'global' then raise exception 'obstacle_not_global'; end if;
    v_imp := p_impediment_id;
  else
    insert into public.impediments (user_id, name, explanation, scope)
    values (v_uid, v_name, p_explanation, 'global')
    returning id into v_imp;
  end if;

  update public.visions set obstacle_id = v_imp where id = v_vision;
  return v_imp;
end
$$;

-- ---------------------------------------------------------------------------
-- set_vision_rule — step 3. Writes WHEN, THEN and RECOVERED WHEN onto the obstacle
-- impediment; all three parts are required (rule 6 / 22 as extended by F6), which is
-- also what the impediments_before_update trigger accepts when the obstacle is an
-- active sprint's highest.
-- ---------------------------------------------------------------------------
create function public.set_vision_rule(p_when text, p_then text, p_recover text)
returns void
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
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id, obstacle_id into v_vision, v_imp from public.visions where user_id = v_uid and archived_at is null;
  if v_vision is null then raise exception 'no_active_vision'; end if;
  if v_imp is null then raise exception 'no_vision_obstacle'; end if;
  if v_when is null or v_then is null or v_recover is null then raise exception 'rule_incomplete'; end if;

  update public.impediments
  set proof_when = v_when, proof_then = v_then, proof_recover = v_recover
  where id = v_imp;
end
$$;

-- ---------------------------------------------------------------------------
-- replace_vision — archives the active vision. Sprints keep their vision_id; the
-- obstacle impediment stays in the library untouched.
-- ---------------------------------------------------------------------------
create function public.replace_vision()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.visions set archived_at = now() where user_id = v_uid and archived_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'no_active_vision'; end if;
end
$$;

-- ---------------------------------------------------------------------------
-- review_vision — one dated row per review; nothing is ever overwritten.
-- ---------------------------------------------------------------------------
create function public.review_vision(p_verdict text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_vision uuid;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_verdict is null or p_verdict not in ('still_true', 'needs_changes') then raise exception 'invalid_verdict'; end if;

  select id into v_vision from public.visions where user_id = v_uid and archived_at is null;
  if v_vision is null then raise exception 'no_active_vision'; end if;

  insert into public.vision_reviews (user_id, vision_id, verdict, note)
  values (v_uid, v_vision, p_verdict, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.save_vision(text, date, text, text, text) from public, anon;
revoke all on function public.set_vision_obstacle(uuid, text, text) from public, anon;
revoke all on function public.set_vision_rule(text, text, text) from public, anon;
revoke all on function public.replace_vision() from public, anon;
revoke all on function public.review_vision(text, text) from public, anon;

grant execute on function public.save_vision(text, date, text, text, text) to authenticated, service_role;
grant execute on function public.set_vision_obstacle(uuid, text, text) to authenticated, service_role;
grant execute on function public.set_vision_rule(text, text, text) to authenticated, service_role;
grant execute on function public.replace_vision() to authenticated, service_role;
grant execute on function public.review_vision(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- archive_item / set_item_scope — the 0004 bodies plus the vision_obstacle guard.
-- start_sprint — the 0010 body with the vision lookup no longer keyed on the Area.
-- ---------------------------------------------------------------------------
create or replace function public.archive_item(p_kind text, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_check jsonb;
  v_ids   uuid[];
  v_n     int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('cue', 'impediment') then raise exception 'invalid_kind'; end if;

  if p_kind = 'cue' then
    select user_id into v_owner from public.cues where id = p_item_id and user_id = v_uid for update;
  else
    select user_id into v_owner from public.impediments where id = p_item_id and user_id = v_uid for update;
  end if;
  if v_owner is null then raise exception 'item_not_found'; end if;

  -- F9: the active vision's main obstacle cannot be archived; Replace the vision or
  -- pick another obstacle first.
  if p_kind = 'impediment' and exists (
    select 1 from public.visions
    where user_id = v_uid and archived_at is null and obstacle_id = p_item_id
  ) then
    raise exception 'vision_obstacle';
  end if;

  v_check := public.affected_sprints_check(p_kind, p_item_id, null);
  if jsonb_array_length(v_check -> 'failing') > 0 then
    return jsonb_build_object('ok', false, 'failing', v_check -> 'failing');
  end if;

  select coalesce(array_agg(x), '{}') into v_ids from jsonb_array_elements_text(v_check -> 'sprint_ids') as t(x);

  if p_kind = 'cue' then
    update public.sprint_cues set removed_at = now()
    where sprint_id = any(v_ids) and cue_id = p_item_id and removed_at is null;
    get diagnostics v_n = row_count;
    update public.cues set archived_at = coalesce(archived_at, now()) where id = p_item_id;
  else
    update public.sprint_impediments set removed_at = now()
    where sprint_id = any(v_ids) and impediment_id = p_item_id and removed_at is null;
    get diagnostics v_n = row_count;
    update public.impediments set archived_at = coalesce(archived_at, now()) where id = p_item_id;
  end if;
  return jsonb_build_object('ok', true, 'removed_from', v_n);
end
$$;


create or replace function public.set_item_scope(p_kind text, p_item_id uuid, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_check jsonb;
  v_ids   uuid[];
  v_n     int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('cue', 'impediment') then raise exception 'invalid_kind'; end if;
  if p_scope not in ('global', 'health', 'wealth', 'relationships') then raise exception 'invalid_scope'; end if;

  if p_kind = 'cue' then
    select user_id into v_owner from public.cues where id = p_item_id and user_id = v_uid for update;
  else
    select user_id into v_owner from public.impediments where id = p_item_id and user_id = v_uid for update;
  end if;
  if v_owner is null then raise exception 'item_not_found'; end if;

  -- F9: the active vision's main obstacle stays global (every sprint can watch it).
  if p_kind = 'impediment' and p_scope <> 'global' and exists (
    select 1 from public.visions
    where user_id = v_uid and archived_at is null and obstacle_id = p_item_id
  ) then
    raise exception 'vision_obstacle';
  end if;

  -- Widening to global never affects a sprint; narrowing removes the item from every
  -- active sprint outside the new scope, all or nothing (rule 20).
  v_check := public.affected_sprints_check(p_kind, p_item_id, p_scope);
  if jsonb_array_length(v_check -> 'failing') > 0 then
    return jsonb_build_object('ok', false, 'failing', v_check -> 'failing');
  end if;

  select coalesce(array_agg(x), '{}') into v_ids from jsonb_array_elements_text(v_check -> 'sprint_ids') as t(x);

  if p_kind = 'cue' then
    update public.sprint_cues set removed_at = now()
    where sprint_id = any(v_ids) and cue_id = p_item_id and removed_at is null;
    get diagnostics v_n = row_count;
    update public.cues set scope = p_scope where id = p_item_id;
  else
    update public.sprint_impediments set removed_at = now()
    where sprint_id = any(v_ids) and impediment_id = p_item_id and removed_at is null;
    get diagnostics v_n = row_count;
    update public.impediments set scope = p_scope where id = p_item_id;
  end if;
  return jsonb_build_object('ok', true, 'removed_from', v_n);
end
$$;


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
  where user_id = v_uid and archived_at is null;
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
