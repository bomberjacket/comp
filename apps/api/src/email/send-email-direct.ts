import { generateUnsubscribeToken } from '@trycompai/email';
import { resend } from './resend';
import type { EmailChannel } from '../trigger/email/send-email';

/**
 * Local-development bypass for the Trigger.dev `send-email` task.
 *
 * Every API email (including the sign-in code) is normally queued on Trigger.dev.
 * When no Trigger.dev key is configured, a local install cannot send any email, so
 * nobody can sign in. With EMAIL_DIRECT_SEND_WITHOUT_TRIGGER=true and no
 * TRIGGER_SECRET_KEY, `triggerEmail` sends through Resend directly instead, using
 * the same sender and header rules as the task. Never enable this in production:
 * there is no queue, retry or throttling.
 */
export function shouldSendDirect(): boolean {
  return (
    process.env.EMAIL_DIRECT_SEND_WITHOUT_TRIGGER === 'true' &&
    !process.env.TRIGGER_SECRET_KEY
  );
}

export interface DirectEmailPayload {
  to: string;
  subject: string;
  html: string;
  channel: EmailChannel;
  cc?: string | string[];
  scheduledAt?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}

function fromAddressFor(channel: EmailChannel): string | undefined {
  const fromSystem = process.env.RESEND_FROM_SYSTEM;
  const fromDefault = process.env.RESEND_FROM_DEFAULT;
  const byChannel: Record<EmailChannel, string | undefined> = {
    trustPortal: process.env.RESEND_FROM_TRUST_PORTAL ?? fromSystem,
    marketing: process.env.RESEND_FROM_MARKETING,
    system: fromSystem,
    default: fromDefault,
  };
  return byChannel[channel] ?? fromSystem ?? fromDefault;
}

export async function sendEmailDirect(
  payload: DirectEmailPayload,
): Promise<{ id: string }> {
  if (!resend) {
    throw new Error('Resend not initialized - missing RESEND_API_KEY');
  }
  const from = fromAddressFor(payload.channel);
  if (!from) {
    throw new Error('Missing FROM address in environment variables');
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.trycomp.ai';
  const token = generateUnsubscribeToken(payload.to);
  const oneClickUrl = `${apiBaseUrl}/v1/email/unsubscribe?email=${encodeURIComponent(payload.to)}&token=${encodeURIComponent(token)}`;

  const { data, error } = await resend.emails.send({
    from,
    to: process.env.RESEND_TO_TEST ?? payload.to,
    cc: payload.cc,
    subject: payload.subject,
    html: payload.html,
    headers: {
      'List-Unsubscribe': `<${oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    scheduledAt: payload.scheduledAt,
    attachments: payload.attachments,
  });
  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.info('[email] sent directly via Resend (Trigger.dev bypass)', {
    subject: payload.subject,
    id: data?.id,
  });
  return { id: data?.id ?? 'direct-send' };
}
