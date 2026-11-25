-- 0014 · Email counts from two real sources
-- This project's sign-in service does not write its audit log to the database, so 0013's report was empty.
-- auth.users records when each account was last sent a confirmation / password-reset email; those times are
-- counted too (a lower bound: only the most recent email per account is recorded there). Each row says which
-- source it came from. Counts only — no addresses, tokens or contents.

drop function if exists public.admin_monitoring_emails(timestamptz, timestamptz);
create or replace function public.admin_monitoring_emails(p_from timestamptz, p_to timestamptz)
returns table(day date, kind text, emails bigint, source text)
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.admin_monitoring_guard(false);
  return query
    select (u.confirmation_sent_at at time zone 'Asia/Kolkata')::date, 'verification'::text, count(*), 'last email per account'::text
      from auth.users u where u.confirmation_sent_at between p_from and p_to group by 1
    union all
    select (u.recovery_sent_at at time zone 'Asia/Kolkata')::date, 'password reset'::text, count(*), 'last email per account'::text
      from auth.users u where u.recovery_sent_at between p_from and p_to group by 1
    union all
    select (a.created_at at time zone 'Asia/Kolkata')::date,
           case a.payload->>'action' when 'user_confirmation_requested' then 'verification' when 'user_recovery_requested' then 'password reset'
                                     when 'user_invited' then 'invitation' else 'reauthentication' end,
           count(*), 'audit log'::text
      from auth.audit_log_entries a
     where a.created_at between p_from and p_to
       and a.payload->>'action' in ('user_confirmation_requested', 'user_recovery_requested', 'user_invited', 'user_reauthenticate_requested')
     group by 1, 2
    order by 1, 2;
end $$;
revoke execute on function public.admin_monitoring_emails(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_monitoring_emails(timestamptz, timestamptz) to authenticated;
