'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionActor } from '@/lib/auth/session';
import { resolveVenueAuthzContext } from '@/domain/venue/authz-context';
import { updateOpenGameSettings, updateVenueCoverPhoto } from '@/domain/venue/settings';
import { DomainError } from '@/domain/errors';

function parseHours(raw: FormDataEntryValue | null): number | null {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return null; // empty field = reset to platform default
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

export async function updateOpenGameSettingsAction(formData: FormData) {
  const venueId = String(formData.get('venueId') ?? '');
  const settingsPath = `/dashboard/${venueId}/settings`;

  const actor = await getSessionActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(settingsPath)}`);

  const minLeadTimeHours = parseHours(formData.get('minLeadTimeHours'));
  const maxHoldHours = parseHours(formData.get('maxHoldHours'));
  if (Number.isNaN(minLeadTimeHours) || Number.isNaN(maxHoldHours)) {
    redirect(
      `${settingsPath}?error=${encodeURIComponent('Enter whole numbers of hours, or leave blank for the default.')}`,
    );
  }

  try {
    const ctx = await resolveVenueAuthzContext(venueId, {
      userId: actor.userId,
      isPlatformAdmin: actor.isPlatformAdmin,
    });
    await updateOpenGameSettings(venueId, ctx, { minLeadTimeHours, maxHoldHours });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`${settingsPath}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(settingsPath);
  revalidatePath('/'); // home page's venue grid shows these hours nowhere, but keep consistent
  redirect(`${settingsPath}?saved=1`);
}

export async function updateVenueCoverPhotoAction(formData: FormData) {
  const venueId = String(formData.get('venueId') ?? '');
  const settingsPath = `/dashboard/${venueId}/settings`;

  const actor = await getSessionActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(settingsPath)}`);

  const raw = String(formData.get('coverPhotoUrl') ?? '').trim();
  const coverPhotoUrl = raw === '' ? null : raw;

  let venueSlug: string | undefined;
  try {
    const ctx = await resolveVenueAuthzContext(venueId, {
      userId: actor.userId,
      isPlatformAdmin: actor.isPlatformAdmin,
    });
    const updated = await updateVenueCoverPhoto(venueId, ctx, coverPhotoUrl);
    venueSlug = updated.slug;
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`${settingsPath}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(settingsPath);
  revalidatePath('/'); // the venue's card on the public home grid
  if (venueSlug) revalidatePath(`/venues/${venueSlug}`);
  redirect(`${settingsPath}?saved=1`);
}
