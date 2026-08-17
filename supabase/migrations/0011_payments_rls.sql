-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------

alter table "public"."payments" enable row level security;

-- Visible to whoever can see the parent booking — the booking's own
-- customer, staff at its venue, or an admin. Same pattern as
-- booking_events_select_via_parent_booking.
create policy "payments_select_via_parent_booking"
  on "public"."payments" for select
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

-- No insert/update/delete policy — payment records are written only by
-- src/domain/payments (via the privileged app connection, which doesn't
-- go through RLS at all) reacting to a real provider webhook/response,
-- never directly by a client. A client-reported payment status is never
-- trusted (CLAUDE.md).
