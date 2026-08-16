# Product Overview

## What this is

A marketplace connecting customers with sports facilities (football pitches,
padel/tennis courts, basketball courts, and future sports) at real venues.
Customers request a booking; the venue confirms or rejects it. Venues can
also register walk-in/phone bookings manually so one calendar reflects
reality regardless of how the customer actually reserved.

Launch market: Egypt, starting in Cairo. UI ships bilingual (English +
Arabic, RTL-ready) from the first release — see
[ADR-008](../adr/ADR-008-bilingual-rtl-from-day-one.md).

## Non-goals for MVP

Native apps, AI recommendations, multi-agent automation, dynamic/surge
pricing, loyalty programs, a general CRM, and microservices. See
`docs/adr/` for why each major structural decision was made, and the Phase 0
architecture discussion for the full non-goals list.

## The core loop

```
Customer discovers a venue → picks a facility + time slot → requests booking
        ↓
Venue confirms or rejects
        ↓
Confirmed booking blocks the slot (database-guaranteed, no double-booking)
        ↓
Booking completes → customer may leave one review per venue
```

This loop must work correctly without any AI involvement. See
`docs/architecture/ai-agent.md` for where AI is allowed to participate later
and where it is permanently excluded.

## Business model

Customers pay online at request time (authorized, not yet charged); payment
is captured when the venue confirms. Platform commission is deducted
automatically from the captured amount before the venue's payout. See
[ADR-007](../adr/ADR-007-online-payments-in-mvp.md) for why payments are in
MVP scope rather than deferred, and the cancellation policy below.

## Cancellation policy (locked, Phase 0)

- Customers cannot cancel within **2 hours** of the booking's start time.
- Cancelling a **confirmed** booking outside that window refunds 50% of the
  captured amount; the other 50% is forfeited.
- Venues cancel using a fixed set of reasons (maintenance, weather,
  scheduling error, double-booked, venue closed, other) — never free text,
  so cancellation data stays analyzable and customer-facing messaging stays
  consistent.

## Related docs

- `docs/product/terminology.md` — precise vocabulary (venue vs. facility, etc.)
- `docs/product/user-roles.md` — who can do what
- `docs/product/booking-flow.md` — the request-to-book flow in detail
- `docs/architecture/database.md` — the schema backing all of this
