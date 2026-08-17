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

  // --- Background jobs (Phase 8) — authenticates Vercel Cron's calls into
  //     src/app/api/cron/*; see docs/architecture/background-jobs.md.
  //     Optional so local tooling doesn't require a secret nothing calls yet.
  CRON_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * NEXT_PUBLIC_APP_URL is used to build absolute redirect URLs (OAuth,
 * email-confirmation links — see src/app/(auth)/actions.ts). On Vercel,
 * infer it instead of requiring it to be hand-set and kept in sync on
 * every deploy: VERCEL_BRANCH_URL is a *stable* domain for a given
 * branch's Preview deployments (unlike VERCEL_URL, which is unique per
 * deployment and changes on every push). An explicit NEXT_PUBLIC_APP_URL
 * always wins, for a real custom domain in production.
 */
function inferAppUrl(): string | undefined {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse({
    ...process.env,
    NEXT_PUBLIC_APP_URL: inferAppUrl(),
  });

  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration — see logged field errors above.');
  }

  return parsed.data;
}

export const env = loadEnv();
