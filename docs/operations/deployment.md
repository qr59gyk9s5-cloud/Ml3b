# Deployment (planned — not yet active)

## Target

- **Web:** Vercel (Next.js app + Vercel Cron for background jobs)
- **Database / Auth / Storage:** Supabase (PostgreSQL)
- **Environments:** LOCAL → STAGING/Preview (Vercel preview deploys +
  a separate Supabase project or branch) → PRODUCTION

The founder has no existing Vercel/Supabase accounts yet — account creation
and first deployment happen together when we reach Phase 12
(Production Readiness), with step-by-step guidance at that time.

## Rules

- All schema changes go through version-controlled migrations in
  `supabase/migrations/` — no manual production schema edits.
- Never deploy if critical tests fail, typecheck fails, the production
  build fails, a migration is unsafe, or a required secret is missing.
- Secrets live in Vercel/GitHub environment configuration, never in
  workflow YAML or source.
- No automatic merge or deploy of architecturally/security-significant
  changes without human review.

## Not yet defined

Rollback procedure, exact CI→CD trigger, and staging data policy get
written up concretely in Phase 12, once there's a real deployment to
document rather than a hypothetical one.
