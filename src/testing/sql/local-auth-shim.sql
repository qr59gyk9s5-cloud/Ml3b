-- ============================================================================
-- LOCAL / CI TESTING ONLY.
--
-- A real Supabase project already provides a full `auth` schema (via
-- GoTrue) — this file must NEVER be applied to one. It exists only so
-- integration tests and local development can run our real migrations
-- (supabase/migrations/*.sql) against a plain, unmanaged Postgres instance
-- when the full Supabase stack (which needs Docker) isn't available.
--
-- It recreates just enough of Supabase's auth surface for our migrations
-- and RLS policies to work: a minimal auth.users table, the auth.uid()
-- function RLS policies call, and the authenticated/anon roles.
-- Applied by src/testing/db.ts, never by `supabase db push` or any
-- production migration path.
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

do $$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;

-- Let whichever role is applying these migrations (the table owner
-- locally/in CI) switch into authenticated/anon via `set local role`, the
-- same mechanism the test harness uses to simulate a logged-in user.
-- Roles are cluster-wide and outlive a single `resetTestDatabase()` run,
-- so skip the grant if membership is already in place (purely to keep
-- test output free of harmless "already a member" notices).
do $$
begin
  if not pg_has_role(current_user, 'authenticated', 'member') then
    execute format('grant authenticated to %I', current_user);
  end if;
  if not pg_has_role(current_user, 'anon', 'member') then
    execute format('grant anon to %I', current_user);
  end if;
end
$$;

grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;
