-- ---------------------------------------------------------------------------
-- 0014 — three corrections to 0012's insight calculations, found by
-- tests/db/insights.test.ts before any of this reached a screen. 0012 is applied,
-- so they arrive here rather than as an edit.
--
-- 1. `sprint_days_effective` never exposed the proof-point snapshot, so the two
--    response cards could not name the WHEN → THEN they were reporting on
--    ("column d.proof_then does not exist").
-- 2. `percentile_cont` over a numeric returns DOUBLE PRECISION, not numeric, so
--    every median column mismatched its declared type and the four functions
--    raised "structure of query does not match function result type". The medians
--    are cast back to numeric: they are ratios shown to the reader as percentages,
--    and numeric is what the rest of the schema uses for them.
-- 3. `impact` is the day's answer about the HIGHEST impediment only (0010 stores it
--    on the day row beside `response`/`recovered`). 0012 counted it for every
--    impediment row, which reads as evidence about an item nobody was asked about.
--    The tally is now zero on any row that is not the highest.
-- ---------------------------------------------------------------------------

create or replace view public.sprint_days_effective
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
       d.actual::numeric / d.target::numeric as attainment,
       d.proof_when,
       d.proof_then,
       d.proof_recover
from public.sprint_days d
where d.closed_at is not null
  and not d.cancelled
  and d.target > 0;

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
         (percentile_cont(0.5) within group (order by o.attainment) filter (where o.recovered = 'yes'))::numeric,
         (percentile_cont(0.5) within group (order by o.attainment) filter (where o.recovered = 'no'))::numeric,
         count(*) filter (where o.recovered = 'yes') >= 2 and count(*) filter (where o.recovered = 'no') >= 2
  from highest h
  left join occ o on o.highest_impediment_id = h.id
  group by h.id, h.name;
end
$$;

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
