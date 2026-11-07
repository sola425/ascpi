-- Local disposable database ONLY. The harness runs this before the migration.
-- Refuse a database with Supabase Auth or existing Supabase roles.
\set ON_ERROR_STOP on
do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'auth')
    or exists (select 1 from pg_catalog.pg_roles where rolname in ('anon', 'authenticated')) then
    raise exception 'Tests require a new disposable database, not an existing Supabase project.';
  end if;
end;
$$;

create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid
language sql stable security invoker set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005'),
  ('00000000-0000-0000-0000-000000000006');
