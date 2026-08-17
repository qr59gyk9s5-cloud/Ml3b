'use server';

import { redirect } from 'next/navigation';
import { getSessionActor } from '@/lib/auth/session';
import { createManualBooking } from '@/domain/booking/manual';
import { DomainError } from '@/domain/errors';

export async function createManualBookingAction(formData: FormData) {
  const actor = await getSessionActor();
  const venueId = String(formData.get('venueId') ?? '');
  const facilityId = String(formData.get('facilityId') ?? '');
  const date = String(formData.get('date') ?? '');
  const manualPath = `/dashboard/${venueId}/manual/${facilityId}?date=${date}`;

  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(manualPath)}`);

  const customerName = String(formData.get('customerName') ?? '').trim();
  const customerPhone = String(formData.get('customerPhone') ?? '').trim();

  try {
    await createManualBooking(
      venueId,
      { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin },
      {
        facilityId,
        startAt: new Date(String(formData.get('startAt'))),
        durationMinutes: Number(formData.get('durationMinutes')),
        customerName: customerName || 'Walk-in customer',
        customerPhone: customerPhone || undefined,
      },
    );
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`${manualPath}&error=${encodeURIComponent(message)}`);
  }

  redirect(`/dashboard/${venueId}?manual=1`);
}
