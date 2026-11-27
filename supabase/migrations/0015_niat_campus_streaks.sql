-- BEAST FEAST — NIAT ID format, mandatory campus, server-side daily streaks
--
-- 1. NIAT student ID: ^N[0-9]{2}H([0-9]{3}|[0-9]{2}[A-Z])[0-9]{4}$  (e.g. N24H0180001, N24H01B0002).
--    The new pattern accepts every ID the previous pattern (0011) accepted, so no stored ID becomes invalid and
--    nothing is rewritten. IDs that still need attention (missing, legacy values not in the format, a legacy ID
--    claimed by another account) are listed for administrators by admin_niat_review(); they are never changed
--    automatically.
-- 2. Campus / college name: required for new email sign-ups and validated in the database (sign-up trigger and
--    every later change). Existing accounts keep whatever they have; administrators can view, search, filter,
--    export and correct it (admin_list_users / admin_set_campus, written to admin_change_log).
-- 3. Daily streak: one row per (student, local day) in streak_days, written by a trigger on positive XP events,
--    so it is server-side, idempotent and keeps its history. A day runs to 23:59 in the student's timezone
--    (default Asia/Kolkata): activity from 23:59 onwards counts for the next day.
--
-- Accounts created by administrators or scripts through the service API can set app_metadata.skip_profile_checks
-- (only the service role can write app_metadata); Google sign-ins are exempt because Google supplies neither field —
-- those students are asked for both on first visit (complete_my_details / profile update).

-- ───────────── 1. NIAT ID format ─────────────
create or replace function public.niat_format_ok(p text) returns boolean
language sql immutable as $$ select coalesce(p ~ '^N[0-9]{2}H([0-9]{3}|[0-9]{2}[A-Z])[0-9]{4}$', false) $$;

alter table public.profile_private drop constraint if exists profile_private_niat_id_check;
-- NOT VALID: existing rows are not re-checked (they all match already); every insert and update is.
alter table public.profile_private add constraint profile_private_niat_id_check
  check (niat_id is null or niat_id ~ '^N[0-9]{2}H([0-9]{3}|[0-9]{2}[A-Z])[0-9]{4}$') not valid;

-- ───────────── 2. campus validation ─────────────
create or replace function public.normalize_campus(p text) returns text
language sql immutable as $$ select nullif(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'), '') $$;

create or replace function public.campus_ok(p text) returns boolean
language sql immutable as $$ select coalesce(p ~ '^[[:alnum:]][[:alnum:] .,''()&/-]{1,59}$', false) $$;

create or replace function public.niat_error() returns text
language sql immutable as $$ select 'Invalid NIAT Student ID. Please enter your ID in the correct NIAT format, for example N24H0180001 or N24H01B0002.'::text $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_niat text := public.normalize_niat(new.raw_user_meta_data->>'niat_id');
  v_phone text := public.normalize_in_phone(new.raw_user_meta_data->>'phone');
  v_campus text := public.normalize_campus(new.raw_user_meta_data->>'campus');
  v_skip boolean := coalesce((new.raw_app_meta_data->>'skip_profile_checks')::boolean, false);
  v_email_signup boolean := coalesce(new.raw_app_meta_data->>'provider', 'email') = 'email' and not v_skip;
begin
  if v_email_signup and v_niat is null then raise exception '%', public.niat_error() using errcode = '22023'; end if;
  if v_niat is not null and not public.niat_format_ok(v_niat) then raise exception '%', public.niat_error() using errcode = '22023'; end if;
  if v_email_signup and v_campus is null then raise exception 'Enter your campus name.' using errcode = '22023'; end if;
  if v_campus is not null and not public.campus_ok(v_campus) then
    raise exception 'Invalid campus name. Use 2–60 letters, numbers, spaces or . , '' ( ) & / -' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'Invalid mobile number. Enter a 10-digit Indian mobile number.' using errcode = '22023';
  end if;
  -- the unique index on profile_private.niat_id is the final guard for two simultaneous sign-ups
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

create or replace function public.niat_id_available(p_niat text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text := public.normalize_niat(p_niat);
begin
  perform public.rl_hit('niat-check', 30, 600);
  if v is null or not public.niat_format_ok(v) then return false; end if;
  return not exists (select 1 from public.profile_private where niat_id = v);
end $$;

create or replace function public.complete_my_details(p_niat text default null, p_phone text default null) returns public.profile_private
language plpgsql security definer set search_path = public as $$
declare
  v_niat text := public.normalize_niat(p_niat);
  v_phone text := public.normalize_in_phone(p_phone);
  r public.profile_private;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform public.rl_hit('details', 20, 3600);
  insert into public.profile_private (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into r from public.profile_private where user_id = auth.uid() for update;
  if v_niat is not null then
    if r.niat_id is not null and r.niat_id <> v_niat then raise exception 'Your NIAT ID is already set. Ask an administrator if it is wrong.' using errcode = '42501'; end if;
    if not public.niat_format_ok(v_niat) then raise exception '%', public.niat_error() using errcode = '22023'; end if;
    if exists (select 1 from public.profile_private where niat_id = v_niat and user_id <> auth.uid()) then raise exception 'This NIAT ID is already registered.' using errcode = '23505'; end if;
  end if;
  if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then raise exception 'Invalid mobile number. Enter a 10-digit Indian mobile number.' using errcode = '22023'; end if;
  begin
    update public.profile_private
       set niat_id = coalesce(niat_id, v_niat), phone = coalesce(v_phone, phone), updated_at = now()
     where user_id = auth.uid()
    returning * into r;
  exception when unique_violation then
    raise exception 'This NIAT ID is already registered.' using errcode = '23505';
  end;
  return r;
end $$;
revoke execute on function public.complete_my_details(text, text) from public, anon;
grant execute on function public.complete_my_details(text, text) to authenticated;

-- ───────────── 3. profile changes: campus validated, timezone added ─────────────
alter table public.profiles add column if not exists timezone text not null default 'Asia/Kolkata';
alter table public.profiles drop constraint if exists profiles_timezone_shape;
alter table public.profiles add constraint profiles_timezone_shape check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' and length(timezone) <= 64);

create or replace function public.protect_profile() returns trigger
language plpgsql security invoker set search_path = public as $$
declare v_campus text;
begin
  if current_user in ('authenticated', 'anon') then
    new.id := old.id;
    new.role := old.role;
    new.xp := old.xp;
    new.daily_xp := old.daily_xp;
    new.rank_level := old.rank_level;
    new.student_id := old.student_id;
  end if;
  -- campus: checked whenever it changes (a stored legacy value is left alone until then)
  if new.campus is distinct from old.campus then
    v_campus := public.normalize_campus(new.campus);
    if v_campus is null then raise exception 'Enter your campus name.' using errcode = '22023'; end if;
    if not public.campus_ok(v_campus) then raise exception 'Invalid campus name. Use 2–60 letters, numbers, spaces or . , '' ( ) & / -' using errcode = '22023'; end if;
    new.campus := v_campus;
  end if;
  if new.timezone is distinct from old.timezone and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone.' using errcode = '22023';
  end if;
  return new;
end $$;

-- ───────────── 4. administrators: campus, NIAT review, change log ─────────────
create table if not exists public.admin_change_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_id uuid references public.profiles(id) on delete set null,
  field text not null check (field in ('campus', 'niat_id')),
  old_value text,
  new_value text
);
alter table public.admin_change_log enable row level security;
drop policy if exists admin_change_log_read on public.admin_change_log;
create policy admin_change_log_read on public.admin_change_log for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.admin_change_log from anon, authenticated;
grant select on public.admin_change_log to authenticated;
grant all on public.admin_change_log to service_role;
grant usage, select on sequence public.admin_change_log_id_seq to service_role;

create or replace function public.admin_set_campus(p_user uuid, p_campus text) returns text
language plpgsql security definer set search_path = public as $$
declare v text := public.normalize_campus(p_campus); v_old text;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  perform public.rl_hit('admin-edit', 120, 600);
  if v is null or not public.campus_ok(v) then raise exception 'Invalid campus name. Use 2–60 letters, numbers, spaces or . , '' ( ) & / -' using errcode = '22023'; end if;
  select campus into v_old from public.profiles where id = p_user for update;
  if not found then raise exception 'No such account' using errcode = 'P0002'; end if;
  update public.profiles set campus = v where id = p_user;
  insert into public.admin_change_log (actor_id, target_id, field, old_value, new_value) values (auth.uid(), p_user, 'campus', v_old, v);
  return v;
end $$;

-- an administrator may set or correct a NIAT ID after checking it (validated, unique, logged)
create or replace function public.admin_set_niat(p_user uuid, p_niat text) returns text
language plpgsql security definer set search_path = public as $$
declare v text := public.normalize_niat(p_niat); v_old text;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  perform public.rl_hit('admin-edit', 120, 600);
  if v is null or not public.niat_format_ok(v) then raise exception '%', public.niat_error() using errcode = '22023'; end if;
  insert into public.profile_private (user_id) values (p_user) on conflict (user_id) do nothing;
  select niat_id into v_old from public.profile_private where user_id = p_user for update;
  if exists (select 1 from public.profile_private where niat_id = v and user_id <> p_user) then raise exception 'This NIAT ID is already registered to another account.' using errcode = '23505'; end if;
  update public.profile_private set niat_id = v, updated_at = now() where user_id = p_user;
  insert into public.admin_change_log (actor_id, target_id, field, old_value, new_value) values (auth.uid(), p_user, 'niat_id', v_old, v);
  return v;
end $$;

-- accounts whose NIAT ID needs a human decision (nothing here changes any data)
create or replace function public.admin_niat_review()
returns table (id uuid, name text, email text, campus text, niat_id text, legacy_student_id text, issue text, created_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  perform public.rl_hit('admin-users', 300, 600);
  return query
  select p.id, p.name, u.email::text, p.campus, pp.niat_id, pp.legacy_student_id,
         case
           when pp.niat_id is not null then 'campus-missing'
           when nullif(trim(coalesce(pp.legacy_student_id, '')), '') is null then 'missing'
           when not public.niat_format_ok(public.normalize_niat(pp.legacy_student_id)) then 'legacy-invalid'
           when exists (select 1 from public.profile_private o where o.niat_id = public.normalize_niat(pp.legacy_student_id)) then 'legacy-duplicate'
           else 'legacy-unclaimed'
         end as issue,
         p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profile_private pp on pp.user_id = p.id
  where p.role = 'student' and (pp.niat_id is null or coalesce(p.campus, '') = '')
  order by p.created_at desc
  limit 1000;
end $$;

drop function if exists public.admin_list_users(text, text, text, int, int, int, int);
create or replace function public.admin_list_users(
  p_search text default null, p_role text default null, p_status text default null,
  p_min_rank int default null, p_max_rank int default null, p_limit int default 25, p_offset int default 0,
  p_campus text default null)
returns table (
  id uuid, name text, email text, phone text, niat_id text, legacy_student_id text, avatar text, role text,
  xp int, daily_xp int, rank_level int, created_at timestamptz, last_sign_in_at timestamptz, status text, campus text, total bigint)
language plpgsql security definer set search_path = public, auth as $$
#variable_conflict use_column
declare
  v_q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_c text := nullif(lower(trim(coalesce(p_campus, ''))), '');
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  perform public.rl_hit('admin-users', 300, 600);
  return query
  with rows as (
    select p.id, p.name, u.email::text as email, pp.phone, pp.niat_id, pp.legacy_student_id, p.avatar, p.role,
           p.xp, p.daily_xp, p.rank_level, p.created_at, u.last_sign_in_at,
           case when u.banned_until is not null and u.banned_until > now() then 'suspended'
                when u.email_confirmed_at is null then 'unconfirmed'
                else 'active' end as status,
           p.campus
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profile_private pp on pp.user_id = p.id
  )
  select r.*, count(*) over () as total
  from rows r
  where (v_q is null or lower(r.name) like '%' || v_q || '%' or lower(r.email) like '%' || v_q || '%'
         or lower(coalesce(r.niat_id, '')) like '%' || v_q || '%' or lower(coalesce(r.legacy_student_id, '')) like '%' || v_q || '%'
         or lower(coalesce(r.campus, '')) like '%' || v_q || '%'
         or coalesce(r.phone, '') like '%' || regexp_replace(v_q, '[^0-9]', '', 'g') || '%' and regexp_replace(v_q, '[^0-9]', '', 'g') <> '')
    and (p_role is null or r.role = p_role)
    and (p_status is null or r.status = p_status)
    and (p_min_rank is null or r.rank_level >= p_min_rank)
    and (p_max_rank is null or r.rank_level <= p_max_rank)
    and (v_c is null or (v_c = '(none)' and coalesce(r.campus, '') = '') or lower(coalesce(r.campus, '')) like '%' || v_c || '%')
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- distinct campus names for the admin filter
create or replace function public.admin_campuses() returns table (campus text, students bigint)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query select coalesce(nullif(p.campus, ''), '(none)'), count(*) from public.profiles p group by 1 order by 2 desc, 1 limit 500;
end $$;

revoke execute on function public.admin_list_users(text, text, text, int, int, int, int, text) from public, anon;
grant execute on function public.admin_list_users(text, text, text, int, int, int, int, text) to authenticated;
revoke execute on function public.admin_set_campus(uuid, text) from public, anon;
grant execute on function public.admin_set_campus(uuid, text) to authenticated;
revoke execute on function public.admin_set_niat(uuid, text) from public, anon;
grant execute on function public.admin_set_niat(uuid, text) to authenticated;
revoke execute on function public.admin_niat_review() from public, anon;
grant execute on function public.admin_niat_review() to authenticated;
revoke execute on function public.admin_campuses() from public, anon;
grant execute on function public.admin_campuses() to authenticated;

-- ───────────── 5. daily streaks ─────────────
create table if not exists public.streak_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  first_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.streak_days enable row level security;
drop policy if exists streak_days_read on public.streak_days;
create policy streak_days_read on public.streak_days for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.streak_days from anon, authenticated;
grant select on public.streak_days to authenticated;
grant all on public.streak_days to service_role;

-- the student's timezone, falling back to India time if it is missing or unknown
create or replace function public.user_tz(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select p.timezone from public.profiles p where p.id = p_user and exists (select 1 from pg_timezone_names t where t.name = p.timezone)), 'Asia/Kolkata')
$$;
revoke execute on function public.user_tz(uuid) from public, anon, authenticated;

-- the streak day an instant belongs to: the day ends at 23:59 local time
create or replace function public.streak_day(p_at timestamptz, p_tz text) returns date
language sql stable as $$ select ((p_at at time zone p_tz) + interval '1 minute')::date $$;

create or replace function public.record_streak_day() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.amount > 0 then
    insert into public.streak_days (user_id, day, first_at)
    values (new.user_id, public.streak_day(new.at, public.user_tz(new.user_id)), new.at)
    on conflict (user_id, day) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists xp_events_streak on public.xp_events;
create trigger xp_events_streak after insert on public.xp_events for each row execute function public.record_streak_day();

-- backfill from the XP ledger (idempotent)
insert into public.streak_days (user_id, day, first_at)
select e.user_id, public.streak_day(e.at, public.user_tz(e.user_id)), min(e.at)
from public.xp_events e
where e.amount > 0
group by 1, 2
on conflict (user_id, day) do nothing;

-- current streak (counting today if active, otherwise up to yesterday), longest streak, and whether today counts yet
create or replace function public.my_streak()
returns table (current_streak int, longest_streak int, active_today boolean, last_active date, today date, timezone text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_today date;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  v_tz := public.user_tz(auth.uid());
  v_today := public.streak_day(now(), v_tz);
  return query
  with d as (select s.day from public.streak_days s where s.user_id = auth.uid() and s.day <= v_today),
  isl as (select day, day - (row_number() over (order by day))::int as k from d),
  runs as (select k, count(*)::int as n, max(day) as last_day from isl group by k)
  select
    coalesce((select r.n from runs r where r.last_day >= v_today - 1), 0),
    coalesce((select max(r.n) from runs r), 0),
    exists (select 1 from d where d.day = v_today),
    (select max(d.day) from d),
    v_today,
    v_tz;
end $$;
revoke execute on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated;
