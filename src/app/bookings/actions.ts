'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionActor } from '@/lib/auth/session';
import { transitionBooking } from '@/domain/booking/transition';
import { DomainError } from '@/domain/errors';

export async function cancelBookingAction(formData: FormData) {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/bookings');

  const bookingId = String(formData.get('bookingId') ?? '');

  try {
    await transitionBooking({
      bookingId,
      targetStatus: 'CANCELLED_BY_CUSTOMER',
      actor: { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin },
    });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`/bookings?error=${encodeURIComponent(message)}`);
  }

  // Without this, the redirect target's RSC payload can still be served
  // from the client router cache — the booking looks unchanged until a
  // manual refresh. Same fix applied across every mutating action in the
  // app (src/app/**/actions.ts) — this was a systemic gap, not a one-off.
  revalidatePath('/bookings');
  redirect('/bookings?cancelled=1');
}
