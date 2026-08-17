-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------

alter table "public"."notifications" enable row level security;

-- A user sees only their own notifications.
create policy "notifications_select_own"
  on "public"."notifications" for select
  using (user_id = auth.uid());

-- A user may mark their own notification read — the app only ever
-- issues an UPDATE ... SET read_at, never touches type/channel/payload
-- from a client path, but RLS itself can't restrict to one column, so
-- this is coarse defense-in-depth like bookings_update_own_or_staff_or_admin.
create policy "notifications_update_own"
  on "public"."notifications" for update
  using (user_id = auth.uid());

-- No insert/delete policy — notifications are written only by
-- dispatchOutboxEvents() via the privileged app connection (which
-- doesn't go through RLS at all), never directly by a client.

-- ---------------------------------------------------------------------
-- outbox_events
-- ---------------------------------------------------------------------

-- RLS enabled with zero policies: nobody (authenticated or anon) gets
-- any access at all. This table is purely internal plumbing between
-- domain services and dispatchOutboxEvents() — no client, including a
-- signed-in one, has any legitimate reason to read or write it.
alter table "public"."outbox_events" enable row level security;
