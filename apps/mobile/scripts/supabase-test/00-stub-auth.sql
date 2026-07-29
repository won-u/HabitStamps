-- Stubs the pieces of Supabase's environment our schema/RPCs depend on, so we
-- can test them against a plain local Postgres. Not part of the real schema —
-- a real Supabase project already provides auth.users and auth.uid().
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Real Supabase's auth.uid() reads the JWT claim of the request; here we fake
-- it with a session-local setting so tests can pick which "user" is calling.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

-- Real Supabase queries from the client run as the low-privilege
-- `authenticated` Postgres role (RLS applies), never as the table owner (RLS
-- is bypassed for owners/superusers by default). Without this, every SELECT
-- in our test would silently skip RLS and every isolation check would pass
-- for the wrong reason.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
grant usage on schema public to authenticated;
