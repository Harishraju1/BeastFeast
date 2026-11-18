-- BEAST FEAST 5.0 — XP ledger details, daily XP with an 11:15 PM IST reset, extended ranks and rank history.
-- Non-destructive: no XP event, attempt or profile is deleted; existing totals are only recomputed.
--
-- XP model
--   * xp_events is the single ledger (one row per transaction). Lifetime XP = sum of the ledger (≥ 0).
--   * Daily XP = ledger sum since the most recent 11:15 PM Asia/Kolkata (17:45 UTC) boundary. A scheduled job
--     (pg_cron, with the Vercel cron route /api/cron/daily-xp-reset as a fallback) re-baselines daily XP at the
--     boundary even if nobody is logged in. Runs are recorded in xp_reset_runs, so a period resets only once.
--   * Challenge XP = ledger rows with source 'challenge' (non-topic quizzes on the Challenges page).
--   * Rank = highest rank reached by lifetime XP (profiles.rank_level); never lowered by the daily reset or by
--     inactivity penalties. Every promotion is written to rank_history.

-- ───────────── 1. ledger columns ─────────────
alter table public.xp_events add column if not exists source text;
alter table public.xp_events add column if not exists description text;
alter table public.xp_events add column if not exists attempt_id uuid references public.quiz_attempts(id) on delete set null;
update public.xp_events set source = case
    when type in ('question-correct', 'quiz-pass') then 'quiz'
    when type = 'lesson-complete' then 'learning'
    when type = 'inactivity-penalty' then 'penalty'
    when type = 'competition-win' then 'competition'
    else 'build' end
  where source is null;
-- quiz-pass rows for non-topic quizzes came from the Challenges page
update public.xp_events set source = 'challenge' where type = 'quiz-pass' and ref_id not like 'topic:%';
create index if not exists xp_events_user_at on public.xp_events (user_id, at desc);

-- ───────────── 2. daily XP + permanent rank on the profile ─────────────
alter table public.profiles add column if not exists daily_xp integer not null default 0;
alter table public.profiles add column if not exists rank_level integer not null default 1;

-- students can never set these themselves (extends the 0005 trigger)
create or replace function public.protect_profile() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.id := old.id;
    new.role := old.role;
    new.xp := old.xp;
    new.daily_xp := old.daily_xp;
    new.rank_level := old.rank_level;
  end if;
  return new;
end $$;

-- ───────────── 3. ranks (central configuration, mirrors src/lib/ranks.ts) ─────────────
create table if not exists public.ranks (
  level integer primary key,
  name text not null unique,
  min_xp integer not null unique
);
insert into public.ranks (level, name, min_xp) values
  (1, 'Beginner', 0), (2, 'Explorer', 100), (3, 'Apprentice', 300), (4, 'Practitioner', 600),
  (5, 'Skilled Engineer', 1000), (6, 'Advanced Engineer', 1600), (7, 'Specialist', 2500), (8, 'Senior Specialist', 3600),
  (9, 'Expert', 5000), (10, 'Master Engineer', 7000), (11, 'Elite Engineer', 9500), (12, 'Robotics Architect', 12500),
  (13, 'Grandmaster', 16000), (14, 'Legendary Engineer', 20500), (15, 'Robotics Titan', 26000), (16, 'BEAST', 33000)
on conflict (level) do update set name = excluded.name, min_xp = excluded.min_xp;
alter table public.ranks enable row level security;
create policy ranks_read on public.ranks for select to authenticated using (true);
create policy ranks_admin on public.ranks for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.ranks to authenticated, anon;
grant all on public.ranks to service_role;

create table if not exists public.rank_history (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  old_level integer,
  new_level integer not null,
  xp_at integer not null,
  at timestamptz not null default now(),
  seen boolean not null default false,
  note text
);
create index if not exists rank_history_user on public.rank_history (user_id, at desc);
alter table public.rank_history enable row level security;
create policy rank_history_read on public.rank_history for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.rank_history from authenticated, anon;
grant select on public.rank_history to authenticated;
grant all on public.rank_history to service_role;
grant usage, select on sequence public.rank_history_id_seq to service_role;

-- ───────────── 4. the 11:15 PM IST XP day ─────────────
-- Start of the current XP day: the most recent 23:15 in Asia/Kolkata (= 17:45 UTC; India has no DST).
create or replace function public.xp_period_start(p_at timestamptz default now()) returns timestamptz
language sql stable set search_path = public as $$
  select case
    when (p_at at time zone 'Asia/Kolkata')::time >= time '23:15'
      then (((p_at at time zone 'Asia/Kolkata')::date) + time '23:15') at time zone 'Asia/Kolkata'
    else ((((p_at at time zone 'Asia/Kolkata')::date) - 1) + time '23:15') at time zone 'Asia/Kolkata'
  end;
$$;

create table if not exists public.xp_reset_runs (
  period_start timestamptz primary key,
  ran_at timestamptz not null default now(),
  profiles_updated integer not null default 0,
  trigger text not null default 'cron'
);
alter table public.xp_reset_runs enable row level security;
create policy xp_reset_runs_admin on public.xp_reset_runs for select to authenticated using (public.is_admin());
grant select on public.xp_reset_runs to authenticated;
grant all on public.xp_reset_runs to service_role;

-- ───────────── 5. one function keeps lifetime XP, daily XP and rank consistent ─────────────
create or replace function public.recompute_xp(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_total int; v_daily int; v_old int; v_new int;
begin
  select greatest(0, coalesce(sum(amount), 0)) into v_total from public.xp_events where user_id = p_user;
  select greatest(0, coalesce(sum(amount), 0)) into v_daily from public.xp_events where user_id = p_user and at >= public.xp_period_start();
  select rank_level into v_old from public.profiles where id = p_user for update;
  select coalesce(max(level), 1) into v_new from public.ranks where min_xp <= v_total;
  if v_old is null then return v_total; end if;
  if v_new > v_old then
    insert into public.rank_history (user_id, old_level, new_level, xp_at) values (p_user, v_old, v_new, v_total);
  end if;
  update public.profiles set xp = v_total, daily_xp = v_daily, rank_level = greatest(v_old, v_new) where id = p_user;
  return v_total;
end $$;
revoke execute on function public.recompute_xp(uuid) from public, anon, authenticated;

-- ───────────── 6. scheduled daily reset (idempotent per period) ─────────────
create or replace function public.reset_daily_xp(p_trigger text default 'cron') returns int
language plpgsql security definer set search_path = public as $$
declare v_period timestamptz := public.xp_period_start(); v_inserted int; v_rows int;
begin
  insert into public.xp_reset_runs (period_start, trigger) values (v_period, left(coalesce(p_trigger, 'cron'), 20)) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return -1; end if; -- this XP day was already reset
  -- re-baseline: daily XP = ledger since the boundary (normally 0; a late run keeps XP earned after 23:15)
  update public.profiles p set daily_xp = greatest(0, coalesce((select sum(e.amount) from public.xp_events e where e.user_id = p.id and e.at >= v_period), 0));
  get diagnostics v_rows = row_count;
  update public.xp_reset_runs set profiles_updated = v_rows where period_start = v_period;
  return v_rows;
end $$;
-- Safe to expose: it only ever re-baselines the *current* period once, so an early or repeated call is a no-op.
revoke execute on function public.reset_daily_xp(text) from public;
grant execute on function public.reset_daily_xp(text) to anon, authenticated, service_role;

-- pg_cron: 17:45 UTC = 23:15 IST every day. If pg_cron is unavailable, the Vercel cron route is the scheduler.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('beast-daily-xp-reset');
    exception when others then null;
    end;
    perform cron.schedule('beast-daily-xp-reset', '45 17 * * *', $cmd$select public.reset_daily_xp('pg_cron')$cmd$);
  end if;
end $$;

-- ───────────── 7. award_xp records source and description ─────────────
drop function if exists public.award_xp(text, text, int);
create or replace function public.award_xp(p_type text, p_ref text, p_amount int default null, p_description text default null) returns table(awarded int, total int)
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
    insert into public.xp_events (user_id, type, ref_id, amount, source, description)
    values (auth.uid(), p_type, p_ref, v, case when p_type = 'competition-win' then 'competition' else 'build' end, left(p_description, 200))
    on conflict do nothing;
    get diagnostics added = row_count;
  end if;
  return query select case when added > 0 then v else 0 end, public.recompute_xp(auth.uid());
end $$;
revoke execute on function public.award_xp(text, text, int, text) from public, anon;
grant execute on function public.award_xp(text, text, int, text) to authenticated;

-- ───────────── 8. lessons ─────────────
create or replace function public.complete_lesson(p_topic text) returns int
language plpgsql security definer set search_path = public as $$
declare added int := 0; v int; v_title text;
begin
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

-- ───────────── 9. quizzes: the attempt is created first, every XP row points at it ─────────────
create or replace function public.submit_quiz(p_quiz text, p_answers jsonb) returns public.quiz_attempts
language plpgsql security definer set search_path = public as $$
declare
  q record; c int := 0; t int := 0; xp int := 0; pass_pct int; a public.quiz_attempts; ins int; v_pass int;
  v_source text := case when p_quiz like 'topic:%' then 'quiz' else 'challenge' end;
  v_title text;
begin
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

-- ───────────── 10. inactivity penalty rows carry source/description ─────────────
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

-- ───────────── 11. rank notifications + admin recalculation ─────────────
create or replace function public.mark_rank_seen(p_ids bigint[]) returns void
language sql security definer set search_path = public as $$
  update public.rank_history set seen = true where user_id = auth.uid() and id = any(p_ids);
$$;
revoke execute on function public.mark_rank_seen(bigint[]) from public, anon;
grant execute on function public.mark_rank_seen(bigint[]) to authenticated;

-- Admins only: recalculate a student's rank from their lifetime XP after the ledger was corrected
-- (may lower the rank; recorded in rank_history as an admin correction).
create or replace function public.admin_recalculate_rank(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_total int; v_old int; v_new int;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  select greatest(0, coalesce(sum(amount), 0)) into v_total from public.xp_events where user_id = p_user;
  select rank_level into v_old from public.profiles where id = p_user;
  select coalesce(max(level), 1) into v_new from public.ranks where min_xp <= v_total;
  if v_new <> v_old then
    insert into public.rank_history (user_id, old_level, new_level, xp_at, seen, note) values (p_user, v_old, v_new, v_total, true, 'Recalculated by an administrator');
    update public.profiles set rank_level = v_new, xp = v_total where id = p_user;
  end if;
  return v_new;
end $$;
revoke execute on function public.admin_recalculate_rank(uuid) from public, anon;
grant execute on function public.admin_recalculate_rank(uuid) to authenticated;

-- ───────────── 12. leaderboard: only students above 50 lifetime XP (filtered in the database) ─────────────
create or replace view public.leaderboard_eligible with (security_invoker = true) as
  select id, name, avatar, campus, xp, daily_xp, rank_level, created_at
  from public.profiles
  where xp > 50;
grant select on public.leaderboard_eligible to authenticated;

-- ───────────── 13. backfill (keeps all history) ─────────────
do $$
declare p record; v_total int; v_lvl int;
begin
  for p in select id from public.profiles loop
    select greatest(0, coalesce(sum(amount), 0)) into v_total from public.xp_events where user_id = p.id;
    select coalesce(max(level), 1) into v_lvl from public.ranks where min_xp <= v_total;
    update public.profiles set xp = v_total, rank_level = greatest(rank_level, v_lvl),
      daily_xp = greatest(0, coalesce((select sum(amount) from public.xp_events e where e.user_id = p.id and e.at >= public.xp_period_start()), 0))
    where id = p.id;
    if not exists (select 1 from public.rank_history where user_id = p.id) then
      insert into public.rank_history (user_id, old_level, new_level, xp_at, seen, note) values (p.id, null, v_lvl, v_total, true, 'Starting rank (extended rank system)');
    end if;
  end loop;
end $$;

grant execute on function public.xp_period_start(timestamptz) to anon, authenticated, service_role;
grant execute on function public.complete_lesson(text) to authenticated;
grant execute on function public.submit_quiz(text, jsonb) to authenticated;
grant execute on function public.apply_inactivity_penalties() to authenticated;
