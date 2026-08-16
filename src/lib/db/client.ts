/**
 * The one Drizzle client for the app. Import `db` from here — never create a
 * second connection pool elsewhere.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/config/env';
import * as schema from './schema';

function createClient() {
  if (!env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and point it at your local Postgres — see docs/operations/local-development.md.',
    );
  }
  const queryClient = postgres(env.DATABASE_URL, { max: 10 });
  return drizzle(queryClient, { schema });
}

let cached: ReturnType<typeof createClient> | undefined;

export function getDb() {
  if (!cached) {
    cached = createClient();
  }
  return cached;
}
