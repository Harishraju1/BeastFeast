-- BEAST FEAST 5.0 — roles (student / admin / super_admin), email-based promotion and an audit log.
--
-- Security model
--   * A role can only change through admin_set_role(), which runs on the database server, checks that the
--     caller is the Super Admin, refuses self-changes and refuses to touch a super_admin, and writes an
--     audit row. Direct UPDATEs from the browser can never change role or XP (protect_profile trigger).
--   * super_admin can only be granted by the database owner (SQL editor or `npm run admin:bootstrap`,
--     which uses the server-side secret key). The app itself can grant at most "admin".
--   * Looking up accounts by email (auth.users) is only possible for the Super Admin, via admin_find_user().
--   * RLS stays enabled on every table.

-- 1. roles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('student', 'admin', 'super_admin'));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin'));
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;

-- 2. browser-side updates can never change id, role or XP — not even an admin's own session.
--    Trusted SECURITY DEFINER functions (XP, admin_set_role) run as the function owner and are allowed.
create or replace function public.protect_profile() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.id := old.id;
    new.role := old.role;
    new.xp := old.xp;
  end if;
  return new;
end $$;

-- 3. append-only audit log of every role change
create table if not exists public.role_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  target_id uuid references public.profiles(id) on delete set null,
  target_email text,
  old_role text,
  new_role text not null,
  action text not null check (action in ('promote', 'revoke', 'bootstrap')),
  note text
);
alter table public.role_audit_log enable row level security;
create policy role_audit_read on public.role_audit_log for select to authenticated using (public.is_admin());
-- no insert/update/delete policies: only admin_set_role() and the database owner write here
revoke insert, update, delete, truncate on public.role_audit_log from authenticated, anon;
grant select on public.role_audit_log to authenticated;
grant all on public.role_audit_log to service_role;
grant usage, select on sequence public.role_audit_log_id_seq to service_role;

-- 4. Super Admin: find a registered account by email
create or replace function public.admin_find_user(p_email text)
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not public.is_super_admin() then raise exception 'Only the Super Admin can look up accounts' using errcode = '42501'; end if;
  return query
    select p.id, p.name, u.email::text, p.role, p.created_at
    from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(p_email));
end $$;

-- 5. Super Admin: promote to admin / revoke to student (audited)
create or replace function public.admin_set_role(p_user uuid, p_role text, p_note text default null)
returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_old text;
  v_target_email text;
  v_actor_email text;
begin
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

-- 6. Admins: list the staff accounts (with emails) for the Admin Management screen
create or replace function public.admin_list_staff()
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
    select p.id, p.name, u.email::text, p.role, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    where p.role in ('admin', 'super_admin')
    order by case p.role when 'super_admin' then 0 else 1 end, p.name;
end $$;

revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.admin_find_user(text) from public, anon;
revoke execute on function public.admin_set_role(uuid, text, text) from public, anon;
revoke execute on function public.admin_list_staff() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.admin_find_user(text) to authenticated;
grant execute on function public.admin_set_role(uuid, text, text) to authenticated;
grant execute on function public.admin_list_staff() to authenticated;
