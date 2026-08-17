# Backup & Recovery

**Implementation status (Phase 12): documented and concrete; not yet
_enabled_ anywhere** — there is no production Supabase project yet (see
`docs/operations/deployment.md`'s launch checklist), so there is nothing
to back up in production today. This doc is what to actually configure
the day that project exists, not a placeholder for someday.

## What to enable, once, on the production Supabase project

Supabase manages Postgres backups for you — this is dashboard
configuration, not application code:

1. **Automated daily backups** (Supabase dashboard → Database →
   Backups). Available on every paid Supabase plan; retention length
   depends on plan tier — check what your plan actually gives you and
   record it here once you know (this doc intentionally doesn't
   guess a number it can't confirm from this sandbox).
2. **Point-in-time recovery (PITR)**, if your plan includes it —
   lets you restore to any specific timestamp, not just the last daily
   snapshot. Matters most for a payments-and-bookings app: a bad
   migration or a data-corruption bug caught an hour after it happened
   shouldn't cost a full day of real bookings.
3. Note the actual retention window and RPO/RTO your plan gives you
   once configured, and put the real numbers here — "backups exist" is
   not the same claim as "we can recover to within N minutes of data
   loss," and CLAUDE.md's rule against overclaiming applies to
   operational docs as much as to code.

## The restore procedure — and testing it for real

A backup that has never been restored should not be assumed to work.
Once the production project exists:

1. Trigger a restore into a **new, throwaway** Supabase project (never
   restore over the live production project to test the process) —
   Supabase's dashboard supports restoring a backup to a new project.
2. Point a local checkout's `DATABASE_URL` at the restored project and
   run the app's own verification suite against it for real:
   `pnpm typecheck && pnpm lint && pnpm test:integration` won't run
   against it directly (that always rebuilds a disposable test DB from
   migrations, by design — see `src/testing/db.ts`), but manually
   spot-check: can you query `bookings`, does `SELECT count(*) FROM
payments` match what you expect, does RLS still behave (sign in as a
   real test user and confirm they see only their own data)?
3. Time the whole exercise once, honestly, and write the real number
   here — that's your actual recovery time, not an estimate.
4. Re-run this drill periodically (e.g. quarterly) — infrastructure and
   data volume both change, and a restore procedure that worked once at
   a small data size is not guaranteed to still work later.

## What backups do NOT cover

- **Application code** — that's git + Vercel's deployment history (see
  `docs/operations/deployment.md`'s rollback procedure), not a database
  backup concern.
- **A bad migration already applied to production** — restoring from
  backup loses every booking/payment made since that backup ran, which
  is its own serious tradeoff. Prefer a forward-fixing migration (see
  the rollback procedure) unless data corruption genuinely leaves no
  other option — and that decision needs the explicit human approval
  CLAUDE.md requires for resetting/restoring the production database.

## Recovery point/time objectives

Left explicitly unstated (not zero-filled with a made-up number) until
there's a real production project with a real backup plan tier to size
these against — see item 3 above. Filling this in with a guess would be
exactly the kind of unverified claim CLAUDE.md rules out.
