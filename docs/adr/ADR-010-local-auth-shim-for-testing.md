# ADR-010: A Local-Only Auth Shim for Testing Migrations and RLS

**Date:** 2026-08-16
**Status:** Accepted

## Context

Our migrations and RLS policies depend on Supabase's `auth` schema
(`auth.users`, `auth.uid()`). A real Supabase project provides this
automatically; the full local Supabase stack (`supabase start`) also
provides it, but requires Docker, which wasn't available in this
environment. CLAUDE.md requires integration tests against a real
Postgres for anything touching the database — not mocks — and RLS
policies are exactly the kind of thing that looks correct and is wrong
until it's exercised against a real access-controlled session.

## Decision

`src/testing/sql/local-auth-shim.sql` recreates the minimum Supabase
surface our code depends on — a minimal `auth.users` table, an
`auth.uid()` function reading `request.jwt.claims` (the same mechanism
Supabase itself uses), and the `authenticated`/`anon` roles — against a
plain, unmanaged Postgres instance. `src/testing/db.ts` applies it before
running our real migrations, so integration tests get a schema that
behaves like a real Supabase project for the things that matter (RLS,
triggers, FKs to `auth.users`), without needing Docker or a live Supabase
project. Tests simulate a logged-in user by switching the Postgres session
role and setting `request.jwt.claims` inside a transaction that's always
rolled back (`asUser()` in `src/testing/db.ts`).

CI uses a plain `postgres:16` service container and the same shim — not a
Supabase-provided environment — for the same reason.

## Alternatives considered

- **Mock the database in tests** — explicitly rejected by CLAUDE.md's
  testing expectations. A mock can't catch a broken RLS policy (see the
  infinite-recursion bug this exact test suite caught during Phase 2 —
  self-referencing policies on `platform_admins`/`venue_members` needed
  `SECURITY DEFINER` helper functions; no mock would have surfaced that).
- **Require Docker/`supabase start` for all local dev and CI** — the more
  complete option (real GoTrue, Studio, etc.), but a heavier requirement
  than schema/migration/RLS work actually needs, and unavailable in this
  environment. Documented in `docs/operations/local-development.md` as
  the fuller alternative once Docker is available.

## Advantages

Real Postgres, real RLS enforcement, real constraint violations — caught
in CI on every PR, not discovered in staging. No dependency on a live
Supabase project existing yet (the founder has none — see Phase 0 Q20).

## Disadvantages

The shim's `auth.users` is deliberately minimal and doesn't match a real
Supabase project's actual columns (`encrypted_password`, `instance_id`,
etc.) — it's not a substitute for testing against a real project before
launch, only for local/CI schema and authorization correctness. Clearly
banner-commented as test-only in every file that touches it, and never
referenced from `supabase/migrations/` (the real, deployable migration
history) or `scripts/migrate.ts` (which targets `DATABASE_URL`, i.e. a
real project).

## Consequences

Before Phase 12 (production readiness), run the full migration set
against an actual Supabase project at least once to confirm the shim's
simplifications didn't hide anything — the shim reduces but doesn't
eliminate that risk.
