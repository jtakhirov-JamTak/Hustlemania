-- ---------------------------------------------------------------------------
-- 0012 — F10: sprint completion, End Early, the postmortem, the Area kit and the
-- next-sprint gate.
--
-- A sprint leaves `active` only through complete_sprint / end_sprint_early /
-- finish_sprint. Each stamps `closed_at` and cancels every still-open day dated on
-- or after the closure date in the sprint's own zone (PRD §10: cancelled, never
-- missed). `close_day` is deliberately NOT redefined: its existing
-- `status <> 'active'` guard is what makes "no backfill after closure" true (PRD §9).
--
-- The review is one row per finished sprint, written only by finish_review, and the
-- Area's "kit" is those rows — there is no kit table and no second copy of a
-- decision. The gate is "finished and unreviewed", so the legacy `'review'` status
-- is dropped unused; `'ended'` is added for a window that ran out under the goal.
--
-- start_sprint, sprint_streak_at and sprint_days_immutable_after_close are each
-- redefined from their CURRENT bodies (0011, 0007, 0007). The F5 defect was exactly a
-- redefinition copied from a stale body; the existing start_sprint, streaks and
-- libraries suites must stay green.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------

alter table public.sprints
  add column closed_at timestamptz,
  drop constraint sprints_status_check,
  add constraint sprints_status_check
    check (status in ('active', 'completed', 'completed_early', 'ended', 'ended_early')),
  add constraint sprints_closed_at_iff_finished_check
    check ((status = 'active') = (closed_at is null));

-- No existing row can violate the new checks: every sprint written so far is
-- 'active' with a null closed_at (the four finished values were unreachable before
-- this migration, and 'review' was never written by any function).

alter table public.sprint_days
  add column cancelled boolean not null default false,
  add constraint sprint_days_cancelled_not_closed_check
    check (not (cancelled and closed_at is not null));

create index sprint_days_sprint_id_open_idx
  on public.sprint_days (sprint_id) where closed_at is null and not cancelled;

-- ---------------------------------------------------------------------------
-- sprints_status_transition — status and closed_at move once, in one direction.
-- `authenticated` holds only `update (mantra)` on sprints, so this guards
-- service_role and any future code path, not the API role.
-- ---------------------------------------------------------------------------
create or replace function public.sprints_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'active'
       or new.status not in ('completed', 'completed_early', 'ended', 'ended_early') then
      raise exception 'sprint_finished';
    end if;
  end if;

  if new.closed_at is distinct from old.closed_at and old.closed_at is not null then
    raise exception 'sprint_finished';
  end if;

  return new;
end
$$;

create trigger sprints_status_transition
  before update on public.sprints
  for each row execute function public.sprints_status_transition();

revoke all on function public.sprints_status_transition() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- sprint_days_immutable_after_close — the 0007 body plus `cancelled`, which is
-- locked once true (a cancelled day is history, like a closed one).
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

  if old.cancelled and new.cancelled is distinct from old.cancelled then
    raise exception 'day_cancelled';
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
-- sprint_days_effective — the ONLY day source the insight functions may read:
-- closed, not cancelled, positive target. `attainment` is the C5/D4 metric
-- (Actual ÷ Target); the median of it is what every comparison card reports.
-- RLS of sprint_days applies to the caller (security_invoker).
-- ---------------------------------------------------------------------------
create view public.sprint_days_effective
with (security_invoker = true)
as
select d.id,
       d.sprint_id,
       d.user_id,
       d.day_index,
       d.date,
       d.target,
       d.actual,
       d.closed_on_time,
       d.highest_impediment_id,
       d.response,
       d.recovered,
       d.impact,
       d.actual::numeric / d.target::numeric as attainment
from public.sprint_days d
where d.closed_at is not null
  and not d.cancelled
  and d.target > 0;

grant select on public.sprint_days_effective to authenticated;

-- ---------------------------------------------------------------------------
-- reviews — one per finished sprint, written only by finish_review. `lesson` is
-- private user text. `verdict` is null exactly when the highest impediment never
-- occurred on a logged day. No archived_at: a review is never removed (PRD §11,
-- master edits must not disconnect historical evidence).
-- ---------------------------------------------------------------------------
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  sprint_id    uuid not null unique references public.sprints(id) on delete cascade,
  lesson       text not null check (btrim(lesson) <> ''),  -- private user text
  moved_vision boolean not null,
  verdict      text check (verdict in ('worked', 'partly', 'didnt')),
  completed_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index reviews_user_id_idx on public.reviews (user_id);

create table public.review_decisions (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.reviews(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('cue', 'impediment')),
  item_id    uuid not null,
  decision   text not null,
  created_at timestamptz not null default now(),
  unique (review_id, kind, item_id),
  constraint review_decisions_decision_check check (
       (kind = 'impediment' and decision in ('keep', 'highest', 'drop'))
    or (kind = 'cue'        and decision in ('keep', 'test_more', 'drop'))
  )
);

create index review_decisions_user_id_idx on public.review_decisions (user_id);
create index review_decisions_review_id_idx on public.review_decisions (review_id);

alter table public.reviews           enable row level security;
alter table public.review_decisions  enable row level security;

create policy reviews_select_own on public.reviews
  for select to authenticated using ((select auth.uid()) = user_id);

create policy review_decisions_select_own on public.review_decisions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Read-only for the API role: finish_review is the only write path, and a finished
-- review is never edited or deleted (SPEC F10 non-goals).
grant select on public.reviews          to authenticated;
grant select on public.review_decisions to authenticated;
grant all    on public.reviews          to service_role;
grant all    on public.review_decisions to service_role;

-- ---------------------------------------------------------------------------
-- Closure. One shared helper writes the closure; the three entry points differ
-- only in their window and the status they land on.
-- ---------------------------------------------------------------------------
create or replace function public.close_sprint_rows(p_sprint_id uuid, p_status text, p_date date)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.sprints
  set status = p_status, closed_at = now()
  where id = p_sprint_id;

  -- The closure day's own close, if it already happened, is kept: only days with no
  -- closed_at are cancelled. Earlier open days stay missed (PRD §9).
  update public.sprint_days
  set cancelled = true
  where sprint_id = p_sprint_id
    and date >= p_date
    and closed_at is null
    and not cancelled;
end
$$;

revoke all on function public.close_sprint_rows(uuid, text, date) from public, anon, authenticated;

create or replace function public.sprint_for_closure(p_sprint_id uuid)
returns table (id uuid, tz text, end_date date, amount bigint, today date, total bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s   record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select s.id, s.tz, s.end_date, s.amount, s.status into v_s
  from public.sprints s
  where s.id = p_sprint_id and s.user_id = v_uid
  for update of s;

  if v_s.id is null then
    raise exception 'sprint_not_found';
  end if;
  if v_s.status <> 'active' then
    raise exception 'sprint_not_active';
  end if;

  return query
  select v_s.id, v_s.tz, v_s.end_date, v_s.amount,
         (now() at time zone v_s.tz)::date,
         coalesce((select sum(d.actual) from public.sprint_days d
                   where d.sprint_id = v_s.id and d.closed_at is not null and not d.cancelled), 0)::bigint;
end
$$;

revoke all on function public.sprint_for_closure(uuid) from public, anon, authenticated;

-- Complete sprint: only while the window runs, and only once the closed days reach
-- the goal (PRD §10; reaching it unlocks the action, it never fires by itself).
create or replace function public.complete_sprint(p_sprint_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select * into v from public.sprint_for_closure(p_sprint_id);

  if v.today > v.end_date then
    raise exception 'window_passed';
  end if;
  if v.total < v.amount then
    raise exception 'goal_not_reached';
  end if;

  perform public.close_sprint_rows(
    p_sprint_id,
    case when v.today < v.end_date then 'completed_early' else 'completed' end,
    v.today);
end
$$;

-- End sprint early: available without reaching the goal, including before day 1
-- (all 14 days are then cancelled). Not available once the window has passed —
-- finish_sprint owns that.
create or replace function public.end_sprint_early(p_sprint_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select * into v from public.sprint_for_closure(p_sprint_id);

  if v.today > v.end_date then
    raise exception 'window_passed';
  end if;

  perform public.close_sprint_rows(p_sprint_id, 'ended_early', v.today);
end
$$;

-- Finish the sprint: the explicit close for a window that has run out. Nothing
-- closes a sprint on a page load, so backfill stays open until the user acts.
create or replace function public.finish_sprint(p_sprint_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select * into v from public.sprint_for_closure(p_sprint_id);

  if v.today <= v.end_date then
    raise exception 'sprint_running';
  end if;

  perform public.close_sprint_rows(
    p_sprint_id,
    case when v.total >= v.amount then 'completed' else 'ended' end,
    v.today);
end
$$;

grant execute on function public.complete_sprint(uuid)   to authenticated;
grant execute on function public.end_sprint_early(uuid)  to authenticated;
grant execute on function public.finish_sprint(uuid)     to authenticated;

-- ---------------------------------------------------------------------------
-- sprint_streak_at — the 0007 body with two changes F5 recorded as owed here:
-- the horizon stops at the closure date, and cancelled days are excluded. Without
-- the first, a sprint completed on day 9 reads a streak of 0 on day 11.
-- ---------------------------------------------------------------------------
create or replace function public.sprint_streak_at(p_sprint_id uuid, p_asof timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  with horizon as (
    select least(
             (p_asof at time zone s.tz)::date,
             coalesce((s.closed_at at time zone s.tz)::date, (p_asof at time zone s.tz)::date)
           ) as d
    from public.sprints s
    where s.id = p_sprint_id
  ),
  counted as (
    select d.day_index, d.closed_on_time
    from public.sprint_days d, horizon
    where d.sprint_id = p_sprint_id
      and not d.cancelled
      and (d.date < horizon.d or (d.date = horizon.d and d.closed_at is not null))
  )
  select count(*)::integer
  from counted
  where day_index > coalesce((select max(day_index) from counted where closed_on_time is not true), 0);
$$;

revoke all on function public.sprint_streak_at(uuid, timestamptz) from public, anon, authenticated;

-- The longest run of on-time closes among the sprint's non-cancelled days — the
-- postmortem's "best streak", which is not the streak the sprint ended on.
create or replace function public.sprint_best_streak(p_sprint_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_best integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.sprints where id = p_sprint_id and user_id = v_uid) then
    raise exception 'sprint_not_found';
  end if;

  select coalesce(max(run), 0) into v_best
  from (
    select count(*) as run
    from (
      select d.day_index,
             d.day_index - row_number() over (order by d.day_index) as grp
      from public.sprint_days d
      where d.sprint_id = p_sprint_id and not d.cancelled and d.closed_on_time
    ) runs
    group by grp
  ) counted;

  return v_best;
end
$$;

grant execute on function public.sprint_best_streak(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- start_sprint — the 0011 body with rule 26: the next sprint in an Area waits for
-- the previous one's review. Same signature, so the 0010 grant carries over.
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

-- ---------------------------------------------------------------------------
-- finish_review — the whole postmortem in one transaction. A verdict is asked
-- exactly when the highest impediment showed up on a logged day; items the caller
-- did not name default to 'keep', so the stored kit always covers every member.
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

  -- Did the highest impediment actually show up on a day that was logged and counts?
  select exists (
    select 1
    from public.day_impediment_observations o
    join public.sprint_days_effective d on d.id = o.sprint_day_id
    where d.sprint_id = p_sprint_id and o.was_highest and o.occurred = 'yes'
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

  -- Every member gets a row: the caller's choice where given, 'keep' otherwise.
  insert into public.review_decisions (review_id, user_id, kind, item_id, decision)
  select v_review, v_uid, m.kind, m.item_id,
         coalesce((select x.decision
                   from jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb))
                          as x(kind text, item_id uuid, decision text)
                   where x.kind = m.kind and x.item_id = m.item_id
                   limit 1), 'keep')
  from (
    select 'impediment'::text as kind, mi.impediment_id as item_id
    from public.sprint_impediments mi where mi.sprint_id = p_sprint_id
    union all
    select 'cue'::text, mc.cue_id
    from public.sprint_cues mc where mc.sprint_id = p_sprint_id
  ) m;

  return v_review;
end
$$;

grant execute on function public.finish_review(uuid, text, boolean, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Single-sprint insight calculations (C5 / D4). Every one reads
-- sprint_days_effective and nothing else, so a cancelled or open day can never
-- reach a figure. The metric is the MEDIAN of Actual ÷ Target; a comparison needs
-- MIN_DAYS on each side and a tri-state rate needs MIN_DAYS answered.
-- Associations, never causes: no function here returns a claim, only counts.
-- ---------------------------------------------------------------------------
create or replace function public.insight_min_days()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

revoke all on function public.insight_min_days() from public, anon, authenticated;

create or replace function public.insight_sprint_owned(p_sprint_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.sprints where id = p_sprint_id and user_id = auth.uid()) then
    raise exception 'sprint_not_found';
  end if;
end
$$;

revoke all on function public.insight_sprint_owned(uuid) from public, anon, authenticated;

-- Card 1 — Impediment impact. Median attainment on days an obstacle was present vs
-- absent. "Present" is occurred = 'yes'; 'no' is absent; 'unsure' and 'unanswered'
-- are in neither group but do count toward coverage.
create or replace function public.insight_impediment_impact(p_sprint_id uuid)
returns table (
  item_id       uuid,
  name          text,
  is_highest    boolean,
  present_days  integer,
  absent_days   integer,
  logged_days   integer,
  unsure_days   integer,
  median_present numeric,
  median_absent  numeric,
  delta_pts      integer,
  enough         boolean,
  felt_a_lot     integer,
  felt_some      integer,
  felt_nothing   integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.insight_sprint_owned(p_sprint_id);

  return query
  with days as (
    select * from public.sprint_days_effective where sprint_id = p_sprint_id
  ),
  members as (
    select m.impediment_id as id, i.name, m.is_highest
    from public.sprint_impediments m
    join public.impediments i on i.id = m.impediment_id
    where m.sprint_id = p_sprint_id
  ),
  obs as (
    select o.impediment_id, o.sprint_day_id, o.occurred, d.attainment, d.impact
    from public.day_impediment_observations o
    join days d on d.id = o.sprint_day_id
  )
  select m.id,
         m.name,
         m.is_highest,
         count(*) filter (where o.occurred = 'yes')::integer,
         count(*) filter (where o.occurred = 'no')::integer,
         count(*) filter (where o.occurred in ('yes', 'no', 'unsure'))::integer,
         count(*) filter (where o.occurred = 'unsure')::integer,
         percentile_cont(0.5) within group (order by o.attainment)
           filter (where o.occurred = 'yes'),
         percentile_cont(0.5) within group (order by o.attainment)
           filter (where o.occurred = 'no'),
         case when count(*) filter (where o.occurred = 'yes') >= public.insight_min_days()
               and count(*) filter (where o.occurred = 'no')  >= public.insight_min_days()
           then round((percentile_cont(0.5) within group (order by o.attainment) filter (where o.occurred = 'yes')
                     - percentile_cont(0.5) within group (order by o.attainment) filter (where o.occurred = 'no')) * 100)::integer
         end,
         count(*) filter (where o.occurred = 'yes') >= public.insight_min_days()
           and count(*) filter (where o.occurred = 'no') >= public.insight_min_days(),
         count(*) filter (where o.occurred = 'yes' and o.impact = 'a_lot')::integer,
         count(*) filter (where o.occurred = 'yes' and o.impact = 'some')::integer,
         count(*) filter (where o.occurred = 'yes' and o.impact = 'nothing')::integer
  from members m
  left join obs o on o.impediment_id = m.id
  group by m.id, m.name, m.is_highest
  order by m.is_highest desc, 10 nulls last, m.name;
end
$$;

-- Card 2 — Response follow-through. Of the days the highest impediment occurred,
-- how often did the WHEN → THEN response run? 'partially' is reported separately
-- and is not counted as ran (reconciliation D3a).
create or replace function public.insight_response_followthrough(p_sprint_id uuid)
returns table (
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.insight_sprint_owned(p_sprint_id);

  return query
  with occ as (
    select d.response, d.proof_then, d.highest_impediment_id
    from public.sprint_days_effective d
    join public.day_impediment_observations o
      on o.sprint_day_id = d.id and o.was_highest and o.occurred = 'yes'
    where d.sprint_id = p_sprint_id
  ),
  highest as (
    select m.impediment_id as id, i.name
    from public.sprint_impediments m
    join public.impediments i on i.id = m.impediment_id
    where m.sprint_id = p_sprint_id and m.is_highest
  )
  select h.id,
         h.name,
         max(o.proof_then),
         count(o.*)::integer,
         count(*) filter (where o.response in ('yes', 'no'))::integer,
         count(*) filter (where o.response = 'yes')::integer,
         count(*) filter (where o.response = 'no')::integer,
         count(*) filter (where o.response = 'partially')::integer,
         count(*) filter (where o.response = 'unsure')::integer,
         case when count(*) filter (where o.response in ('yes', 'no')) >= public.insight_min_days()
           then round(count(*) filter (where o.response = 'yes') * 100.0
                    / nullif(count(*) filter (where o.response in ('yes', 'no')), 0))::integer
         end,
         count(*) filter (where o.response in ('yes', 'no')) >= public.insight_min_days()
  from highest h
  left join occ o on o.highest_impediment_id = h.id
  group by h.id, h.name;
end
$$;

-- Card 3 — Response recovery. Was the recovery criterion met, with the response vs
-- without it (D3b / C5)? Recovery is asked whenever the highest occurred, so both
-- groups exist.
create or replace function public.insight_response_recovery(p_sprint_id uuid)
returns table (
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.insight_sprint_owned(p_sprint_id);

  return query
  with occ as (
    select d.response, d.recovered, d.proof_recover, d.attainment, d.highest_impediment_id
    from public.sprint_days_effective d
    join public.day_impediment_observations o
      on o.sprint_day_id = d.id and o.was_highest and o.occurred = 'yes'
    where d.sprint_id = p_sprint_id
  ),
  highest as (
    select m.impediment_id as id, i.name
    from public.sprint_impediments m
    join public.impediments i on i.id = m.impediment_id
    where m.sprint_id = p_sprint_id and m.is_highest
  )
  select h.id,
         h.name,
         max(o.proof_recover),
         count(*) filter (where o.response = 'yes' and o.recovered in ('yes', 'no'))::integer,
         count(*) filter (where o.response = 'yes' and o.recovered = 'yes')::integer,
         count(*) filter (where o.response in ('no', 'partially') and o.recovered in ('yes', 'no'))::integer,
         count(*) filter (where o.response in ('no', 'partially') and o.recovered = 'yes')::integer,
         count(*) filter (where o.recovered in ('yes', 'no'))::integer,
         case when count(*) filter (where o.recovered in ('yes', 'no')) >= public.insight_min_days()
           then round(count(*) filter (where o.recovered = 'yes') * 100.0
                    / nullif(count(*) filter (where o.recovered in ('yes', 'no')), 0))::integer
         end,
         count(*) filter (where o.recovered in ('yes', 'no')) >= public.insight_min_days(),
         percentile_cont(0.5) within group (order by o.attainment) filter (where o.recovered = 'yes'),
         percentile_cont(0.5) within group (order by o.attainment) filter (where o.recovered = 'no'),
         count(*) filter (where o.recovered = 'yes') >= 2 and count(*) filter (where o.recovered = 'no') >= 2
  from highest h
  left join occ o on o.highest_impediment_id = h.id
  group by h.id, h.name;
end
$$;

-- Card 4 — Cue usefulness. Same shape as card 1, on used vs not used.
create or replace function public.insight_cue_usefulness(p_sprint_id uuid)
returns table (
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.insight_sprint_owned(p_sprint_id);

  return query
  with days as (
    select * from public.sprint_days_effective where sprint_id = p_sprint_id
  ),
  members as (
    select m.cue_id as id, c.name, m.is_focus
    from public.sprint_cues m
    join public.cues c on c.id = m.cue_id
    where m.sprint_id = p_sprint_id
  ),
  obs as (
    select o.cue_id, o.used, d.attainment
    from public.day_cue_observations o
    join days d on d.id = o.sprint_day_id
  )
  select m.id,
         m.name,
         m.is_focus,
         count(*) filter (where o.used = 'yes')::integer,
         count(*) filter (where o.used = 'no')::integer,
         count(*) filter (where o.used in ('yes', 'no', 'unsure'))::integer,
         count(*) filter (where o.used = 'unsure')::integer,
         percentile_cont(0.5) within group (order by o.attainment) filter (where o.used = 'yes'),
         percentile_cont(0.5) within group (order by o.attainment) filter (where o.used = 'no'),
         case when count(*) filter (where o.used = 'yes') >= public.insight_min_days()
               and count(*) filter (where o.used = 'no')  >= public.insight_min_days()
           then round((percentile_cont(0.5) within group (order by o.attainment) filter (where o.used = 'yes')
                     - percentile_cont(0.5) within group (order by o.attainment) filter (where o.used = 'no')) * 100)::integer
         end,
         count(*) filter (where o.used = 'yes') >= public.insight_min_days()
           and count(*) filter (where o.used = 'no') >= public.insight_min_days()
  from members m
  left join obs o on o.cue_id = m.id
  group by m.id, m.name, m.is_focus
  order by m.is_focus desc, 10 desc nulls last, m.name;
end
$$;

-- The result card: the numbers the postmortem opens with.
create or replace function public.sprint_review_summary(p_sprint_id uuid)
returns table (
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.insight_sprint_owned(p_sprint_id);

  return query
  select coalesce(sum(d.actual) filter (where d.closed_at is not null and not d.cancelled), 0)::bigint,
         s.amount,
         round(coalesce(sum(d.actual) filter (where d.closed_at is not null and not d.cancelled), 0) * 100.0
             / nullif(s.amount, 0))::integer,
         coalesce(sum(d.actual) filter (where d.closed_at is not null and not d.cancelled), 0) >= s.amount,
         count(*) filter (where d.closed_at is not null)::integer,
         count(*) filter (where d.closed_at is null and not d.cancelled)::integer,
         count(*) filter (where d.cancelled)::integer,
         public.sprint_best_streak(p_sprint_id),
         s.status
  from public.sprints s
  join public.sprint_days d on d.sprint_id = s.id
  where s.id = p_sprint_id
  group by s.id, s.amount, s.status;
end
$$;

grant execute on function public.insight_impediment_impact(uuid)      to authenticated;
grant execute on function public.insight_response_followthrough(uuid) to authenticated;
grant execute on function public.insight_response_recovery(uuid)      to authenticated;
grant execute on function public.insight_cue_usefulness(uuid)         to authenticated;
grant execute on function public.sprint_review_summary(uuid)          to authenticated;
