-- 0005_targets — F3: custom daily targets, reconciliation, target locking and
-- intention pre-planning (PRD §6, rules 10–14).
--
-- `sprint_days.target` has exactly two writers, both explicit user actions:
-- `start_sprint` inserts the initial plan and `save_targets` replaces the future part
-- of it. No trigger, job or other function touches a target (rules 12–14); the DB
-- suite asserts that by scanning pg_proc. A plan persists only when its 14 targets sum
-- to the goal (rule 11). A day whose date has begun in the sprint's zone is locked
-- (rule 10): `save_targets` refuses to change it, and a BEFORE UPDATE trigger binds
-- every role, the postgres role included.
--
-- Additive: no new table or column. `sprints.target_mode` ('same' | 'custom') already
-- exists; it is function-only (authenticated may UPDATE `mantra` alone).

-- ---------------------------------------------------------------------------
-- validate_targets — shared by start_sprint and save_targets. Raises the first
-- violated rule: shape, sign, precision (whole planning units: 100 minor for money,
-- 1 minute or 1 unit otherwise), then the sum (rule 11).
-- ---------------------------------------------------------------------------
create or replace function public.validate_targets(p_measurement text, p_amount bigint, p_targets bigint[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_step bigint := public.measurement_step(p_measurement);
  v_sum  bigint;
begin
  if p_targets is null or cardinality(p_targets) <> 14 or array_ndims(p_targets) <> 1 then
    raise exception 'invalid_targets';
  end if;
  if exists (select 1 from unnest(p_targets) as t where t is null or t < 0) then
    raise exception 'negative_target';
  end if;
  if exists (select 1 from unnest(p_targets) as t where t % v_step <> 0) then
    raise exception 'target_precision';
  end if;
  select sum(t) into v_sum from unnest(p_targets) as t;
  if v_sum <> p_amount then
    raise exception 'targets_sum_mismatch';
  end if;
end
$$;

revoke all on function public.validate_targets(text, bigint, bigint[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_targets — the one way to change a plan after the sprint starts. The caller
-- sends all 14 targets; days that have begun must arrive unchanged (rule 10), the
-- rest replace the future plan, and the sprint becomes 'custom'. Nothing is
-- redistributed: the caller balances the plan, and the sum rule rejects any other.
-- ---------------------------------------------------------------------------
create or replace function public.save_targets(p_sprint_id uuid, p_targets bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_measurement text;
  v_amount      bigint;
  v_tz          text;
  v_status      text;
  v_today       date;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select measurement, amount, tz, status
  into v_measurement, v_amount, v_tz, v_status
  from public.sprints
  where id = p_sprint_id and user_id = v_uid;
  if not found then
    raise exception 'sprint_not_found';
  end if;
  if v_status <> 'active' then
    raise exception 'sprint_not_active';
  end if;

  perform public.validate_targets(v_measurement, v_amount, p_targets);

  v_today := (now() at time zone v_tz)::date;

  if exists (
    select 1 from public.sprint_days d
    where d.sprint_id = p_sprint_id and d.date <= v_today and d.target <> p_targets[d.day_index]
  ) then
    raise exception 'target_locked';
  end if;

  update public.sprint_days d
  set target = p_targets[d.day_index]
  where d.sprint_id = p_sprint_id and d.date > v_today and d.target <> p_targets[d.day_index];

  update public.sprints
  set target_mode = 'custom'
  where id = p_sprint_id and target_mode <> 'custom';
end
$$;

revoke all on function public.save_targets(uuid, bigint[]) from public, anon;
grant execute on function public.save_targets(uuid, bigint[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sprint_days_target_locked — rule 10 at the row level: once a day's date has begun
-- in the sprint's zone its target cannot change, whoever the caller is. Fires after
-- sprint_days_immutable_after_close (alphabetical), so a closed day still reports
-- day_closed.
-- ---------------------------------------------------------------------------
create or replace function public.sprint_days_target_locked()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tz text;
begin
  if new.target is distinct from old.target then
    select tz into v_tz from public.sprints where id = old.sprint_id;
    if old.date <= (now() at time zone v_tz)::date then
      raise exception 'target_locked';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.sprint_days_target_locked() from public, anon, authenticated;

create trigger sprint_days_target_locked
  before update on public.sprint_days
  for each row execute function public.sprint_days_target_locked();

-- ---------------------------------------------------------------------------
-- start_sprint — same behaviour plus two optional trailing parameters:
--   p_targets     bigint[14]  a custom plan (validated like save_targets; the sprint
--                             starts in 'custom' mode); null = Goal ÷ 14 as before
--   p_intentions  text[]      per-day Daily Intentions by index (1 = day 1); an entry
--                             that is null or blank leaves that day empty; day 1 falls
--                             back to p_intention
-- The 0004 overload is dropped so there is one entry point.
-- ---------------------------------------------------------------------------
drop function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, text, text, text);

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

  -- Rules 5–6: a Highest Impediment among the selected, with a complete Proof Point.
  if p_highest_impediment_id is null or not (p_highest_impediment_id = any(v_imps)) then
    raise exception 'no_highest_impediment';
  end if;
  if nullif(btrim(p_proof_when), '') is not null or nullif(btrim(p_proof_then), '') is not null then
    update public.impediments
    set proof_when = coalesce(nullif(btrim(p_proof_when), ''), proof_when),
        proof_then = coalesce(nullif(btrim(p_proof_then), ''), proof_then)
    where id = p_highest_impediment_id;
  end if;
  select proof_when, proof_then into v_proof from public.impediments where id = p_highest_impediment_id;
  if v_proof.proof_when is null or v_proof.proof_then is null then
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

revoke all on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, text, text, text, bigint[], text[])
  from public, anon;
grant execute on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, text, text, text, bigint[], text[])
  to authenticated, service_role;
