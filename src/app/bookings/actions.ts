'use server';

import { redirect } from 'next/navigation';
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

  redirect('/bookings?cancelled=1');
}
