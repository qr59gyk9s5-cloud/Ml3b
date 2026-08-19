/**
 * The one Drizzle client for the app. Import `getDb()` from here — never
 * create a second connection pool elsewhere.
 *
 * `max` and `prepare` below are tuned for serverless (Vercel), not a
 * long-running server — this bit us in production (2026-08-19): Vercel
 * can run several concurrent instances of the same route, and each one
 * gets its own module-level `queryClient` (Node module state isn't
 * shared across serverless instances). At the old `max: 10`, just two
 * concurrent instances could open 20 connections against Supabase's
 * session-mode pooler, whose cap is a fixed 15 total — the third
 * request in got `EMAXCONNSESSION: max clients reached in session mode`
 * and every query on that instance failed until it recycled. `max: 3`
 * keeps a single instance's worst case well under that ceiling even
 * with several instances live at once; it does NOT fix a `DATABASE_URL`
 * that points at the session-mode pooler under real sustained
 * concurrency — see docs/operations/deployment.md for switching the
 * production connection string to Supabase's transaction-mode pooler
 * (port 6543), which is what's actually designed for many short-lived
 * serverless connections.
 *
 * `prepare: false` disables postgres.js's prepared-statement caching.
 * Required if `DATABASE_URL` ever points at the transaction pooler
 * (PgBouncer transaction mode has no session to hold a prepared
 * statement in) — harmless against a direct/session connection, so it's
 * set unconditionally rather than branching on which URL is configured.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/config/env';
import * as schema from './schema';

let queryClient: postgres.Sql | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!db) {
    if (!env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env.local and point it at your local Postgres — see docs/operations/local-development.md.',
      );
    }
    queryClient = postgres(env.DATABASE_URL, { max: 3, prepare: false });
    db = drizzle(queryClient, { schema });
  }
  return db;
}

/**
 * Closes the underlying connection pool. The long-running Next.js server
 * never needs this — it's for one-shot scripts (scripts/migrate.ts,
 * supabase/seed/seed.ts) that call getDb() and must exit cleanly instead
 * of hanging on an open pool.
 */
export async function closeDb() {
  if (queryClient) {
    await queryClient.end({ timeout: 5 });
    queryClient = undefined;
    db = undefined;
  }
}
