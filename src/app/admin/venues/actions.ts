'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionActor } from '@/lib/auth/session';
import { transitionVenueStatus } from '@/domain/venue/lifecycle';
import { DomainError } from '@/domain/errors';
import type { VenueStatus } from '@/lib/config/constants';

async function runTransition(formData: FormData, targetStatus: VenueStatus) {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/venues');
  if (!actor.isPlatformAdmin) redirect('/');

  const venueId = String(formData.get('venueId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  try {
    await transitionVenueStatus({
      venueId,
      targetStatus,
      actor: { userId: actor.userId, isPlatformAdmin: true },
      reason: reason || undefined,
    });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`/admin/venues?error=${encodeURIComponent(message)}`);
  }
  // '/' too — approving/suspending/archiving flips whether this venue
  // shows up in the public listing, not just the admin table.
  revalidatePath('/admin/venues');
  revalidatePath('/');
  redirect(`/admin/venues?done=1`);
}

export async function approveVenueAction(formData: FormData) {
  await runTransition(formData, 'ACTIVE');
}

export async function suspendVenueAction(formData: FormData) {
  await runTransition(formData, 'SUSPENDED');
}

export async function reactivateVenueAction(formData: FormData) {
  await runTransition(formData, 'ACTIVE');
}

export async function archiveVenueAction(formData: FormData) {
  await runTransition(formData, 'ARCHIVED');
}
