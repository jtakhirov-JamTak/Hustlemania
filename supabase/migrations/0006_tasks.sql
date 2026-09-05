-- 0006_tasks — F4: the optional per-day task list (PRD §8, rules 15–17).
--
-- A task belongs to exactly one sprint day and never moves (rule 16: nothing rolls
-- over; the user recreates what is still worth doing). It locks with the day (rule 17):
-- a BEFORE INSERT OR UPDATE trigger refuses any write once the parent day is closed,
-- whoever the caller is. Completion is a fact about the task alone — no function,
-- trigger or job reads `done` to change a sprint, a day or a total (rule 15); the DB
-- suite asserts that by scanning pg_proc and pg_trigger.
--
-- Same access model as 0001/0004: RLS in this migration, the authenticated role gets
-- SELECT plus the columns a user writes directly (insert user_id / sprint_day_id / text,
-- update text / done / archived_at), no DELETE. History keeps every task (PRD §11), so
-- "remove" is archived_at and every list filters on it.

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  sprint_day_id uuid not null references public.sprint_days(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  text          text not null check (btrim(text) <> ''),  -- private user text
  done          boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- archived_at: a removed task is archived, never deleted; Today and Insights filter
  -- on it. The SELECT policy returns archived rows too (owner's own history).
  archived_at   timestamptz
);

create index tasks_sprint_day_id_idx on public.tasks (sprint_day_id);
create index tasks_user_id_idx on public.tasks (user_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks_lock_with_day — rule 17 at the row level, plus the two anchors. Runs for
-- every role, the postgres role included. A day the caller does not own is
-- "not found", never "closed", so nothing leaks about another user's calendar.
-- ---------------------------------------------------------------------------
create or replace function public.tasks_lock_with_day()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_day record;
begin
  if tg_op = 'UPDATE' and (
       new.sprint_day_id is distinct from old.sprint_day_id
    or new.user_id       is distinct from old.user_id
    or new.created_at    is distinct from old.created_at
  ) then
    raise exception 'task_locked';
  end if;

  select d.user_id, d.closed_at into v_day
  from public.sprint_days d
  where d.id = new.sprint_day_id;
  if not found or v_day.user_id <> new.user_id then
    raise exception 'day_not_found';
  end if;
  if v_day.closed_at is not null then
    raise exception 'day_closed';
  end if;
  return new;
end
$$;

revoke all on function public.tasks_lock_with_day() from public, anon, authenticated;

create trigger tasks_lock_with_day
  before insert or update on public.tasks
  for each row execute function public.tasks_lock_with_day();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;

create policy tasks_select on public.tasks
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy tasks_update on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert (user_id, sprint_day_id, text), update (text, done, archived_at)
  on public.tasks to authenticated;
grant all on public.tasks to service_role;
