-- BEAST FEAST — private contact details, sign-up validation, profile pictures and server-side rate limits.
--
-- * profile_private holds each student's phone (+91), NIAT ID and any legacy student ID. Only the student and
--   administrators can read it; nobody writes it directly (only the sign-up trigger and the functions below).
--   Previously the student ID sat on `profiles`, which every signed-in student can read; it is moved here.
-- * NIAT ID format ^N\d{2}H01\d{5}$ and Indian mobile numbers are validated in the database, not just the form.
--   Existing accounts keep their old-format IDs as `legacy_student_id`; nothing is reformatted or invented.
-- * Profile pictures live in the public `avatars` Storage bucket; a user can only write inside their own folder.
-- * rl_hit() is a shared (database-backed) rate limiter, so it holds across serverless instances.
-- Nothing is deleted: the old student_id values are copied before the public column is blanked.

-- ───────────── 1. shared rate limiter ─────────────
create table if not exists public.rate_limits (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, key, window_start)
);
alter table public.rate_limits enable row level security; -- no policies: only security-definer functions touch it
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

create or replace function public.request_ip() returns text
language plpgsql stable set search_path = public as $$
declare h json; v text;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then return null;
  end;
  v := coalesce(h->>'cf-connecting-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), h->>'x-real-ip');
  return nullif(trim(v), '');
end $$;

create or replace function public.rl_hit(p_bucket text, p_max int, p_window_s int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_key text := coalesce(auth.uid()::text, 'ip:' || coalesce(public.request_ip(), 'unknown'));
  v_win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  v_hits int;
begin
  insert into public.rate_limits as r (bucket, key, window_start, hits) values (p_bucket, v_key, v_win, 1)
  on conflict (bucket, key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'Too many requests — please wait a few minutes and try again.' using errcode = 'P0429';
  end if;
end $$;
revoke execute on function public.rl_hit(text, int, int) from public, anon, authenticated;
revoke execute on function public.request_ip() from public, anon, authenticated;

-- ───────────── 2. private profile details ─────────────
create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  country_code text not null default '+91' check (country_code = '+91'),
  phone text check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$'),
  niat_id text unique check (niat_id is null or niat_id ~ '^N[0-9]{2}H01[0-9]{5}$'),
  legacy_student_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;
drop policy if exists profile_private_read on public.profile_private;
create policy profile_private_read on public.profile_private for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.profile_private from anon, authenticated;
grant select on public.profile_private to authenticated;
grant all on public.profile_private to service_role;

create or replace function public.normalize_niat(p text) returns text
language sql immutable as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')), '') $$;
create or replace function public.normalize_in_phone(p text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if d = '' then return null; end if;
  if length(d) = 12 and left(d, 2) = '91' then d := substr(d, 3); end if;
  if length(d) = 11 and left(d, 1) = '0' then d := substr(d, 2); end if;
  return '+91' || d;
end $$;

-- backfill: every existing profile gets a private row; old IDs are kept as legacy, valid ones become the NIAT ID
insert into public.profile_private (user_id, niat_id, legacy_student_id)
select p.id,
       case when public.normalize_niat(p.student_id) ~ '^N[0-9]{2}H01[0-9]{5}$' then public.normalize_niat(p.student_id) end,
       nullif(trim(p.student_id), '')
from public.profiles p
on conflict (user_id) do nothing;
-- the copy above is the record now; stop exposing IDs on the publicly readable profiles table
update public.profiles set student_id = '' where student_id <> '';

-- students may still edit their name, campus and avatar; never id, role, XP, rank or the (retired) student_id
create or replace function public.protect_profile() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.id := old.id;
    new.role := old.role;
    new.xp := old.xp;
    new.daily_xp := old.daily_xp;
    new.rank_level := old.rank_level;
    new.student_id := old.student_id;
  end if;
  return new;
end $$;

-- avatar must be a short https URL (the Storage public URL) — no data: or javascript: URLs, no huge blobs
alter table public.profiles drop constraint if exists profiles_avatar_url;
alter table public.profiles add constraint profiles_avatar_url check (avatar is null or (avatar ~ '^https://' and length(avatar) <= 500)) not valid;

-- sign-up: validate and store phone + NIAT ID from the sign-up form (server-side, cannot be skipped by the form)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_niat text := public.normalize_niat(new.raw_user_meta_data->>'niat_id');
  v_phone text := public.normalize_in_phone(new.raw_user_meta_data->>'phone');
begin
  if v_niat is not null and v_niat !~ '^N[0-9]{2}H01[0-9]{5}$' then
    raise exception 'Invalid NIAT ID. Use the format NXXH01XXXXX, e.g. N24H0100001.' using errcode = '22023';
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

-- the form checks availability before submitting (anonymous, rate limited per IP)
create or replace function public.niat_id_available(p_niat text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text := public.normalize_niat(p_niat);
begin
  perform public.rl_hit('niat-check', 30, 600);
  if v is null or v !~ '^N[0-9]{2}H01[0-9]{5}$' then return false; end if;
  return not exists (select 1 from public.profile_private where niat_id = v);
end $$;
revoke execute on function public.niat_id_available(text) from public;
grant execute on function public.niat_id_available(text) to anon, authenticated;

-- a student adds missing details once; a NIAT ID can never be changed by the student after it is set
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
    if v_niat !~ '^N[0-9]{2}H01[0-9]{5}$' then raise exception 'Invalid NIAT ID. Use the format NXXH01XXXXX, e.g. N24H0100001.' using errcode = '22023'; end if;
    if exists (select 1 from public.profile_private where niat_id = v_niat and user_id <> auth.uid()) then raise exception 'This NIAT ID is already registered.' using errcode = '23505'; end if;
  end if;
  if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then raise exception 'Invalid mobile number. Enter a 10-digit Indian mobile number.' using errcode = '22023'; end if;
  update public.profile_private
     set niat_id = coalesce(niat_id, v_niat), phone = coalesce(v_phone, phone), updated_at = now()
   where user_id = auth.uid()
  returning * into r;
  return r;
end $$;
revoke execute on function public.complete_my_details(text, text) from public, anon;
grant execute on function public.complete_my_details(text, text) to authenticated;

-- ───────────── 3. profile pictures (Supabase Storage) ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;
drop policy if exists avatars_read_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
-- listing your own folder (to clean up the old picture); public URLs work without this
create policy avatars_read_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- the upload route calls this once per upload
create or replace function public.avatar_upload_allowed() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform public.rl_hit('avatar', 10, 3600);
end $$;
revoke execute on function public.avatar_upload_allowed() from public, anon;
grant execute on function public.avatar_upload_allowed() to authenticated;

-- ───────────── 4. existing functions with rate limits ─────────────
-- award_xp: unchanged logic, plus a rate limit (120 calls / 10 min)
create or replace function public.award_xp(p_type text, p_ref text, p_amount int default null, p_description text default null) returns table(awarded int, total int)
language plpgsql security definer set search_path = public as $$
declare r public.xp_rules; v int; n int; added int := 0;
begin
  perform public.rl_hit('xp', 120, 600);
  perform public.rl_hit('xp', 120, 600);
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from public.xp_rules where type = p_type;
  if not found then raise exception 'unknown xp type'; end if;
  if p_type in ('question-correct', 'quiz-pass', 'lesson-complete', 'inactivity-penalty') then
    raise exception 'use submit_quiz / complete_lesson';
  end if;
  v := r.amount;
  if r.max_per_user is not null then
    select count(*) into n from public.xp_events where user_id = auth.uid() and type = p_type;
    if n >= r.max_per_user then v := 0; end if;
  end if;
  if v > 0 then
    insert into public.xp_events (user_id, type, ref_id, amount, source, description)
    values (auth.uid(), p_type, p_ref, v, case when p_type = 'competition-win' then 'competition' else 'build' end, left(p_description, 200))
    on conflict do nothing;
    get diagnostics added = row_count;
  end if;
  return query select case when added > 0 then v else 0 end, public.recompute_xp(auth.uid());
end $$;

-- complete_lesson: unchanged logic, plus a rate limit (60 calls / 10 min)
create or replace function public.complete_lesson(p_topic text) returns int
language plpgsql security definer set search_path = public as $$
declare added int := 0; v int; v_title text;
begin
  perform public.rl_hit('lesson', 60, 600);
  perform public.rl_hit('lesson', 60, 600);
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select title into v_title from public.topics where id = p_topic;
  if v_title is null then raise exception 'unknown topic'; end if;
  select coalesce(amount, 20) into v from public.xp_rules where type = 'lesson-complete';
  insert into public.progress(user_id) values (auth.uid()) on conflict do nothing;
  insert into public.learning_activity (user_id, day, kind, ref) values (auth.uid(), (now() at time zone public.xp_timezone())::date, 'lesson', p_topic) on conflict do nothing;
  if v > 0 then
    insert into public.xp_events (user_id, type, ref_id, amount, source, description)
    values (auth.uid(), 'lesson-complete', p_topic, v, 'learning', 'Completed lesson: ' || v_title) on conflict do nothing;
    get diagnostics added = row_count;
  end if;
  update public.progress set completed_topics = array(select distinct unnest(completed_topics || p_topic)) where user_id = auth.uid();
  perform public.recompute_xp(auth.uid());
  return case when added > 0 then v else 0 end;
end $$;

-- submit_quiz: unchanged logic, plus a rate limit (30 calls / 10 min)
create or replace function public.submit_quiz(p_quiz text, p_answers jsonb) returns public.quiz_attempts
language plpgsql security definer set search_path = public as $$
declare
  q record; c int := 0; t int := 0; xp int := 0; pass_pct int; a public.quiz_attempts; ins int; v_pass int;
  v_source text := case when p_quiz like 'topic:%' then 'quiz' else 'challenge' end;
  v_title text;
begin
  perform public.rl_hit('quiz', 30, 600);
  perform public.rl_hit('quiz', 30, 600);
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_quiz like 'topic:%' then
    select title into v_title from public.topics where id = substr(p_quiz, 7);
    pass_pct := 60;
  else
    select title, pass_percent into v_title, pass_pct from public.quizzes where id = p_quiz;
    if pass_pct is null then raise exception 'unknown quiz'; end if;
  end if;
  insert into public.progress(user_id) values (auth.uid()) on conflict do nothing;
  insert into public.learning_activity (user_id, day, kind, ref) values (auth.uid(), (now() at time zone public.xp_timezone())::date, 'quiz', left(p_quiz, 120)) on conflict do nothing;
  insert into public.quiz_attempts (user_id, quiz_id, answers, correct, total, percent, passed, xp_awarded)
    values (auth.uid(), p_quiz, p_answers, 0, 0, 0, false, 0) returning * into a;
  select coalesce(amount, 25) into v_pass from public.xp_rules where type = 'quiz-pass';

  for q in
    select qq.id, qq.xp, k.answer_index from public.quiz_questions qq join public.quiz_answer_keys k on k.question_id = qq.id
     where (p_quiz like 'topic:%' and qq.topic_id = substr(p_quiz, 7))
        or (p_quiz not like 'topic:%' and qq.id in (select question_id from public.quiz_membership where quiz_id = p_quiz))
  loop
    t := t + 1;
    if (p_answers ? q.id) and (p_answers->>q.id) ~ '^[0-9]+$' and (p_answers->>q.id)::int = q.answer_index then
      c := c + 1;
      insert into public.xp_events (user_id, type, ref_id, amount, source, description, attempt_id)
      values (auth.uid(), 'question-correct', q.id, q.xp, v_source, 'Correct answer — ' || coalesce(v_title, p_quiz), a.id)
      on conflict do nothing;
      get diagnostics ins = row_count; if ins > 0 then xp := xp + q.xp; end if;
    end if;
  end loop;
  if t > 0 and c * 100 / t >= pass_pct and v_pass > 0 then
    insert into public.xp_events (user_id, type, ref_id, amount, source, description, attempt_id)
    values (auth.uid(), 'quiz-pass', p_quiz, v_pass, v_source, 'Passed: ' || coalesce(v_title, p_quiz), a.id)
    on conflict do nothing;
    get diagnostics ins = row_count; if ins > 0 then xp := xp + v_pass; end if;
  end if;
  update public.quiz_attempts set correct = c, total = t, percent = case when t > 0 then c * 100 / t else 0 end,
         passed = t > 0 and c * 100 / t >= pass_pct, xp_awarded = xp
   where id = a.id returning * into a;
  perform public.recompute_xp(auth.uid());
  update public.progress set correct_questions = array(select distinct unnest(correct_questions || array(
      select key from jsonb_each_text(p_answers) e join public.quiz_answer_keys k on k.question_id = e.key and e.value ~ '^[0-9]+$' and k.answer_index = e.value::int)))
   where user_id = auth.uid();
  return a;
end $$;

-- apply_inactivity_penalties: unchanged logic, plus a rate limit (30 calls / 10 min)
create or replace function public.apply_inactivity_penalties() returns table(deducted int, days int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s jsonb; v_tz text; v_pen int; v_role text; v_created timestamptz;
  v_today date; v_start date; d date; v_total int; v int; v_ded int := 0; v_days int := 0;
begin
  perform public.rl_hit('penalty', 30, 600);
  perform public.rl_hit('penalty', 30, 600);
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select value into s from public.xp_settings where key = 'penalty';
  select amount into v_pen from public.xp_rules where type = 'inactivity-penalty';
  if s is null or not coalesce((s->>'enabled')::boolean, false) or coalesce(v_pen, 0) <= 0 then
    return query select 0, 0; return;
  end if;
  select role, created_at into v_role, v_created from public.profiles where id = v_uid;
  if v_role in ('admin', 'super_admin') then return query select 0, 0; return; end if;
  v_tz := coalesce(s->>'timezone', 'Asia/Kolkata');
  v_today := (now() at time zone v_tz)::date;
  v_start := greatest((v_created at time zone v_tz)::date + 1, coalesce((s->>'start')::date, v_today), v_today - coalesce((s->>'maxDaysBack')::int, 30));
  d := v_start;
  while d < v_today loop
    if not exists (select 1 from public.xp_events where user_id = v_uid and type = 'inactivity-penalty' and ref_id = d::text)
       and not exists (select 1 from public.learning_activity where user_id = v_uid and day = d)
       and not exists (select 1 from public.quiz_attempts where user_id = v_uid and (at at time zone v_tz)::date = d)
       and not exists (select 1 from public.xp_events where user_id = v_uid and type in ('lesson-complete', 'question-correct', 'quiz-pass') and (at at time zone v_tz)::date = d)
    then
      select coalesce(sum(amount), 0) into v_total from public.xp_events where user_id = v_uid;
      v := least(v_pen, greatest(v_total, 0));
      insert into public.xp_events (user_id, type, ref_id, amount, source, description)
      values (v_uid, 'inactivity-penalty', d::text, -v, 'penalty', 'No Beast Topics, videos or quizzes on ' || to_char(d, 'DD Mon YYYY'))
      on conflict do nothing;
      if v > 0 then v_ded := v_ded + v; v_days := v_days + 1; end if;
    end if;
    d := d + 1;
  end loop;
  perform public.recompute_xp(v_uid);
  return query select v_ded, v_days;
end $$;

-- record_learning_activity: unchanged logic, plus a rate limit (200 calls / 10 min)
create or replace function public.record_learning_activity(p_kind text, p_ref text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.rl_hit('activity', 200, 600);
  perform public.rl_hit('activity', 200, 600);
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_kind not in ('topic', 'video', 'lesson', 'quiz') then raise exception 'Unknown activity' using errcode = '22023'; end if;
  insert into public.learning_activity (user_id, day, kind, ref)
  values (auth.uid(), (now() at time zone public.xp_timezone())::date, p_kind, left(coalesce(p_ref, ''), 120))
  on conflict do nothing;
end $$;

-- admin_find_user: unchanged logic, plus a rate limit (60 calls / 10 min)
create or replace function public.admin_find_user(p_email text)
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.rl_hit('admin-search', 60, 600);
  perform public.rl_hit('admin-search', 60, 600);
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not public.is_super_admin() then raise exception 'Only the Super Admin can look up accounts' using errcode = '42501'; end if;
  return query
    select p.id, p.name, u.email::text, p.role, p.created_at
    from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(p_email));
end $$;

-- admin_set_role: unchanged logic, plus a rate limit (30 calls / 10 min)
create or replace function public.admin_set_role(p_user uuid, p_role text, p_note text default null)
returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_old text;
  v_target_email text;
  v_actor_email text;
begin
  perform public.rl_hit('admin-role', 30, 600);
  perform public.rl_hit('admin-role', 30, 600);
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not public.is_super_admin() then raise exception 'Only the Super Admin can change roles' using errcode = '42501'; end if;
  if p_role not in ('student', 'admin') then raise exception 'Role must be student or admin' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role' using errcode = '42501'; end if;
  select role into v_old from public.profiles where id = p_user for update;
  if not found then raise exception 'No account with that id' using errcode = 'P0002'; end if;
  if v_old = 'super_admin' then raise exception 'The Super Admin account is protected' using errcode = '42501'; end if;
  if v_old = p_role then return v_old; end if;

  update public.profiles set role = p_role where id = p_user;
  select email into v_target_email from auth.users where id = p_user;
  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.role_audit_log (actor_id, actor_email, target_id, target_email, old_role, new_role, action, note)
  values (auth.uid(), v_actor_email, p_user, v_target_email, v_old, p_role, case when p_role = 'admin' then 'promote' else 'revoke' end, p_note);
  return p_role;
end $$;

-- admin_list_staff: unchanged logic, plus a rate limit (120 calls / 10 min)
create or replace function public.admin_list_staff()
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.rl_hit('admin-list', 120, 600);
  perform public.rl_hit('admin-list', 120, 600);
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
    select p.id, p.name, u.email::text, p.role, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    where p.role in ('admin', 'super_admin')
    order by case p.role when 'super_admin' then 0 else 1 end, p.name;
end $$;

-- ───────────── 5. admin user management ─────────────
-- Admins (and the Super Admin) see contact details; students never can (is_admin check + profile_private RLS).
-- Passwords, hashes and tokens are never returned.
create or replace function public.admin_list_users(
  p_search text default null, p_role text default null, p_status text default null,
  p_min_rank int default null, p_max_rank int default null, p_limit int default 25, p_offset int default 0)
returns table (
  id uuid, name text, email text, phone text, niat_id text, legacy_student_id text, avatar text, role text,
  xp int, daily_xp int, rank_level int, created_at timestamptz, last_sign_in_at timestamptz, status text, total bigint)
language plpgsql security definer set search_path = public, auth as $$
#variable_conflict use_column
declare v_q text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  perform public.rl_hit('admin-users', 300, 600);
  return query
  with rows as (
    select p.id, p.name, u.email::text as email, pp.phone, pp.niat_id, pp.legacy_student_id, p.avatar, p.role,
           p.xp, p.daily_xp, p.rank_level, p.created_at, u.last_sign_in_at,
           case when u.banned_until is not null and u.banned_until > now() then 'suspended'
                when u.email_confirmed_at is null then 'unconfirmed'
                else 'active' end as status
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profile_private pp on pp.user_id = p.id
  )
  select r.*, count(*) over () as total
  from rows r
  where (v_q is null or lower(r.name) like '%' || v_q || '%' or lower(r.email) like '%' || v_q || '%'
         or lower(coalesce(r.niat_id, '')) like '%' || v_q || '%' or lower(coalesce(r.legacy_student_id, '')) like '%' || v_q || '%'
         or coalesce(r.phone, '') like '%' || regexp_replace(v_q, '[^0-9]', '', 'g') || '%' and regexp_replace(v_q, '[^0-9]', '', 'g') <> '')
    and (p_role is null or r.role = p_role)
    and (p_status is null or r.status = p_status)
    and (p_min_rank is null or r.rank_level >= p_min_rank)
    and (p_max_rank is null or r.rank_level <= p_max_rank)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke execute on function public.admin_list_users(text, text, text, int, int, int, int) from public, anon;
grant execute on function public.admin_list_users(text, text, text, int, int, int, int) to authenticated;

-- grants for the re-created functions (create or replace keeps grants, restated for clarity)
revoke execute on function public.admin_find_user(text) from public, anon;
revoke execute on function public.admin_list_staff() from public, anon;
grant execute on function public.admin_find_user(text) to authenticated;
grant execute on function public.admin_list_staff() to authenticated;

-- ───────────── 6. housekeeping: drop rate-limit windows older than a day (daily, pg_cron) ─────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('beast-rate-limit-cleanup');
    exception when others then null;
    end;
    perform cron.schedule('beast-rate-limit-cleanup', '15 18 * * *', $cmd$delete from public.rate_limits where window_start < now() - interval '1 day'$cmd$);
  end if;
end $$;
