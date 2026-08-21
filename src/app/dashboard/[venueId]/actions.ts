'use server';

/**
 * Venue-staff Server Actions — confirm/reject a request. Re-derives the
 * actor from the session (never a hidden form field); transitionBooking()
 * itself re-checks staff membership at the booking's venue regardless of
 * which venueId the URL claims, so this can't be tricked into acting on
 * a booking at a venue the actor isn't staff at.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionActor } from '@/lib/auth/session';
import { transitionBooking } from '@/domain/booking/transition';
import { addVenueStaffMember, removeVenueStaffMember } from '@/domain/venue/staff';
import { addVenueStaffSchema } from '@/lib/validation/venue-staff';
import { DomainError } from '@/domain/errors';
import type { VenueCancellationReason } from '@/lib/config/constants';

export async function confirmRequestAction(formData: FormData) {
  const actor = await getSessionActor();
  const venueId = String(formData.get('venueId') ?? '');
  if (!actor) redirect(`/sign-in?next=/dashboard/${venueId}`);

  const bookingId = String(formData.get('bookingId') ?? '');
  try {
    await transitionBooking({
      bookingId,
      targetStatus: 'CONFIRMED',
      actor: { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin },
    });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`/dashboard/${venueId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/dashboard/${venueId}`);
  redirect(`/dashboard/${venueId}?confirmed=1`);
}

export async function rejectRequestAction(formData: FormData) {
  const actor = await getSessionActor();
  const venueId = String(formData.get('venueId') ?? '');
  if (!actor) redirect(`/sign-in?next=/dashboard/${venueId}`);

  const bookingId = String(formData.get('bookingId') ?? '');
  const reason = String(formData.get('reason') ?? '') as VenueCancellationReason;
  try {
    await transitionBooking({
      bookingId,
      targetStatus: 'REJECTED',
      actor: { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin },
      reason,
    });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`/dashboard/${venueId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/dashboard/${venueId}`);
  redirect(`/dashboard/${venueId}?rejected=1`);
}

export async function addStaffAction(formData: FormData) {
  const actor = await getSessionActor();
  const venueId = String(formData.get('venueId') ?? '');
  if (!actor) redirect(`/sign-in?next=/dashboard/${venueId}`);

  const parsed = addVenueStaffSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Check the staff details and try again.';
    redirect(`/dashboard/${venueId}?error=${encodeURIComponent(message)}`);
  }

  try {
    await addVenueStaffMember(
      venueId,
      { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin },
      parsed.data,
    );
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`/dashboard/${venueId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/dashboard/${venueId}`);
  redirect(`/dashboard/${venueId}?staffAdded=1`);
}

export async function removeStaffAction(formData: FormData) {
  const actor = await getSessionActor();
  const venueId = String(formData.get('venueId') ?? '');
  if (!actor) redirect(`/sign-in?next=/dashboard/${venueId}`);

  const memberId = String(formData.get('memberId') ?? '');
  try {
    await removeVenueStaffMember(
      venueId,
      { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin },
      memberId,
    );
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`/dashboard/${venueId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/dashboard/${venueId}`);
  redirect(`/dashboard/${venueId}?staffRemoved=1`);
}
