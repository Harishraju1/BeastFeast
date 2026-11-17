-- BEAST FEAST 5.0 — XP rework
--   * XP rewards real work: own circuit designs, own code, and successful simulations with own code.
--     Creating/opening projects and merely starting a simulation earn nothing.
--   * Admins edit every amount (xp_rules) and the daily-inactivity penalty (xp_settings) from /admin.
--   * A student who does no Beast Topics / quizzes / videos on a day loses the penalty amount (default 10)
--     for that day. Computed on the server; never takes XP below 0; admins are exempt.

-- 1. amounts (the client decides *whether* an event happened; the server decides *how much* it is worth)
update public.xp_rules set amount = 0 where type in ('project-created', 'simulation-first');
update public.xp_rules set amount = 60, max_per_user = null where type = 'validation-pass';
update public.xp_rules set amount = 80 where type = 'code-check-pass';
update public.xp_rules set amount = 150 where type = 'lap-complete';
update public.xp_rules set amount = 150 where type = 'sumo-win';
update public.xp_rules set amount = 25 where type = 'record-improved';
insert into public.xp_rules (type, amount, max_per_user) values ('inactivity-penalty', 10, null)
  on conflict (type) do nothing;

-- 2. XP settings (penalty switch, start date, time zone)
create table if not exists public.xp_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.xp_settings enable row level security;
create policy xp_settings_read on public.xp_settings for select to authenticated using (true);
create policy xp_settings_admin on public.xp_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.xp_settings to authenticated;
grant all on public.xp_settings to service_role;
insert into public.xp_settings (key, value) values (
  'penalty',
  jsonb_build_object('enabled', true, 'timezone', 'Asia/Kolkata', 'maxDaysBack', 30,
                     -- penalties count from the day after this release, never retroactively
                     'start', to_char((now() at time zone 'Asia/Kolkata')::date + 1, 'YYYY-MM-DD'))
) on conflict (key) do nothing;

-- 3. daily learning activity (topic studied, video watched, lesson completed, quiz taken)
create table if not exists public.learning_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('topic', 'video', 'lesson', 'quiz')),
  ref text not null default '',
  at timestamptz not null default now(),
  primary key (user_id, day, kind, ref)
);
alter table public.learning_activity enable row level security;
create policy learning_activity_read on public.learning_activity for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.learning_activity from authenticated, anon;
grant select on public.learning_activity to authenticated;
grant all on public.learning_activity to service_role;

create or replace function public.xp_timezone() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select value->>'timezone' from public.xp_settings where key = 'penalty'), 'Asia/Kolkata');
$$;

create or replace function public.record_learning_activity(p_kind text, p_ref text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_kind not in ('topic', 'video', 'lesson', 'quiz') then raise exception 'Unknown activity' using errcode = '22023'; end if;
  insert into public.learning_activity (user_id, day, kind, ref)
  values (auth.uid(), (now() at time zone public.xp_timezone())::date, p_kind, left(coalesce(p_ref, ''), 120))
  on conflict do nothing;
end $$;

-- 4. one place that recomputes a profile's XP total (never below 0)
create or replace function public.recompute_xp(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  select greatest(0, coalesce(sum(amount), 0)) into v from public.xp_events where user_id = p_user;
  update public.profiles set xp = v where id = p_user;
  return v;
end $$;
revoke execute on function public.recompute_xp(uuid) from public, anon, authenticated;

-- 5. award_xp: amounts from xp_rules; zero-value rules award nothing; penalties cannot be self-awarded
create or replace function public.award_xp(p_type text, p_ref text, p_amount int default null) returns table(awarded int, total int)
language plpgsql security definer set search_path = public as $$
declare r public.xp_rules; v int; n int; added int := 0;
begin
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
    insert into public.xp_events(user_id, type, ref_id, amount) values (auth.uid(), p_type, p_ref, v) on conflict do nothing;
    get diagnostics added = row_count;
  end if;
  return query select case when added > 0 then v else 0 end, public.recompute_xp(auth.uid());
end $$;

-- 6. complete_lesson: amount from xp_rules, counts as learning activity
create or replace function public.complete_lesson(p_topic text) returns int
language plpgsql security definer set search_path = public as $$
declare added int; v int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.topics where id = p_topic) then raise exception 'unknown topic'; end if;
  select coalesce(amount, 20) into v from public.xp_rules where type = 'lesson-complete';
  insert into public.progress(user_id) values (auth.uid()) on conflict do nothing;
  insert into public.learning_activity (user_id, day, kind, ref) values (auth.uid(), (now() at time zone public.xp_timezone())::date, 'lesson', p_topic) on conflict do nothing;
  added := 0;
  if v > 0 then
    insert into public.xp_events(user_id, type, ref_id, amount) values (auth.uid(), 'lesson-complete', p_topic, v) on conflict do nothing;
    get diagnostics added = row_count;
  end if;
  update public.progress set completed_topics = array(select distinct unnest(completed_topics || p_topic)) where user_id = auth.uid();
  perform public.recompute_xp(auth.uid());
  return case when added > 0 then v else 0 end;
end $$;

-- 7. submit_quiz: quiz-pass amount from xp_rules, counts as learning activity
create or replace function public.submit_quiz(p_quiz text, p_answers jsonb) returns public.quiz_attempts
language plpgsql security definer set search_path = public as $$
declare q record; c int := 0; t int := 0; xp int := 0; pass_pct int; a public.quiz_attempts; ins int; v_pass int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.progress(user_id) values (auth.uid()) on conflict do nothing;
  insert into public.learning_activity (user_id, day, kind, ref) values (auth.uid(), (now() at time zone public.xp_timezone())::date, 'quiz', left(p_quiz, 120)) on conflict do nothing;
  select coalesce(amount, 25) into v_pass from public.xp_rules where type = 'quiz-pass';
  if p_quiz like 'topic:%' then
    pass_pct := 60;
    for q in select qq.id, qq.xp, k.answer_index from public.quiz_questions qq join public.quiz_answer_keys k on k.question_id = qq.id where qq.topic_id = substr(p_quiz, 7) loop
      t := t + 1;
      if (p_answers->>q.id)::int = q.answer_index then
        c := c + 1;
        insert into public.xp_events(user_id, type, ref_id, amount) values (auth.uid(), 'question-correct', q.id, q.xp) on conflict do nothing;
        get diagnostics ins = row_count; if ins > 0 then xp := xp + q.xp; end if;
      end if;
    end loop;
  else
    select pass_percent into pass_pct from public.quizzes where id = p_quiz;
    if pass_pct is null then raise exception 'unknown quiz'; end if;
    for q in select qq.id, qq.xp, k.answer_index from public.quiz_membership m join public.quiz_questions qq on qq.id = m.question_id join public.quiz_answer_keys k on k.question_id = qq.id where m.quiz_id = p_quiz loop
      t := t + 1;
      if (p_answers->>q.id)::int = q.answer_index then
        c := c + 1;
        insert into public.xp_events(user_id, type, ref_id, amount) values (auth.uid(), 'question-correct', q.id, q.xp) on conflict do nothing;
        get diagnostics ins = row_count; if ins > 0 then xp := xp + q.xp; end if;
      end if;
    end loop;
  end if;
  if t > 0 and c * 100 / t >= pass_pct and v_pass > 0 then
    insert into public.xp_events(user_id, type, ref_id, amount) values (auth.uid(), 'quiz-pass', p_quiz, v_pass) on conflict do nothing;
    get diagnostics ins = row_count; if ins > 0 then xp := xp + v_pass; end if;
  end if;
  perform public.recompute_xp(auth.uid());
  insert into public.quiz_attempts(user_id, quiz_id, answers, correct, total, percent, passed, xp_awarded)
    values (auth.uid(), p_quiz, p_answers, c, t, case when t > 0 then c * 100 / t else 0 end, t > 0 and c * 100 / t >= pass_pct, xp) returning * into a;
  update public.progress set correct_questions = array(select distinct unnest(correct_questions || array(select key from jsonb_each_text(p_answers) e join public.quiz_answer_keys k on k.question_id = e.key and k.answer_index = e.value::int))) where user_id = auth.uid();
  return a;
end $$;

-- 8. daily inactivity penalty — called by the app when a student signs in / opens the app.
--    Each past day (from the configured start, at most maxDaysBack ago, never before the day after sign-up)
--    with no learning activity costs the penalty amount, once per day, without going below 0 XP.
create or replace function public.apply_inactivity_penalties() returns table(deducted int, days int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s jsonb; v_tz text; v_pen int; v_role text; v_created timestamptz;
  v_today date; v_start date; d date; v_total int; v int; v_ded int := 0; v_days int := 0;
begin
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
      -- a zero-amount row still marks the day as settled, so it is never charged later
      insert into public.xp_events(user_id, type, ref_id, amount) values (v_uid, 'inactivity-penalty', d::text, -v) on conflict do nothing;
      if v > 0 then v_ded := v_ded + v; v_days := v_days + 1; end if;
    end if;
    d := d + 1;
  end loop;
  perform public.recompute_xp(v_uid);
  return query select v_ded, v_days;
end $$;

revoke execute on function public.record_learning_activity(text, text) from public, anon;
revoke execute on function public.apply_inactivity_penalties() from public, anon;
revoke execute on function public.xp_timezone() from public, anon;
grant execute on function public.record_learning_activity(text, text) to authenticated;
grant execute on function public.apply_inactivity_penalties() to authenticated;
grant execute on function public.xp_timezone() to authenticated;
grant execute on function public.award_xp(text, text, int) to authenticated;
grant execute on function public.complete_lesson(text) to authenticated;
grant execute on function public.submit_quiz(text, jsonb) to authenticated;
