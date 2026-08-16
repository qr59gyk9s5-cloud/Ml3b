# Database Architecture

PostgreSQL via Supabase. Extension required: `btree_gist` (powers the
double-booking exclusion constraint below). Schema is applied via
version-controlled migrations in `supabase/migrations/` — created starting
Phase 2, not yet present.

## Enums

```
venue_status       DRAFT | PENDING_REVIEW | ACTIVE | SUSPENDED | ARCHIVED
venue_role         OWNER | MANAGER | RECEPTIONIST
booking_mode       REQUEST_TO_BOOK | INSTANT_BOOK
booking_status     REQUESTED | CONFIRMED | REJECTED | EXPIRED |
                   CANCELLED_BY_CUSTOMER | CANCELLED_BY_VENUE | COMPLETED | NO_SHOW
booking_source     MARKETPLACE | MANUAL | ADMIN | IMPORT
actor_type         CUSTOMER | VENUE_USER | ADMIN | SYSTEM | AI_AGENT
exception_kind     HOLIDAY | MAINTENANCE | TOURNAMENT | PRIVATE_EVENT | WEATHER | SPECIAL_HOURS | OTHER
cancellation_reason MAINTENANCE | WEATHER | SCHEDULING_ERROR | DOUBLE_BOOKED | VENUE_CLOSED | OTHER
payment_status     AUTHORIZED | CAPTURED | RELEASED | REFUNDED | PARTIALLY_REFUNDED | FAILED
```

TypeScript mirrors of these live in `src/lib/config/constants.ts` — keep
both in sync; nothing should hardcode these strings elsewhere.

## MVP tables

### `profiles` — 1:1 extension of `auth.users`

```
id           uuid PK REFERENCES auth.users(id) ON DELETE CASCADE
full_name    text NOT NULL
phone        text NULL
avatar_url   text NULL
created_at   timestamptz NOT NULL DEFAULT now()
updated_at   timestamptz NOT NULL DEFAULT now()
```

### `platform_admins` — explicit, auditable admin grants

```
user_id      uuid PK REFERENCES profiles(id)
granted_by   uuid NULL REFERENCES profiles(id)
created_at   timestamptz NOT NULL DEFAULT now()
```

Deliberately not a boolean flag on `profiles` — grants should be an
auditable event, easy to revoke without touching the profile row.

### `sports`

```
id            uuid PK DEFAULT gen_random_uuid()
code          text NOT NULL UNIQUE       -- 'football','padel','tennis','basketball'
display_name  text NOT NULL
is_active     boolean NOT NULL DEFAULT true
created_at    timestamptz NOT NULL DEFAULT now()
```

### `venues`

```
id               uuid PK DEFAULT gen_random_uuid()
slug             text NOT NULL UNIQUE
name             text NOT NULL
description      text NULL
status           venue_status NOT NULL DEFAULT 'DRAFT'
country          text NOT NULL DEFAULT 'EG'
city             text NOT NULL
district         text NULL
address          text NULL
latitude         double precision NULL
longitude        double precision NULL
timezone         text NOT NULL DEFAULT 'Africa/Cairo'   -- IANA id, per venue
cover_photo_url  text NULL
created_by       uuid NOT NULL REFERENCES profiles(id)
created_at       timestamptz NOT NULL DEFAULT now()
updated_at       timestamptz NOT NULL DEFAULT now()

INDEX (status), INDEX (city)
```

Goes through `DRAFT → PENDING_REVIEW → ACTIVE` even though the founder is
currently the one onboarding venues as admin — the approval gate stays in
the model rather than being special-cased away.

### `venue_members` — membership, not a single owner FK

```
id          uuid PK DEFAULT gen_random_uuid()
venue_id    uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE
user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
role        venue_role NOT NULL
created_at  timestamptz NOT NULL DEFAULT now()

UNIQUE (venue_id, user_id)
INDEX (user_id)
```

### `facilities`

```
id                         uuid PK DEFAULT gen_random_uuid()
venue_id                   uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE
sport_id                   uuid NOT NULL REFERENCES sports(id)
name                       text NOT NULL
slug                       text NOT NULL
description                text NULL
capacity                   int NULL
booking_mode               booking_mode NOT NULL DEFAULT 'REQUEST_TO_BOOK'
slot_duration_minutes      int NOT NULL DEFAULT 60   -- fixed pre-set slot length
minimum_duration_minutes   int NOT NULL DEFAULT 60   -- min consecutive slots × slot_duration
maximum_duration_minutes   int NOT NULL DEFAULT 120
base_price_minor           int NOT NULL CHECK (base_price_minor >= 0)  -- price per hour
currency                   text NOT NULL DEFAULT 'EGP'
is_active                  boolean NOT NULL DEFAULT true
created_at                 timestamptz NOT NULL DEFAULT now()
updated_at                 timestamptz NOT NULL DEFAULT now()

UNIQUE (venue_id, slug)
CHECK (minimum_duration_minutes <= maximum_duration_minutes)
INDEX (venue_id), INDEX (sport_id)
```

Booking uses **fixed pre-set slots**: a customer selects one or more
consecutive `slot_duration_minutes` blocks (up to `maximum_duration_minutes`),
never a freeform start/end. Price = `base_price_minor / 60 × total minutes`.

### `availability_rules` — recurring weekly schedule, per facility

```
id           uuid PK DEFAULT gen_random_uuid()
facility_id  uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE
day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6)  -- 0=Sunday
start_time   time NOT NULL
end_time     time NOT NULL   -- domain layer handles midnight-crossing
is_closed    boolean NOT NULL DEFAULT false
created_at   timestamptz NOT NULL DEFAULT now()

INDEX (facility_id, day_of_week)
```

### `availability_exceptions` — one-off overrides (closures, special hours, holidays, maintenance)

```
id           uuid PK DEFAULT gen_random_uuid()
facility_id  uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE
kind         exception_kind NOT NULL
starts_at    timestamptz NOT NULL
ends_at      timestamptz NOT NULL
is_closed    boolean NOT NULL DEFAULT true   -- false = special *open* hours override
reason       text NULL
created_by   uuid NOT NULL REFERENCES profiles(id)
created_at   timestamptz NOT NULL DEFAULT now()

CHECK (starts_at < ends_at)
INDEX (facility_id, starts_at, ends_at)
```

This single table covers both "blocked periods" and "availability
exceptions" from the original entity brainstorm — both are "a time range
that overrides normal availability for a reason"; merging avoids two
near-identical code paths computing the same thing.

### `bookings` — the core table; unified for marketplace + manual + admin

```
id                   uuid PK DEFAULT gen_random_uuid()
reference            text NOT NULL UNIQUE            -- 'BK-7F2K91'
venue_id             uuid NOT NULL REFERENCES venues(id)
facility_id          uuid NOT NULL REFERENCES facilities(id)
customer_id          uuid NULL REFERENCES profiles(id)   -- null for MANUAL w/o an account
status               booking_status NOT NULL DEFAULT 'REQUESTED'
source               booking_source NOT NULL DEFAULT 'MARKETPLACE'
start_at             timestamptz NOT NULL
end_at               timestamptz NOT NULL
requested_at         timestamptz NOT NULL DEFAULT now()
responded_at         timestamptz NULL
expires_at           timestamptz NULL
customer_name        text NULL      -- manual booking / snapshot
customer_phone       text NULL
customer_note        text NULL      -- customer-visible
venue_private_note   text NULL      -- staff-only, never shown to customer
cancellation_reason  cancellation_reason NULL
subtotal_minor       int NOT NULL
platform_fee_minor   int NOT NULL DEFAULT 0
total_minor          int NOT NULL
currency             text NOT NULL DEFAULT 'EGP'
idempotency_key      text NULL
created_by           uuid NULL REFERENCES profiles(id)
created_at           timestamptz NOT NULL DEFAULT now()
updated_at           timestamptz NOT NULL DEFAULT now()

CHECK (start_at < end_at)
UNIQUE (customer_id, idempotency_key) WHERE idempotency_key IS NOT NULL
INDEX (facility_id, start_at, end_at)
INDEX (venue_id, status)
INDEX (customer_id, status)

-- THE double-booking guarantee — see docs/architecture/database.md#concurrency
EXCLUDE USING gist (
  facility_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (status = 'CONFIRMED')
```

### `payments` — one authorize→capture record per booking

```
id                    uuid PK DEFAULT gen_random_uuid()
booking_id            uuid NOT NULL REFERENCES bookings(id)
provider              text NOT NULL         -- 'paymob' | 'fawry' (TBD, see ADR-007)
provider_ref          text NULL             -- provider transaction id, for reconciliation
status                payment_status NOT NULL DEFAULT 'AUTHORIZED'
amount_minor          int NOT NULL
currency              text NOT NULL DEFAULT 'EGP'
authorized_at         timestamptz NULL
captured_at           timestamptz NULL
refunded_at           timestamptz NULL
refund_amount_minor   int NULL
created_at            timestamptz NOT NULL DEFAULT now()
updated_at            timestamptz NOT NULL DEFAULT now()

INDEX (booking_id)
```

Built out when the payment gateway integration lands (see ADR-007) — not a
Phase 1/2 migration. Documented now because it changes the booking
transition side effects (`CONFIRMED` → capture, `REJECTED`/`EXPIRED` →
release, cancellation → 50% refund) that the booking domain service must
call out to.

### `booking_events`

```
id           uuid PK DEFAULT gen_random_uuid()
booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
event_type   text NOT NULL       -- BOOKING_REQUESTED, BOOKING_CONFIRMED, ...
actor_type   actor_type NOT NULL
actor_id     uuid NULL
reason       text NULL
metadata     jsonb NOT NULL DEFAULT '{}'
created_at   timestamptz NOT NULL DEFAULT now()

INDEX (booking_id, created_at)
```

### `reviews`

```
id           uuid PK DEFAULT gen_random_uuid()
booking_id   uuid NOT NULL REFERENCES bookings(id)   -- the COMPLETED booking that granted eligibility
customer_id  uuid NOT NULL REFERENCES profiles(id)
venue_id     uuid NOT NULL REFERENCES venues(id)
facility_id  uuid NOT NULL REFERENCES facilities(id)
rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5)
comment      text NULL
created_at   timestamptz NOT NULL DEFAULT now()

UNIQUE (customer_id, venue_id)   -- one review per customer per venue, ever
INDEX (venue_id)
```

**Not** `UNIQUE(booking_id)`. A customer who books the same venue ten times
can still only leave one review for that venue — confirmed as a Phase 0
decision, see [ADR-009](../adr/ADR-009-review-per-venue-not-per-booking.md).

### `notifications`

```
id          uuid PK DEFAULT gen_random_uuid()
user_id     uuid NOT NULL REFERENCES profiles(id)
type        text NOT NULL
channel     text NOT NULL DEFAULT 'IN_APP'   -- IN_APP | EMAIL (future PUSH/WHATSAPP/SMS)
payload     jsonb NOT NULL DEFAULT '{}'
status      text NOT NULL DEFAULT 'PENDING'   -- PENDING | SENT | FAILED
read_at     timestamptz NULL
created_at  timestamptz NOT NULL DEFAULT now()
sent_at     timestamptz NULL

INDEX (user_id, status)
```

### `outbox_events` — reliable delivery backbone

```
id           uuid PK DEFAULT gen_random_uuid()
event_type   text NOT NULL
payload      jsonb NOT NULL
status       text NOT NULL DEFAULT 'PENDING'   -- PENDING | PROCESSING | PROCESSED | FAILED
attempts     int NOT NULL DEFAULT 0
last_error   text NULL
created_at   timestamptz NOT NULL DEFAULT now()
processed_at timestamptz NULL

INDEX (status, created_at)
```

### `audit_logs`

```
id              uuid PK DEFAULT gen_random_uuid()
actor_type      actor_type NOT NULL
actor_id        uuid NULL
action          text NOT NULL
resource_type   text NOT NULL
resource_id     uuid NULL
correlation_id  uuid NULL
metadata        jsonb NOT NULL DEFAULT '{}'
created_at      timestamptz NOT NULL DEFAULT now()

INDEX (resource_type, resource_id), INDEX (actor_type, actor_id), INDEX (created_at)
```

## Explicitly deferred (not created until their phase needs them)

`venue_photos`, `facility_photos`, `support_tickets`,
`notification_preferences`, `agent_runs`, `agent_actions`,
`agent_approvals`, `venue_payouts`, `commission_rules`, `promotions`,
`search_events`. Premature tables drift from reality faster than missing
ones — each gets added in the phase that actually reads/writes it.

## Concurrency: the double-booking guarantee

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    facility_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'CONFIRMED');
```

- Half-open intervals (`[start, end)`) — back-to-back bookings (10–11 and
  11–12) never conflict.
- On simultaneous confirmation attempts for overlapping requests: both
  `UPDATE ... SET status='CONFIRMED'` run in their own transaction;
  whichever commits first wins, the second raises Postgres error `23P01`
  (exclusion violation), caught by the domain service and returned as
  `BOOKING_CONFLICT` — never a generic 500, never a silent overwrite.
- The domain service also does an explicit conflict check inside the
  transaction before attempting the update, for a clear domain error even
  before hitting the DB constraint — but the constraint is the actual
  guarantee; the app-level check alone cannot be trusted under concurrency.
- Booking creation accepts a client-supplied `idempotency_key`, uniquely
  scoped per customer, so a double-submit/retry returns the existing row
  instead of creating a duplicate `REQUESTED` booking.

## Timezones

- `venues.timezone` is an IANA identifier (default `Africa/Cairo`), never
  hardcoded into application logic.
- `bookings.start_at/end_at` are `timestamptz` — absolute instants.
- `availability_rules.start_time/end_time` are local wall-clock times,
  interpreted against the venue's timezone when generating slots, so DST is
  handled by Postgres/date libraries rather than by hand.
- Midnight-crossing schedules (e.g. Friday 12:00–02:00) are supported by
  allowing `end_time < start_time` in a rule row, interpreted as "ends the
  next calendar day," with explicit domain-layer test coverage.
