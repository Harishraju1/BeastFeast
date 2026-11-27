-- BEAST FEAST — one rate limit for everything: 1000 requests per hour per user (or per IP when signed out),
-- for every bucket (NIAT check, details, quiz, XP, activity, lessons, avatar, penalties, admin tools).
-- The per-call limits passed by each function are ignored from now on, so changing the number is a one-line edit
-- here. Windows are fixed clock hours (reset at :00). Nothing else changes: counting, monitoring (limit_max) and
-- the error the app shows stay the same.

create or replace function public.rl_hit(p_bucket text, p_max int, p_window_s int) returns void
language plpgsql security definer set search_path = public as $$
declare
  c_max constant int := 1000;
  c_window constant int := 3600;
  v_key text := coalesce(auth.uid()::text, 'ip:' || coalesce(public.request_ip(), 'unknown'));
  v_win timestamptz := to_timestamp(floor(extract(epoch from now()) / c_window) * c_window);
  v_hits int;
begin
  insert into public.rate_limits as r (bucket, key, window_start, hits, limit_max) values (p_bucket, v_key, v_win, 1, c_max)
  on conflict (bucket, key, window_start) do update set hits = r.hits + 1, limit_max = c_max
  returning hits into v_hits;
  if v_hits > c_max then
    raise exception 'Too many requests — please try again later.' using errcode = 'P0429';
  end if;
end $$;
revoke execute on function public.rl_hit(text, int, int) from public, anon, authenticated;
