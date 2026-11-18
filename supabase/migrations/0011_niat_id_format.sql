-- BEAST FEAST — correct NIAT student ID format: N00H01X0000
--   N, two digits, H01, one letter, four digits  (e.g. N24H01A0001)  →  ^N[0-9]{2}H01[A-Z][0-9]{4}$
-- 0010 used N + 2 digits + H01 + 5 digits, which real IDs do not follow. The existing accounts' IDs (kept as
-- legacy_student_id) already use the correct format, so they become their NIAT IDs now (first account wins
-- if two accounts share an ID; the legacy value is kept either way).

alter table public.profile_private drop constraint if exists profile_private_niat_id_check;
-- no NIAT IDs were stored under the old (wrong) format, but clear any defensively so the new check can apply
update public.profile_private set niat_id = null where niat_id is not null and niat_id !~ '^N[0-9]{2}H01[A-Z][0-9]{4}$';
alter table public.profile_private add constraint profile_private_niat_id_check check (niat_id is null or niat_id ~ '^N[0-9]{2}H01[A-Z][0-9]{4}$');

with c as (
  select user_id, public.normalize_niat(legacy_student_id) as v,
         row_number() over (partition by public.normalize_niat(legacy_student_id) order by created_at, user_id) as n
  from public.profile_private
  where niat_id is null and public.normalize_niat(legacy_student_id) ~ '^N[0-9]{2}H01[A-Z][0-9]{4}$'
)
update public.profile_private p set niat_id = c.v, updated_at = now()
from c
where p.user_id = c.user_id and c.n = 1
  and not exists (select 1 from public.profile_private o where o.niat_id = c.v);

create or replace function public.niat_format_ok(p text) returns boolean
language sql immutable as $$ select coalesce(p ~ '^N[0-9]{2}H01[A-Z][0-9]{4}$', false) $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_niat text := public.normalize_niat(new.raw_user_meta_data->>'niat_id');
  v_phone text := public.normalize_in_phone(new.raw_user_meta_data->>'phone');
begin
  if v_niat is not null and not public.niat_format_ok(v_niat) then
    raise exception 'Invalid NIAT ID. Use the format N00H01X0000, e.g. N24H01A0001.' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'Invalid mobile number. Enter a 10-digit Indian mobile number.' using errcode = '22023';
  end if;
  if v_niat is not null and exists (select 1 from public.profile_private where niat_id = v_niat) then
    raise exception 'This NIAT ID is already registered.' using errcode = '23505';
  end if;
  insert into public.profiles (id, name, campus, student_id)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'Engineer'), 80), left(coalesce(new.raw_user_meta_data->>'campus', ''), 60), '');
  insert into public.profile_private (user_id, niat_id, phone) values (new.id, v_niat, v_phone);
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
    if not public.niat_format_ok(v_niat) then raise exception 'Invalid NIAT ID. Use the format N00H01X0000, e.g. N24H01A0001.' using errcode = '22023'; end if;
    if exists (select 1 from public.profile_private where niat_id = v_niat and user_id <> auth.uid()) then raise exception 'This NIAT ID is already registered.' using errcode = '23505'; end if;
  end if;
  if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then raise exception 'Invalid mobile number. Enter a 10-digit Indian mobile number.' using errcode = '22023'; end if;
  update public.profile_private
     set niat_id = coalesce(niat_id, v_niat), phone = coalesce(v_phone, phone), updated_at = now()
   where user_id = auth.uid()
  returning * into r;
  return r;
end $$;

revoke execute on function public.niat_id_available(text) from public;
grant execute on function public.niat_id_available(text) to anon, authenticated;
revoke execute on function public.complete_my_details(text, text) from public, anon;
grant execute on function public.complete_my_details(text, text) to authenticated;
