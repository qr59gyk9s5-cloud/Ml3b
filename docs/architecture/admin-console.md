# Admin console

Phase 11 (extended in Phase 12). Cross-cutting platform-admin tools:
venue approval/moderation, exceptional booking correction, user
suspension, admin access management, a system-health overview, and the
audit trail those actions write to. Everything here sits behind
`/admin/*`, gated server-side in `src/app/admin/layout.tsx` (redirects a
non-admin) — every domain-layer call underneath re-checks
`isPlatformAdmin` itself too, per CLAUDE.md's "authorization is
server-side, always, never just a hidden UI element."

**Implementation status: real**, not a stub — schema, RLS, domain logic,
and UI all actually work. What's deliberately _not_ built is called out
below, not silently missing.

## System health overview

`/admin` (the console's landing page, not a redirect) —
`getSystemHealthSummary()` (`src/domain/admin/queries.ts`) surfaces
pending venue approvals, and counts of `outbox_events`/`notifications`
rows stuck `status='FAILED'`, closing the gap
`docs/operations/monitoring.md` originally flagged as "no dashboard
yet." Deliberately just counts, not the rows themselves — a health
signal to notice something's wrong, not a place to investigate from;
that's still a direct database query today.

## Venue approval & moderation

Not new machinery — `src/domain/venue/lifecycle.ts`'s
`transitionVenueStatus()` (built in Phase 3) already enforced
`PENDING_REVIEW -> ACTIVE` and `ACTIVE <-> SUSPENDED` as admin-only. Phase
11 adds:

- `/admin/venues` — the approval queue (`PENDING_REVIEW`) plus every
  other venue with status controls.
- A mandatory reason when suspending (`ACTIVE -> SUSPENDED`) — approving
  or reactivating isn't a "why" moment worth mandating.
- Every admin-performed transition (not an owner/manager's own routine
  ones) writes an `audit_logs` row: `VENUE_ACTIVE`, `VENUE_SUSPENDED`,
  `VENUE_ARCHIVED`, etc.

## Admin override of booking state

`docs/architecture/authorization.md`'s "Admin override, specifically":
exceptional correction only, never a substitute for the normal
confirm/reject/cancel flow (which admin can already do, being counted as
venue staff for authorization purposes — see `isVenueStaffForBooking`).

The booking state machine (`src/domain/booking/state-machine.ts`) had no
edges leaving a terminal status at all before this phase — deliberately,
per its own doc comment. Phase 11 adds exactly six, all gated to
`isPlatformAdminCtx`:

```
EXPIRED               -> REQUESTED
REJECTED               -> REQUESTED
CANCELLED_BY_CUSTOMER  -> REQUESTED
CANCELLED_BY_VENUE     -> REQUESTED
NO_SHOW                -> COMPLETED
COMPLETED              -> NO_SHOW
```

`transitionBooking()` requires a free-text `overrideReason` whenever the
actor is an admin transitioning _out of_ a status
`isTerminalBookingStatus()` considers terminal — that's what makes it an
override rather than a normal transition — and writes both:

- `booking_events` (`actor_type=ADMIN`, same as any other admin action)
- `audit_logs` (`action: 'BOOKING_OVERRIDE'`, `metadata: {from, to, reason}`)

Reopening to `REQUESTED` also resets `expires_at` to a fresh
`BOOKING_REQUEST_EXPIRY_MINUTES` window and clears `responded_at` —
without that, the expiry cron
(`src/domain/booking/expire.ts`) would just re-expire the reopened
booking on its next run, since it only checks
`status='REQUESTED' AND expires_at < now()`.

**Known, flagged gap:** reopening a booking does not re-run the payment
authorize/capture/release flow (`src/domain/payments/service.ts`) — a
booking that was released (its hold dropped) and then reopened does not
get a fresh authorization. This is moot today since the real Fawry
provider is itself a stub (`docs/architecture/payments.md`), but is a
real design question for whoever wires Fawry up for real: should
reopening a booking re-authorize payment automatically, or require the
customer to re-confirm? Not decided here — flagged, not silently picked.

## User suspension

`docs/architecture/authorization.md`'s "Suspend user" matrix row — a
real, reversible admin action, deliberately distinct from a permanent
ban. CLAUDE.md's forbidden-without-approval list still gates _banning_
users behind explicit human sign-off; nothing resembling a permanent ban
is built here.

- `profiles.suspended_at` / `suspended_reason` / `suspended_by` — a
  single current state, not an append-only grant list like
  `platform_admins` (the "who did this and why" history lives in
  `audit_logs`, not on the row itself).
- `src/domain/admin/users.ts`'s `suspendUser`/`unsuspendUser` — admin
  only, reason required to suspend, can't suspend yourself, can't
  suspend another platform admin (revoking admin access is a separate,
  separately-audited step — see "Managing admin access" below).
- **Enforcement**: `src/domain/admin/suspension.ts`'s `isUserSuspended()`
  is checked as a blanket precondition — independent of the normal
  role/ownership `allow` checks — in `createBookingRequest`,
  `transitionBooking`, and `transitionVenueStatus`. A suspended account
  can create no booking and make no venue-lifecycle move, admin override
  included. This does **not** touch Supabase Auth sign-in itself (out of
  this app's control at the auth layer); a suspended user can still sign
  in and browse, they just can't write. `SuspendedBanner`
  (`src/components/suspended-banner.tsx`) tells them why, honestly —
  UI-only, never the enforcement mechanism.
- **RLS gotcha worth remembering**: the existing `profiles_update_own`
  RLS policy is row-level ("a user may edit their own row"), so it alone
  would let a suspended user simply write `suspended_at = null`
  themselves through a direct Supabase client call. Column-level
  `REVOKE`/`GRANT` (`0013_admin_domain_rls.sql`) is what actually stops
  that — and a column-level `REVOKE` alone does **not** narrow a
  table-level `GRANT` in Postgres (a real, easy-to-miss gotcha: column
  privileges are purely additive on top of table-level ones). The fix is
  `REVOKE UPDATE` on the whole table from `authenticated`, then
  `GRANT UPDATE` back for only the columns a user should self-edit
  (`full_name`, `phone`, `avatar_url`, `updated_at`) — never
  `suspended_at`/`suspended_reason`/`suspended_by`.

## Managing admin access

`/admin/admins` — grant by email (must already have an account) and
revoke, both fully audited (`ADMIN_GRANTED`/`ADMIN_REVOKED`).
`revokePlatformAdmin` refuses two cases regardless of who's asking:
revoking your own access (avoids an accidental self-lockout mid-click),
and revoking the very last remaining admin (avoids a total lockout with
nobody left who can grant it back in — that would need a direct
database fix outside the app). `suspendUser` still separately refuses to
act on an admin account — revoking admin access is a deliberately
distinct, separately-audited step from suspension, never folded into
one action.

## Audit log

`docs/architecture/database.md`'s `audit_logs` table, built for real in
this phase. `src/domain/audit/log.ts`'s `recordAuditLog()` is the only
writer — and deliberately **not** best-effort like the notifications
outbox: an admin override without a surviving audit record is a silent
admin edit, which CLAUDE.md rules out entirely, so a failure here
propagates like any other write in the same call.

- RLS: admin-only `select`, no `insert`/`update`/`delete` policy at all
  — written only via the privileged app connection, and never edited or
  deleted once written.
- `/admin/audit-log` — newest first, filterable by resource type.
- Scope: every admin-performed venue-moderation transition, booking
  override, user suspend/unsuspend, and admin grant/revoke. Ordinary
  admin actions that don't need special accountability (e.g. an admin
  confirming a `REQUESTED` booking exactly as venue staff would) are
  **not** logged here — `booking_events` already records those with
  `actor_type=ADMIN`.
- The two read-path matrix rows are now instrumented too:
  `getBookingById` (`src/domain/booking/queries.ts`) logs
  `BOOKING_VIEWED_BY_ADMIN` and `getVenueByIdForStaff`
  (`src/domain/venue/staff-queries.ts`) logs
  `VENUE_DATA_ACCESSED_BY_ADMIN` — but only when access came purely from
  being an admin (`ctx.isPlatformAdmin` true and the actual
  ownership/membership check false), never for the genuine owner/staff/
  customer's own everyday access to their own data. Every _other_ read
  path (e.g. `listBookingsForVenueWithDetails`) still isn't
  instrumented — auditing literally every admin read would mean
  touching every query function for a benefit that's marginal once the
  two highest-value ones (a specific booking, a specific venue) are
  covered. Flagged as a real, narrower-than-total gap, not silently
  dropped.
