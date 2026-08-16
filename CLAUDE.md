@AGENTS.md

# Sports Venue Booking Marketplace — CLAUDE.md

Operational guide for any Claude Code session working in this repo. This is
a real business, not a demo — booking correctness and security outrank
speed. Full architecture lives in `docs/`; this file is the map, not the
territory.

## What this is

A marketplace where customers request bookings for sports facilities
(pitches, courts) inside venues, venues confirm/reject, and a
database-enforced booking engine guarantees no double-booking. Launch
market: Cairo, Egypt. UI ships bilingual (English/Arabic, RTL) from day
one. See `docs/product/product-overview.md`.

## Repository structure

```
src/app/          Next.js routes — thin, no business logic
src/domain/        booking, availability, venue, authz, notifications, review
src/lib/           db (Drizzle), auth (Supabase), notifications, validation, config
src/components/    shared UI
src/testing/       test utilities
supabase/          migrations/, seed/  (created starting Phase 2)
docs/              product/, architecture/, security/, operations/, adr/
```

## Non-negotiable architecture rules

- **All booking state transitions go through one domain service**
  (`src/domain/booking`, `transitionBooking(...)`). Customer, venue,
  admin, and (later) AI-agent call sites must not duplicate transition
  logic.
- **Double-booking prevention is a database guarantee**, not just
  application code — the Postgres exclusion constraint on `bookings` (see
  `docs/architecture/database.md#concurrency`) is the actual source of
  truth. Never remove or weaken it to work around a bug; fix the bug.
- **AI never becomes the source of truth.** It cannot decide facility
  existence, ownership, conflicts, availability, legal transitions, money
  owed, permissions, or payment success. See `docs/architecture/ai-agent.md`.
- **Authorization is server-side, in `src/domain/authz`, always.** UI
  hiding a control is never the enforcement mechanism. See
  `docs/architecture/authorization.md` for the full matrix.
- **Money is integer minor units** (`*_minor`), never floats.
- **Env vars are read only through `src/lib/config/env.ts`.** No scattered
  `process.env.*`. Domain constants (statuses, roles, policy numbers) come
  from `src/lib/config/constants.ts`, not hardcoded literals.
- **Never trust the client.** Every mutation revalidates ownership,
  permissions, and business rules server-side, regardless of what the UI
  allowed the user to select.

## Key business rules (see `docs/product/booking-flow.md` for detail)

- Booking uses fixed pre-set slots per facility, not freeform times.
- Requests auto-expire after 30 minutes if the venue doesn't respond.
- Customers cannot cancel within 2 hours of `start_at`; cancelling a
  confirmed booking outside that window refunds 50%, forfeits 50%.
- Venue-initiated cancellations use a fixed reason list — never free text.
- Payment is authorize-on-request, capture-on-confirm (see ADR-007) —
  payments are in MVP scope, not deferred.
- One review per customer per venue, ever — not per booking (ADR-009).

## Commands

```bash
pnpm dev / build / start
pnpm lint / format / format:check / typecheck
pnpm test / test:watch
```

## Git workflow

- Work happens on feature branches off `main`
  (`feat/…`, `fix/…`, `chore/…`, `docs/…`, `test/…`, `refactor/…`).
- Logical commits, descriptive messages (`feat: …`, `fix: …`, not "update").
- No secrets ever committed — `.env.example` only, real values in
  `.env.local` (gitignored). See `docs/security/secrets.md`.
- No force-push to `main`, no history rewrites, no auto-merge of
  architecturally/security-significant PRs, without explicit human
  approval.

## Testing expectations

Domain logic (state machine, availability, pricing) gets unit tests.
Anything touching the database — especially the double-booking exclusion
constraint and confirmation races — gets integration tests against a real
Postgres, not mocks. Authorization gets tested against the full matrix in
`docs/architecture/authorization.md`, not spot-checked. See
`docs/architecture/*` for what "done" requires per area.

## Forbidden without explicit human approval

Deleting/resetting the production database, force-pushing `main`,
rewriting git history, merging a major/security-sensitive PR, disabling
RLS or permission checks, exposing the service-role key, changing
commission logic, executing refunds, banning users/venues, deleting
booking/audit history, giving the AI agent unrestricted DB/shell/GitHub
access.

## Where to look next

- `docs/product/` — what we're building and why
- `docs/architecture/` — how it's built (system, database, authorization,
  notifications, background jobs, AI agent)
- `docs/security/` — threat model, secrets handling
- `docs/operations/` — local dev, deployment (deployment/monitoring/backup
  docs are placeholders until Phase 12)
- `docs/adr/` — the record of _why_ each major decision was made
