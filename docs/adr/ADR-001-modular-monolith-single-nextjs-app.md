# ADR-001: Modular Monolith, Single Next.js App (Not a Monorepo)

**Date:** 2026-08-16
**Status:** Accepted

## Context

The master spec sketches a possible `apps/{web,worker}` + `packages/*`
monorepo. We have one deployable frontend+backend (Next.js) and, for MVP,
no background-job workload heavy enough to need a standalone worker
process.

## Decision

Single Next.js app with an internal modular structure
(`src/app`, `src/domain`, `src/lib`, `src/components`). Background jobs run
as Vercel Cron hitting authenticated internal route handlers that call the
same domain services as interactive requests.

## Alternatives considered

- **Turborepo monorepo with `apps/web` + `apps/worker`** — the spec's
  suggested shape. Rejected for now: adds workspace tooling, cross-package
  versioning, and CI complexity with no current payload that needs a
  separate runtime.
- **Separate services (booking API, notification service, etc.)** — full
  microservices. Explicitly rejected per the founder spec's non-negotiable
  "do NOT start with microservices."

## Advantages

Simpler CI, one deploy target, no workspace/package-boundary overhead,
faster iteration for a pre-revenue MVP.

## Disadvantages

If background job volume grows significantly (e.g. the AI agent runtime in
Phase 13+, or heavy notification fan-out), Vercel Cron + route handlers may
become a bottleneck or awkward fit.

## Consequences

Revisit this decision — split into a real worker app — when job execution
time or complexity genuinely outgrows a cron-triggered route handler, not
preemptively. Domain logic already lives in framework-agnostic `src/domain`
modules, so extracting a worker later doesn't require rewriting business
logic, only moving its caller.
