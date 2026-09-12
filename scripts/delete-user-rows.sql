-- delete-user-rows.sql — removes ONE user's application rows, in FK order, and leaves
-- auth.users and every other user untouched. Never a migration: it is run by hand, by
-- the owner, for their own account, after a fresh `supabase db dump --linked`
-- (docs/RUNBOOK_RESTORE.md). F15 (2026-09-11): the owner's clean restart.
--
-- Usage (psql or the SQL editor, as the postgres role):
--   \set uid '00000000-0000-0000-0000-000000000000'
--   \i scripts/delete-user-rows.sql
-- In the dashboard SQL editor, replace :'uid' with the quoted uuid literal.
--
-- The script refuses to run against more than one user and prints the counts it is
-- about to delete before deleting them, so a wrong id is caught by eye.

begin;

do $$
declare
  v_uid uuid := :'uid';
  v_email text;
begin
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    raise exception 'no auth.users row for %', v_uid;
  end if;
  raise notice 'deleting application rows for % (%)', v_uid, v_email;
  raise notice 'sprints %, days %, tasks %, reviews %, cues %, impediments %, situations %',
    (select count(*) from public.sprints where user_id = v_uid),
    (select count(*) from public.sprint_days where user_id = v_uid),
    (select count(*) from public.tasks where user_id = v_uid),
    (select count(*) from public.reviews where user_id = v_uid),
    (select count(*) from public.cues where user_id = v_uid),
    (select count(*) from public.impediments where user_id = v_uid),
    (select count(*) from public.situations where user_id = v_uid);
end
$$;

delete from public.reminder_log where user_id = :'uid';
delete from public.tasks where user_id = :'uid';
delete from public.day_impediment_situation_observations where user_id = :'uid';
delete from public.day_cue_situation_observations where user_id = :'uid';
delete from public.day_impediment_observations where user_id = :'uid';
delete from public.day_cue_observations where user_id = :'uid';
delete from public.review_decisions where user_id = :'uid';
delete from public.reviews where user_id = :'uid';
delete from public.sprint_cues where user_id = :'uid';
delete from public.sprint_impediments where user_id = :'uid';
delete from public.sprint_days where user_id = :'uid';
delete from public.sprints where user_id = :'uid';
delete from public.vision_reviews where user_id = :'uid';
update public.visions set obstacle_id = null where user_id = :'uid';
delete from public.visions where user_id = :'uid';
delete from public.impediment_situations where user_id = :'uid';
delete from public.cue_situations where user_id = :'uid';
delete from public.situations where user_id = :'uid';
delete from public.impediments where user_id = :'uid';
delete from public.cues where user_id = :'uid';

commit;
