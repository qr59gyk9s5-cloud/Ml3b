# ADR-004: Double-Booking Prevention via PostgreSQL Exclusion Constraint

**Date:** 2026-08-16
**Status:** Accepted

## Context

This is the single most important correctness requirement in the product.
Application-level "check then insert" is not safe under concurrency — two
processes can both pass the check before either writes.

## Decision

A GiST exclusion constraint on `bookings`, scoped to `status = 'CONFIRMED'`:

```sql
EXCLUDE USING gist (
  facility_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (status = 'CONFIRMED');
```

The database itself refuses a second overlapping confirmed booking,
regardless of how many application processes race to confirm it. The
domain service still performs an application-level conflict check first
(for a clean `BOOKING_CONFLICT` domain error), but treats the database
constraint as the actual guarantee, catching Postgres error `23P01` as the
authoritative "no" when the app-level check was itself racing.

## Alternatives considered

- **Application-level locking only (`SELECT ... FOR UPDATE`)** — helps
  within a single confirmation but doesn't protect against every race
  shape, and is easy to accidentally bypass in a future code path. Kept as
  defense-in-depth, not the primary guarantee.
- **Advisory locks per facility** — workable, but reinvents what an
  exclusion constraint already gives us declaratively, with less risk of a
  forgotten lock acquisition in a new code path.

## Advantages

Correctness holds even if a future developer (or AI agent) adds a new
booking-confirmation code path and forgets to replicate the application
check — the database still refuses the conflicting write.

## Disadvantages

Requires the `btree_gist` extension; error handling must specifically
recognize `23P01` and translate it to a domain-level `BOOKING_CONFLICT`
rather than a generic 500.

## Consequences

Phase 5 is not complete until this is proven with a real concurrency test
(two simultaneous confirmation attempts on overlapping requests — exactly
one must succeed), not just reviewed as correct-looking code.
