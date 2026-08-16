-- LOCAL / CI TESTING ONLY — see local-auth-shim.sql.
--
-- On a real Supabase project, table privileges for `authenticated`/`anon`
-- are already configured by Supabase; RLS policies are the actual
-- boundary. Here we still need table-level grants so `set local role
-- authenticated` can reach the tables at all before RLS narrows the rows.
-- Run once, after all migrations have created their tables.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on auth.users to authenticated, anon;
