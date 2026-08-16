# System Overview

## Stack

| Layer              | Choice                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Frontend + backend | Next.js (App Router), TypeScript strict mode, one deployable                                   |
| Database           | PostgreSQL via Supabase                                                                        |
| Auth               | Supabase Auth — email/password + Google + Apple OAuth                                          |
| ORM                | Drizzle (typed SQL, no schema/type drift)                                                      |
| Validation         | Zod at every server boundary                                                                   |
| Background jobs    | Vercel Cron → authenticated internal route handlers                                            |
| Payments           | Egyptian payment gateway (Paymob/Fawry — TBD when we reach that phase), authorize-then-capture |
| Testing            | Vitest (unit/domain/integration) + Playwright (E2E)                                            |
| Hosting            | Vercel (web) + Supabase (DB/Auth/Storage)                                                      |
| i18n               | English + Arabic (RTL) from the first release                                                  |

## Why a single Next.js app, not a monorepo

We have one deployable frontend+backend and no worker complex enough yet to
justify `apps/worker` + `packages/*` + Turborepo. Background jobs are
authenticated route handlers triggered by Vercel Cron, calling the same
domain services as interactive requests. Revisit this the moment a real
standalone worker process (e.g. a heavier AI agent runtime) justifies the
split — see [ADR-001](../adr/ADR-001-modular-monolith-single-nextjs-app.md).

## Layering

```
                CUSTOMERS / VENUE STAFF / ADMINS
                            │
                            ▼
              Next.js UI (App Router, mobile-first)
                            │
              Route Handlers / Server Actions  ◄── Zod validation, authz
                            │
              DOMAIN LAYER (framework-agnostic, src/domain/*)
              booking · availability · venue · authz · notifications · review
                            │
              Data access (Drizzle) — transactions, idempotency
                            │
                            ▼
                      PostgreSQL (Supabase)
              RLS + exclusion constraints + CHECK constraints
                            │
            ┌───────────────┼────────────────┐
            ▼               ▼                ▼
      outbox_events    audit_logs      booking_events
            │
            ▼
      Vercel Cron → notification dispatch (provider-abstracted)
            │
            ▼
      (Phase 13+) AI tool registry → Ops Agent (read-only first)
```

**Rule:** all booking-state-changing logic goes through one domain service
(`transitionBooking(...)` in `src/domain/booking`). Customer routes, venue
routes, admin routes, and (later) AI tools all call it — never duplicate
transition logic per caller.

## Folder layout

```
src/
  app/            Next.js routes — thin, no business logic
  domain/         booking, availability, venue, authz, notifications, review
  lib/
    db/           Drizzle schema + client
    auth/         Supabase session helpers
    notifications/ provider abstraction (in-app, email, future push/whatsapp)
    validation/   shared Zod schemas
    config/       env.ts, constants.ts — single source for enums/config
  components/     shared UI
  testing/        test utilities, factories
supabase/
  migrations/
  seed/
docs/
  product/  architecture/  security/  operations/  adr/
```

See `docs/architecture/database.md`, `authorization.md`, `notifications.md`,
`background-jobs.md`, and `ai-agent.md` for the layers this diagram
compresses.
