-- Fix 1: protect_profile() blocked the trusted XP functions too.
-- It ran as SECURITY DEFINER and only checked is_admin(), so award_xp / complete_lesson / submit_quiz
-- (which update profiles.xp on the student's behalf) had their XP total reset to the old value.
-- Now it runs as the caller: a direct API update arrives as role "authenticated" and is still blocked,
-- while the security-definer XP functions run as the function owner and may update the total.
create or replace function public.protect_profile() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.role := old.role;
    new.xp := old.xp;
  end if;
  return new;
end $$;

-- recompute totals for anyone affected
update public.profiles p set xp = coalesce((select sum(amount) from public.xp_events e where e.user_id = p.id), 0);

-- Fix 2: submit_quiz only updated an existing progress row, so a first quiz before any progress
-- was saved lost its correct answers. Create the row first.
create or replace function public.submit_quiz(p_quiz text, p_answers jsonb) returns public.quiz_attempts
language plpgsql security definer set search_path = public as $$
declare q record; c int := 0; t int := 0; xp int := 0; pass_pct int; a public.quiz_attempts; ins int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.progress(user_id) values (auth.uid()) on conflict do nothing;
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
  if t > 0 and c * 100 / t >= pass_pct then
    insert into public.xp_events(user_id, type, ref_id, amount) values (auth.uid(), 'quiz-pass', p_quiz, 25) on conflict do nothing;
    get diagnostics ins = row_count; if ins > 0 then xp := xp + 25; end if;
  end if;
  update public.profiles set xp = (select coalesce(sum(amount),0) from public.xp_events where user_id = auth.uid()) where id = auth.uid();
  insert into public.quiz_attempts(user_id, quiz_id, answers, correct, total, percent, passed, xp_awarded)
    values (auth.uid(), p_quiz, p_answers, c, t, case when t > 0 then c * 100 / t else 0 end, t > 0 and c * 100 / t >= pass_pct, xp) returning * into a;
  update public.progress set correct_questions = array(select distinct unnest(correct_questions || array(select key from jsonb_each_text(p_answers) e join public.quiz_answer_keys k on k.question_id = e.key and k.answer_index = e.value::int))) where user_id = auth.uid();
  return a;
end $$;
revoke execute on function public.submit_quiz(text, jsonb) from public, anon;
grant execute on function public.submit_quiz(text, jsonb) to authenticated, service_role;
