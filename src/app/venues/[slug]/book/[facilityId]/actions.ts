'use server';

/**
 * The customer-facing "request this slot" action. Re-derives the actor
 * from the session server-side (getSessionActor(), cookie-backed) rather
 * than trusting anything the form posted — a hidden userId field would
 * let any client claim to be anyone (CLAUDE.md: "never trust the
 * client"). All real validation (facility/venue active, duration,
 * availability) happens inside createBookingRequest() itself; this is
 * just the HTTP-shaped wrapper around it.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionActor } from '@/lib/auth/session';
import { createBookingRequest } from '@/domain/booking/create-request';
import { DomainError } from '@/domain/errors';

export async function requestBookingAction(formData: FormData) {
  const actor = await getSessionActor();
  const venueSlug = String(formData.get('venueSlug') ?? '');
  const facilityId = String(formData.get('facilityId') ?? '');
  const date = String(formData.get('date') ?? '');
  const bookingPath = `/venues/${venueSlug}/book/${facilityId}?date=${date}`;

  if (!actor) {
    redirect(`/sign-in?next=${encodeURIComponent(bookingPath)}`);
  }

  const startAtRaw = formData.get('startAt');
  const durationRaw = formData.get('durationMinutes');
  const idempotencyKeyRaw = formData.get('idempotencyKey');

  try {
    await createBookingRequest(
      { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin },
      {
        facilityId,
        startAt: new Date(String(startAtRaw)),
        durationMinutes: Number(durationRaw),
        idempotencyKey: idempotencyKeyRaw ? String(idempotencyKeyRaw) : undefined,
      },
    );
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`${bookingPath}&error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/bookings');
  revalidatePath(`/venues/${venueSlug}/book/${facilityId}`);
  redirect('/bookings?requested=1');
}
