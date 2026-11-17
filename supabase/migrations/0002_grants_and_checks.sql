-- BEAST FEAST 5.0: explicit Data API grants and small server-function checks.
-- Row-level security (0001) still decides which rows each user sees; these grants only make the
-- tables reachable through the API on projects that do not grant new public tables automatically.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.leaderboard_entries to authenticated;
-- anonymous visitors get nothing: every page that reads data requires sign-in
revoke all on all tables in schema public from anon;

-- complete_lesson must refuse anonymous callers, like award_xp and submit_quiz already do
create or replace function public.complete_lesson(p_topic text) returns int
language plpgsql security definer set search_path = public as $$
declare added int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.topics where id = p_topic) then raise exception 'unknown topic'; end if;
  insert into public.progress(user_id) values (auth.uid()) on conflict do nothing;
  insert into public.xp_events(user_id, type, ref_id, amount) values (auth.uid(), 'lesson-complete', p_topic, 20) on conflict do nothing;
  get diagnostics added = row_count;
  update public.progress set completed_topics = array(select distinct unnest(completed_topics || p_topic)) where user_id = auth.uid();
  update public.profiles set xp = (select coalesce(sum(amount),0) from public.xp_events where user_id = auth.uid()) where id = auth.uid();
  return case when added > 0 then 20 else 0 end;
end $$;

-- server functions are for signed-in users only
revoke execute on function public.award_xp(text, text, int) from public, anon;
revoke execute on function public.complete_lesson(text) from public, anon;
revoke execute on function public.submit_quiz(text, jsonb) from public, anon;
grant execute on function public.award_xp(text, text, int) to authenticated;
grant execute on function public.complete_lesson(text) to authenticated;
grant execute on function public.submit_quiz(text, jsonb) to authenticated;
