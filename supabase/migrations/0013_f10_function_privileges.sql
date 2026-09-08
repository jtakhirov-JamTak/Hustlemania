-- ---------------------------------------------------------------------------
-- 0013 — F10 function privileges.
--
-- Postgres grants EXECUTE to PUBLIC on every newly created function, which reaches
-- `anon` (0002 records the same finding for 0001's functions). 0012 granted its ten
-- entry points to `authenticated` but did not revoke the implicit PUBLIC grant, so
-- `anon` could execute all ten; `tests/db/grants.test.ts` caught it. 0012 is applied,
-- so the fix is this migration rather than an edit.
--
-- Nothing was reachable in practice — every one of these functions raises
-- `not_authenticated` on a null `auth.uid()` — but "anon can execute no function in
-- public" is the pinned invariant, and a future function that forgets the check
-- would have no second line of defence.
-- ---------------------------------------------------------------------------

revoke all on function public.complete_sprint(uuid)   from public, anon;
revoke all on function public.end_sprint_early(uuid)  from public, anon;
revoke all on function public.finish_sprint(uuid)     from public, anon;
revoke all on function public.sprint_best_streak(uuid) from public, anon;
revoke all on function public.finish_review(uuid, text, boolean, text, jsonb) from public, anon;
revoke all on function public.insight_impediment_impact(uuid)      from public, anon;
revoke all on function public.insight_response_followthrough(uuid) from public, anon;
revoke all on function public.insight_response_recovery(uuid)      from public, anon;
revoke all on function public.insight_cue_usefulness(uuid)         from public, anon;
revoke all on function public.sprint_review_summary(uuid)          from public, anon;

-- `revoke ... from public` also removes the privilege authenticated held only
-- through PUBLIC, so the ten grants are re-applied explicitly.
grant execute on function public.complete_sprint(uuid)   to authenticated;
grant execute on function public.end_sprint_early(uuid)  to authenticated;
grant execute on function public.finish_sprint(uuid)     to authenticated;
grant execute on function public.sprint_best_streak(uuid) to authenticated;
grant execute on function public.finish_review(uuid, text, boolean, text, jsonb) to authenticated;
grant execute on function public.insight_impediment_impact(uuid)      to authenticated;
grant execute on function public.insight_response_followthrough(uuid) to authenticated;
grant execute on function public.insight_response_recovery(uuid)      to authenticated;
grant execute on function public.insight_cue_usefulness(uuid)         to authenticated;
grant execute on function public.sprint_review_summary(uuid)          to authenticated;
