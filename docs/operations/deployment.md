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

## Known build issue: `next build` crashes on `/_global-error` (Next.js 16)

`next build` fails during static-page generation with:

```
Error occurred prerendering page "/_global-error".
TypeError: Cannot read properties of null (reading 'useContext')
```

This is a confirmed, still-open upstream Next.js 16 bug — reproduces on
a completely stock app with no custom `global-error.tsx` at all
(vercel/next.js#86178, #84994, #95741, discussion #94667). Verified
in this repo, not assumed:

- Reproduces identically on a fresh `pnpm install` from the committed
  lockfile (not a corrupted local `node_modules`).
- Reproduces on both Next 16.3.0 and 16.3.1.
- Reproduces with both Turbopack and `next build --webpack`.
- `export const dynamic = 'force-dynamic'` on `global-error.tsx` (a
  commonly-cited workaround) does **not** fix it here — tried and
  confirmed ineffective, though it's still set (see that file) since
  it's independently correct regardless.
- `experimental.cpus: 1` (forcing single-worker generation) does not
  fix it either — the community report that tried this found the crash
  just relocates to `/_global-error` itself.

**The one thing that does work:** `next build --debug-prerender`. This
is a real Next.js flag, but the CLI itself warns "Not for production
use!" — it disables minification and `prerenderEarlyExit`, and runs the
prerender pass under development-mode semantics. It is a workaround to
unblock seeing a working deploy now, not a permanent fix.

**What this means for deploying right now:** until upstream ships a
fix, getting an actual deployable build (Preview or Production) requires
overriding Vercel's Build Command for this project (Vercel dashboard →
Project → Settings → Build & Development Settings) to:

```
next build --debug-prerender
```

Revert this the moment a Next.js patch release fixes the underlying
bug — check the linked issues periodically. This was a decision flagged
to the founder rather than silently baked into `package.json`'s `build`
script, since it trades away real production-build guarantees
(minification, the normal optimized prerender path) for the sake of
being deployable today.

## Production launch checklist (Phase 12)

Everything below needs a real account/domain/payment method — none of
it can be done from a Claude Code sandbox session, and it's exactly the
kind of decision CLAUDE.md says never to make silently. This is the
concrete list of what the founder does, once, outside this repo:

1. **Create a separate, real production Supabase project** — do not
   reuse the dev project this app has been developed against so far.
   Mixing real customer/booking/payment data with dev seed data in the
   same project is a data-integrity risk (CLAUDE.md's priority order
   puts data integrity above almost everything).
2. Apply every migration in `supabase/migrations/` to the new project,
   in order, via its SQL Editor (the same one-time-by-hand pattern this
   session used for the dev project — see the note above — or
   `pnpm db:migrate` from any machine/CI runner that can actually reach
   it, which this sandbox cannot).
3. Grant your own account a `platform_admins` row on the production
   project — nothing else creates the first admin.
4. In Vercel: create/point a **Production** deployment (not another
   Preview) at the `main` branch, with its own environment variables
   pointing at the production Supabase project (`DATABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`), a freshly-generated `CRON_SECRET`
   (different from the dev one), and `NEXT_PUBLIC_APP_URL` left unset so
   it's inferred from the real production domain (`src/lib/config/env.ts`).

   **`DATABASE_URL` must use Supabase's transaction-mode pooler, not the
   session-mode one.** Supabase's connection string page shows several
   options — pick the one labeled "Transaction" (port `6543`), not
   "Session" (port `5432`) or the direct connection. Session mode caps
   out at a small fixed number of total clients across the whole
   project; Vercel runs several concurrent serverless instances of the
   same route, each holding its own connection pool (`src/lib/db/
client.ts`), and session mode's cap gets exhausted fast under any
   real concurrent traffic — confirmed live on the dev project
   (`EMAXCONNSESSION: max clients reached in session mode`) the day
   before this was written. Transaction mode is what Supabase actually
   recommends for serverless/edge deployments and doesn't have this
   ceiling the same way.

5. Connect your real custom domain in Vercel's project settings (Domains
   tab) and update DNS at your registrar — Vercel's own docs walk
   through this per-registrar.
6. **Turn on Google + Apple sign-in** — the app side is already fully
   built (ADR-005: `src/components/auth/oauth-buttons.tsx`,
   `signInWithOAuthAction` in `src/app/(auth)/actions.ts`, the PKCE
   callback at `src/app/auth/callback/route.ts`; both buttons already
   render on `/sign-in` and `/sign-up`). What's left is two external
   registrations only the founder's identity can create — no amount of
   backend access substitutes for this, it's not a config file:
   - **Google**: in Google Cloud Console, create an OAuth 2.0 Client ID
     (OAuth consent screen → Credentials → Create Credentials → OAuth
     client ID → Web application). Authorized redirect URI is your
     Supabase project's `https://<project-ref>.supabase.co/auth/v1/callback`.
   - **Apple**: requires an active Apple Developer Program membership
     (paid, tied to the founder's Apple ID/legal entity). Create a
     Services ID with "Sign in with Apple" enabled, a Sign in with
     Apple key, and register the same Supabase callback URL as a
     verified return URL.
   - Paste both providers' client ID + secret into the **production**
     Supabase project's dashboard → Authentication → Providers →
     Google / Apple, and toggle each on. Do this on the real production
     project from step 1, not the dev project.
   - This session currently has no Supabase or Vercel MCP connector
     attached, so even with credentials in hand this step can't be
     done from here — it's ~10 minutes by hand in both dashboards.
7. Enable Vercel Analytics and Speed Insights for the project (Vercel
   dashboard → project → Analytics/Speed Insights tabs) — the
   `<Analytics />`/`<SpeedInsights />` components are already wired into
   `src/app/layout.tsx` and no-op until you do this. See
   `docs/operations/monitoring.md`.
8. Confirm Vercel Cron is enabled for the project (Hobby plan: once
   daily, matching `vercel.json`'s schedule; a paid plan allows the
   background-jobs doc's originally-intended cadence — see
   `docs/architecture/background-jobs.md`).
9. Set up Supabase's own automated backups / point-in-time recovery for
   the production project (Supabase dashboard → Database → Backups) —
   see `docs/operations/backup-recovery.md` for what to actually
   configure and how to verify it.
10. Once real traffic exists, watch `/api/health`
    (`src/app/api/health/route.ts`) and Vercel's Logs for the first
    while — see `docs/operations/monitoring.md`.

## Rollback procedure

Two different failure shapes, two different responses:

- **A bad deploy (app code)**: Vercel keeps every previous deployment.
  From the Vercel dashboard → Deployments, find the last known-good one
  and use "Promote to Production" — this is instant (no rebuild) and is
  the fastest way back to a working state. Fix forward on a new commit
  afterward; don't leave `main` broken.
- **A bad migration (schema)**: never roll back by editing/deleting the
  migration file that already ran — `supabase/migrations/` is an
  append-only history (CLAUDE.md: no rewriting migration history that's
  already been applied anywhere real). Instead:
  1. Write a new, forward migration that undoes the specific change
     (e.g. `ALTER TABLE ... DROP COLUMN` for a column added by mistake,
     or a data-fixup `UPDATE` for bad data written by a bug).
  2. Apply it the same way every migration gets applied to production
     (SQL Editor, by hand, tracked in `_migrations` — see above).
  3. If the bad migration already ran against real booking/payment data,
     treat it as an incident, not just a schema fix — see
     `docs/operations/incident-response.md`.
- A **destructive rollback** (dropping/truncating a table, restoring
  from backup over current data) is not something to reach for casually
  — it is explicitly in CLAUDE.md's forbidden-without-human-approval
  list ("deleting/resetting the production database"). Get explicit
  approval first, always.

## Staging data policy

The dev/Preview Supabase project this repo has been built against so
far continues to serve exactly that purpose after production launch —
Preview deployments (any non-`main` branch) keep pointing at it, seeded
with fake data via `pnpm db:seed`. Production data (real customers, real
bookings, real payments once Fawry is live) never gets copied into it,
and dev/seed data never gets copied into production. If a real
production bug needs investigating with realistic data, reproduce it
with fresh synthetic data in dev — don't pull real customer data out of
production to do it.
