# User Roles

## Customer

Registers, browses venues/facilities, requests bookings, manages their own
bookings, and may leave **one review per venue, ever** (`UNIQUE(customer_id,
venue_id)` — not per booking; a repeat customer can only review a venue
once, updated by re-reviewing is out of scope for MVP).

## Venue organization (membership-based, not a single owner field)

A venue has staff via `venue_members`, never a lone `owner_user_id`. Roles:

| Role           | Can                                                                                                     | Cannot                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `OWNER`        | Everything for their venue(s), including transferring ownership                                         | Access other venues                                                    |
| `MANAGER`      | Facilities, availability, pricing, staff (except other managers/owner), confirm/reject, manual bookings | Transfer ownership, delete the venue                                   |
| `RECEPTIONIST` | View calendar, confirm/reject requests, enter manual bookings, block time                               | Facility/pricing edits, staff management, financial/ownership settings |

Every MVP venue has at least an `OWNER` plus one additional staff account
(confirmed as a Phase 0 requirement, not a "someday" feature).

## Platform administrator

Elevated, cross-venue. Approves venues (`PENDING_REVIEW` → `ACTIVE`),
moderates, investigates bookings/support, views audit logs. In the current
phase, the founder acts as the admin doing initial venue onboarding — the
architecture still routes every venue through admin approval rather than
going live automatically. Admin actions are enforced server-side, never
hidden by only removing a UI link.

Admins may override a booking's state in exceptional situations. This is
allowed but **always requires a reason and is fully audited**
(`booking_events` + `audit_logs`) — not a casual free-form edit.

## System

Background jobs (request expiry, marking bookings `COMPLETED`, processing
the notification outbox) act as their own `actor_type = SYSTEM` for audit
purposes — they go through the same domain transition function as a human
actor would.

## AI Operations Agent (future)

Not a user role with direct data access. Acts only through authorized,
typed tools — see `docs/architecture/ai-agent.md`.
