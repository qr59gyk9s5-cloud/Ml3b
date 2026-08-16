# ADR-002: One `bookings` Table for Marketplace, Manual, and Admin Bookings

**Date:** 2026-08-16
**Status:** Accepted

## Context

Venues need to record phone/WhatsApp/walk-in reservations ("manual
bookings") that must block the same facility/time as a marketplace
booking. The founder's stated preference was one unified reservation/
conflict model unless there's a strong reason otherwise.

## Decision

A single `bookings` table with a `source` column
(`MARKETPLACE | MANUAL | ADMIN | IMPORT`). Manual bookings skip
`REQUESTED` and are created directly as `CONFIRMED`, with `customer_id`
nullable and `customer_name`/`customer_phone` captured as plain snapshot
fields (no marketplace account required).

## Alternatives considered

- **Separate `manual_bookings` table** — would need its own conflict
  logic, duplicating (and risking divergence from) the exclusion
  constraint that protects marketplace bookings. Rejected: double-booking
  prevention is the single most important invariant in the product: it
  must not depend on two tables staying in sync.

## Advantages

One conflict rule (the Postgres exclusion constraint), one transition
service, one calendar query for venue staff, one audit trail.

## Disadvantages

The `bookings` table carries columns relevant only to some sources
(e.g. `customer_name` is meaningless for `source=MARKETPLACE` where
`customer_id` is set) — a moderate, acceptable amount of nullable-column
sparsity in exchange for a single correctness guarantee.

## Consequences

Every future booking-adjacent feature (reviews, notifications, payments)
must handle `customer_id IS NULL` gracefully rather than assuming a
marketplace account always exists.
