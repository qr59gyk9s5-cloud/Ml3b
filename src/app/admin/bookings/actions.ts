'use server';

import { redirect } from 'next/navigation';
import { getSessionActor } from '@/lib/auth/session';
import { transitionBooking } from '@/domain/booking/transition';
import { DomainError } from '@/domain/errors';
import type { BookingStatus } from '@/lib/config/constants';

export async function overrideBookingAction(formData: FormData) {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/bookings');
  if (!actor.isPlatformAdmin) redirect('/');

  const reference = String(formData.get('reference') ?? '');
  const bookingId = String(formData.get('bookingId') ?? '');
  const targetStatus = String(formData.get('targetStatus') ?? '') as BookingStatus;
  const overrideReason = String(formData.get('overrideReason') ?? '');

  try {
    await transitionBooking({
      bookingId,
      targetStatus,
      actor: { userId: actor.userId, isPlatformAdmin: true },
      overrideReason,
    });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(
      `/admin/bookings?ref=${encodeURIComponent(reference)}&error=${encodeURIComponent(message)}`,
    );
  }
  redirect(`/admin/bookings?ref=${encodeURIComponent(reference)}&done=1`);
}
