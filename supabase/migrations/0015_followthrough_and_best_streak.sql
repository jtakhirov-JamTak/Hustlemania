-- ---------------------------------------------------------------------------
-- 0015 — two corrections from the F10 evaluation (docs/evals/eval-06.md, P2-3 and
-- P2-5). 0012 and 0014 are applied, so these arrive as a new migration.
--
-- 1. `insight_response_followthrough.answered` counted only `yes` and `no`, so a
--    `partially` day was treated as unanswered. That is wrong twice over: the SPEC's
--    rule is that only `unsure` and `unanswered` leave a denominator, and "partially"
--    is plainly an answer. The effect was that someone who answered every single
--    occurrence could still see "Not enough data", and a sprint answered entirely with
--    `partially` rendered "response ran 0 of 0 answered". `answered` now includes
--    `partially`; `ran` still means `yes` only, so the rate falls when the response
--    only half ran — which is the honest reading.
--
-- 2. `sprint_best_streak` grouped by `day_index - row_number()`, so a cancelled day in
--    the middle of a run split it. `sprint_streak_at` removes cancelled days from the
--    sequence instead, and the SPEC defines best streak as the longest run "among
--    non-cancelled days" — the same thing. The two disagreed (6 vs 3 on the
--    evaluator's fixture). Best streak now renumbers the non-cancelled days first and
--    looks for gaps in that ordinal, so the two functions answer the same question.
--    Only reachable by writing a cancelled day directly today, since closure only ever
--    cancels from the closure date forward; pinned so it stays true.
-- ---------------------------------------------------------------------------

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
         -- `partially` is an answer; only `unsure` and an unanswered day leave the
         -- denominator (C5, and the SPEC's own rule).
         count(*) filter (where o.response in ('yes', 'no', 'partially'))::integer,
         count(*) filter (where o.response = 'yes')::integer,
         count(*) filter (where o.response = 'no')::integer,
         count(*) filter (where o.response = 'partially')::integer,
         count(*) filter (where o.response = 'unsure')::integer,
         case when count(*) filter (where o.response in ('yes', 'no', 'partially')) >= public.insight_min_days()
           then round(count(*) filter (where o.response = 'yes') * 100.0
                    / nullif(count(*) filter (where o.response in ('yes', 'no', 'partially')), 0))::integer
         end,
         count(*) filter (where o.response in ('yes', 'no', 'partially')) >= public.insight_min_days()
  from highest h
  left join occ o on o.highest_impediment_id = h.id
  group by h.id, h.name;
end
$$;

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
      -- `ord` numbers the non-cancelled days, so a cancelled day is removed from the
      -- sequence rather than punching a hole in it (as sprint_streak_at does).
      select seq.ord - row_number() over (order by seq.ord) as grp
      from (
        select row_number() over (order by d.day_index) as ord, d.closed_on_time
        from public.sprint_days d
        where d.sprint_id = p_sprint_id and not d.cancelled
      ) seq
      where seq.closed_on_time
    ) runs
    group by grp
  ) counted;

  return v_best;
end
$$;
