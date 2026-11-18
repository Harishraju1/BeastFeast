-- Supabase's safe-update guard rejects UPDATE without a WHERE clause when called through the API,
-- so the reset re-baselines profiles with an explicit (always-true) condition.
create or replace function public.reset_daily_xp(p_trigger text default 'cron') returns int
language plpgsql security definer set search_path = public as $$
declare v_period timestamptz := public.xp_period_start(); v_inserted int; v_rows int;
begin
  insert into public.xp_reset_runs (period_start, trigger) values (v_period, left(coalesce(p_trigger, 'cron'), 20)) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return -1; end if; -- this XP day was already reset
  update public.profiles p
     set daily_xp = greatest(0, coalesce((select sum(e.amount) from public.xp_events e where e.user_id = p.id and e.at >= v_period), 0))
   where p.id is not null;
  get diagnostics v_rows = row_count;
  update public.xp_reset_runs set profiles_updated = v_rows where period_start = v_period;
  return v_rows;
end $$;
revoke execute on function public.reset_daily_xp(text) from public;
grant execute on function public.reset_daily_xp(text) to anon, authenticated, service_role;

-- Admins / the service role can confirm the scheduler is installed and see recent runs.
create or replace function public.xp_scheduler_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_job jsonb := null; v_runs jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select to_jsonb(j) from (select jobname, schedule, command, active from cron.job where jobname = 'beast-daily-xp-reset') j$q$ into v_job;
  end if;
  select coalesce(jsonb_agg(r order by r.period_start desc), '[]'::jsonb) into v_runs
    from (select period_start, ran_at, profiles_updated, trigger from public.xp_reset_runs order by period_start desc limit 10) r;
  return jsonb_build_object('pg_cron_job', v_job, 'current_period_start', public.xp_period_start(), 'recent_runs', v_runs);
end $$;
revoke execute on function public.xp_scheduler_status() from public, anon;
grant execute on function public.xp_scheduler_status() to authenticated, service_role;
