# ADR-005: Supabase Auth (Email/Password + Google + Apple)

**Date:** 2026-08-16
**Status:** Accepted

## Context

We need secure authentication without building a custom auth system
(explicitly out of scope per the founder spec). We're already using
Supabase for Postgres, so its Auth product integrates directly with RLS
via `auth.uid()`.

## Decision

Supabase Auth with email/password as the baseline method, plus Google and
Apple OAuth sign-in (founder-requested, both natural for the target
market's device mix).

## Alternatives considered

- **Phone OTP as the primary method** — more natural for an Egypt-based
  audience but adds SMS provider cost/complexity and an extra external
  dependency before the core loop is validated. Not chosen for MVP; can be
  added later behind the same Supabase Auth integration.
- **Custom auth** — explicitly rejected per the founder spec's
  non-negotiable rules.

## Advantages

Managed sessions, password reset, and OAuth flows; direct RLS integration;
no custom credential storage to secure.

## Disadvantages

Ties the auth layer to Supabase as a vendor. Acceptable — we're already
committed to Supabase for the database.

## Consequences

`profiles` is a 1:1 extension of `auth.users`, never a replacement for it.
Session handling lives in `src/lib/auth`, never reimplemented per route.
