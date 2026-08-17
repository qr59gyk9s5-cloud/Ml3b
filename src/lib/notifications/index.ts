import { env } from '@/lib/config/env';
import type { NotificationProvider } from './provider';
import { ConsoleNotificationProvider } from './console-provider';
import { ResendNotificationProvider } from './resend-provider';

export type { NotificationProvider, SendEmailParams } from './provider';

export function getNotificationProvider(): NotificationProvider {
  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    return new ResendNotificationProvider(env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);
  }
  return new ConsoleNotificationProvider();
}
