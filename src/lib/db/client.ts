/**
 * The one Drizzle client for the app. Import `getDb()` from here — never
 * create a second connection pool elsewhere.
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
    queryClient = postgres(env.DATABASE_URL, { max: 10 });
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
