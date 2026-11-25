-- 0013 · Lighter project saves + database monitoring for the admin dashboard
--
-- 1. sync_project(): every autosave used to delete and re-insert ALL derived rows (parts, wires, code versions,
--    simulations, results) even when only the code changed. The 2026-11-23 load test showed this trigger is the
--    bottleneck (~100–140 saves/s). On UPDATE it now rebuilds only the sections whose JSON actually changed.
--    The derived tables end up exactly as before.
-- 2. Monitoring (real measurements only, nothing simulated):
--    * monitoring_snapshots — every 5 minutes (pg_cron) the cumulative counters of pg_stat_database,
--      pg_stat_statements (application roles only) and pg_stat_activity are stored; the dashboard shows deltas.
--      Kept for 120 days.
--    * rate_limits.limit_max + rate_limit_daily — how often a rate limit was reached, per day and bucket.
--    * admin_* functions (SECURITY DEFINER, role-checked): admins see the overview/series/emails/jobs/rate
--      limits; only super admins see statement-level, table-level and per-user usage and change settings.
--    * monitoring_settings — plan quotas entered by a super admin (NULL = unknown; no quota is assumed).
-- Idempotent; safe to re-run. No existing data is changed or removed.

-- ───────────────────────────── 1. lighter saves ─────────────────────────────
create or replace function public.sync_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := new.data;
  o jsonb := case when tg_op = 'UPDATE' then old.data else null end;
  all_new boolean := tg_op = 'INSERT';
begin
  if all_new or (d->'parts') is distinct from (o->'parts') then
    delete from public.mechanical_assemblies where project_id = new.id;
    insert into public.mechanical_assemblies(project_id, part_uid, component_id, label, position, rotation, attached_to, config)
      select new.id, p->>'uid', p->>'componentId', p->>'label', p->'position', p->'rotation', p->>'attachedTo', p->'config'
      from jsonb_array_elements(coalesce(d->'parts','[]')) p
      where exists (select 1 from public.components c where c.id = p->>'componentId');
    insert into public.robot_configurations(project_id, part_count, motor_count)
      values (new.id, jsonb_array_length(coalesce(d->'parts','[]')), (select count(*) from jsonb_array_elements(coalesce(d->'parts','[]')) p join public.components c on c.id = p->>'componentId' where c.kind = 'dc-motor'))
      on conflict (project_id) do update set part_count = excluded.part_count, motor_count = excluded.motor_count;
  end if;
  if all_new or (d->'wires') is distinct from (o->'wires') then
    delete from public.circuit_connections where project_id = new.id;
    insert into public.circuit_connections(id, project_id, from_part, from_pin, to_part, to_pin, color)
      select w->>'id', new.id, w->'from'->>'part', w->'from'->>'pin', w->'to'->>'part', w->'to'->>'pin', w->>'color' from jsonb_array_elements(coalesce(d->'wires','[]')) w;
  end if;
  if all_new or (d->'codeVersions') is distinct from (o->'codeVersions') then
    delete from public.code_versions where project_id = new.id;
    insert into public.code_versions(id, project_id, at, source, note)
      select v->>'id', new.id, (v->>'at')::timestamptz, v->>'source', v->>'note' from jsonb_array_elements(coalesce(d->'codeVersions','[]')) v;
  end if;
  if all_new or (d->'simulations') is distinct from (o->'simulations') then
    delete from public.simulations where project_id = new.id; -- cascades to simulation_results
    insert into public.simulations(id, project_id, at, mode, track_id, control_mode)
      select s->>'id', new.id, (s->>'at')::timestamptz, s->>'mode', s->>'trackId', s->>'controlMode' from jsonb_array_elements(coalesce(d->'simulations','[]')) s;
    insert into public.simulation_results(simulation_id, project_id, lap_time_s, best_lap_s, avg_speed, max_speed, distance_m, collisions, completion, outcome)
      select s->>'id', new.id, (s->>'lapTimeS')::numeric, (s->>'bestLapS')::numeric, (s->>'avgSpeed')::numeric, (s->>'maxSpeed')::numeric, (s->>'distanceM')::numeric, (s->>'collisions')::int, (s->>'completion')::numeric, s->>'outcome'
      from jsonb_array_elements(coalesce(d->'simulations','[]')) s;
  end if;
  if all_new or (d->'chassis') is distinct from (o->'chassis') then
    insert into public.chassis(project_id, component_id, length_mm, width_mm, thickness_mm, material)
      values (new.id, d->'chassis'->>'componentId', (d->'chassis'->>'length_mm')::numeric, (d->'chassis'->>'width_mm')::numeric, (d->'chassis'->>'thickness_mm')::numeric, d->'chassis'->>'material')
      on conflict (project_id) do update set component_id = excluded.component_id, length_mm = excluded.length_mm, width_mm = excluded.width_mm, thickness_mm = excluded.thickness_mm, material = excluded.material;
  end if;
  return new;
end $$;

-- ───────────────────────────── 2. monitoring storage ─────────────────────────────
do $$ begin
  create extension if not exists pg_stat_statements with schema extensions;
exception when others then raise notice 'pg_stat_statements not available: %', sqlerrm;
end $$;

create table if not exists public.monitoring_snapshots (
  at timestamptz primary key default now(),
  stats_reset timestamptz,
  xact_commit bigint, xact_rollback bigint,
  tup_returned bigint, tup_fetched bigint, tup_inserted bigint, tup_updated bigint, tup_deleted bigint,
  blks_read bigint, blks_hit bigint, deadlocks bigint, temp_bytes bigint,
  db_size_bytes bigint,
  connections int, active_connections int, idle_connections int, max_connections int,
  -- pg_stat_statements, application roles only (anon / authenticated / service_role); NULL if unavailable
  app_calls bigint, app_read_calls bigint, app_write_calls bigint, app_exec_ms double precision,
  app_slow_calls bigint,            -- calls of statements whose mean time is >= the slow threshold
  app_statement_timeouts bigint     -- reserved; PostgreSQL does not count these, left NULL
);
alter table public.monitoring_snapshots enable row level security; -- no policies: read only through admin_* functions
revoke all on public.monitoring_snapshots from anon, authenticated;

create table if not exists public.monitoring_settings (
  key text primary key,
  value numeric,
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.monitoring_settings enable row level security;
revoke all on public.monitoring_settings from anon, authenticated;
insert into public.monitoring_settings(key, value, note) values
  ('slow_query_ms', 200, 'A statement whose mean execution time is at least this many ms counts as slow'),
  ('refresh_seconds', 60, 'Dashboard auto-refresh interval (0 = off)'),
  ('plan_db_quota_mb', null, 'Database size included in your plan (MB). Unknown until a super admin enters it.'),
  ('plan_monthly_cost', null, 'Monthly plan price in your currency. Unknown until a super admin enters it.')
on conflict (key) do nothing;

alter table public.rate_limits add column if not exists limit_max integer;
create table if not exists public.rate_limit_daily (
  day date not null,
  bucket text not null,
  requests bigint not null default 0,
  windows_limited bigint not null default 0,  -- client windows that reached the limit (each blocks further requests)
  primary key (day, bucket)
);
alter table public.rate_limit_daily enable row level security;
revoke all on public.rate_limit_daily from anon, authenticated;

-- rl_hit now remembers its limit so "limit reached" can be counted (behaviour is otherwise unchanged)
create or replace function public.rl_hit(p_bucket text, p_max int, p_window_s int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_key text := coalesce(auth.uid()::text, 'ip:' || coalesce(public.request_ip(), 'unknown'));
  v_win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  v_hits int;
begin
  insert into public.rate_limits as r (bucket, key, window_start, hits, limit_max) values (p_bucket, v_key, v_win, 1, p_max)
  on conflict (bucket, key, window_start) do update set hits = r.hits + 1, limit_max = p_max
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'Too many requests — please wait a few minutes and try again.' using errcode = 'P0429';
  end if;
end $$;
revoke execute on function public.rl_hit(text, int, int) from public, anon, authenticated;

-- ───────────────────────────── 3. capture (pg_cron, every 5 minutes) ─────────────────────────────
create or replace function public.monitoring_capture() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  v_slow numeric := coalesce((select value from public.monitoring_settings where key = 'slow_query_ms'), 200);
  v_calls bigint; v_read bigint; v_write bigint; v_ms double precision; v_slow_calls bigint;
begin
  select * into s from pg_stat_database where datname = current_database();
  begin
    select sum(st.calls),
           sum(st.calls) filter (where not (st.query ~* '\m(insert|update|delete|merge)\M')),
           sum(st.calls) filter (where st.query ~* '\m(insert|update|delete|merge)\M'),
           sum(st.total_exec_time),
           sum(st.calls) filter (where st.mean_exec_time >= v_slow)
      into v_calls, v_read, v_write, v_ms, v_slow_calls
      from extensions.pg_stat_statements st
      join pg_roles r on r.oid = st.userid
     where st.dbid = (select oid from pg_database where datname = current_database())
       and r.rolname in ('anon', 'authenticated', 'service_role');
  exception when others then
    v_calls := null; v_read := null; v_write := null; v_ms := null; v_slow_calls := null;
  end;
  insert into public.monitoring_snapshots(at, stats_reset, xact_commit, xact_rollback, tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted,
                                          blks_read, blks_hit, deadlocks, temp_bytes, db_size_bytes, connections, active_connections, idle_connections, max_connections,
                                          app_calls, app_read_calls, app_write_calls, app_exec_ms, app_slow_calls)
  select now(), s.stats_reset, s.xact_commit, s.xact_rollback, s.tup_returned, s.tup_fetched, s.tup_inserted, s.tup_updated, s.tup_deleted,
         s.blks_read, s.blks_hit, s.deadlocks, s.temp_bytes, pg_database_size(current_database()),
         (select count(*) from pg_stat_activity where datname = current_database()),
         (select count(*) from pg_stat_activity where datname = current_database() and state = 'active'),
         (select count(*) from pg_stat_activity where datname = current_database() and state like 'idle%'),
         current_setting('max_connections')::int,
         v_calls, v_read, v_write, v_ms, v_slow_calls
  on conflict (at) do nothing;

  -- rate-limit history (rate_limits itself is cleared after a day)
  insert into public.rate_limit_daily as d (day, bucket, requests, windows_limited)
  select (window_start at time zone 'Asia/Kolkata')::date, bucket, sum(hits), count(*) filter (where limit_max is not null and hits >= limit_max)
    from public.rate_limits group by 1, 2
  on conflict (day, bucket) do update set requests = greatest(d.requests, excluded.requests), windows_limited = greatest(d.windows_limited, excluded.windows_limited);

  delete from public.monitoring_snapshots where at < now() - interval '120 days';
end $$;
revoke execute on function public.monitoring_capture() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'beast-monitoring-capture';
    perform cron.schedule('beast-monitoring-capture', '*/5 * * * *', $cmd$select public.monitoring_capture()$cmd$);
  end if;
end $$;
select public.monitoring_capture();

-- ───────────────────────────── 4. admin read functions ─────────────────────────────
create or replace function public.admin_monitoring_guard(p_super boolean) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_super and not public.is_super_admin() then raise exception 'Super admin access required.' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
end $$;
revoke execute on function public.admin_monitoring_guard(boolean) from public, anon, authenticated;

-- live state + settings (admins)
create or replace function public.admin_monitoring_overview() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v jsonb; v_stmt boolean;
begin
  perform public.admin_monitoring_guard(false);
  select exists (select 1 from pg_extension where extname = 'pg_stat_statements') into v_stmt;
  select jsonb_build_object(
    'now', now(),
    'db_size_bytes', pg_database_size(current_database()),
    'connections', (select count(*) from pg_stat_activity where datname = current_database()),
    'active_connections', (select count(*) from pg_stat_activity where datname = current_database() and state = 'active'),
    'idle_connections', (select count(*) from pg_stat_activity where datname = current_database() and state like 'idle%'),
    'connections_by_role', (select coalesce(jsonb_object_agg(coalesce(usename, 'system'), n), '{}') from (select usename, count(*) n from pg_stat_activity where datname = current_database() group by usename) x),
    'max_connections', current_setting('max_connections')::int,
    'longest_active_query_s', (select coalesce(max(extract(epoch from now() - query_start)), 0) from pg_stat_activity where datname = current_database() and state = 'active' and pid <> pg_backend_pid()),
    'stats_reset', (select stats_reset from pg_stat_database where datname = current_database()),
    'cache_hit_ratio', (select case when blks_hit + blks_read = 0 then null else round(blks_hit::numeric / (blks_hit + blks_read), 4) end from pg_stat_database where datname = current_database()),
    'pg_stat_statements', v_stmt,
    'snapshot_count', (select count(*) from public.monitoring_snapshots),
    'first_snapshot', (select min(at) from public.monitoring_snapshots),
    'capture_job', (select jsonb_build_object('schedule', schedule, 'active', active) from cron.job where jobname = 'beast-monitoring-capture'),
    'settings', (select jsonb_object_agg(key, jsonb_build_object('value', value, 'note', note, 'updated_at', updated_at)) from public.monitoring_settings),
    'is_super_admin', public.is_super_admin()
  ) into v;
  return v;
end $$;

-- snapshots in a range (admins); the dashboard turns cumulative counters into per-interval deltas
create or replace function public.admin_monitoring_series(p_from timestamptz, p_to timestamptz) returns setof public.monitoring_snapshots
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_monitoring_guard(false);
  if p_to - p_from > interval '120 days' then raise exception 'Range too long (max 120 days).' using errcode = '22023'; end if;
  -- include the snapshot just before the range so the first interval has a baseline
  return query
    select * from public.monitoring_snapshots
     where at between coalesce((select max(at) from public.monitoring_snapshots where at < p_from), p_from) and p_to
     order by at;
end $$;

-- statement-level report (super admins). Statements are normalised by PostgreSQL ($1, $2 …): no user values.
create or replace function public.admin_monitoring_statements(p_order text default 'total', p_limit int default 25)
returns table(role text, calls bigint, total_ms double precision, mean_ms double precision, max_ms double precision, rows_returned bigint, kind text, statement text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.admin_monitoring_guard(true);
  return query
    select r.rolname::text, st.calls, round(st.total_exec_time::numeric, 2)::double precision, round(st.mean_exec_time::numeric, 2)::double precision, round(st.max_exec_time::numeric, 2)::double precision, st.rows,
           case when st.query ~* '\m(insert|update|delete|merge)\M' then 'write' else 'read' end,
           left(regexp_replace(st.query, '\s+', ' ', 'g'), 400)
      from extensions.pg_stat_statements st
      join pg_roles r on r.oid = st.userid
     where st.dbid = (select oid from pg_database where datname = current_database())
       and r.rolname in ('anon', 'authenticated', 'service_role')
     order by case p_order when 'mean' then st.mean_exec_time when 'calls' then st.calls::double precision when 'max' then st.max_exec_time else st.total_exec_time end desc
     limit least(greatest(p_limit, 1), 100);
end $$;

-- per-table activity and size (super admins)
create or replace function public.admin_monitoring_tables()
returns table(table_name text, live_rows bigint, total_bytes bigint, seq_scans bigint, index_scans bigint, inserts bigint, updates bigint, deletes bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_monitoring_guard(true);
  return query
    select t.relname::text, t.n_live_tup, pg_total_relation_size(t.relid), t.seq_scan, coalesce(t.idx_scan, 0), t.n_tup_ins, t.n_tup_upd, t.n_tup_del
      from pg_stat_user_tables t where t.schemaname = 'public'
     order by pg_total_relation_size(t.relid) desc;
end $$;

-- stored project data per member (super admins)
create or replace function public.admin_monitoring_usage_by_user(p_limit int default 50)
returns table(user_id uuid, name text, role text, projects bigint, project_bytes bigint, last_saved timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_monitoring_guard(true);
  return query
    select pr.id, pr.name, pr.role::text, count(p.id), coalesce(sum(pg_column_size(p.data)), 0)::bigint, max(p.updated_at)
      from public.profiles pr left join public.projects p on p.owner_id = pr.id
     group by pr.id, pr.name, pr.role
     order by 5 desc
     limit least(greatest(p_limit, 1), 500);
end $$;

-- auth emails by day and kind (admins). From the sign-in service's own audit log — counts only, no addresses.
create or replace function public.admin_monitoring_emails(p_from timestamptz, p_to timestamptz)
returns table(day date, kind text, emails bigint)
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.admin_monitoring_guard(false);
  return query
    select (a.created_at at time zone 'Asia/Kolkata')::date,
           case a.payload->>'action'
             when 'user_confirmation_requested' then 'verification'
             when 'user_recovery_requested' then 'password reset'
             when 'user_invited' then 'invitation'
             when 'user_reauthenticate_requested' then 'reauthentication'
             else 'other' end,
           count(*)
      from auth.audit_log_entries a
     where a.created_at between p_from and p_to
       and a.payload->>'action' in ('user_confirmation_requested', 'user_recovery_requested', 'user_invited', 'user_reauthenticate_requested')
     group by 1, 2 order by 1, 2;
end $$;

-- scheduled jobs (pg_cron) — the platform's background jobs (admins)
create or replace function public.admin_monitoring_jobs(p_from timestamptz, p_to timestamptz)
returns table(job text, schedule text, active boolean, runs bigint, succeeded bigint, failed bigint, avg_ms double precision, max_ms double precision, last_run timestamptz, last_status text, last_message text)
language plpgsql security definer set search_path = public, cron as $$
begin
  perform public.admin_monitoring_guard(false);
  return query
    select j.jobname::text, j.schedule::text, j.active, count(d.runid),
           count(d.runid) filter (where d.status = 'succeeded'), count(d.runid) filter (where d.status = 'failed'),
           round(avg(extract(epoch from d.end_time - d.start_time) * 1000)::numeric, 1)::double precision,
           round(max(extract(epoch from d.end_time - d.start_time) * 1000)::numeric, 1)::double precision,
           max(d.start_time),
           (select d2.status::text from cron.job_run_details d2 where d2.jobid = j.jobid order by d2.start_time desc limit 1),
           (select left(d2.return_message, 200) from cron.job_run_details d2 where d2.jobid = j.jobid and d2.status = 'failed' order by d2.start_time desc limit 1)
      from cron.job j left join cron.job_run_details d on d.jobid = j.jobid and d.start_time between p_from and p_to
     where j.jobname like 'beast-%'
     group by j.jobid, j.jobname, j.schedule, j.active order by j.jobname;
end $$;

-- rate limits reached, by day and bucket (admins)
create or replace function public.admin_monitoring_rate_limits(p_from date, p_to date)
returns table(day date, bucket text, requests bigint, windows_limited bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_monitoring_guard(false);
  return query select r.day, r.bucket, r.requests, r.windows_limited from public.rate_limit_daily r where r.day between p_from and p_to order by r.day, r.bucket;
end $$;

-- settings (super admins); every change is recorded with who and when
create or replace function public.admin_monitoring_set(p_key text, p_value numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_monitoring_guard(true);
  if p_key not in ('slow_query_ms', 'refresh_seconds', 'plan_db_quota_mb', 'plan_monthly_cost') then raise exception 'Unknown setting.' using errcode = '22023'; end if;
  if p_value is not null and (p_value < 0 or p_value > 1e9) then raise exception 'Value out of range.' using errcode = '22023'; end if;
  if p_key = 'refresh_seconds' and p_value is not null and p_value <> 0 and p_value < 15 then raise exception 'Auto-refresh must be at least 15 seconds (or 0 for off).' using errcode = '22023'; end if;
  update public.monitoring_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_monitoring_overview()', 'admin_monitoring_series(timestamptz, timestamptz)', 'admin_monitoring_statements(text, int)',
    'admin_monitoring_tables()', 'admin_monitoring_usage_by_user(int)', 'admin_monitoring_emails(timestamptz, timestamptz)',
    'admin_monitoring_jobs(timestamptz, timestamptz)', 'admin_monitoring_rate_limits(date, date)', 'admin_monitoring_set(text, numeric)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
