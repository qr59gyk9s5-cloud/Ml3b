/**
 * Resolves "who is making this request" from the Supabase session into
 * the actor shape src/domain/authz consumes (userId + isPlatformAdmin —
 * see BookingActor/VenueActor). The one place `auth.getUser()` is called
 * outside src/lib/auth itself — nothing else in the app reaches into
 * Supabase directly.
 *
 * Deliberately uses getUser(), not getSession(): getUser() revalidates
 * the JWT against the Auth server on every call, where getSession() only
 * decodes whatever's in the local cookie — which a tampered client could
 * have altered. Slightly slower, always trustworthy. See Supabase's own
 * Next.js SSR guidance.
 *
 * Wrapped in React's cache() because both src/app/layout.tsx (for the
 * bottom tab bar) and src/components/site-header.tsx call this per
 * request now — without cache() that's two getUser() round trips plus
 * two profile/admin lookups per page load instead of one.
 */
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { platformAdmins, profiles, type Profile } from '@/lib/db/schema';
import { createServerSupabaseClient, isSupabaseConfigured } from './server';

export interface SessionActor {
  userId: string;
  email: string | null;
  profile: Profile | null;
  isPlatformAdmin: boolean;
}

export const getSessionActor = cache(async (): Promise<SessionActor | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  const [admin] = await db.select().from(platformAdmins).where(eq(platformAdmins.userId, user.id));

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    isPlatformAdmin: Boolean(admin),
  };
});
