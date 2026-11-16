-- BEAST FEAST 5.0 — Supabase schema
-- Run with: supabase db push   (or paste into the SQL editor)
-- Component data is stored separately from student projects. Row-level security is enabled on every table.

create extension if not exists pgcrypto;

-- ───────────────────────────── people ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  campus text not null default '',
  student_id text not null default '',
  avatar text,
  role text not null default 'student' check (role in ('student','admin')),
  xp integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- create a profile automatically on sign-up (metadata: name, campus, student_id)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, campus, student_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Engineer'), coalesce(new.raw_user_meta_data->>'campus',''), coalesce(new.raw_user_meta_data->>'student_id',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- students may edit their own name/campus/avatar but never role or xp
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.xp := old.xp;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile();

-- ───────────────────────────── component catalogue ─────────────────────────────
create table public.components (
  id text primary key,
  name text not null,
  category text not null,
  category_number int not null,
  subcategory text,
  manufacturer text,
  model text,
  description text not null,
  functionality_class text not null check (functionality_class in ('A','B','C')),
  kind text not null,
  sim_status text not null check (sim_status in ('green','blue','yellow','grey')),
  verification text not null,
  image_url text,
  model3d_url text,
  footprint2d_url text,
  datasheet_url text,
  pinout_status text not null,
  competitions jsonb not null,
  options jsonb not null default '[]',
  sim_params jsonb not null default '{}',
  sources jsonb not null,
  cross_listed_with text[] not null default '{}',
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create table public.component_pins (
  component_id text references public.components(id) on delete cascade,
  pin_id text not null,
  label text not null,
  fn text not null,
  side text not null,
  caps text[] not null default '{}',
  arduino_pin int,
  v_min numeric, v_max numeric, v_out numeric, i_max_ma numeric, logic_v numeric,
  note text,
  primary key (component_id, pin_id)
);
create table public.component_specifications (
  component_id text primary key references public.components(id) on delete cascade,
  voltage text, logic_voltage numeric, current text, power text,
  protocols text[], dimensions jsonb, weight_g numeric, extra jsonb,
  bridges jsonb not null default '[]',
  compatible_with text[] not null default '{}',
  compatible_controllers text[] not null default '{}',
  compatible_drivers text[] not null default '{}',
  mounting_points jsonb not null default '[]'
);

-- ───────────────────────────── projects ─────────────────────────────
create table public.projects (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  competition text not null check (competition in ('race','line','sumo')),
  data jsonb not null,             -- full project document (parts, wires, code, validation …)
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner on public.projects(owner_id);

-- normalised views of the project document, maintained by trigger for analytics and admin queries
create table public.robot_configurations (project_id text primary key references public.projects(id) on delete cascade, part_count int, motor_count int, controller text, driver text, battery text);
create table public.chassis (project_id text primary key references public.projects(id) on delete cascade, component_id text, length_mm numeric, width_mm numeric, thickness_mm numeric, material text);
create table public.mechanical_assemblies (id bigserial primary key, project_id text references public.projects(id) on delete cascade, part_uid text, component_id text references public.components(id), label text, position jsonb, rotation jsonb, attached_to text, config jsonb);
create table public.circuit_connections (id text, project_id text references public.projects(id) on delete cascade, from_part text, from_pin text, to_part text, to_pin text, color text, primary key (project_id, id));
create table public.code_versions (id text, project_id text references public.projects(id) on delete cascade, at timestamptz, source text, note text, primary key (project_id, id));
create table public.simulations (id text, project_id text references public.projects(id) on delete cascade, at timestamptz, mode text, track_id text, control_mode text, primary key (project_id, id));
create table public.simulation_results (simulation_id text, project_id text, lap_time_s numeric, best_lap_s numeric, avg_speed numeric, max_speed numeric, distance_m numeric, collisions int, completion numeric, outcome text, primary key (project_id, simulation_id), foreign key (project_id, simulation_id) references public.simulations(project_id, id) on delete cascade);

create or replace function public.sync_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := new.data;
begin
  delete from public.mechanical_assemblies where project_id = new.id;
  delete from public.circuit_connections where project_id = new.id;
  delete from public.code_versions where project_id = new.id;
  delete from public.simulations where project_id = new.id;
  insert into public.mechanical_assemblies(project_id, part_uid, component_id, label, position, rotation, attached_to, config)
    select new.id, p->>'uid', p->>'componentId', p->>'label', p->'position', p->'rotation', p->>'attachedTo', p->'config'
    from jsonb_array_elements(coalesce(d->'parts','[]')) p
    where exists (select 1 from public.components c where c.id = p->>'componentId');
  insert into public.circuit_connections(id, project_id, from_part, from_pin, to_part, to_pin, color)
    select w->>'id', new.id, w->'from'->>'part', w->'from'->>'pin', w->'to'->>'part', w->'to'->>'pin', w->>'color' from jsonb_array_elements(coalesce(d->'wires','[]')) w;
  insert into public.code_versions(id, project_id, at, source, note)
    select v->>'id', new.id, (v->>'at')::timestamptz, v->>'source', v->>'note' from jsonb_array_elements(coalesce(d->'codeVersions','[]')) v;
  insert into public.simulations(id, project_id, at, mode, track_id, control_mode)
    select s->>'id', new.id, (s->>'at')::timestamptz, s->>'mode', s->>'trackId', s->>'controlMode' from jsonb_array_elements(coalesce(d->'simulations','[]')) s;
  insert into public.simulation_results(simulation_id, project_id, lap_time_s, best_lap_s, avg_speed, max_speed, distance_m, collisions, completion, outcome)
    select s->>'id', new.id, (s->>'lapTimeS')::numeric, (s->>'bestLapS')::numeric, (s->>'avgSpeed')::numeric, (s->>'maxSpeed')::numeric, (s->>'distanceM')::numeric, (s->>'collisions')::int, (s->>'completion')::numeric, s->>'outcome'
    from jsonb_array_elements(coalesce(d->'simulations','[]')) s;
  insert into public.chassis(project_id, component_id, length_mm, width_mm, thickness_mm, material)
    values (new.id, d->'chassis'->>'componentId', (d->'chassis'->>'length_mm')::numeric, (d->'chassis'->>'width_mm')::numeric, (d->'chassis'->>'thickness_mm')::numeric, d->'chassis'->>'material')
    on conflict (project_id) do update set component_id = excluded.component_id, length_mm = excluded.length_mm, width_mm = excluded.width_mm, thickness_mm = excluded.thickness_mm, material = excluded.material;
  insert into public.robot_configurations(project_id, part_count, motor_count)
    values (new.id, jsonb_array_length(coalesce(d->'parts','[]')), (select count(*) from jsonb_array_elements(coalesce(d->'parts','[]')) p join public.components c on c.id = p->>'componentId' where c.kind = 'dc-motor'))
    on conflict (project_id) do update set part_count = excluded.part_count, motor_count = excluded.motor_count;
  return new;
end $$;
create trigger projects_sync after insert or update on public.projects for each row execute function public.sync_project();

-- ───────────────────────────── tracks ─────────────────────────────
create table public.tracks (
  id text primary key,
  owner_id uuid references public.profiles(id) on delete cascade, -- null = built-in example
  name text not null,
  kind text not null check (kind in ('race','line','sumo')),
  difficulty text not null,
  data jsonb not null,
  shared boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── learning ─────────────────────────────
create table public.learning_paths (id text primary key, title text not null, tagline text, description text, sort int);
create table public.topics (id text primary key, path_id text references public.learning_paths(id), sort int not null, title text not null, summary text, minutes int);
create table public.lessons (topic_id text primary key references public.topics(id) on delete cascade, content jsonb not null, admin_notes text, updated_at timestamptz default now());
create table public.quizzes (id text primary key, title text not null, kind text not null, path_id text, pass_percent int not null, xp_bonus int not null default 0, time_limit_s int);
create table public.quiz_questions (id text primary key, topic_id text references public.topics(id) on delete cascade, type text not null, prompt text not null, code text, diagram jsonb, options jsonb not null, explanation text not null, difficulty int not null, xp int not null);
create table public.quiz_membership (quiz_id text references public.quizzes(id) on delete cascade, question_id text references public.quiz_questions(id) on delete cascade, primary key (quiz_id, question_id));
-- answer keys are NOT readable by students; grading happens in submit_quiz()
create table public.quiz_answer_keys (question_id text primary key references public.quiz_questions(id) on delete cascade, answer_index int not null);
create table public.quiz_attempts (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete cascade, quiz_id text not null, answers jsonb not null, correct int, total int, percent int, passed boolean, xp_awarded int, at timestamptz default now());
create table public.progress (user_id uuid primary key references public.profiles(id) on delete cascade, completed_topics text[] not null default '{}', bookmarks text[] not null default '{}', last_topic text, correct_questions text[] not null default '{}', watched_videos text[] not null default '{}', records jsonb not null default '{}');

-- ───────────────────────────── gamification ─────────────────────────────
create table public.xp_rules (type text primary key, amount int not null, max_per_user int);
insert into public.xp_rules values
 ('lesson-complete',20,null),('question-correct',0,null),('quiz-pass',25,null),('project-created',10,5),('validation-pass',50,null),
 ('code-check-pass',30,null),('simulation-first',30,null),('lap-complete',40,null),('record-improved',15,null),('sumo-win',60,null),('track-created',20,5),('competition-win',200,null);
create table public.xp_events (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, type text not null references public.xp_rules(type), ref_id text not null, amount int not null, at timestamptz not null default now(), unique (user_id, type, ref_id));
create table public.achievements (id text primary key, title text not null, description text not null, icon text);
create table public.user_achievements (user_id uuid references public.profiles(id) on delete cascade, achievement_id text references public.achievements(id), at timestamptz default now(), primary key (user_id, achievement_id));
insert into public.achievements values
 ('first-circuit','First Circuit','Pass circuit validation for the first time','zap'),('first-robot','First Robot','Build a robot with chassis, motors, wheels and a controller','bot'),
 ('first-simulation','First Simulation','Run your robot in the Simulation Arena','play'),('circuit-master','Circuit Master','Pass validation on 5 projects','cpu'),
 ('code-warrior','Code Warrior','Code matches the circuit and drives a simulation','code'),('track-designer','Track Designer','Design and save a track','map'),
 ('sensor-expert','Sensor Expert','Complete a line track using your own code','eye'),('simulation-champion','Simulation Champion','Win a sumo match against an Advanced or Beast opponent','trophy'),
 ('beast-engineer','Beast Engineer','Pass the Final Beast Engineer examination','crown');

-- Server-side XP: amount comes from xp_rules (client cannot choose it); duplicates are ignored.
create or replace function public.award_xp(p_type text, p_ref text, p_amount int default null) returns table(awarded int, total int)
language plpgsql security definer set search_path = public as $$
declare r public.xp_rules; v int; n int; added int := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from public.xp_rules where type = p_type;
  if not found then raise exception 'unknown xp type'; end if;
  if p_type in ('question-correct','quiz-pass','lesson-complete') then
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
  update public.profiles set xp = (select coalesce(sum(amount),0) from public.xp_events where user_id = auth.uid()) where id = auth.uid();
  return query select case when added > 0 then v else 0 end, (select xp from public.profiles where id = auth.uid());
end $$;

create or replace function public.complete_lesson(p_topic text) returns int
language plpgsql security definer set search_path = public as $$
declare added int;
begin
  if not exists (select 1 from public.topics where id = p_topic) then raise exception 'unknown topic'; end if;
  insert into public.xp_events(user_id, type, ref_id, amount) values (auth.uid(), 'lesson-complete', p_topic, 20) on conflict do nothing;
  get diagnostics added = row_count;
  update public.progress set completed_topics = array(select distinct unnest(completed_topics || p_topic)) where user_id = auth.uid();
  update public.profiles set xp = (select coalesce(sum(amount),0) from public.xp_events where user_id = auth.uid()) where id = auth.uid();
  return case when added > 0 then 20 else 0 end;
end $$;

-- Grades a quiz against the hidden answer keys and awards XP once per question.
create or replace function public.submit_quiz(p_quiz text, p_answers jsonb) returns public.quiz_attempts
language plpgsql security definer set search_path = public as $$
declare q record; c int := 0; t int := 0; xp int := 0; pass_pct int; a public.quiz_attempts; ins int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
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

create view public.leaderboard_entries with (security_invoker = true) as
  select p.id as user_id, p.name, p.avatar, p.campus, p.xp,
    (select count(*) from public.projects pr where pr.owner_id = p.id) as projects,
    (select count(*) from public.user_achievements ua where ua.user_id = p.id) as achievements
  from public.profiles p;

-- ───────────────────────────── admin content ─────────────────────────────
create table public.weekly_missions (day text primary key, title text not null, description text, topic_ids text[] not null default '{}', sort int);
create table public.videos (id text primary key, title text not null, url text not null, thumbnail text, description text, competition text, topic_id text, difficulty text, category text, created_at timestamptz default now());
create table public.announcements (id text primary key, title text not null, body text not null, kind text not null default 'announcement', at timestamptz not null default now());
create table public.app_content (key text primary key, value jsonb not null, updated_at timestamptz default now());

-- ───────────────────────────── row-level security ─────────────────────────────
alter table public.profiles enable row level security;
alter table public.components enable row level security;
alter table public.component_pins enable row level security;
alter table public.component_specifications enable row level security;
alter table public.projects enable row level security;
alter table public.robot_configurations enable row level security;
alter table public.chassis enable row level security;
alter table public.mechanical_assemblies enable row level security;
alter table public.circuit_connections enable row level security;
alter table public.code_versions enable row level security;
alter table public.simulations enable row level security;
alter table public.simulation_results enable row level security;
alter table public.tracks enable row level security;
alter table public.learning_paths enable row level security;
alter table public.topics enable row level security;
alter table public.lessons enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_membership enable row level security;
alter table public.quiz_answer_keys enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.progress enable row level security;
alter table public.xp_rules enable row level security;
alter table public.xp_events enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.weekly_missions enable row level security;
alter table public.videos enable row level security;
alter table public.announcements enable row level security;
alter table public.app_content enable row level security;

-- everyone signed in can read profiles (leaderboard); users update only themselves (trigger protects role/xp)
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin());

-- public reference data: read for all signed-in users, write for admins
do $$ declare t text; begin
  foreach t in array array['components','component_pins','component_specifications','learning_paths','topics','lessons','quizzes','quiz_questions','quiz_membership','xp_rules','achievements','weekly_missions','videos','announcements','app_content'] loop
    execute format('create policy %I_read on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_admin on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;
-- answer keys: admins only (students are graded by submit_quiz)
create policy answer_keys_admin on public.quiz_answer_keys for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- projects: owners have full access, admins can read (progress review) and delete
create policy projects_owner on public.projects for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy projects_admin_read on public.projects for select to authenticated using (public.is_admin());
create policy projects_admin_delete on public.projects for delete to authenticated using (public.is_admin());
do $$ declare t text; begin
  foreach t in array array['robot_configurations','chassis','mechanical_assemblies','circuit_connections','code_versions','simulations','simulation_results'] loop
    execute format('create policy %I_owner on public.%I for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.is_admin())))', t, t);
  end loop;
end $$;

-- tracks: built-ins and shared tracks readable by all; owners manage their own
create policy tracks_read on public.tracks for select to authenticated using (owner_id is null or shared or owner_id = auth.uid() or public.is_admin());
create policy tracks_owner on public.tracks for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- personal learning data
create policy progress_self on public.progress for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_admin on public.progress for select to authenticated using (public.is_admin());
create policy attempts_self_read on public.quiz_attempts for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy xp_read on public.xp_events for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy ua_read on public.user_achievements for select to authenticated using (true);
-- no insert/update policies on xp_events / quiz_attempts: only the security-definer functions write them.

grant execute on function public.award_xp(text, text, int) to authenticated;
grant execute on function public.complete_lesson(text) to authenticated;
grant execute on function public.submit_quiz(text, jsonb) to authenticated;
