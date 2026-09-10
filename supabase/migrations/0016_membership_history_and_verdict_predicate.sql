-- ---------------------------------------------------------------------------
-- 0016 — two dead ends found by the 2026-09-09 full review (docs/FIX_LOG.md), each
-- of which left an Area permanently unable to start another sprint. 0012 and 0014
-- are applied, so both fixes arrive as a new migration.
--
-- 1. A member removed mid-sprint and added back is TWO membership rows: the removed
--    row is kept as history (the postmortem lists what was dropped on day 3), and
--    `add_sprint_item` inserts a fresh one. Three readers took one row per membership
--    row instead of one per item:
--      · `finish_review` inserted one `review_decisions` row per membership row, so the
--        (review_id, kind, item_id) unique key fired, the transaction rolled back, the
--        client read the generic "try again", and rule 26 kept the Area locked for
--        good. The fill is now `select distinct kind, item_id`.
--      · `insight_impediment_impact` and `insight_cue_usefulness` joined every
--        observation once per membership row, doubling present/absent/logged counts
--        (a coverage line reading "Logged 4 of 2 closed days") and letting a row clear
--        n≥3 on two real days. `members` is now one row per item; `is_highest` /
--        `is_focus` is `bool_or` over the item's rows, which the partial unique indexes
--        already make true for at most one row.
--    The membership history itself is unchanged: one row per window is the record.
--
-- 2. `finish_review` asked for a verdict when ANY observation was `was_highest and
--    occurred = 'yes'`, while the postmortem decides whether to show the verdict chips
--    from `insight_response_followthrough`, which only reads the CURRENT highest
--    (`sprint_impediments.is_highest`). Promote a different impediment after the first
--    one occurred and the two disagree: the UI shows no chips and sends null, the DB
--    raises `verdict_required`, and nothing the user can click changes that. The SPEC
--    (F10, `finish_review`) says "the sprint's highest impediment" — one item — so the
--    predicate now names the current highest the way the follow-through function does:
--    an effective day whose snapshot `highest_impediment_id` is that item and whose
--    `was_highest` observation occurred. The earlier highest's answers stay in the
--    day rows; they are simply not the proof point under review (BACKLOG).
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
  -- postmortem shows the verdict at all, so the two can never disagree.
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

  -- Every member gets ONE row: the caller's choice where given, 'keep' otherwise. An
  -- item removed and added back has two membership rows and is still one item.
  insert into public.review_decisions (review_id, user_id, kind, item_id, decision)
  select v_review, v_uid, m.kind, m.item_id,
         coalesce((select x.decision
                   from jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb))
                          as x(kind text, item_id uuid, decision text)
                   where x.kind = m.kind and x.item_id = m.item_id
                   limit 1), 'keep')
  from (
    select distinct 'impediment'::text as kind, mi.impediment_id as item_id
    from public.sprint_impediments mi where mi.sprint_id = p_sprint_id
    union
    select distinct 'cue'::text, mc.cue_id
    from public.sprint_cues mc where mc.sprint_id = p_sprint_id
  ) m;

  return v_review;
end
$$;

-- ---------------------------------------------------------------------------

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
    -- One row per ITEM. A member removed and added back has two membership rows;
    -- joining observations once per row would count every day twice.
    select m.impediment_id as id, i.name, bool_or(m.is_highest) as is_highest
    from public.sprint_impediments m
    join public.impediments i on i.id = m.impediment_id
    where m.sprint_id = p_sprint_id
    group by m.impediment_id, i.name
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
         (percentile_cont(0.5) within group (order by o.attainment)
           filter (where o.occurred = 'yes'))::numeric,
         (percentile_cont(0.5) within group (order by o.attainment)
           filter (where o.occurred = 'no'))::numeric,
         case when count(*) filter (where o.occurred = 'yes') >= public.insight_min_days()
               and count(*) filter (where o.occurred = 'no')  >= public.insight_min_days()
           then round(((percentile_cont(0.5) within group (order by o.attainment) filter (where o.occurred = 'yes'))::numeric
                     - (percentile_cont(0.5) within group (order by o.attainment) filter (where o.occurred = 'no'))::numeric) * 100)::integer
         end,
         count(*) filter (where o.occurred = 'yes') >= public.insight_min_days()
           and count(*) filter (where o.occurred = 'no') >= public.insight_min_days(),
         count(*) filter (where m.is_highest and o.occurred = 'yes' and o.impact = 'a_lot')::integer,
         count(*) filter (where m.is_highest and o.occurred = 'yes' and o.impact = 'some')::integer,
         count(*) filter (where m.is_highest and o.occurred = 'yes' and o.impact = 'nothing')::integer
  from members m
  left join obs o on o.impediment_id = m.id
  group by m.id, m.name, m.is_highest
  order by m.is_highest desc, 10 nulls last, m.name;
end
$$;

-- ---------------------------------------------------------------------------

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
    -- One row per ITEM (see insight_impediment_impact above).
    select m.cue_id as id, c.name, bool_or(m.is_focus) as is_focus
    from public.sprint_cues m
    join public.cues c on c.id = m.cue_id
    where m.sprint_id = p_sprint_id
    group by m.cue_id, c.name
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
         (percentile_cont(0.5) within group (order by o.attainment) filter (where o.used = 'yes'))::numeric,
         (percentile_cont(0.5) within group (order by o.attainment) filter (where o.used = 'no'))::numeric,
         case when count(*) filter (where o.used = 'yes') >= public.insight_min_days()
               and count(*) filter (where o.used = 'no')  >= public.insight_min_days()
           then round(((percentile_cont(0.5) within group (order by o.attainment) filter (where o.used = 'yes'))::numeric
                     - (percentile_cont(0.5) within group (order by o.attainment) filter (where o.used = 'no'))::numeric) * 100)::integer
         end,
         count(*) filter (where o.used = 'yes') >= public.insight_min_days()
           and count(*) filter (where o.used = 'no') >= public.insight_min_days()
  from members m
  left join obs o on o.cue_id = m.id
  group by m.id, m.name, m.is_focus
  order by m.is_focus desc, 10 desc nulls last, m.name;
end
$$;

-- `create or replace` keeps each function's ACL (0013's revoke-from-public and the
-- authenticated grants), which tests/db/grants.test.ts pins on every run.
