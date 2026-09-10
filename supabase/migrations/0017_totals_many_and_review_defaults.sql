-- ---------------------------------------------------------------------------
-- 0017 — the data-layer findings of the 2026-09-09 full review
-- (docs/audits/full-review-2026-09-09.md #5, #6, #15, #22, #25). 0012–0016 are applied,
-- so everything arrives as a new migration.
--
-- 1. `sprint_totals` — one row per sprint: closed, effective and on-target day counts
--    and the total the result card uses. `loadAcross`, `loadReviewStats` and
--    `loadVisionSprints` read every `sprint_days_effective` / `sprint_days` row of every
--    sprint and summed in TypeScript; PostgREST returns at most 1,000 rows, so at ~72
--    finished sprints the evidence line, the coverage denominators, goals-met and the
--    Vision tab's Met/Under would all go quietly wrong. The view is N rows for N sprints
--    and is filtered by id. `total` is the summary's own sum (closed, not cancelled,
--    zero-target days included), so goals-met can never disagree with the result card.
--
-- 2. `*_many(uuid[])` — one call for many sprints over the four insight functions and
--    `sprint_review_summary`. The Insights page issued 5N+4 requests per render (the
--    sidebar N summaries, the page 4N insights); at three areas that is ~78 sprints a
--    year, ~400 concurrent requests against a 20-connection pool. Each wrapper is a
--    plain SQL `security invoker` function that `lateral`-calls the existing definer
--    function per id, so the ownership check (`insight_sprint_owned`) still runs for
--    every sprint and no authorization logic is added; a foreign id fails the whole call.
--
-- 3. `finish_review` — a member removed mid-sprint defaults to `drop` in the decision
--    fill instead of `keep`, so the next sprint's kit does not resurrect what the user
--    pruned with "Set up tomorrow → Remove" (the postmortem UI applies the same default).
--
-- 4. `start_sprint` — rule 26 exempts a finished sprint that never closed a day (ended
--    early before day 1): there is nothing to review, and demanding a "key lesson" for a
--    sprint that never ran forced a fabricated record before the Area could restart.
-- ---------------------------------------------------------------------------

create view public.sprint_totals
with (security_invoker = true)
as
select d.sprint_id,
       d.user_id,
       count(*) filter (where d.closed_at is not null)::integer as closed_days,
       count(*) filter (where d.closed_at is not null and not d.cancelled and d.target > 0)::integer as effective_days,
       count(*) filter (where d.closed_at is not null and not d.cancelled and d.target > 0 and d.actual >= d.target)::integer as on_target_days,
       coalesce(sum(d.actual) filter (where d.closed_at is not null and not d.cancelled), 0)::bigint as total
from public.sprint_days d
group by d.sprint_id, d.user_id;

grant select on public.sprint_totals to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.insight_impediment_impact_many(p_sprint_ids uuid[])
returns table (
  sprint_id      uuid,
  item_id        uuid,
  name           text,
  is_highest     boolean,
  present_days   integer,
  absent_days    integer,
  logged_days    integer,
  unsure_days    integer,
  median_present numeric,
  median_absent  numeric,
  delta_pts      integer,
  enough         boolean,
  felt_a_lot     integer,
  felt_some      integer,
  felt_nothing   integer
)
language sql
set search_path = ''
as $$
  select s.id, f.*
  from (select distinct x as id from unnest(coalesce(p_sprint_ids, '{}')) as x) s
  cross join lateral public.insight_impediment_impact(s.id) f;
$$;

create or replace function public.insight_response_followthrough_many(p_sprint_ids uuid[])
returns table (
  sprint_id    uuid,
  item_id      uuid,
  name         text,
  proof_then   text,
  occurrences  integer,
  answered     integer,
  ran          integer,
  didnt        integer,
  partially    integer,
  unsure       integer,
  rate         integer,
  enough       boolean
)
language sql
set search_path = ''
as $$
  select s.id, f.*
  from (select distinct x as id from unnest(coalesce(p_sprint_ids, '{}')) as x) s
  cross join lateral public.insight_response_followthrough(s.id) f;
$$;

create or replace function public.insight_response_recovery_many(p_sprint_ids uuid[])
returns table (
  sprint_id         uuid,
  item_id           uuid,
  name              text,
  proof_recover     text,
  with_response     integer,
  with_recovered    integer,
  without_response  integer,
  without_recovered integer,
  answered          integer,
  rate              integer,
  enough            boolean,
  median_recovered  numeric,
  median_not        numeric,
  outcome_enough    boolean
)
language sql
set search_path = ''
as $$
  select s.id, f.*
  from (select distinct x as id from unnest(coalesce(p_sprint_ids, '{}')) as x) s
  cross join lateral public.insight_response_recovery(s.id) f;
$$;

create or replace function public.insight_cue_usefulness_many(p_sprint_ids uuid[])
returns table (
  sprint_id      uuid,
  item_id        uuid,
  name           text,
  is_focus       boolean,
  used_days      integer,
  unused_days    integer,
  logged_days    integer,
  unsure_days    integer,
  median_used    numeric,
  median_unused  numeric,
  delta_pts      integer,
  enough         boolean
)
language sql
set search_path = ''
as $$
  select s.id, f.*
  from (select distinct x as id from unnest(coalesce(p_sprint_ids, '{}')) as x) s
  cross join lateral public.insight_cue_usefulness(s.id) f;
$$;

create or replace function public.sprint_review_summary_many(p_sprint_ids uuid[])
returns table (
  sprint_id      uuid,
  total          bigint,
  goal           bigint,
  pct            integer,
  met            boolean,
  closed_days    integer,
  missed_days    integer,
  cancelled_days integer,
  best_streak    integer,
  status         text
)
language sql
set search_path = ''
as $$
  select s.id, f.*
  from (select distinct x as id from unnest(coalesce(p_sprint_ids, '{}')) as x) s
  cross join lateral public.sprint_review_summary(s.id) f;
$$;

-- Postgres grants EXECUTE to PUBLIC on a new function (0002, 0013, FIX_LOG 2026-09-08).
revoke all on function public.insight_impediment_impact_many(uuid[])       from public, anon;
revoke all on function public.insight_response_followthrough_many(uuid[])  from public, anon;
revoke all on function public.insight_response_recovery_many(uuid[])       from public, anon;
revoke all on function public.insight_cue_usefulness_many(uuid[])          from public, anon;
revoke all on function public.sprint_review_summary_many(uuid[])           from public, anon;
grant execute on function public.insight_impediment_impact_many(uuid[])      to authenticated;
grant execute on function public.insight_response_followthrough_many(uuid[]) to authenticated;
grant execute on function public.insight_response_recovery_many(uuid[])      to authenticated;
grant execute on function public.insight_cue_usefulness_many(uuid[])         to authenticated;
grant execute on function public.sprint_review_summary_many(uuid[])          to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.finish_review(
  p_sprint_id  uuid,
  p_lesson     text,
  p_moved      boolean,
  p_verdict    text default null,
  p_decisions  jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_sprint   record;
  v_lesson   text := nullif(btrim(p_lesson), '');
  v_verdict  text := nullif(btrim(p_verdict), '');
  v_highest  uuid;
  v_occurred boolean;
  v_review   uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select s.id, s.status into v_sprint
  from public.sprints s
  where s.id = p_sprint_id and s.user_id = v_uid
  for update of s;

  if v_sprint.id is null then
    raise exception 'sprint_not_found';
  end if;
  if v_sprint.status = 'active' then
    raise exception 'sprint_running';
  end if;
  if exists (select 1 from public.reviews where sprint_id = p_sprint_id) then
    raise exception 'review_exists';
  end if;

  if v_lesson is null then
    raise exception 'lesson_required';
  end if;
  if p_moved is null then
    raise exception 'vision_answer_required';
  end if;

  -- Did the CURRENT highest impediment show up on a day that was logged and counts?
  -- The same predicate `insight_response_followthrough` uses to decide whether the
  -- postmortem shows the verdict at all, so the two can never disagree (0016).
  select m.impediment_id into v_highest
  from public.sprint_impediments m
  where m.sprint_id = p_sprint_id and m.is_highest;

  select exists (
    select 1
    from public.day_impediment_observations o
    join public.sprint_days_effective d on d.id = o.sprint_day_id
    where d.sprint_id = p_sprint_id
      and d.highest_impediment_id = v_highest
      and o.was_highest and o.occurred = 'yes'
  ) into v_occurred;

  if v_occurred and v_verdict is null then
    raise exception 'verdict_required';
  end if;
  if not v_occurred and v_verdict is not null then
    raise exception 'verdict_not_applicable';
  end if;
  if v_verdict is not null and v_verdict not in ('worked', 'partly', 'didnt') then
    raise exception 'invalid_verdict';
  end if;

  if jsonb_typeof(coalesce(p_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_decisions';
  end if;

  -- Every named item must belong to this sprint (membership, removed or not).
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb)) as x(kind text, item_id uuid, decision text)
    where not (
      (x.kind = 'impediment' and exists (
        select 1 from public.sprint_impediments m
        where m.sprint_id = p_sprint_id and m.impediment_id = x.item_id))
      or (x.kind = 'cue' and exists (
        select 1 from public.sprint_cues m
        where m.sprint_id = p_sprint_id and m.cue_id = x.item_id))
    )
  ) then
    raise exception 'item_not_in_sprint';
  end if;

  if (select count(*) from jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb))
        as x(kind text, item_id uuid, decision text)
      where x.decision = 'highest') > 1 then
    raise exception 'one_highest_only';
  end if;

  insert into public.reviews (user_id, sprint_id, lesson, moved_vision, verdict)
  values (v_uid, p_sprint_id, v_lesson, p_moved, v_verdict)
  returning id into v_review;

  -- Every member gets ONE row (0016): the caller's choice where given; otherwise 'keep'
  -- for a current member and 'drop' for one the user removed mid-sprint and never added
  -- back, so a pruned item does not return in the next kit by default.
  insert into public.review_decisions (review_id, user_id, kind, item_id, decision)
  select v_review, v_uid, m.kind, m.item_id,
         coalesce((select x.decision
                   from jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb))
                          as x(kind text, item_id uuid, decision text)
                   where x.kind = m.kind and x.item_id = m.item_id
                   limit 1),
                  case when m.current then 'keep' else 'drop' end)
  from (
    select 'impediment'::text as kind, mi.impediment_id as item_id, bool_or(mi.removed_at is null) as current
    from public.sprint_impediments mi where mi.sprint_id = p_sprint_id
    group by mi.impediment_id
    union all
    select 'cue'::text, mc.cue_id, bool_or(mc.removed_at is null)
    from public.sprint_cues mc where mc.sprint_id = p_sprint_id
    group by mc.cue_id
  ) m;

  return v_review;
end
$$;

-- ---------------------------------------------------------------------------
-- start_sprint: the 0012 body with one clause added to rule 26 (see header, item 4).
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

