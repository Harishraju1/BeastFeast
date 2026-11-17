-- The server-side secret key (service_role) is used by `npm run seed:supabase` and admin tooling.
-- Newer Supabase projects do not grant it access to tables created by migrations automatically.
-- It bypasses RLS by design, so it must never be exposed to the browser (see .env.example).
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- future tables get the same signed-in access as the existing ones (RLS still applies)
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
