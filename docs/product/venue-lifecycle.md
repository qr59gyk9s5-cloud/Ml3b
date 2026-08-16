# Venue Lifecycle

Same discipline as the booking state machine (`docs/product/booking-flow.md`):
one enum, one domain service that's the only writer of `venues.status`
(`transitionVenueStatus` in `src/domain/venue/lifecycle.ts`), and an
explicit transition table — nothing implicit, nothing reachable by
skipping a step.

## States

```
DRAFT ──submit──▶ PENDING_REVIEW ──approve──▶ ACTIVE ⇄ SUSPENDED
  │                    │                        │           │
  │                    │(withdraw)               │           │
  │                    ▼                         │           │
  │                  DRAFT                       │           │
  │                                               │           │
  └──────────────────archive─────────────────────┴───────────┴──▶ ARCHIVED
```

`ARCHIVED` is terminal — no transition leaves it, including for admins.
Archival, not deletion, is how a venue goes away (§25 of the founder
spec's deletion-strategy principle).

## Transition matrix

| From                                  | To                           | Who                                                                                       |
| ------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `DRAFT`                               | `PENDING_REVIEW`             | Owner or Manager                                                                          |
| `PENDING_REVIEW`                      | `DRAFT` (withdraw/send back) | Owner, Manager, or Admin                                                                  |
| `PENDING_REVIEW`                      | `ACTIVE`                     | **Admin only** — the approval gate agreed in Phase 0; not even the owner can self-approve |
| `ACTIVE`                              | `SUSPENDED`                  | **Admin only** — moderation action                                                        |
| `SUSPENDED`                           | `ACTIVE`                     | **Admin only**                                                                            |
| `DRAFT` / `PENDING_REVIEW` / `ACTIVE` | `ARCHIVED`                   | Owner or Admin                                                                            |
| `SUSPENDED`                           | `ARCHIVED`                   | **Admin only**                                                                            |

Any pair not in this table (e.g. `DRAFT` straight to `ACTIVE`) is
rejected as `INVALID_TRANSITION`, regardless of who's asking. An
authorized actor attempting a transition that exists but that they don't
have the role for gets `FORBIDDEN`. Both are `DomainError`s
(`src/domain/errors.ts`) — never a raw exception or a silent no-op.

## Facilities

Facility management (`src/domain/venue/facilities.ts`) follows the same
"one service, real authorization, real validation" shape:

- Create/update: **Owner or Manager only** — not Receptionist (matches
  the authorization matrix).
- Deactivate, never delete: a facility that stops taking bookings keeps
  its history (past bookings, reviews) intact — `is_active = false`, not
  a dropped row.
- Slug uniqueness is per-venue, enforced at the database level
  (`facilities_venue_id_slug_key`) — the service also checks first, for a
  clean `CONFLICT` error instead of surfacing the constraint violation.
- `minimumDurationMinutes <= maximumDurationMinutes` is validated both by
  Zod (`src/lib/validation/facility.ts`) at the service boundary and by a
  database `CHECK` constraint — belt and suspenders, since this is exactly
  the kind of invariant that must never depend on the client having
  validated it correctly.
