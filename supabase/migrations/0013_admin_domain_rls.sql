-- ---------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------

alter table "public"."audit_logs" enable row level security;

-- Admin-only. Nobody else — not even the actor a row is about — reads
-- the audit trail directly; that's the whole point of it. See
-- docs/architecture/authorization.md's "View audit logs" matrix row.
create policy "audit_logs_select_admin_only"
  on "public"."audit_logs" for select
  using (public.is_platform_admin(auth.uid()));

-- No insert/update/delete policy — written only by
-- src/domain/audit/log.ts via the privileged app connection (bypasses
-- RLS entirely), never by a client, and never edited or deleted once
-- written (an audit trail that can be edited isn't one).

-- ---------------------------------------------------------------------
-- profiles.suspended_* — RLS is row-level, not column-level, so the
-- existing profiles_update_own policy (a user may edit their own row)
-- would otherwise let a suspended user simply UN-suspend themselves by
-- writing suspended_at = null directly through the Supabase client.
-- Column-level privilege is the correct tool, not another RLS policy —
-- but a column-level REVOKE alone does NOT narrow a table-level GRANT
-- (Postgres treats column privileges as purely additive on top of
-- table-level ones, never subtractive — a well-known gotcha). The only
-- way to actually restrict specific columns is to revoke the blanket
-- table-level UPDATE and re-grant it only for the columns a user should
-- be able to self-edit. The privileged app connection used by
-- src/domain/admin/users.ts is a superuser/table-owner role and is
-- unaffected by any of this, same as it already bypasses RLS.
-- ---------------------------------------------------------------------

revoke update on "public"."profiles" from authenticated;
grant update (full_name, phone, avatar_url, updated_at)
  on "public"."profiles" to authenticated;
