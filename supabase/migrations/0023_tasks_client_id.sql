-- 0023_tasks_client_id — F19 / U7: the client may name a task's id (docs/SPEC.md F19,
-- full audit 2026-09-13 M1).
--
-- Today's entry creates its tasks one server action at a time and offers Retry after a
-- failure. A create whose row committed but whose response was lost is re-run on Retry;
-- with a server-generated id that is a second row. `createTask` now accepts an id the
-- client drew with `crypto.randomUUID()`: the replay hits the primary key, and the action
-- returns the row that already exists. The column-level INSERT grant from 0006 listed
-- `user_id, sprint_day_id, text` only, so the insert with an explicit id was
-- `permission denied`. This widens that grant by the one column.
--
-- Not a change to who may write: RLS still requires `user_id = auth.uid()` on insert,
-- the primary key refuses a second row for a known id, and the replay's select runs
-- under RLS — another user's id cannot be claimed or read. Additive, no rows touched.

grant insert (id) on public.tasks to authenticated;

-- Self-check: the insert grant on tasks for authenticated is now exactly these four columns.
do $$
declare
  v_cols text;
begin
  select string_agg(column_name, ',' order by column_name)
    into v_cols
  from information_schema.column_privileges
  where grantee = 'authenticated' and table_schema = 'public' and table_name = 'tasks' and privilege_type = 'INSERT';
  if v_cols is distinct from 'id,sprint_day_id,text,user_id' then
    raise exception '0023: tasks INSERT columns for authenticated are % (expected id,sprint_day_id,text,user_id)', v_cols;
  end if;
end
$$;
