# ADR-003: Availability Is Computed, Not Materialized Into Slot Rows

**Date:** 2026-08-16
**Status:** Accepted

## Context

A naive implementation could pre-generate a row per bookable slot per
facility per day, indefinitely into the future. This explodes in row count
and requires rewriting historical/future rows whenever a venue changes its
hours.

## Decision

Requestable slots are computed on read from `availability_rules` (weekly
recurring) + `availability_exceptions` (one-off overrides) − existing
`CONFIRMED` bookings, sliced by each facility's `slot_duration_minutes`.
Nothing about "is this slot available" is stored as its own row.

## Alternatives considered

- **Materialized slot table, regenerated on schedule change** — simpler
  reads, but risks staleness if regeneration is missed, and doesn't scale
  cleanly across many venues/facilities/future dates.

## Advantages

Correct by construction — a schedule change takes effect immediately for
every future date without a backfill job. No risk of stale materialized
slots contradicting the real rules.

## Disadvantages

Slot computation is a genuine piece of domain logic that needs its own
test suite (timezone handling, midnight-crossing, exception precedence) —
built and tested in Phase 4 before any booking UI is built on top of it.

## Consequences

`docs/product/booking-flow.md` and `docs/architecture/database.md` assume
this model. Any future performance concern here should be addressed with
caching of the _computed_ result (careful never to let a stale cache cause
an incorrect booking write — see the founder spec's caching rules), not by
reintroducing a materialized slot table.
