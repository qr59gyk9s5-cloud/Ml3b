/**
 * Shared "is this account currently suspended" lookup — reused by
 * src/domain/booking/authz-context.ts and src/domain/venue/authz-context.ts
 * so a suspended user is blocked from mutating anything through either
 * domain, not just one. Fetched fresh every call, same discipline as
 * every other authz lookup in this codebase — never trust a cached flag.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema';

export async function isUserSuspended(userId: string): Promise<boolean> {
  const db = getDb();
  const [profile] = await db
    .select({ suspendedAt: profiles.suspendedAt })
    .from(profiles)
    .where(eq(profiles.id, userId));
  return profile?.suspendedAt != null;
}
