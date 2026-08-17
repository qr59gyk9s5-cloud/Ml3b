/**
 * Real email delivery via Resend's REST API — plain fetch, no SDK
 * dependency for one endpoint. Only ever constructed when
 * env.RESEND_API_KEY is set (see index.ts's factory); never imported by
 * a domain service directly.
 */
import type { NotificationProvider, SendEmailParams } from './provider';

export class ResendNotificationProvider implements NotificationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
  ) {}

  async sendEmail(params: SendEmailParams): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Resend API error ${response.status}: ${body.slice(0, 500)}`);
    }
  }
}
