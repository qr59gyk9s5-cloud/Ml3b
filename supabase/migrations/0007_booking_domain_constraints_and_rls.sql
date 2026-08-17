-- THE double-booking guarantee (ADR-004, docs/architecture/database.md
-- #concurrency). This is the actual source of truth — not the
-- application-level conflict check in src/domain/booking/transition.ts,
-- which exists only to turn this constraint's violation into a clean
-- domain error. Never remove or weaken this to work around a bug; fix
-- the bug.
--
-- Half-open interval ([start, end)) via tstzrange's '[)' bound spec means
-- back-to-back bookings (10-11 and 11-12) never conflict. Scoped to
-- status = 'CONFIRMED' only — REQUESTED bookings may legitimately
-- overlap (§12 of the founder spec: a request never guarantees the slot).

create extension if not exists btree_gist;

alter table "public"."bookings"
  add constraint "bookings_no_overlap"
  exclude using gist (
    facility_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status = 'CONFIRMED');

-- ---------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------

alter table "public"."bookings" enable row level security;

-- A customer sees their own bookings; venue staff see every booking at
-- their venue; admins see everything.
create policy "bookings_select_own_or_staff_or_admin"
  on "public"."bookings" for select
  using (
    customer_id = auth.uid()
    or public.is_venue_teammate(venue_id, auth.uid())
    or public.is_platform_admin(auth.uid())
  );

-- A customer may request a booking for themselves (MARKETPLACE source).
-- Venue staff (RECEPTIONIST and up) may enter a MANUAL booking for their
-- own venue. Admins may do either. The actual state-machine/pricing/
-- idempotency validation lives in src/domain/booking — this is coarse
-- defense-in-depth, same posture as venues_insert_self.
create policy "bookings_insert_customer_or_staff_or_admin"
  on "public"."bookings" for insert
  with check (
    (source = 'MARKETPLACE' and customer_id = auth.uid())
    or (
      source = 'MANUAL'
      and public.has_venue_role(venue_id, auth.uid(), array['OWNER', 'MANAGER', 'RECEPTIONIST'])
    )
    or public.is_platform_admin(auth.uid())
  );

-- Coarse backstop for updates (state transitions): the owning customer,
-- staff at the venue, or an admin may touch the row at all. Which
-- transition is actually legal is enforced by
-- src/domain/booking/transition.ts, the only code path that should ever
-- issue this UPDATE.
create policy "bookings_update_own_or_staff_or_admin"
  on "public"."bookings" for update
  using (
    customer_id = auth.uid()
    or public.is_venue_teammate(venue_id, auth.uid())
    or public.is_platform_admin(auth.uid())
  );

-- No delete policy: bookings are never removed, only transitioned to a
-- terminal status — the append-only booking_events history depends on
-- the row surviving.

-- ---------------------------------------------------------------------
-- booking_events
-- ---------------------------------------------------------------------

alter table "public"."booking_events" enable row level security;

-- Visible to whoever can see the parent booking. No insert/update/delete
-- policy — events are written only by the domain service (via the
-- privileged app connection, which doesn't go through RLS at all), never
-- directly by a client.
create policy "booking_events_select_via_parent_booking"
  on "public"."booking_events" for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (
          b.customer_id = auth.uid()
          or public.is_venue_teammate(b.venue_id, auth.uid())
          or public.is_platform_admin(auth.uid())
        )
    )
  );
