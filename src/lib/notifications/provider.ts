/**
 * Booking/venue/review domain services never import an email SDK
 * directly (docs/architecture/notifications.md) — only this interface.
 * Swapping providers (Resend today, something else later) never touches
 * a domain service.
 */
export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface NotificationProvider {
  /** Throws on failure — the caller (dispatchOutboxEvents) is what
   * records the failure against the outbox row and retries; this layer
   * doesn't swallow errors itself. */
  sendEmail(params: SendEmailParams): Promise<void>;
}
