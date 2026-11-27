-- BEAST FEAST — fix for 0015: "NIAT ID + campus required" is checked at the END of the sign-up transaction.
--
-- Supabase Auth inserts the auth.users row first and writes custom app_metadata (skip_profile_checks, used by
-- administrator scripts) afterwards in the same transaction, so the insert trigger in 0015 could not see the flag
-- and rejected flagged service accounts. Now:
--   * handle_new_user() (on insert) still validates the FORMAT of whatever is supplied and rejects duplicates;
--   * a deferred constraint trigger checks, at commit, that an email sign-up has both a NIAT ID and a campus
--     unless the account is flagged by the service role (app_metadata cannot be set by the public sign-up API).
-- Google sign-ins remain exempt (provider <> 'email'); they are asked for both on first visit.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_niat text := public.normalize_niat(new.raw_user_meta_data->>'niat_id');
  v_phone text := public.normalize_in_phone(new.raw_user_meta_data->>'phone');
  v_campus text := public.normalize_campus(new.raw_user_meta_data->>'campus');
begin
  if v_niat is not null and not public.niat_format_ok(v_niat) then raise exception '%', public.niat_error() using errcode = '22023'; end if;
  if v_campus is not null and not public.campus_ok(v_campus) then
    raise exception 'Invalid campus name. Use 2–60 letters, numbers, spaces or . , '' ( ) & / -' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'Invalid mobile number. Enter a 10-digit Indian mobile number.' using errcode = '22023';
  end if;
  if v_niat is not null and exists (select 1 from public.profile_private where niat_id = v_niat) then
    raise exception 'This NIAT ID is already registered.' using errcode = '23505';
  end if;
  insert into public.profiles (id, name, campus, student_id)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'Engineer'), 80), coalesce(v_campus, ''), '');
  begin
    insert into public.profile_private (user_id, niat_id, phone) values (new.id, v_niat, v_phone);
  exception when unique_violation then
    raise exception 'This NIAT ID is already registered.' using errcode = '23505';
  end;
  return new;
end $$;

create or replace function public.enforce_signup_profile() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_app jsonb;
begin
  -- the row as it is at commit (app_metadata may have been updated after the insert)
  select u.raw_app_meta_data into v_app from auth.users u where u.id = new.id;
  if not found then return null; end if; -- deleted again in the same transaction
  if coalesce(v_app->>'provider', 'email') <> 'email' or coalesce((v_app->>'skip_profile_checks')::boolean, false) then return null; end if;
  if not exists (select 1 from public.profile_private pp where pp.user_id = new.id and pp.niat_id is not null) then
    raise exception '%', public.niat_error() using errcode = '22023';
  end if;
  if coalesce((select p.campus from public.profiles p where p.id = new.id), '') = '' then
    raise exception 'Enter your campus name.' using errcode = '22023';
  end if;
  return null;
end $$;
revoke execute on function public.enforce_signup_profile() from public, anon, authenticated;

drop trigger if exists enforce_signup_profile on auth.users;
create constraint trigger enforce_signup_profile
  after insert on auth.users
  deferrable initially deferred
  for each row execute function public.enforce_signup_profile();
