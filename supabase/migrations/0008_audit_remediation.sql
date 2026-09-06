-- 0008_audit_remediation — three findings of the 2026-09-05 full audit
-- (docs/audits/full-audit-2026-09-05.md), none of which changes a rule.
--
-- 1. `sprint_days_sprint_id_date_idx` (0001) duplicates the unique (sprint_id, date)
--    key on the same table: a second index maintained on every insert and close for
--    no read the unique index does not already serve.
--
-- 2. `set_highest_impediment` takes the Proof Point it requires. The app used to
--    write the WHEN → THEN to `impediments` first and call the function second, so a
--    designation the function rejects (not_in_sprint, sprint_not_active, a foreign
--    sprint) left the library row changed behind an error. Inside one function the
--    proof write and the flag flip commit together or not at all. The two-argument
--    form is dropped: two overloads would make the RPC ambiguous.
--
-- 3. `sprint_invalid_reason`: `not (p_kind = 'cue' and cue_id = p_exclude_item)` is
--    NULL rather than TRUE when either argument is NULL (three-valued logic), so a call
--    with the defaults excluded every membership and reported `no_cues` for a valid
--    sprint. No caller passes the defaults today; the coalesce makes the default mean
--    what it says.

drop index if exists public.sprint_days_sprint_id_date_idx;

-- ---------------------------------------------------------------------------
-- sprint_invalid_reason — the 0004 body with the exclusion made null-safe.
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
  if v_cues < 1 then return 'no_cues'; end if;
  if v_cues > 3 then return 'too_many_cues'; end if;

  select count(*) into v_imps
  from public.sprint_impediments
  where sprint_id = p_sprint_id and removed_at is null
    and not coalesce(p_kind = 'impediment' and impediment_id = p_exclude_item, false);
  if v_imps < 1 then return 'no_impediments'; end if;
  if v_imps > 5 then return 'too_many_impediments'; end if;

  select i.proof_when, i.proof_then into v_highest
  from public.sprint_impediments m
  join public.impediments i on i.id = m.impediment_id
  where m.sprint_id = p_sprint_id and m.is_highest and m.removed_at is null
    and not coalesce(p_kind = 'impediment' and m.impediment_id = p_exclude_item, false);
  if not found then return 'no_highest_impediment'; end if;
  if v_highest.proof_when is null or v_highest.proof_then is null then return 'proof_point_required'; end if;

  return null;
end
$$;

revoke all on function public.sprint_invalid_reason(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_highest_impediment — the 0004 body, plus the optional Proof Point written in
-- the same transaction as the flag. A blank proof after trim is rejected by the
-- impediments trigger's nullif, so the proof check below still sees NULL.
-- ---------------------------------------------------------------------------
drop function public.set_highest_impediment(uuid, uuid);

create function public.set_highest_impediment(
  p_sprint_id uuid,
  p_impediment_id uuid,
  p_proof_when text default null,
  p_proof_then text default null
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

  if p_proof_when is not null or p_proof_then is not null then
    update public.impediments
    set proof_when = p_proof_when, proof_then = p_proof_then
    where id = p_impediment_id and user_id = v_uid;
    if not found then raise exception 'item_not_found'; end if;
  end if;

  select i.proof_when, i.proof_then into v_proof
  from public.impediments i
  where i.id = p_impediment_id;
  if v_proof.proof_when is null or v_proof.proof_then is null then raise exception 'proof_point_required'; end if;

  update public.sprint_impediments set is_highest = false
  where sprint_id = p_sprint_id and is_highest and impediment_id <> p_impediment_id;
  update public.sprint_impediments set is_highest = true
  where sprint_id = p_sprint_id and impediment_id = p_impediment_id and removed_at is null;
end
$$;

revoke all on function public.set_highest_impediment(uuid, uuid, text, text) from public, anon;
grant execute on function public.set_highest_impediment(uuid, uuid, text, text) to authenticated, service_role;
