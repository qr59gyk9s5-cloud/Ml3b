/**
 * The default provider until a real email account is connected (no
 * RESEND_API_KEY set — see docs/operations/deployment.md's pattern for
 * Supabase/Vercel: build the real pipeline now, degrade honestly until
 * credentials exist). Logs instead of sending, always "succeeds" — so
 * the outbox/dispatch machinery is exercised for real without silently
 * pretending an email went anywhere.
 */
import type { NotificationProvider, SendEmailParams } from './provider';

export class ConsoleNotificationProvider implements NotificationProvider {
  async sendEmail(params: SendEmailParams): Promise<void> {
    console.log(
      `[notifications] (not sent — no email provider configured) to=${params.to} subject="${params.subject}"`,
    );
  }
}
