import { ShieldOff } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';

/**
 * Tells a suspended user honestly why their actions are being rejected,
 * instead of leaving them to hit FORBIDDEN errors with no explanation.
 * The actual enforcement is server-side in the domain layer (see
 * src/domain/admin/suspension.ts and every call site that checks it) —
 * this is UI-only, same "never the enforcement mechanism" caveat as any
 * other client-side affordance (CLAUDE.md).
 */
export async function SuspendedBanner() {
  const actor = await getSessionActor();
  if (!actor?.profile?.suspendedAt) return null;

  return (
    <div className="bg-danger-wash px-4 py-2.5 text-center text-xs font-semibold text-danger sm:px-6">
      <span className="inline-flex items-center gap-1.5">
        <ShieldOff className="h-3.5 w-3.5" aria-hidden />
        Your account has been suspended
        {actor.profile.suspendedReason ? `: ${actor.profile.suspendedReason}` : '.'} You can&apos;t
        book or manage venues while suspended. Contact support if you believe this is a mistake.
      </span>
    </div>
  );
}
