# Deployment

## Target

- **Web:** Vercel (Next.js app + Vercel Cron for background jobs)
- **Database / Auth / Storage:** Supabase (PostgreSQL)
- **Environments:** LOCAL → STAGING/Preview (Vercel preview deploys +
  a separate Supabase project or branch) → PRODUCTION

**Vercel, specifically**, was also connected earlier than the original
Phase 12 plan called for, alongside Supabase — the founder needed an
actual clickable preview to test Phase 6 against, not just this dev
sandbox (which cannot reach the public internet for arbitrary hosts; see
the network-policy note below). This is a Preview deployment off the
`claude/sports-venue-booking-marketplace-qb3u37` branch, not a production
launch — a real Vercel/Supabase production setup with its own accounts,
custom domain, monitoring, and backups is still Phase 12's job.

**Supabase, specifically**, was connected earlier than that, in Phase 6 —
`src/lib/auth` (ADR-005) needs a real Auth provider to build sign-in UI
against, not just the schema/RLS work Phases 2–5 already exercise against
a plain local Postgres (ADR-010). This one project is dev-only for now:
its `DATABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`/keys live in this
environment's own `.env.local`, never committed. A separate
STAGING/PRODUCTION Supabase project still gets created at Phase 12, not
reused from this one.

## Rules

- All schema changes go through version-controlled migrations in
  `supabase/migrations/` — no manual production schema edits.
- Never deploy if critical tests fail, typecheck fails, the production
  build fails, a migration is unsafe, or a required secret is missing.
- Secrets live in Vercel/GitHub environment configuration, never in
  workflow YAML or source.
- No automatic merge or deploy of architecturally/security-significant
  changes without human review.

## A note on this session's own network access

The Claude Code sandbox this work was done in cannot reach arbitrary
external hosts (an org-level egress allowlist that doesn't include
`supabase.co`, and raw Postgres connections are unsupported through its
proxy entirely, regardless of host). Practical consequence: the initial
migration set for the Phase 6 Supabase project was applied by hand,
once, via the Supabase SQL Editor (a combined script generated from
`supabase/migrations/*.sql`) rather than `pnpm db:migrate` from this
session. `pnpm db:migrate` remains the real, idempotent source of truth
for every migration after that — it tracks what's applied in
`public._migrations`, which the combined script populated to match, so
it stays a correct no-op if run from an environment that can reach the
database (a normal dev machine, or CI).

## Not yet defined

Rollback procedure, exact CI→CD trigger, and staging data policy get
written up concretely in Phase 12, once there's a real production
deployment to document rather than this dev/preview one.
