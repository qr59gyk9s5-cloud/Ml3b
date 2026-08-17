# Booking Engine

Phase 5. This is the highest-risk part of the whole product — see the
founder spec's own framing (§13.3, §56) and ADR-004. If you're changing
anything in `src/domain/booking/`, read this first.

## The one rule

**`src/domain/booking/transition.ts`'s `transitionBooking()` is the only
function that ever writes `bookings.status`.** Customer cancellation,
venue confirm/reject/cancel, system expiry, completion, no-show — every
one of them calls it. There is no second write path, not even for the
system job (`expire.ts` calls `transitionBooking()` too, with
`actor.isSystem = true` — it does not `UPDATE` the row itself). See
CLAUDE.md's "all booking state transitions go through one domain service"
rule; this is that rule, applied.

## The state machine

```
REQUESTED --confirm--> CONFIRMED --complete--> COMPLETED
   |  |                    |  |
   |  |--reject--> REJECTED   |--no_show--> NO_SHOW
   |  |--expire--> EXPIRED    |--cancel(customer)--> CANCELLED_BY_CUSTOMER
   |--cancel(customer)--> CANCELLED_BY_CUSTOMER
                              |--cancel(venue)--> CANCELLED_BY_VENUE
```

`src/domain/booking/state-machine.ts` is the complete, explicit edge
list (`findBookingTransitionRule`) plus who's allowed to walk each edge
(`src/domain/authz/booking.ts`'s pure predicates). Anything not in that
table is illegal — including from any of the six terminal statuses
(`isTerminalBookingStatus`). No admin override/correction path exists yet
— deliberately deferred, same scope discipline as venue `ARCHIVED`.

The state machine itself is pure and has no idea about time or the
database — `canTransitionBooking(ctx, from, to)` is a same-process
function call, fully covered by `state-machine.test.ts` without a
database in sight.

## What `transitionBooking()` adds on top of the pure graph

1. **The 2-hour cancellation cutoff** (`CANCELLATION_CUTOFF_HOURS`) — a
   time-based rule, not a role one, so it isn't in the state machine's
   edge table. Applies uniformly to every `CANCELLED_BY_CUSTOMER`
   transition regardless of actor (see `transition.ts`'s comment on why
   an admin doesn't currently bypass it — no override flow exists yet).
2. **A required, fixed-list reason** for `REJECTED` and
   `CANCELLED_BY_VENUE` (`VENUE_CANCELLATION_REASON`) — never free text,
   per the founder spec.
3. **An explicit conflict pre-check** before confirming: a `SELECT` for
   any other `CONFIRMED` booking overlapping the same facility/time. This
   exists purely to fail fast with a clear message — it is a courtesy,
   not the guarantee (see below).
4. **Optimistic concurrency**: the actual `UPDATE` is
   `WHERE id = ? AND status = <the status we just read>`. If another
   request already moved the row, this affects zero rows and
   `transitionBooking()` throws `CONFLICT`.
5. **The database exclusion constraint** (`bookings_no_overlap`,
   `docs/architecture/database.md#concurrency`, ADR-004) is what actually
   makes double-booking impossible. Two concurrent requests confirming
   overlapping bookings both reach their `UPDATE`; Postgres allows
   whichever commits first and raises `23P01` (exclusion_violation) on
   the other. `transition.ts` catches that specific code
   (`isExclusionViolation`, `src/lib/db/errors.ts`) and translates it to
   the same `CONFLICT` domain error — never a generic 500, never a
   silent overwrite.

Layers 3 and 4 both narrow the race window and produce a clean error in
the common case, but neither is trustworthy alone under true concurrency
— only layer 5 is a database-enforced guarantee. This is why
`transition.integration.test.ts` has a test that fires two
`transitionBooking()` calls at the real database, truly concurrently
(`Promise.allSettled`, no artificial serialization), confirming two
_overlapping_ (not just identical) `REQUESTED` bookings on the same
facility, and asserts: exactly one becomes `CONFIRMED`, the other fails,
and a fresh read of the table afterward shows exactly one `CONFIRMED`
row. That's the test the whole product's correctness rests on.

## Creating a booking

- **Marketplace** (`create-request.ts`): a signed-in customer only.
  Validates the facility/venue are active, the duration is a whole
  number of the facility's slots and within its min/max, and — via the
  same `getAvailableSlots()` the customer-facing UI reads — that every
  slot the span covers is actually open. Always lands as
  `status='REQUESTED', source='MARKETPLACE'`, priced by
  `computeBookingPricing()` (a snapshot — see `pricing.ts` — never
  recomputed later even if the venue's rate changes), with `expiresAt`
  set `BOOKING_REQUEST_EXPIRY_MINUTES` out. Idempotent: a client-supplied
  `idempotencyKey` (scoped per customer, `bookings_customer_id_idempotency_key_key`)
  makes a retried submit return the original booking instead of a
  duplicate.
- **Manual** (`manual.ts`): venue staff only (any role — OWNER, MANAGER,
  or RECEPTIONIST), for a walk-in/phone booking with no marketplace
  account. Lands directly as `status='CONFIRMED', source='MANUAL'`,
  `customer_id` null, name/phone captured as plain fields. Same table,
  same exclusion constraint, same conflict pre-check as a marketplace
  confirmation — there is no separate "manual booking" conflict system to
  keep in sync (ADR-002).

## Expiry

`expire.ts`'s `expireOverdueBookingRequests()` selects every `REQUESTED`
booking past its `expiresAt` and calls `transitionBooking()` with a
system actor for each. Not wired to a scheduler yet
(`docs/architecture/background-jobs.md`, Phase 8+) — the function is real
and tested now, just not invoked periodically yet. A booking another
actor raced to confirm/reject/cancel in between the select and the
transition is simply skipped for that pass, not treated as a job failure.

## What's explicitly not here yet

- **Payment capture/release/refund execution.** `transition.ts` records,
  as `booking_events.metadata`, the refund policy that _would_ apply when
  a customer cancels a `CONFIRMED` booking outside the cutoff
  (`{ refundRateApplied: CANCELLATION_REFUND_RATE }`) — informational
  only, no money moves. Real payment integration is ADR-007's own phase.
- **Admin override/correction** of a terminal booking.
- **Reviews**, which depend on a `COMPLETED` booking existing
  (ADR-009) — not built yet.
