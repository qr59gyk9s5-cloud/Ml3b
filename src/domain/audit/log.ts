/**
 * The one writer of audit_logs (docs/architecture/authorization.md's
 * "Admin override, specifically", docs/product/user-roles.md's platform
 * administrator section). Deliberately NOT best-effort like
 * src/domain/notifications/outbox.ts — an admin override without a
 * surviving audit record isn't a degraded version of the feature, it's a
 * silent admin edit, which CLAUDE.md rules out entirely. A failure here
 * propagates to the caller like any other write in the same call
 * (mirrors how src/domain/booking/transition.ts's bookingEvents insert
 * isn't wrapped in a try/catch either).
 */
import { getDb } from '@/lib/db/client';
import { auditLogs } from '@/lib/db/schema';
import type { ActorType } from '@/lib/config/constants';

export interface RecordAuditLogParams {
  actorType: ActorType;
  /** null for a SYSTEM actor with no human behind it. */
  actorId: string | null;
  /** Free text, e.g. 'BOOKING_OVERRIDE', 'VENUE_APPROVED', 'USER_SUSPENDED'. */
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditLog(params: RecordAuditLogParams): Promise<void> {
  const db = getDb();
  await db.insert(auditLogs).values({
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadata: params.metadata ?? {},
  });
}
