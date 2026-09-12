-- 0019_situations — F15: one response covers many situations.
--
-- The response is the library item: an impediment is WHEN (`name`) → INTERFERES →
-- THEN → RECOVERED WHEN, a cue is WHEN → REMIND, and each carries one or more
-- SITUATIONS it applies to. Situations are library entities of their own, one list per
-- kind (`situations.kind`), attached through `impediment_situations` / `cue_situations`.
-- Day Close asks, per impediment that showed up, which situations it was and whether
-- the user recovered from each; per cue used, which situations it applied to. The
-- Highest's three day-row answers (response / recovered / impact) are no longer asked.
--
-- Data-transforming, every user's rows (the hosted project is live, DECISIONS
-- 2026-09-10/11): each existing impediment and cue becomes its own first situation
-- (same id, so the conversion is traceable and needs no mapping table), an impediment's
-- WHEN moves into `name` where it had one, and every legacy observation row gets its
-- situation row so history feeds the new cards. Nothing is deleted. The six legacy
-- day columns (`proof_when`, `proof_then`, `proof_recover`, `response`, `recovered`,
-- `impact`) stay on `sprint_days`, never written again, still locked by the 0012
-- immutability trigger, and removed from the effective-days view so no calculation can
-- read them (global rule: data with history value is not deleted; BACKLOG: drop once no
-- hosted row carries a value). An assertion at the end refuses to commit a conversion
-- that left any item without a situation.
--
-- Rules amended (docs/SPEC.md F15): 3 → 0–3 cues, 4 → 1–3 impediments, 6 → every sprint
-- impediment carries THEN + RECOVERED WHEN at start / add (the validity check keeps the
-- Highest-only form so a legacy sprint is never locked out of archive / scope), the F7
-- focus cue is required only while the sprint has cues, and every member needs ≥1 live
-- situation.
--
-- Every function redefined here is rebuilt from its latest definer — `start_sprint`
-- from 0017, `sprint_invalid_reason`, `close_day` and `day_offered_items` from 0010,
-- `set_highest_impediment`, `impediments_before_update` and `library_item_before_insert`
-- from 0009, `archive_item` / `set_item_scope` from 0011, `add_sprint_item`,
-- `remove_sprint_item`, `restore_item`, `move_item` and `affected_sprints_check` from
-- 0004, `set_vision_rule` from 0011, `insight_impediment_impact` from 0016,
-- `insight_response_recovery` from 0014, the `_many` wrappers from 0017 — and
-- tests/db/libraries.test.ts pins one marker per body. `sprint_days_immutable_after_close`
-- is NOT touched: its 0012 body still locks the legacy columns.

-- ---------------------------------------------------------------------------
-- situations — one library per kind; rank per (user, kind); archive like 0004.
-- ---------------------------------------------------------------------------
create table public.situations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('cue', 'impediment')),
  name        text not null check (btrim(name) <> ''),  -- private user text
  scope       text not null default 'global'
              check (scope in ('global', 'health', 'wealth', 'relationships')),
  rank        integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, kind)
);

create index situations_user_id_kind_rank_idx on public.situations (user_id, kind, rank);

create or replace function public.situations_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rank is null then
    select coalesce(max(rank), 0) + 1 into new.rank
    from public.situations where user_id = new.user_id and kind = new.kind;
  end if;
  new.name := btrim(new.name);
  return new;
end
$$;

create or replace function public.situations_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  return new;
end
$$;

create trigger situations_before_insert
  before insert on public.situations
  for each row execute function public.situations_before_insert();
create trigger situations_before_update
  before update on public.situations
  for each row execute function public.situations_before_update();
create trigger situations_set_updated_at
  before update on public.situations
  for each row execute function public.set_updated_at();

revoke all on function public.situations_before_insert() from public, anon, authenticated;
revoke all on function public.situations_before_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- impediment_situations / cue_situations — the attachments. The composite FK on
-- (situation_id, kind) makes a cue situation on an impediment impossible at DDL level.
-- Only set_item_situations writes them.
-- ---------------------------------------------------------------------------
create table public.impediment_situations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  impediment_id  uuid not null references public.impediments(id) on delete cascade,
  situation_id   uuid not null,
  situation_kind text not null default 'impediment' check (situation_kind = 'impediment'),
  created_at     timestamptz not null default now(),
  unique (impediment_id, situation_id),
  foreign key (situation_id, situation_kind) references public.situations (id, kind)
);

create index impediment_situations_user_id_idx on public.impediment_situations (user_id);
create index impediment_situations_situation_id_idx on public.impediment_situations (situation_id);

create table public.cue_situations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  cue_id         uuid not null references public.cues(id) on delete cascade,
  situation_id   uuid not null,
  situation_kind text not null default 'cue' check (situation_kind = 'cue'),
  created_at     timestamptz not null default now(),
  unique (cue_id, situation_id),
  foreign key (situation_id, situation_kind) references public.situations (id, kind)
);

create index cue_situations_user_id_idx on public.cue_situations (user_id);
create index cue_situations_situation_id_idx on public.cue_situations (situation_id);

-- ---------------------------------------------------------------------------
-- Observation rows gain the per-item proof snapshot (moved off the day row) and a
-- child row per offered situation. Immutable like their parents (UPDATE trigger;
-- DELETE open for the account cascade, as 0004 recorded); no updated_at.
-- ---------------------------------------------------------------------------
alter table public.day_impediment_observations
  add column proof_then    text,  -- private user text (snapshot)
  add column proof_recover text;  -- private user text (snapshot)

create table public.day_impediment_situation_observations (
  id             uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.day_impediment_observations(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  situation_id   uuid not null references public.situations(id),
  name           text not null,  -- private user text (snapshot)
  occurred       boolean not null default false,
  recovered      text check (recovered in ('yes', 'no')),
  created_at     timestamptz not null default now(),
  unique (observation_id, situation_id),
  constraint day_impediment_situation_observations_recovered_needs_occurred check (occurred or recovered is null)
);

create index day_impediment_situation_observations_user_id_idx on public.day_impediment_situation_observations (user_id);
create index day_impediment_situation_observations_situation_id_idx on public.day_impediment_situation_observations (situation_id);
create index day_impediment_situation_observations_observation_id_idx on public.day_impediment_situation_observations (observation_id);

create table public.day_cue_situation_observations (
  id             uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.day_cue_observations(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  situation_id   uuid not null references public.situations(id),
  name           text not null,  -- private user text (snapshot)
  applied        boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (observation_id, situation_id)
);

create index day_cue_situation_observations_user_id_idx on public.day_cue_situation_observations (user_id);
create index day_cue_situation_observations_situation_id_idx on public.day_cue_situation_observations (situation_id);
create index day_cue_situation_observations_observation_id_idx on public.day_cue_situation_observations (observation_id);

create trigger day_impediment_situation_observations_immutable
  before update on public.day_impediment_situation_observations
  for each row execute function public.day_selection_immutable();
create trigger day_cue_situation_observations_immutable
  before update on public.day_cue_situation_observations
  for each row execute function public.day_selection_immutable();

-- ---------------------------------------------------------------------------
-- RLS and grants — in the same migration that creates the tables. Situations: SELECT
-- own (archived included, rule 24), INSERT / UPDATE own, DELETE own only while no
-- attachment exists (the rule-19 analogue); `kind` is an anchor: insert-only. Scope,
-- rank and archive go through the library functions. Attachments and situation
-- observations: SELECT own, written only by SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
alter table public.situations                          enable row level security;
alter table public.impediment_situations               enable row level security;
alter table public.cue_situations                      enable row level security;
alter table public.day_impediment_situation_observations enable row level security;
alter table public.day_cue_situation_observations        enable row level security;

create policy situations_select on public.situations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy situations_insert on public.situations
  for insert to authenticated with check ((select auth.uid()) = user_id and archived_at is null);
create policy situations_update on public.situations
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy situations_delete on public.situations
  for delete to authenticated
  using ((select auth.uid()) = user_id
         and not exists (select 1 from public.impediment_situations a where a.situation_id = situations.id)
         and not exists (select 1 from public.cue_situations a where a.situation_id = situations.id));

create policy impediment_situations_select on public.impediment_situations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy cue_situations_select on public.cue_situations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy day_impediment_situation_observations_select on public.day_impediment_situation_observations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy day_cue_situation_observations_select on public.day_cue_situation_observations
  for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert (user_id, kind, name, scope), update (name), delete
  on public.situations to authenticated;
grant select on public.impediment_situations, public.cue_situations,
                public.day_impediment_situation_observations, public.day_cue_situation_observations
  to authenticated;
grant all on public.situations, public.impediment_situations, public.cue_situations,
             public.day_impediment_situation_observations, public.day_cue_situation_observations
  to service_role;

-- ---------------------------------------------------------------------------
-- Conversion — every user's rows, set-based, additive. The situation keeps the item's
-- id so the join needs no mapping; `name` keeps the old SITUATION text (that is what
-- the situation is), `rank` keeps the item's rank so the new list reads in the same
-- order. An impediment's WHEN becomes its name where it had one; a cue's situation is
-- its WHEN where it had one, else its REMIND. Legacy observation rows get one situation
-- row each (occurred = the item's own answer; recovered = the day's answer for the
-- Highest, the only item it was asked about) and the Highest rows carry the day's
-- proof snapshot. The old triggers are still in place for these statements and none
-- of them touches a proof column, so rule 22 stays silent.
-- ---------------------------------------------------------------------------
insert into public.situations (id, user_id, kind, name, scope, rank, created_at)
select i.id, i.user_id, 'impediment', i.name, i.scope, i.rank, i.created_at
from public.impediments i;

insert into public.impediment_situations (user_id, impediment_id, situation_id)
select i.user_id, i.id, i.id from public.impediments i;

insert into public.situations (id, user_id, kind, name, scope, rank, created_at)
select c.id, c.user_id, 'cue', coalesce(nullif(btrim(c.cue_when), ''), c.name), c.scope, c.rank, c.created_at
from public.cues c;

insert into public.cue_situations (user_id, cue_id, situation_id)
select c.user_id, c.id, c.id from public.cues c;

update public.impediments
set name = coalesce(nullif(btrim(proof_when), ''), name);

-- The observation rows are immutable by trigger (rule 17); the snapshot copy is the one
-- write history needs, so the trigger is off for this statement and on again after it.
alter table public.day_impediment_observations disable trigger day_impediment_observations_immutable;

update public.day_impediment_observations o
set proof_then = d.proof_then, proof_recover = d.proof_recover
from public.sprint_days d
where d.id = o.sprint_day_id and o.was_highest;

alter table public.day_impediment_observations enable trigger day_impediment_observations_immutable;

insert into public.day_impediment_situation_observations (observation_id, user_id, situation_id, name, occurred, recovered)
select o.id, o.user_id, o.impediment_id, o.name, o.occurred = 'yes',
       case when o.was_highest and o.occurred = 'yes' and d.recovered in ('yes', 'no') then d.recovered end
from public.day_impediment_observations o
join public.sprint_days d on d.id = o.sprint_day_id;

insert into public.day_cue_situation_observations (observation_id, user_id, situation_id, name, applied)
select o.id, o.user_id, o.cue_id, coalesce(nullif(btrim(o.cue_when), ''), o.name), o.used = 'yes'
from public.day_cue_observations o;

do $$
declare
  v_missing int;
begin
  select count(*) into v_missing
  from (
    select i.id from public.impediments i
    where not exists (select 1 from public.impediment_situations a where a.impediment_id = i.id)
    union all
    select c.id from public.cues c
    where not exists (select 1 from public.cue_situations a where a.cue_id = c.id)
  ) x;
  if v_missing > 0 then
    raise exception 'conversion_incomplete: % items without a situation', v_missing;
  end if;
  if (select count(*) from public.situations) <> (select count(*) from public.impediments) + (select count(*) from public.cues) then
    raise exception 'conversion_incomplete: situation count mismatch';
  end if;
end
$$;

-- WHEN now lives in `name`; the column grant goes with the column.
alter table public.impediments drop column proof_when;

-- ---------------------------------------------------------------------------
-- sprint_days_effective — the 0014 body minus the six legacy columns, so no calculation
-- can read a legacy answer. A view cannot drop columns through `create or replace`.
-- ---------------------------------------------------------------------------
drop view public.sprint_days_effective;

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
       d.actual::numeric / d.target::numeric as attainment
from public.sprint_days d
where d.closed_at is not null
  and not d.cancelled
  and d.target > 0;

grant select on public.sprint_days_effective to authenticated;

-- ---------------------------------------------------------------------------
-- library_item_usage — the 0009 view plus a `situation` branch: used = attached to an
-- item that has ever been a member; active = attached to a current member of an
-- active sprint.
-- ---------------------------------------------------------------------------
create or replace view public.library_item_usage
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
group by i.id
union all
select 'situation'::text,
       t.id,
       count(m.id) > 0,
       coalesce(bool_or(m.removed_at is null and s.status = 'active'), false)
from public.situations t
left join (
  select a.situation_id, m.id, m.removed_at, m.sprint_id
  from public.impediment_situations a
  join public.sprint_impediments m on m.impediment_id = a.impediment_id
  union all
  select a.situation_id, m.id, m.removed_at, m.sprint_id
  from public.cue_situations a
  join public.sprint_cues m on m.cue_id = a.cue_id
) m on m.situation_id = t.id
left join public.sprints s on s.id = m.sprint_id
group by t.id;

-- ---------------------------------------------------------------------------
-- library_item_before_insert — the 0009 body minus proof_when.
-- impediments_before_update — the 0009 body: rule 22 over THEN and RECOVERED WHEN.
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
  new.explanation := nullif(btrim(new.explanation), '');
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

-- ---------------------------------------------------------------------------
-- set_item_situations — replaces an item's attachment set atomically. The only writer
-- of the join tables. `no_situations` when the item is a current member of an active
-- sprint and the resulting live set would be empty; the library-level "≥1" for an
-- unused item is a UI rule (D5 precedent).
-- ---------------------------------------------------------------------------
create function public.set_item_situations(p_kind text, p_item_id uuid, p_situation_ids uuid[])
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

  if (select count(*) from public.situations where id = any(v_ids) and user_id = v_uid and kind = p_kind) <> cardinality(v_ids) then
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

revoke all on function public.set_item_situations(text, uuid, uuid[]) from public, anon;
grant execute on function public.set_item_situations(text, uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sprint_invalid_reason — the 0010 body with the amended rules: 0–3 cues, a focus only
-- while cues remain, 1–3 impediments, a highest, every member with ≥1 live situation
-- (`p_kind = 'situation'` excludes that situation from the count), and the Highest's
-- THEN + RECOVERED WHEN. Order follows the PRD rule order.
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
  if v_cues > 3 then return 'too_many_cues'; end if;
  if v_cues >= 1 and not exists (
    select 1 from public.sprint_cues
    where sprint_id = p_sprint_id and removed_at is null and is_focus
      and not coalesce(p_kind = 'cue' and cue_id = p_exclude_item, false)
  ) then return 'no_focus_cue'; end if;

  select count(*) into v_imps
  from public.sprint_impediments
  where sprint_id = p_sprint_id and removed_at is null
    and not coalesce(p_kind = 'impediment' and impediment_id = p_exclude_item, false);
  if v_imps < 1 then return 'no_impediments'; end if;
  if v_imps > 3 then return 'too_many_impediments'; end if;

  select i.proof_then, i.proof_recover into v_highest
  from public.sprint_impediments m
  join public.impediments i on i.id = m.impediment_id
  where m.sprint_id = p_sprint_id and m.is_highest and m.removed_at is null
    and not coalesce(p_kind = 'impediment' and m.impediment_id = p_exclude_item, false);
  if not found then return 'no_highest_impediment'; end if;

  -- F15: every remaining member keeps at least one live situation.
  if exists (
    select 1 from public.sprint_cues m
    where m.sprint_id = p_sprint_id and m.removed_at is null
      and not coalesce(p_kind = 'cue' and m.cue_id = p_exclude_item, false)
      and not exists (
        select 1 from public.cue_situations a
        join public.situations t on t.id = a.situation_id
        where a.cue_id = m.cue_id and t.archived_at is null
          and not coalesce(p_kind = 'situation' and t.id = p_exclude_item, false))
  ) or exists (
    select 1 from public.sprint_impediments m
    where m.sprint_id = p_sprint_id and m.removed_at is null
      and not coalesce(p_kind = 'impediment' and m.impediment_id = p_exclude_item, false)
      and not exists (
        select 1 from public.impediment_situations a
        join public.situations t on t.id = a.situation_id
        where a.impediment_id = m.impediment_id and t.archived_at is null
          and not coalesce(p_kind = 'situation' and t.id = p_exclude_item, false))
  ) then return 'no_situations'; end if;

  if v_highest.proof_then is null or v_highest.proof_recover is null then
    return 'proof_point_required';
  end if;

  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- affected_sprints_check — the 0004 body plus the `situation` kind: an active sprint is
-- affected when one of its current members is attached to the situation.
-- ---------------------------------------------------------------------------
create or replace function public.affected_sprints_check(p_kind text, p_item_id uuid, p_new_scope text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_failing jsonb := '[]'::jsonb;
  v_ids     uuid[] := '{}';
  r         record;
  v_reason  text;
begin
  for r in
    select s.id, s.area, s.outcome
    from public.sprints s
    where s.status = 'active'
      and (p_new_scope is null or p_new_scope not in ('global', s.area))
      and (
        (p_kind = 'cue' and exists (select 1 from public.sprint_cues m where m.sprint_id = s.id and m.cue_id = p_item_id and m.removed_at is null))
        or
        (p_kind = 'impediment' and exists (select 1 from public.sprint_impediments m where m.sprint_id = s.id and m.impediment_id = p_item_id and m.removed_at is null))
        or
        (p_kind = 'situation' and (
          exists (select 1 from public.sprint_cues m join public.cue_situations a on a.cue_id = m.cue_id
                  where m.sprint_id = s.id and m.removed_at is null and a.situation_id = p_item_id)
          or exists (select 1 from public.sprint_impediments m join public.impediment_situations a on a.impediment_id = m.impediment_id
                     where m.sprint_id = s.id and m.removed_at is null and a.situation_id = p_item_id)))
      )
    order by s.created_at
    for update of s
  loop
    v_ids := v_ids || r.id;
    v_reason := public.sprint_invalid_reason(r.id, p_kind, p_item_id);
    if v_reason is not null then
      v_failing := v_failing || jsonb_build_object('sprint_id', r.id, 'area', r.area, 'outcome', r.outcome, 'reason', v_reason);
    end if;
  end loop;
  return jsonb_build_object('sprint_ids', to_jsonb(v_ids), 'failing', v_failing);
end
$$;

-- ---------------------------------------------------------------------------
-- archive_item / set_item_scope — the 0011 bodies (vision_obstacle guard kept) plus the
-- `situation` kind and the focus clearing: a cue removed from a sprint by archive or
-- rescope drops its focus flag in the same UPDATE (the sprint may now have no cue).
-- A situation's scope is a filter, never a validity input; its archive is.
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
  if p_kind not in ('cue', 'impediment', 'situation') then raise exception 'invalid_kind'; end if;

  if p_kind = 'cue' then
    select user_id into v_owner from public.cues where id = p_item_id and user_id = v_uid for update;
  elsif p_kind = 'impediment' then
    select user_id into v_owner from public.impediments where id = p_item_id and user_id = v_uid for update;
  else
    select user_id into v_owner from public.situations where id = p_item_id and user_id = v_uid for update;
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
    update public.sprint_cues set removed_at = now(), is_focus = false
    where sprint_id = any(v_ids) and cue_id = p_item_id and removed_at is null;
    get diagnostics v_n = row_count;
    update public.cues set archived_at = coalesce(archived_at, now()) where id = p_item_id;
  elsif p_kind = 'impediment' then
    update public.sprint_impediments set removed_at = now()
    where sprint_id = any(v_ids) and impediment_id = p_item_id and removed_at is null;
    get diagnostics v_n = row_count;
    update public.impediments set archived_at = coalesce(archived_at, now()) where id = p_item_id;
  else
    update public.situations set archived_at = coalesce(archived_at, now()) where id = p_item_id;
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
  if p_kind not in ('cue', 'impediment', 'situation') then raise exception 'invalid_kind'; end if;
  if p_scope not in ('global', 'health', 'wealth', 'relationships') then raise exception 'invalid_scope'; end if;

  if p_kind = 'situation' then
    update public.situations set scope = p_scope where id = p_item_id and user_id = v_uid;
    if not found then raise exception 'item_not_found'; end if;
    return jsonb_build_object('ok', true, 'removed_from', 0);
  end if;

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
    update public.sprint_cues set removed_at = now(), is_focus = false
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

-- ---------------------------------------------------------------------------
-- restore_item / move_item — the 0004 bodies plus the `situation` kind (neighbours
-- within the same user and kind).
-- ---------------------------------------------------------------------------
create or replace function public.restore_item(p_kind text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('cue', 'impediment', 'situation') then raise exception 'invalid_kind'; end if;
  if p_kind = 'cue' then
    update public.cues set archived_at = null where id = p_item_id and user_id = v_uid;
  elsif p_kind = 'impediment' then
    update public.impediments set archived_at = null where id = p_item_id and user_id = v_uid;
  else
    update public.situations set archived_at = null where id = p_item_id and user_id = v_uid;
  end if;
  if not found then raise exception 'item_not_found'; end if;
end
$$;

create or replace function public.move_item(p_kind text, p_item_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_rank     integer;
  v_kind     text;
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
    select rank, kind into v_rank, v_kind from public.situations where id = p_item_id and user_id = v_uid and archived_at is null for update;
    if v_rank is null then raise exception 'item_not_found'; end if;
    if p_direction = 'up' then
      select id, rank into v_other_id, v_other from public.situations
      where user_id = v_uid and kind = v_kind and archived_at is null and (rank, id) < (v_rank, p_item_id)
      order by rank desc, id desc limit 1 for update;
    else
      select id, rank into v_other_id, v_other from public.situations
      where user_id = v_uid and kind = v_kind and archived_at is null and (rank, id) > (v_rank, p_item_id)
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
-- add_sprint_item / remove_sprint_item — the 0004 bodies with the amended rules: caps
-- 3 / 3; a member needs a live situation; an impediment needs THEN + RECOVERED WHEN;
-- the first cue of a sprint becomes the focus; removing the last cue clears the focus
-- in the same UPDATE (the focus-active check would otherwise fire).
-- ---------------------------------------------------------------------------
create or replace function public.add_sprint_item(p_sprint_id uuid, p_kind text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_sprint record;
  v_item   record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('cue', 'impediment') then raise exception 'invalid_kind'; end if;

  select id, area, status into v_sprint from public.sprints
  where id = p_sprint_id and user_id = v_uid for update;
  if v_sprint.id is null then raise exception 'sprint_not_found'; end if;
  if v_sprint.status <> 'active' then raise exception 'sprint_not_active'; end if;

  if p_kind = 'cue' then
    select id, scope, archived_at, null::text as proof_then, null::text as proof_recover into v_item
    from public.cues where id = p_item_id and user_id = v_uid;
  else
    select id, scope, archived_at, proof_then, proof_recover into v_item
    from public.impediments where id = p_item_id and user_id = v_uid;
  end if;
  if v_item.id is null then raise exception 'item_not_found'; end if;
  if v_item.archived_at is not null then raise exception 'item_archived'; end if;
  if v_item.scope not in ('global', v_sprint.area) then raise exception 'item_out_of_scope'; end if;

  if p_kind = 'cue' then
    if not exists (select 1 from public.cue_situations a join public.situations t on t.id = a.situation_id
                   where a.cue_id = p_item_id and t.archived_at is null) then
      raise exception 'no_situations';
    end if;
    if exists (select 1 from public.sprint_cues where sprint_id = p_sprint_id and cue_id = p_item_id and removed_at is null) then
      raise exception 'already_in_sprint';
    end if;
    if (select count(*) from public.sprint_cues where sprint_id = p_sprint_id and removed_at is null) >= 3 then
      raise exception 'too_many_cues';
    end if;
    insert into public.sprint_cues (sprint_id, user_id, cue_id, is_focus)
    values (p_sprint_id, v_uid, p_item_id,
            not exists (select 1 from public.sprint_cues where sprint_id = p_sprint_id and removed_at is null and is_focus));
  else
    if not exists (select 1 from public.impediment_situations a join public.situations t on t.id = a.situation_id
                   where a.impediment_id = p_item_id and t.archived_at is null) then
      raise exception 'no_situations';
    end if;
    if v_item.proof_then is null or v_item.proof_recover is null then
      raise exception 'proof_point_required';
    end if;
    if exists (select 1 from public.sprint_impediments where sprint_id = p_sprint_id and impediment_id = p_item_id and removed_at is null) then
      raise exception 'already_in_sprint';
    end if;
    if (select count(*) from public.sprint_impediments where sprint_id = p_sprint_id and removed_at is null) >= 3 then
      raise exception 'too_many_impediments';
    end if;
    insert into public.sprint_impediments (sprint_id, user_id, impediment_id) values (p_sprint_id, v_uid, p_item_id);
  end if;
end
$$;

create or replace function public.remove_sprint_item(p_sprint_id uuid, p_kind text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_sprint record;
  v_reason text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('cue', 'impediment') then raise exception 'invalid_kind'; end if;

  select id, status into v_sprint from public.sprints
  where id = p_sprint_id and user_id = v_uid for update;
  if v_sprint.id is null then raise exception 'sprint_not_found'; end if;
  if v_sprint.status <> 'active' then raise exception 'sprint_not_active'; end if;

  v_reason := public.sprint_invalid_reason(p_sprint_id, p_kind, p_item_id);
  if v_reason is not null then raise exception '%', v_reason; end if;

  if p_kind = 'cue' then
    update public.sprint_cues set removed_at = now(), is_focus = false
    where sprint_id = p_sprint_id and cue_id = p_item_id and removed_at is null;
  else
    update public.sprint_impediments set removed_at = now()
    where sprint_id = p_sprint_id and impediment_id = p_item_id and removed_at is null;
  end if;
  if not found then raise exception 'not_in_sprint'; end if;
end
$$;

-- ---------------------------------------------------------------------------
-- set_highest_impediment — the 0009 body minus WHEN. The five-argument form is dropped:
-- two overloads would make the RPC ambiguous.
-- ---------------------------------------------------------------------------
drop function public.set_highest_impediment(uuid, uuid, text, text, text);

create function public.set_highest_impediment(
  p_sprint_id uuid,
  p_impediment_id uuid,
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

  if nullif(btrim(p_proof_then), '') is not null
     or nullif(btrim(p_proof_recover), '') is not null then
    update public.impediments
    set proof_then    = coalesce(nullif(btrim(p_proof_then), ''), proof_then),
        proof_recover = coalesce(nullif(btrim(p_proof_recover), ''), proof_recover)
    where id = p_impediment_id and user_id = v_uid;
    if not found then raise exception 'item_not_found'; end if;
  end if;

  select i.proof_then, i.proof_recover into v_proof
  from public.impediments i
  where i.id = p_impediment_id;
  if v_proof.proof_then is null or v_proof.proof_recover is null then
    raise exception 'proof_point_required';
  end if;

  update public.sprint_impediments set is_highest = false
  where sprint_id = p_sprint_id and is_highest and impediment_id <> p_impediment_id;
  update public.sprint_impediments set is_highest = true
  where sprint_id = p_sprint_id and impediment_id = p_impediment_id and removed_at is null;
end
$$;

revoke all on function public.set_highest_impediment(uuid, uuid, text, text) from public, anon;
grant execute on function public.set_highest_impediment(uuid, uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_vision_rule — the 0011 body; WHEN is the obstacle's name now.
-- ---------------------------------------------------------------------------
create or replace function public.set_vision_rule(p_when text, p_then text, p_recover text)
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
  set name = v_when, proof_then = v_then, proof_recover = v_recover
  where id = v_imp;
end
$$;

-- ---------------------------------------------------------------------------
-- start_sprint — the 0017 body with the amended rules and without p_proof_when. The
-- 0017 signature is dropped so there is one entry point.
-- ---------------------------------------------------------------------------
drop function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, text, bigint[], text[]);

create function public.start_sprint(
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
  v_vision  uuid;
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
  select v_sprint, v_uid, x, x = v_focus from unnest(v_cues) as x;

  insert into public.sprint_impediments (sprint_id, user_id, impediment_id, is_highest)
  select v_sprint, v_uid, x, x = v_highest from unnest(v_imps) as x;

  return v_sprint;
exception
  when unique_violation then
    raise exception 'active_sprint_exists';
end
$$;

revoke all on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, bigint[], text[])
  from public, anon;
grant execute on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, uuid, text, text, text, bigint[], text[])
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- day_offered_items — the 0010 body without proof_when, plus each item's live
-- situations as of the call (`[{id, name, rank}]`, rank order). Return type changes:
-- dropped and recreated, grants re-applied.
-- ---------------------------------------------------------------------------
drop function public.day_offered_items(uuid);

create function public.day_offered_items(p_sprint_day_id uuid)
returns table (kind text, item_id uuid, name text, explanation text, cue_when text, proof_then text, proof_recover text, is_focus boolean, rank integer, situations jsonb)
language sql
stable
set search_path = ''
as $$
  select distinct on (kind, item_id) *
  from (
    select 'impediment'::text as kind, i.id as item_id, i.name, i.explanation, null::text as cue_when,
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

revoke all on function public.day_offered_items(uuid) from public, anon;
grant execute on function public.day_offered_items(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- close_day — the 0010 body (lock, future / backfill logic, closed_on_time, streak
-- return) with situations in place of the Highest's three answers.
-- p_impediments: [{ "item_id", "answer", "situations": [{ "situation_id", "recovered" }] }]
-- p_cues:        [{ "item_id", "answer", "situations": [{ "situation_id" }] }]
-- answer in yes / no / unsure; an item absent from the array is `unanswered`. A `yes`
-- needs at least one situation, each offered for that item, none twice; any other
-- answer carries none. `recovered` (impediments only) is yes / no or null — blank is a
-- real answer state. One situation row is written per offered situation of every
-- offered item, so the breakdown never has to derive an answer from an absent row.
-- The 0010 signature is dropped so there is one entry point.
-- ---------------------------------------------------------------------------
drop function public.close_day(uuid, bigint, text, jsonb, jsonb, text, text, text);

create function public.close_day(
  p_sprint_day_id  uuid,
  p_actual         bigint,
  p_notes          text default null,
  p_impediments    jsonb default '[]',
  p_cues           jsonb default '[]'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_day       record;
  v_today     date;
  v_imps      jsonb := coalesce(p_impediments, '[]'::jsonb);
  v_cues      jsonb := coalesce(p_cues, '[]'::jsonb);
  v_highest   uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_actual is null or p_actual < 0 then
    raise exception 'invalid_actual';
  end if;
  if jsonb_typeof(v_imps) <> 'array' or jsonb_typeof(v_cues) <> 'array' then
    raise exception 'invalid_answer';
  end if;

  select d.id, d.date, d.closed_at, d.sprint_id, s.tz, s.status
  into v_day
  from public.sprint_days d
  join public.sprints s on s.id = d.sprint_id
  where d.id = p_sprint_day_id and d.user_id = v_uid
  for update of d;

  if v_day.id is null then
    raise exception 'day_not_found';
  end if;
  if v_day.closed_at is not null then
    raise exception 'day_closed';
  end if;
  if v_day.status <> 'active' then
    raise exception 'sprint_not_active';
  end if;

  v_today := (now() at time zone v_day.tz)::date;
  if v_day.date > v_today then
    raise exception 'day_in_future';
  end if;

  -- Answers: on the scale, one per item, and only for what this day offered (rule 23).
  if exists (
    select 1 from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text, situations jsonb)
    where x.item_id is null or x.answer is null or x.answer not in ('yes', 'no', 'unsure')
       or (x.situations is not null and jsonb_typeof(x.situations) <> 'array')
  ) or exists (
    select 1 from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text, situations jsonb)
    where x.item_id is null or x.answer is null or x.answer not in ('yes', 'no', 'unsure')
       or (x.situations is not null and jsonb_typeof(x.situations) <> 'array')
  ) then
    raise exception 'invalid_answer';
  end if;
  if (select count(*) - count(distinct item_id) from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text)) > 0
  or (select count(*) - count(distinct item_id) from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text)) > 0 then
    raise exception 'duplicate_item';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text)
    where x.item_id not in (select item_id from public.day_offered_items(p_sprint_day_id) where kind = 'impediment')
  ) or exists (
    select 1 from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text)
    where x.item_id not in (select item_id from public.day_offered_items(p_sprint_day_id) where kind = 'cue')
  ) then
    raise exception 'item_not_offered';
  end if;

  -- Situations: only with a `yes`, at least one then, each offered for the item, none
  -- twice; `recovered` on its scale for impediments and absent for cues.
  if exists (
    select 1
    from (
      select x.answer, coalesce(x.situations, '[]'::jsonb) as situations
      from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text, situations jsonb)
      union all
      select x.answer, coalesce(x.situations, '[]'::jsonb)
      from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text, situations jsonb)
    ) y
    where y.answer <> 'yes' and jsonb_array_length(y.situations) > 0
  ) then
    raise exception 'situations_not_applicable';
  end if;
  if exists (
    select 1
    from (
      select x.answer, coalesce(x.situations, '[]'::jsonb) as situations
      from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text, situations jsonb)
      union all
      select x.answer, coalesce(x.situations, '[]'::jsonb)
      from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text, situations jsonb)
    ) y
    where y.answer = 'yes' and jsonb_array_length(y.situations) = 0
  ) then
    raise exception 'situations_required';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text, situations jsonb)
    cross join lateral jsonb_to_recordset(coalesce(x.situations, '[]'::jsonb)) as s(situation_id uuid, recovered text)
    where s.situation_id is null or (s.recovered is not null and s.recovered not in ('yes', 'no'))
  ) or exists (
    select 1
    from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text, situations jsonb)
    cross join lateral jsonb_to_recordset(coalesce(x.situations, '[]'::jsonb)) as s(situation_id uuid, recovered text)
    where s.situation_id is null or s.recovered is not null
  ) then
    raise exception 'invalid_answer';
  end if;
  if exists (
    select 1
    from (
      select x.item_id, s.situation_id
      from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text, situations jsonb)
      cross join lateral jsonb_to_recordset(coalesce(x.situations, '[]'::jsonb)) as s(situation_id uuid)
      union all
      select x.item_id, s.situation_id
      from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text, situations jsonb)
      cross join lateral jsonb_to_recordset(coalesce(x.situations, '[]'::jsonb)) as s(situation_id uuid)
    ) y
    group by y.item_id, y.situation_id
    having count(*) > 1
  ) then
    raise exception 'duplicate_situation';
  end if;
  if exists (
    select 1
    from (
      select 'impediment'::text as kind, x.item_id, s.situation_id
      from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text, situations jsonb)
      cross join lateral jsonb_to_recordset(coalesce(x.situations, '[]'::jsonb)) as s(situation_id uuid)
      union all
      select 'cue', x.item_id, s.situation_id
      from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text, situations jsonb)
      cross join lateral jsonb_to_recordset(coalesce(x.situations, '[]'::jsonb)) as s(situation_id uuid)
    ) y
    where not exists (
      select 1 from public.day_offered_items(p_sprint_day_id) o
      cross join lateral jsonb_to_recordset(o.situations) as t(id uuid)
      where o.kind = y.kind and o.item_id = y.item_id and t.id = y.situation_id)
  ) then
    raise exception 'situation_not_offered';
  end if;

  select m.impediment_id into v_highest
  from public.sprint_impediments m
  where m.sprint_id = v_day.sprint_id and m.is_highest and m.removed_at is null;

  -- On time = closed on the day's own date in the sprint's zone (PRD §9). Any later
  -- date is a backfill: it counts, it never repairs the streak (rule 18).
  update public.sprint_days
  set actual = p_actual,
      notes = nullif(btrim(p_notes), ''),
      closed_at = now(),
      closed_on_time = v_today <= v_day.date,
      highest_impediment_id = v_highest
  where id = p_sprint_day_id;

  insert into public.day_impediment_observations (sprint_day_id, user_id, impediment_id, name, occurred, was_highest, proof_then, proof_recover)
  select p_sprint_day_id, v_uid, o.item_id, o.name, coalesce(x.answer, 'unanswered'), coalesce(o.item_id = v_highest, false), o.proof_then, o.proof_recover
  from public.day_offered_items(p_sprint_day_id) o
  left join jsonb_to_recordset(v_imps) as x(item_id uuid, answer text) on x.item_id = o.item_id
  where o.kind = 'impediment';

  insert into public.day_cue_observations (sprint_day_id, user_id, cue_id, name, cue_when, used, was_focus)
  select p_sprint_day_id, v_uid, o.item_id, o.name, o.cue_when, coalesce(x.answer, 'unanswered'), o.is_focus
  from public.day_offered_items(p_sprint_day_id) o
  left join jsonb_to_recordset(v_cues) as x(item_id uuid, answer text) on x.item_id = o.item_id
  where o.kind = 'cue';

  insert into public.day_impediment_situation_observations (observation_id, user_id, situation_id, name, occurred, recovered)
  select obs.id, v_uid, t.id, t.name, s.situation_id is not null, s.recovered
  from public.day_offered_items(p_sprint_day_id) o
  cross join lateral jsonb_to_recordset(o.situations) as t(id uuid, name text)
  join public.day_impediment_observations obs on obs.sprint_day_id = p_sprint_day_id and obs.impediment_id = o.item_id
  left join (
    select x.item_id, s.situation_id, s.recovered
    from jsonb_to_recordset(v_imps) as x(item_id uuid, answer text, situations jsonb)
    cross join lateral jsonb_to_recordset(coalesce(x.situations, '[]'::jsonb)) as s(situation_id uuid, recovered text)
  ) s on s.item_id = o.item_id and s.situation_id = t.id
  where o.kind = 'impediment';

  insert into public.day_cue_situation_observations (observation_id, user_id, situation_id, name, applied)
  select obs.id, v_uid, t.id, t.name, s.situation_id is not null
  from public.day_offered_items(p_sprint_day_id) o
  cross join lateral jsonb_to_recordset(o.situations) as t(id uuid, name text)
  join public.day_cue_observations obs on obs.sprint_day_id = p_sprint_day_id and obs.cue_id = o.item_id
  left join (
    select x.item_id, s.situation_id
    from jsonb_to_recordset(v_cues) as x(item_id uuid, answer text, situations jsonb)
    cross join lateral jsonb_to_recordset(coalesce(x.situations, '[]'::jsonb)) as s(situation_id uuid)
  ) s on s.item_id = o.item_id and s.situation_id = t.id
  where o.kind = 'cue';

  return public.sprint_streak_at(v_day.sprint_id, now());
end
$$;

revoke all on function public.close_day(uuid, bigint, text, jsonb, jsonb) from public, anon;
grant execute on function public.close_day(uuid, bigint, text, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Insight calculations. Follow-through goes (the response question is no longer
-- asked). Impact loses the felt_* tally (the cost question is gone). Recovery becomes
-- one row per impediment over its situation rows. insight_situations is the new
-- per-situation breakdown. Every one reads sprint_days_effective and nothing else.
-- Return types change, so the functions and their _many wrappers are dropped and
-- recreated; Postgres grants EXECUTE to PUBLIC on a new function (0002, 0013), so
-- every one is revoked and granted again.
-- ---------------------------------------------------------------------------
drop function public.insight_response_followthrough_many(uuid[]);
drop function public.insight_response_followthrough(uuid);
drop function public.insight_impediment_impact_many(uuid[]);
drop function public.insight_impediment_impact(uuid);
drop function public.insight_response_recovery_many(uuid[]);
drop function public.insight_response_recovery(uuid);

create function public.insight_impediment_impact(p_sprint_id uuid)
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
    -- One row per ITEM (0016): a member removed and added back has two membership rows.
    select m.impediment_id as id, i.name, bool_or(m.is_highest) as is_highest
    from public.sprint_impediments m
    join public.impediments i on i.id = m.impediment_id
    where m.sprint_id = p_sprint_id
    group by m.impediment_id, i.name
  ),
  obs as (
    select o.impediment_id, o.sprint_day_id, o.occurred, d.attainment
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
           and count(*) filter (where o.occurred = 'no') >= public.insight_min_days()
  from members m
  left join obs o on o.impediment_id = m.id
  group by m.id, m.name, m.is_highest
  order by m.is_highest desc, 10 nulls last, m.name;
end
$$;

-- Recovery per impediment: on the days it showed up, across the situations it showed
-- up in, how often the recovery criterion was met. `verdict_occurrences` is the 0016
-- predicate (the current Highest, on an effective day whose snapshot names it), so
-- the postmortem's verdict chips and finish_review can never disagree.
create function public.insight_response_recovery(p_sprint_id uuid)
returns table (
  item_id             uuid,
  name                text,
  proof_then          text,
  proof_recover       text,
  is_highest          boolean,
  occurrences         integer,
  verdict_occurrences integer,
  answered            integer,
  recovered           integer,
  didnt               integer,
  rate                integer,
  enough              boolean
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
    select m.impediment_id as id, i.name, bool_or(m.is_highest) as is_highest
    from public.sprint_impediments m
    join public.impediments i on i.id = m.impediment_id
    where m.sprint_id = p_sprint_id
    group by m.impediment_id, i.name
  ),
  obs as (
    select o.id, o.impediment_id, o.occurred, o.was_highest, o.proof_then, o.proof_recover,
           d.highest_impediment_id
    from public.day_impediment_observations o
    join days d on d.id = o.sprint_day_id
    where o.occurred = 'yes'
  ),
  sit as (
    select so.observation_id, so.recovered
    from public.day_impediment_situation_observations so
    join obs on obs.id = so.observation_id
    where so.occurred
  ),
  per_item as (
    select o.impediment_id,
           count(*)::integer as occurrences,
           count(*) filter (where o.was_highest and o.highest_impediment_id = o.impediment_id)::integer as verdict_occurrences,
           max(o.proof_then) as proof_then,
           max(o.proof_recover) as proof_recover
    from obs o
    group by o.impediment_id
  ),
  per_sit as (
    select o.impediment_id,
           count(*) filter (where s.recovered in ('yes', 'no'))::integer as answered,
           count(*) filter (where s.recovered = 'yes')::integer as recovered,
           count(*) filter (where s.recovered = 'no')::integer as didnt
    from sit s
    join obs o on o.id = s.observation_id
    group by o.impediment_id
  )
  select m.id,
         m.name,
         p.proof_then,
         p.proof_recover,
         m.is_highest,
         coalesce(p.occurrences, 0),
         coalesce(p.verdict_occurrences, 0),
         coalesce(s.answered, 0),
         coalesce(s.recovered, 0),
         coalesce(s.didnt, 0),
         case when coalesce(s.answered, 0) >= public.insight_min_days()
           then round(s.recovered * 100.0 / s.answered)::integer end,
         coalesce(s.answered, 0) >= public.insight_min_days()
  from members m
  left join per_item p on p.impediment_id = m.id
  left join per_sit s on s.impediment_id = m.id
  order by m.is_highest desc, 11 desc nulls last, m.name;
end
$$;

-- Per situation: how often each showed up (impediments) or applied (cues) on effective
-- days, and for impediments how often the user recovered. `enough` at insight_min_days
-- on the answered recoveries (impediments) or the occurrences (cues). A situation the
-- day never offered has no row; that is "no data", not zero.
create function public.insight_situations(p_sprint_id uuid)
returns table (
  kind               text,
  item_id            uuid,
  item_name          text,
  situation_id       uuid,
  situation_name     text,
  occurrences        integer,
  asked_days         integer,
  recovered_yes      integer,
  recovered_answered integer,
  rate               integer,
  enough             boolean
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
  imp as (
    select o.impediment_id as item_id, so.situation_id, max(so.name) as situation_name,
           count(*) filter (where so.occurred)::integer as occurrences,
           count(*) filter (where o.occurred in ('yes', 'no', 'unsure'))::integer as asked_days,
           count(*) filter (where so.occurred and so.recovered = 'yes')::integer as recovered_yes,
           count(*) filter (where so.occurred and so.recovered in ('yes', 'no'))::integer as recovered_answered
    from public.day_impediment_situation_observations so
    join public.day_impediment_observations o on o.id = so.observation_id
    join days d on d.id = o.sprint_day_id
    group by o.impediment_id, so.situation_id
  ),
  cue as (
    select o.cue_id as item_id, so.situation_id, max(so.name) as situation_name,
           count(*) filter (where so.applied)::integer as occurrences,
           count(*) filter (where o.used in ('yes', 'no', 'unsure'))::integer as asked_days
    from public.day_cue_situation_observations so
    join public.day_cue_observations o on o.id = so.observation_id
    join days d on d.id = o.sprint_day_id
    group by o.cue_id, so.situation_id
  )
  select 'impediment'::text, x.item_id, i.name, x.situation_id, x.situation_name,
         x.occurrences, x.asked_days, x.recovered_yes, x.recovered_answered,
         case when x.recovered_answered >= public.insight_min_days()
           then round(x.recovered_yes * 100.0 / x.recovered_answered)::integer end,
         x.recovered_answered >= public.insight_min_days()
  from imp x
  join public.impediments i on i.id = x.item_id
  union all
  select 'cue', x.item_id, c.name, x.situation_id, x.situation_name,
         x.occurrences, x.asked_days, 0, 0, null,
         x.occurrences >= public.insight_min_days()
  from cue x
  join public.cues c on c.id = x.item_id
  order by 1 desc, 3, 6 desc, 5;
end
$$;

create function public.insight_impediment_impact_many(p_sprint_ids uuid[])
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
  enough         boolean
)
language sql
set search_path = ''
as $$
  select s.id, f.*
  from (select distinct x as id from unnest(coalesce(p_sprint_ids, '{}')) as x) s
  cross join lateral public.insight_impediment_impact(s.id) f;
$$;

create function public.insight_response_recovery_many(p_sprint_ids uuid[])
returns table (
  sprint_id           uuid,
  item_id             uuid,
  name                text,
  proof_then          text,
  proof_recover       text,
  is_highest          boolean,
  occurrences         integer,
  verdict_occurrences integer,
  answered            integer,
  recovered           integer,
  didnt               integer,
  rate                integer,
  enough              boolean
)
language sql
set search_path = ''
as $$
  select s.id, f.*
  from (select distinct x as id from unnest(coalesce(p_sprint_ids, '{}')) as x) s
  cross join lateral public.insight_response_recovery(s.id) f;
$$;

create function public.insight_situations_many(p_sprint_ids uuid[])
returns table (
  sprint_id          uuid,
  kind               text,
  item_id            uuid,
  item_name          text,
  situation_id       uuid,
  situation_name     text,
  occurrences        integer,
  asked_days         integer,
  recovered_yes      integer,
  recovered_answered integer,
  rate               integer,
  enough             boolean
)
language sql
set search_path = ''
as $$
  select s.id, f.*
  from (select distinct x as id from unnest(coalesce(p_sprint_ids, '{}')) as x) s
  cross join lateral public.insight_situations(s.id) f;
$$;

revoke all on function public.insight_impediment_impact(uuid)          from public, anon;
revoke all on function public.insight_response_recovery(uuid)          from public, anon;
revoke all on function public.insight_situations(uuid)                 from public, anon;
revoke all on function public.insight_impediment_impact_many(uuid[])   from public, anon;
revoke all on function public.insight_response_recovery_many(uuid[])   from public, anon;
revoke all on function public.insight_situations_many(uuid[])          from public, anon;
grant execute on function public.insight_impediment_impact(uuid)         to authenticated;
grant execute on function public.insight_response_recovery(uuid)         to authenticated;
grant execute on function public.insight_situations(uuid)                to authenticated;
grant execute on function public.insight_impediment_impact_many(uuid[])  to authenticated;
grant execute on function public.insight_response_recovery_many(uuid[])  to authenticated;
grant execute on function public.insight_situations_many(uuid[])         to authenticated;
