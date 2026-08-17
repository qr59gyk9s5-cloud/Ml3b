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

-- Re-narrow what the blanket grant above just re-opened. On a real
-- Supabase project this table-level grant only ever happens once,
-- automatically, at table-creation time (before 0013_admin_domain_rls.sql's
-- REVOKE ever runs), so the REVOKE sticks. Here, because this whole file
-- necessarily re-grants broadly on every test run (there's no equivalent
-- of Supabase's one-time automatic grant to mimic otherwise), it has to
-- re-apply the same REVOKE+GRANT immediately after, or profiles.suspended_*
-- would look client-writable in every RLS test even though it isn't on
-- the real database. Keep in sync with 0013_admin_domain_rls.sql.
revoke update on "public"."profiles" from authenticated;
grant update (full_name, phone, avatar_url, updated_at)
  on "public"."profiles" to authenticated;
