-- BEAST FEAST 5.0 — admin_recalculate_rank always refreshes lifetime and daily XP from the ledger.
-- (0007 only wrote XP when the rank level changed, so a ledger correction that kept the same rank left a
-- stale total on the profile.) Rank may still go down here: this is the deliberate admin correction path.
create or replace function public.admin_recalculate_rank(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_total int; v_daily int; v_old int; v_new int;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  select rank_level into v_old from public.profiles where id = p_user for update;
  if v_old is null then raise exception 'No such student' using errcode = 'P0002'; end if;
  select greatest(0, coalesce(sum(amount), 0)) into v_total from public.xp_events where user_id = p_user;
  select greatest(0, coalesce(sum(amount), 0)) into v_daily from public.xp_events where user_id = p_user and at >= public.xp_period_start();
  select coalesce(max(level), 1) into v_new from public.ranks where min_xp <= v_total;
  if v_new <> v_old then
    insert into public.rank_history (user_id, old_level, new_level, xp_at, seen, note) values (p_user, v_old, v_new, v_total, true, 'Recalculated by an administrator');
  end if;
  update public.profiles set rank_level = v_new, xp = v_total, daily_xp = v_daily where id = p_user;
  return v_new;
end $$;
revoke execute on function public.admin_recalculate_rank(uuid) from public, anon;
grant execute on function public.admin_recalculate_rank(uuid) to authenticated;
