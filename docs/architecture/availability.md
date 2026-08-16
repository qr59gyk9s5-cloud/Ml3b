# Availability

Implements ADR-003 (derived, not materialized). If you haven't read that
ADR, start there — this doc is the "how," that one is the "why."

## The model

```
weekly rules (local wall-clock, per facility, possibly midnight-crossing)
  + special-hours exceptions (extra availability)
  − closure exceptions (maintenance, weather, holiday, tournament, ...)
  − already-confirmed bookings (Phase 5 — not sourced yet, see below)
  = fixed-duration slots for one local calendar day,
    each flagged available or not, and why
```

Nothing here is a stored "slot" row. `getAvailableSlots(facilityId, date)`
(`src/domain/availability/queries.ts`) computes the answer fresh on every
call from `availability_rules` + `availability_exceptions` +
`computeAvailableSlots` (`src/domain/availability/compute-slots.ts`, pure,
no I/O — see that file's tests for the full correctness matrix: same-day
windows, split hours, midnight-crossing both directions, closure and
special-hours exceptions, partial-slot exclusion, chronological ordering).

## Timezones — the part that's easy to get subtly wrong

Every venue has an IANA `timezone` (default `Africa/Cairo`). A weekly rule
(`day_of_week`, `start_time`, `end_time`) names a **wall-clock** time —
"9am Sunday" — which only becomes an absolute instant once you know which
timezone it's 9am _in_. `src/domain/availability/time.ts` is the one
place that conversion happens (`localWallClockToUtc`, via
`date-fns-tz`'s `fromZonedTime` — DST-correct, not manual UTC-offset
arithmetic). Everything else in the availability domain works with
already-resolved absolute `Date`s.

A **local date** (`'YYYY-MM-DD'`) names a calendar day, not an instant —
calendar arithmetic on it (`addLocalDays`, `dayOfWeekOfLocalDate`) never
touches a timezone at all, deliberately, so it can't accidentally pick up
the _server's_ timezone. `todayInTimeZone(timeZone)` is the only place
"what day is it right now" gets asked, and it asks in the venue's
timezone, not the server's.

## Midnight-crossing rules

A rule where `end_time <= start_time` (e.g. `22:00`–`02:00`) crosses into
the next calendar day. The rule this resolves to:

> **A slot belongs to the calendar day it _starts_ on.**

So a Friday `22:00`–`02:00` rule contributes two slots to Friday
(22:00–23:00, 23:00–00:00) and two to Saturday (00:00–01:00,
01:00–02:00) — never both on the same day, never dropped, never
double-counted. `compute-slots.ts` achieves this by resolving _both_ the
target day's own rule occurrence _and_ the previous day's rule occurrence
(only if it wraps), then filtering every generated slot to keep only
those whose start falls within the target day's local boundaries.

## Exceptions

One table (`availability_exceptions`) covers both directions:

- `is_closed = true` — maintenance, weather, a holiday, a private event:
  removes availability. Slots it overlaps come back with
  `reason: 'CLOSED_PERIOD'`, not silently omitted — the customer-facing
  UI (Phase 6) can show _why_ a slot is greyed out, not just that it is.
- `is_closed = false` — special opening hours: **adds** availability on
  top of the normal weekly schedule, for a one-off case like a holiday
  the venue chooses to open for.

Exceptions are create/delete only (no update) — changing a closure is a
new record, not an edit to the old one, so "who declared this and when"
stays honest in the audit trail.

## What's still missing (Phase 5)

`getAvailableSlots` always passes `blockedRanges: []` to
`computeAvailableSlots` — there's no `bookings` table yet. The function
signature already accepts `blockedRanges`, so Phase 5 only has to fetch
`CONFIRMED` bookings overlapping the day and pass them in; nothing here
changes. A slot with an overlapping blocked range comes back with
`reason: 'BOOKED'`, already distinguished from `'CLOSED_PERIOD'`.

## Authorization

`src/domain/availability/rules.ts` and `exceptions.ts` follow the same
OWNER/MANAGER-only pattern as `facilities.ts`. Reading computed
availability is public (no actor) once the facility and venue are both
active — the same reasoning as facility visibility in
`docs/architecture/authorization.md`. RLS on the raw
`availability_rules`/`availability_exceptions` tables
(`0005_availability_domain_rls.sql`) mirrors this, reusing the
`is_venue_teammate` / `has_venue_role` / `is_platform_admin` helpers from
`0001_identity_auth_and_rls.sql`.
