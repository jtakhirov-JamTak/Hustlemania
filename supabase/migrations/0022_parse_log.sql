-- 0022_parse_log — F17: the rate limit for the capture parser (docs/SPEC.md F17).
--
-- `parseCapture` sends the user's words to a paid model. The cap has to hold across
-- Vercel instances (an in-memory map is per instance and gone on a cold start), so it
-- is a row per permitted call: `parse_permit(kind)` refuses the 11th call within a
-- minute and the 201st within a day, otherwise records the call and prunes the caller's
-- rows older than two days. The table holds no user text — a kind and a timestamp.
-- RLS is on with no policies: nothing reads it from the client; only the definer
-- function writes it (the F13 reminder_log pattern).

create table public.parse_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('vision_goal', 'impediment', 'response', 'cue', 'situations', 'today')),
  created_at timestamptz not null default now()
);

create index parse_log_user_id_created_at_idx on public.parse_log (user_id, created_at);

alter table public.parse_log enable row level security;

grant all on public.parse_log to service_role;

create function public.parse_permit(p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_minute int;
  v_day    int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('vision_goal', 'impediment', 'response', 'cue', 'situations', 'today') then
    raise exception 'invalid_kind';
  end if;

  -- Serialise the caller's own calls so a burst cannot slip past the count.
  perform pg_advisory_xact_lock(hashtext('parse_permit'), hashtext(v_uid::text));

  select count(*) filter (where created_at > now() - interval '1 minute'),
         count(*) filter (where created_at > now() - interval '1 day')
  into v_minute, v_day
  from public.parse_log
  where user_id = v_uid and created_at > now() - interval '1 day';

  if v_minute >= 10 or v_day >= 200 then
    return 'rate_limited';
  end if;

  insert into public.parse_log (user_id, kind) values (v_uid, p_kind);
  delete from public.parse_log where user_id = v_uid and created_at < now() - interval '2 days';
  return null;
end
$$;

revoke all on function public.parse_permit(text) from public, anon;
grant execute on function public.parse_permit(text) to authenticated, service_role;
