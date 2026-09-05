-- 0002_function_privileges — internal functions are not part of the API surface.
--
-- Postgres grants EXECUTE to PUBLIC on a new function regardless of the ALTER DEFAULT
-- PRIVILEGES revoke in 0001 (verified locally: proacl stayed null). Revoke explicitly so
-- only start_sprint and close_day are callable by the authenticated role. The grants
-- test asserts this set and fails if a later migration adds a callable function
-- without deciding who may call it.

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.sprints_lock_after_start() from public, anon, authenticated;
revoke all on function public.sprint_days_immutable_after_close() from public, anon, authenticated;
revoke all on function public.same_daily_targets(bigint) from public, anon, authenticated;
