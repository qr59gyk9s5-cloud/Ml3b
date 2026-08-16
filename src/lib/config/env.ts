/**
 * Centralized, validated environment configuration.
 *
 * Nothing in this codebase should read `process.env.*` directly outside this
 * file — import `env` instead. That keeps every required variable documented
 * in one place, fails fast (at startup, not mid-request) when something is
 * missing, and stops secrets from being referenced ad hoc across the app.
 *
 * Server-only secrets (anything without NEXT_PUBLIC_) must never be imported
 * from a file that ships to the browser.
 */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // --- Public (browser-safe) ---
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(['en', 'ar']).default('en'),

  // --- Supabase (wired up in Phase 2 — optional for now so Phase 1 tooling
  //     doesn't require secrets that don't exist yet) ---
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration — see logged field errors above.');
  }

  return parsed.data;
}

export const env = loadEnv();
