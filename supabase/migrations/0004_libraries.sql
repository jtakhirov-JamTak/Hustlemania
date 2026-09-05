-- 0004_libraries — Hustlemania F2: Execution Cue and Impediment libraries, sprint
-- membership (date-ranged), Highest Impediment, Day Close selections.
--
-- Same access model as 0001: RLS on every table in the migration that creates it, the
-- authenticated role gets SELECT plus the few columns a user may write directly, and
-- every write that carries an invariant (rules 3–6, 19–24 of the PRD) goes through a
-- SECURITY DEFINER function that takes identity from auth.uid().
--
-- Ranks are per user per library; a BEFORE INSERT trigger appends new items at the end
-- and move_item swaps neighbours. archived_at exists on both libraries: every list,
-- selection and eligibility query in this file filters on it; the SELECT policy still
-- returns archived rows so the owner can see the collapsed "Archived (n)" section.

-- ---------------------------------------------------------------------------
-- cues
-- ---------------------------------------------------------------------------
create table public.cues (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),  -- private user text
  explanation text,                                     -- private user text
  scope       text not null default 'global'
              check (scope in ('global', 'health', 'wealth', 'relationships')),
  rank        integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

create index cues_user_id_rank_idx on public.cues (user_id, rank);

-- ---------------------------------------------------------------------------
-- impediments — may carry a WHEN → THEN Proof Point
-- ---------------------------------------------------------------------------
create table public.impediments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),  -- private user text
  explanation text,                                     -- private user text
  scope       text not null default 'global'
              check (scope in ('global', 'health', 'wealth', 'relationships')),
  rank        integer not null,
  proof_when  text,  -- private user text
  proof_then  text,  -- private user text
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

create index impediments_user_id_rank_idx on public.impediments (user_id, rank);

-- Append at the end of the owner's library and normalise blank text to NULL.
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
  if tg_table_name = 'impediments' then
    new.proof_when := nullif(btrim(new.proof_when), '');
    new.proof_then := nullif(btrim(new.proof_then), '');
  end if;
  return new;
end
$$;

create trigger cues_before_insert
  before insert on public.cues
  for each row execute function public.library_item_before_insert();
create trigger impediments_before_insert
  before insert on public.impediments
  for each row execute function public.library_item_before_insert();

create trigger cues_set_updated_at
  before update on public.cues
  for each row execute function public.set_updated_at();
create trigger impediments_set_updated_at
  before update on public.impediments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sprint_cues / sprint_impediments — date-ranged membership (PRD §4)
-- ---------------------------------------------------------------------------
create table public.sprint_cues (
  id         uuid primary key default gen_random_uuid(),
  sprint_id  uuid not null references public.sprints(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  cue_id     uuid not null references public.cues(id),
  added_at   timestamptz not null default now(),
  removed_at timestamptz,
  constraint sprint_cues_range_check check (removed_at is null or removed_at >= added_at)
);

create index sprint_cues_user_id_idx on public.sprint_cues (user_id);
create index sprint_cues_sprint_id_idx on public.sprint_cues (sprint_id);
create index sprint_cues_cue_id_idx on public.sprint_cues (cue_id);
create unique index sprint_cues_one_active
  on public.sprint_cues (sprint_id, cue_id) where removed_at is null;

create table public.sprint_impediments (
  id            uuid primary key default gen_random_uuid(),
  sprint_id     uuid not null references public.sprints(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  impediment_id uuid not null references public.impediments(id),
  is_highest    boolean not null default false,
  added_at      timestamptz not null default now(),
  removed_at    timestamptz,
  constraint sprint_impediments_range_check check (removed_at is null or removed_at >= added_at),
  constraint sprint_impediments_highest_active_check check (not is_highest or removed_at is null)
);

create index sprint_impediments_user_id_idx on public.sprint_impediments (user_id);
create index sprint_impediments_sprint_id_idx on public.sprint_impediments (sprint_id);
create index sprint_impediments_impediment_id_idx on public.sprint_impediments (impediment_id);
create unique index sprint_impediments_one_active
  on public.sprint_impediments (sprint_id, impediment_id) where removed_at is null;
create unique index sprint_impediments_one_highest
  on public.sprint_impediments (sprint_id) where is_highest;

-- ---------------------------------------------------------------------------
-- day_impediment_hurt / day_cue_helped — Day Close selections (rule 17: immutable)
-- ---------------------------------------------------------------------------
create table public.day_impediment_hurt (
  id               uuid primary key default gen_random_uuid(),
  sprint_day_id    uuid not null references public.sprint_days(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  impediment_id    uuid not null references public.impediments(id),
  is_most_damaging boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (sprint_day_id, impediment_id)
);

create index day_impediment_hurt_user_id_idx on public.day_impediment_hurt (user_id);
create index day_impediment_hurt_impediment_id_idx on public.day_impediment_hurt (impediment_id);
create unique index day_impediment_hurt_one_most_damaging
  on public.day_impediment_hurt (sprint_day_id) where is_most_damaging;

create table public.day_cue_helped (
  id             uuid primary key default gen_random_uuid(),
  sprint_day_id  uuid not null references public.sprint_days(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  cue_id         uuid not null references public.cues(id),
  is_most_useful boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (sprint_day_id, cue_id)
);

create index day_cue_helped_user_id_idx on public.day_cue_helped (user_id);
create index day_cue_helped_cue_id_idx on public.day_cue_helped (cue_id);
create unique index day_cue_helped_one_most_useful
  on public.day_cue_helped (sprint_day_id) where is_most_useful;

-- A closed day's selections never change. UPDATE only: a DELETE trigger would also
-- fire on the auth.users → sprint_days cascade and break account deletion.
create or replace function public.day_selection_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'day_closed';
end
$$;

create trigger day_impediment_hurt_immutable
  before update on public.day_impediment_hurt
  for each row execute function public.day_selection_immutable();
create trigger day_cue_helped_immutable
  before update on public.day_cue_helped
  for each row execute function public.day_selection_immutable();

-- ---------------------------------------------------------------------------
-- sprint_days — snapshot of the Highest Impediment at close, so History survives
-- later Proof Point edits. Nullable: rows exist from before this migration.
-- ---------------------------------------------------------------------------
alter table public.sprint_days
  add column highest_impediment_id uuid references public.impediments(id),
  add column proof_when text,  -- private user text (snapshot)
  add column proof_then text;  -- private user text (snapshot)

create index sprint_days_highest_impediment_id_idx on public.sprint_days (highest_impediment_id);

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

  if old.closed_at is not null and (
       new.actual                is distinct from old.actual
    or new.intention             is distinct from old.intention
    or new.notes                 is distinct from old.notes
    or new.closed_at             is distinct from old.closed_at
    or new.target                is distinct from old.target
    or new.highest_impediment_id is distinct from old.highest_impediment_id
    or new.proof_when            is distinct from old.proof_when
    or new.proof_then            is distinct from old.proof_then
  ) then
    raise exception 'day_closed';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.cues                enable row level security;
alter table public.impediments         enable row level security;
alter table public.sprint_cues         enable row level security;
alter table public.sprint_impediments  enable row level security;
alter table public.day_impediment_hurt enable row level security;
alter table public.day_cue_helped      enable row level security;

create policy cues_select on public.cues
  for select to authenticated using ((select auth.uid()) = user_id);
create policy cues_insert on public.cues
  for insert to authenticated with check ((select auth.uid()) = user_id and archived_at is null);
create policy cues_update on public.cues
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Rule 19: permanent delete only for an item with no sprint history.
create policy cues_delete on public.cues
  for delete to authenticated
  using ((select auth.uid()) = user_id
         and not exists (select 1 from public.sprint_cues m where m.cue_id = cues.id));

create policy impediments_select on public.impediments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy impediments_insert on public.impediments
  for insert to authenticated with check ((select auth.uid()) = user_id and archived_at is null);
create policy impediments_update on public.impediments
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy impediments_delete on public.impediments
  for delete to authenticated
  using ((select auth.uid()) = user_id
         and not exists (select 1 from public.sprint_impediments m where m.impediment_id = impediments.id));

create policy sprint_cues_select on public.sprint_cues
  for select to authenticated using ((select auth.uid()) = user_id);
create policy sprint_impediments_select on public.sprint_impediments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy day_impediment_hurt_select on public.day_impediment_hurt
  for select to authenticated using ((select auth.uid()) = user_id);
create policy day_cue_helped_select on public.day_cue_helped
  for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert (user_id, name, explanation, scope), update (name, explanation), delete
  on public.cues to authenticated;
grant select, insert (user_id, name, explanation, scope, proof_when, proof_then),
      update (name, explanation, proof_when, proof_then), delete
  on public.impediments to authenticated;
grant select on public.sprint_cues, public.sprint_impediments,
                public.day_impediment_hurt, public.day_cue_helped to authenticated;
grant all on public.cues, public.impediments, public.sprint_cues, public.sprint_impediments,
             public.day_impediment_hurt, public.day_cue_helped to service_role;

revoke all on function public.library_item_before_insert() from public, anon, authenticated;
revoke all on function public.day_selection_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rule 22: the Proof Point of a Highest Impediment in any active sprint may be
-- edited but never cleared.
-- ---------------------------------------------------------------------------
create or replace function public.impediments_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.explanation := nullif(btrim(new.explanation), '');
  new.proof_when := nullif(btrim(new.proof_when), '');
  new.proof_then := nullif(btrim(new.proof_then), '');
  if (new.proof_when is null or new.proof_then is null) and exists (
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

create trigger impediments_before_update
  before update on public.impediments
  for each row execute function public.impediments_before_update();

create or replace function public.cues_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.explanation := nullif(btrim(new.explanation), '');
  return new;
end
$$;

create trigger cues_before_update
  before update on public.cues
  for each row execute function public.cues_before_update();

revoke all on function public.impediments_before_update() from public, anon, authenticated;
revoke all on function public.cues_before_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- sprint_invalid_reason — why a sprint would break rules 3–6 once `p_exclude_item`
-- of kind `p_kind` is no longer a member (NULL exclude = as it stands). Internal.
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
    and not (p_kind = 'cue' and cue_id = p_exclude_item);
  if v_cues < 1 then return 'no_cues'; end if;
  if v_cues > 3 then return 'too_many_cues'; end if;

  select count(*) into v_imps
  from public.sprint_impediments
  where sprint_id = p_sprint_id and removed_at is null
    and not (p_kind = 'impediment' and impediment_id = p_exclude_item);
  if v_imps < 1 then return 'no_impediments'; end if;
  if v_imps > 5 then return 'too_many_impediments'; end if;

  select i.proof_when, i.proof_then into v_highest
  from public.sprint_impediments m
  join public.impediments i on i.id = m.impediment_id
  where m.sprint_id = p_sprint_id and m.is_highest and m.removed_at is null
    and not (p_kind = 'impediment' and m.impediment_id = p_exclude_item);
  if not found then return 'no_highest_impediment'; end if;
  if v_highest.proof_when is null or v_highest.proof_then is null then return 'proof_point_required'; end if;

  return null;
end
$$;

revoke all on function public.sprint_invalid_reason(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- start_sprint — new signature: cues, impediments and the Highest Impediment are
-- part of the atomic start (rules 3–6). The F1 signature is dropped; two overloads
-- would make the RPC ambiguous.
-- ---------------------------------------------------------------------------
drop function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, text);

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
  p_proof_then             text default null
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
    p_why, p_celebration, p_mantra, coalesce(p_usage_of_funds, '[]'::jsonb), 'same', p_tz,
    p_start_date, p_start_date + 13
  )
  returning id into v_sprint;

  v_targets := public.same_daily_targets(p_amount, v_step);

  insert into public.sprint_days (sprint_id, user_id, day_index, date, target, intention)
  select v_sprint, v_uid, i, p_start_date + (i - 1), v_targets[i],
         case when i = 1 then nullif(btrim(p_intention), '') end
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

revoke all on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, text, text, text)
  from public, anon;
grant execute on function public.start_sprint(text, text, text, text, text, bigint, int, text, text, text, jsonb, text, date, uuid[], uuid[], uuid, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- day_offered_items — the cues and impediments Day Close offers for a day: every
-- item whose membership overlapped that date in the sprint's zone, later removal or
-- archive notwithstanding (rule 23). SECURITY INVOKER: RLS scopes it to the caller.
-- Used by close_day (validation) and by the UI (options), so the rule lives once.
-- ---------------------------------------------------------------------------
create or replace function public.day_offered_items(p_sprint_day_id uuid)
returns table (kind text, item_id uuid, name text, explanation text, proof_when text, proof_then text, rank integer)
language sql
stable
set search_path = ''
as $$
  select distinct on (kind, item_id) *
  from (
    select 'impediment'::text as kind, i.id as item_id, i.name, i.explanation, i.proof_when, i.proof_then, i.rank
    from public.sprint_days d
    join public.sprints s on s.id = d.sprint_id
    join public.sprint_impediments m on m.sprint_id = s.id
    join public.impediments i on i.id = m.impediment_id
    where d.id = p_sprint_day_id
      and (m.added_at at time zone s.tz)::date <= d.date
      and (m.removed_at is null or (m.removed_at at time zone s.tz)::date >= d.date)
    union all
    select 'cue', c.id, c.name, c.explanation, null, null, c.rank
    from public.sprint_days d
    join public.sprints s on s.id = d.sprint_id
    join public.sprint_cues m on m.sprint_id = s.id
    join public.cues c on c.id = m.cue_id
    where d.id = p_sprint_day_id
      and (m.added_at at time zone s.tz)::date <= d.date
      and (m.removed_at is null or (m.removed_at at time zone s.tz)::date >= d.date)
  ) x
  order by kind, item_id
$$;

revoke all on function public.day_offered_items(uuid) from public, anon;
grant execute on function public.day_offered_items(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- close_day — Actual + hurt/helped selections + snapshot of the Highest Impediment.
-- The F1 signature is dropped (defaults would make the two overloads ambiguous).
-- ---------------------------------------------------------------------------
drop function public.close_day(uuid, bigint, text);

create or replace function public.close_day(
  p_sprint_day_id  uuid,
  p_actual         bigint,
  p_notes          text default null,
  p_hurt           uuid[] default '{}',
  p_most_damaging  uuid default null,
  p_helped         uuid[] default '{}',
  p_most_useful    uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_day     record;
  v_hurt    uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_hurt, '{}')) as x);
  v_helped  uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_helped, '{}')) as x);
  v_highest record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_actual is null or p_actual < 0 then
    raise exception 'invalid_actual';
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
  if v_day.date > (now() at time zone v_day.tz)::date then
    raise exception 'day_in_future';
  end if;

  -- Selections must come from what this day offered (rule 23), and a most-damaging /
  -- most-useful pick is required exactly when at least one item is selected (PRD §8).
  if exists (
    select 1 from unnest(v_hurt) as x
    where x not in (select item_id from public.day_offered_items(p_sprint_day_id) where kind = 'impediment')
  ) then
    raise exception 'item_not_offered';
  end if;
  if exists (
    select 1 from unnest(v_helped) as x
    where x not in (select item_id from public.day_offered_items(p_sprint_day_id) where kind = 'cue')
  ) then
    raise exception 'item_not_offered';
  end if;
  if (cardinality(v_hurt) > 0) <> (p_most_damaging is not null) or (p_most_damaging is not null and not (p_most_damaging = any(v_hurt))) then
    raise exception 'most_damaging_required';
  end if;
  if (cardinality(v_helped) > 0) <> (p_most_useful is not null) or (p_most_useful is not null and not (p_most_useful = any(v_helped))) then
    raise exception 'most_useful_required';
  end if;

  select i.id, i.proof_when, i.proof_then into v_highest
  from public.sprint_impediments m
  join public.impediments i on i.id = m.impediment_id
  where m.sprint_id = v_day.sprint_id and m.is_highest and m.removed_at is null;

  update public.sprint_days
  set actual = p_actual,
      notes = nullif(btrim(p_notes), ''),
      closed_at = now(),
      highest_impediment_id = v_highest.id,
      proof_when = v_highest.proof_when,
      proof_then = v_highest.proof_then
  where id = p_sprint_day_id;

  insert into public.day_impediment_hurt (sprint_day_id, user_id, impediment_id, is_most_damaging)
  select p_sprint_day_id, v_uid, x, x = p_most_damaging from unnest(v_hurt) as x;

  insert into public.day_cue_helped (sprint_day_id, user_id, cue_id, is_most_useful)
  select p_sprint_day_id, v_uid, x, x = p_most_useful from unnest(v_helped) as x;
end
$$;

revoke all on function public.close_day(uuid, bigint, text, uuid[], uuid, uuid[], uuid) from public, anon;
grant execute on function public.close_day(uuid, bigint, text, uuid[], uuid, uuid[], uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sprint membership edits during a sprint (PRD §4: within the 1–3 / 1–5 limits)
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
    select id, scope, archived_at into v_item from public.cues where id = p_item_id and user_id = v_uid;
  else
    select id, scope, archived_at into v_item from public.impediments where id = p_item_id and user_id = v_uid;
  end if;
  if v_item.id is null then raise exception 'item_not_found'; end if;
  if v_item.archived_at is not null then raise exception 'item_archived'; end if;
  if v_item.scope not in ('global', v_sprint.area) then raise exception 'item_out_of_scope'; end if;

  if p_kind = 'cue' then
    if exists (select 1 from public.sprint_cues where sprint_id = p_sprint_id and cue_id = p_item_id and removed_at is null) then
      raise exception 'already_in_sprint';
    end if;
    if (select count(*) from public.sprint_cues where sprint_id = p_sprint_id and removed_at is null) >= 3 then
      raise exception 'too_many_cues';
    end if;
    insert into public.sprint_cues (sprint_id, user_id, cue_id) values (p_sprint_id, v_uid, p_item_id);
  else
    if exists (select 1 from public.sprint_impediments where sprint_id = p_sprint_id and impediment_id = p_item_id and removed_at is null) then
      raise exception 'already_in_sprint';
    end if;
    if (select count(*) from public.sprint_impediments where sprint_id = p_sprint_id and removed_at is null) >= 5 then
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
    update public.sprint_cues set removed_at = now()
    where sprint_id = p_sprint_id and cue_id = p_item_id and removed_at is null;
  else
    update public.sprint_impediments set removed_at = now()
    where sprint_id = p_sprint_id and impediment_id = p_item_id and removed_at is null;
  end if;
  if not found then raise exception 'not_in_sprint'; end if;
end
$$;

-- Changing the Highest Impediment touches membership flags only, never a day row.
create or replace function public.set_highest_impediment(p_sprint_id uuid, p_impediment_id uuid)
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

  select i.proof_when, i.proof_then into v_proof
  from public.sprint_impediments m
  join public.impediments i on i.id = m.impediment_id
  where m.sprint_id = p_sprint_id and m.impediment_id = p_impediment_id and m.removed_at is null;
  if not found then raise exception 'not_in_sprint'; end if;
  if v_proof.proof_when is null or v_proof.proof_then is null then raise exception 'proof_point_required'; end if;

  update public.sprint_impediments set is_highest = false
  where sprint_id = p_sprint_id and is_highest and impediment_id <> p_impediment_id;
  update public.sprint_impediments set is_highest = true
  where sprint_id = p_sprint_id and impediment_id = p_impediment_id and removed_at is null;
end
$$;

-- ---------------------------------------------------------------------------
-- Library actions with sprint validation (rules 19–21): archive, scope, restore, rank.
-- archive_item and set_item_scope return {"ok": true, "removed_from": n} or
-- {"ok": false, "failing": [{sprint_id, area, outcome, reason}]} having changed nothing.
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

-- Rule 21: restore returns the item to the library only; no membership is created.
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
  if p_kind not in ('cue', 'impediment') then raise exception 'invalid_kind'; end if;
  if p_kind = 'cue' then
    update public.cues set archived_at = null where id = p_item_id and user_id = v_uid;
  else
    update public.impediments set archived_at = null where id = p_item_id and user_id = v_uid;
  end if;
  if not found then raise exception 'item_not_found'; end if;
end
$$;

-- Swap ranks with the neighbouring active item ('up' or 'down'); no-op at the ends.
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
  if p_kind not in ('cue', 'impediment') then raise exception 'invalid_kind'; end if;
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
  else
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
  end if;
end
$$;

revoke all on function public.affected_sprints_check(text, uuid, text) from public, anon, authenticated;

revoke all on function public.add_sprint_item(uuid, text, uuid) from public, anon;
revoke all on function public.remove_sprint_item(uuid, text, uuid) from public, anon;
revoke all on function public.set_highest_impediment(uuid, uuid) from public, anon;
revoke all on function public.archive_item(text, uuid) from public, anon;
revoke all on function public.set_item_scope(text, uuid, text) from public, anon;
revoke all on function public.restore_item(text, uuid) from public, anon;
revoke all on function public.move_item(text, uuid, text) from public, anon;

grant execute on function public.add_sprint_item(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.remove_sprint_item(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.set_highest_impediment(uuid, uuid) to authenticated, service_role;
grant execute on function public.archive_item(text, uuid) to authenticated, service_role;
grant execute on function public.set_item_scope(text, uuid, text) to authenticated, service_role;
grant execute on function public.restore_item(text, uuid) to authenticated, service_role;
grant execute on function public.move_item(text, uuid, text) to authenticated, service_role;
