-- BEAST FEAST — one quiz attempt = one graded result = its XP awarded once.
-- Non-destructive: no XP event, attempt or profile is deleted or changed; existing totals are not recomputed.
--
-- Before this migration every call to submit_quiz created a NEW attempt. The XP ledger itself was already
-- protected (unique (user_id, type, ref_id) on xp_events, so a question or a quiz-pass bonus can only ever be
-- recorded once per student), but a double click, a retried request or a lost response produced extra attempt
-- rows and the retry could not return the original result.
--
-- Now the browser generates the attempt id (a UUID) when the attempt starts and sends it with every try:
--   * the first request creates the attempt row with that id, grades it and writes its XP rows,
--     all in one transaction together with the profile totals (recompute_xp);
--   * any repeat of the same id (double click, retry after a timeout, refresh during submission, a second
--     simultaneous request) returns that stored result and awards nothing. Simultaneous requests are
--     serialised by the primary key: the second waits for the first to commit, then reads its result;
--   * an attempt id that belongs to another student is refused.
-- Separate attempts keep the existing rules: each question's XP once per student, the pass bonus once per quiz.

-- ───────────── 1. ledger guarantees ─────────────
-- The per-student uniqueness created in 0001 is what makes a reward impossible to duplicate. Make sure it exists
-- (it is created there as an unnamed table constraint, so look for any unique index on exactly these columns).
do $$
begin
  if not exists (
    select 1 from pg_index i
    where i.indrelid = 'public.xp_events'::regclass and i.indisunique
      and (select array_agg(a.attname::text order by a.attname) from unnest(i.indkey::int2[]) k join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k)
          = array['ref_id', 'type', 'user_id']
  ) then
    alter table public.xp_events add constraint xp_events_user_type_ref_key unique (user_id, type, ref_id);
  end if;
end $$;
-- Within one attempt a reward row can exist only once (explicit, independent of the rule above).
create unique index if not exists xp_events_attempt_reward_key on public.xp_events (attempt_id, type, ref_id) where attempt_id is not null;

-- ───────────── 2. attempt breakdown ─────────────
-- XP from correct answers and the pass bonus are separate ledger rows; store the bonus on the attempt so the
-- result screen can show "+15 for correct answers + 25 pass bonus" instead of an unexplained total.
-- NULL = attempt made before this migration (breakdown not recorded).
alter table public.quiz_attempts add column if not exists pass_bonus integer;

-- ───────────── 3. idempotent submit_quiz ─────────────
-- Replace the two-argument version (a default-parameter overload would make two-argument calls ambiguous).
-- Old browsers that still call it without an attempt id keep working (p_attempt defaults to NULL).
drop function if exists public.submit_quiz(text, jsonb);
create or replace function public.submit_quiz(p_quiz text, p_answers jsonb, p_attempt uuid default null) returns public.quiz_attempts
language plpgsql security definer set search_path = public as $$
declare
  q record; c int := 0; t int := 0; xp int := 0; pass_pct int; a public.quiz_attempts; ins int; v_pass int; v_bonus int := 0;
  v_uid uuid := auth.uid();
  v_source text := case when p_quiz like 'topic:%' then 'quiz' else 'challenge' end;
  v_title text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  -- a repeat of an attempt that was already graded: return the stored result, award nothing
  if p_attempt is not null then
    select * into a from public.quiz_attempts where id = p_attempt;
    if found then
      if a.user_id is distinct from v_uid then raise exception 'Invalid quiz attempt' using errcode = '42501'; end if;
      if a.quiz_id <> p_quiz then raise exception 'This attempt belongs to a different quiz'; end if;
      return a;
    end if;
  end if;

  perform public.rl_hit('quiz', 30, 600); -- (0010 counted every call twice)

  if p_quiz like 'topic:%' then
    select title into v_title from public.topics where id = substr(p_quiz, 7);
    pass_pct := 60;
  else
    select title, pass_percent into v_title, pass_pct from public.quizzes where id = p_quiz;
    if pass_pct is null then raise exception 'unknown quiz'; end if;
  end if;

  -- claim the attempt id. A simultaneous request with the same id blocks here until the first one commits,
  -- then finds the row and returns the first request's graded result.
  insert into public.quiz_attempts (id, user_id, quiz_id, answers, correct, total, percent, passed, xp_awarded, pass_bonus)
    values (coalesce(p_attempt, gen_random_uuid()), v_uid, p_quiz, p_answers, 0, 0, 0, false, 0, 0)
    on conflict (id) do nothing
    returning * into a;
  if a.id is null then
    select * into a from public.quiz_attempts where id = p_attempt;
    if a.user_id is distinct from v_uid then raise exception 'Invalid quiz attempt' using errcode = '42501'; end if;
    if a.quiz_id <> p_quiz then raise exception 'This attempt belongs to a different quiz'; end if;
    return a;
  end if;

  insert into public.progress(user_id) values (v_uid) on conflict do nothing;
  insert into public.learning_activity (user_id, day, kind, ref) values (v_uid, (now() at time zone public.xp_timezone())::date, 'quiz', left(p_quiz, 120)) on conflict do nothing;
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
      values (v_uid, 'question-correct', q.id, q.xp, v_source, 'Correct answer — ' || coalesce(v_title, p_quiz), a.id)
      on conflict do nothing;
      get diagnostics ins = row_count; if ins > 0 then xp := xp + q.xp; end if;
    end if;
  end loop;
  if t > 0 and c * 100 / t >= pass_pct and v_pass > 0 then
    insert into public.xp_events (user_id, type, ref_id, amount, source, description, attempt_id)
    values (v_uid, 'quiz-pass', p_quiz, v_pass, v_source, 'Passed: ' || coalesce(v_title, p_quiz), a.id)
    on conflict do nothing;
    get diagnostics ins = row_count; if ins > 0 then xp := xp + v_pass; v_bonus := v_pass; end if;
  end if;
  update public.quiz_attempts set correct = c, total = t, percent = case when t > 0 then c * 100 / t else 0 end,
         passed = t > 0 and c * 100 / t >= pass_pct, xp_awarded = xp, pass_bonus = v_bonus
   where id = a.id returning * into a;
  perform public.recompute_xp(v_uid);
  update public.progress set correct_questions = array(select distinct unnest(correct_questions || array(
      select key from jsonb_each_text(p_answers) e join public.quiz_answer_keys k on k.question_id = e.key and e.value ~ '^[0-9]+$' and k.answer_index = e.value::int)))
   where user_id = v_uid;
  return a;
end $$;
revoke execute on function public.submit_quiz(text, jsonb, uuid) from public, anon;
grant execute on function public.submit_quiz(text, jsonb, uuid) to authenticated, service_role;
