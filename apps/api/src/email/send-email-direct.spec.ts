import { createElement } from 'react';
import { triggerEmail } from './trigger-email';
import { shouldSendDirect } from './send-email-direct';

const mockSend = jest.fn();
const mockTrigger = jest.fn().mockResolvedValue({ id: 'run_email' });

jest.mock('@react-email/render', () => ({
  render: jest.fn().mockResolvedValue('<p>Code</p>'),
}));
jest.mock('@trigger.dev/sdk', () => ({
  tasks: { trigger: (...args: unknown[]) => mockTrigger(...args) },
  idempotencyKeys: { create: jest.fn() },
}));
jest.mock('@trycompai/email', () => ({
  generateUnsubscribeToken: () => 'tok',
}));
jest.mock('./resend', () => ({
  resend: { emails: { send: (...args: unknown[]) => mockSend(...args) } },
}));

const email = {
  to: 'owner@example.invalid',
  subject: 'Your sign-in code',
  react: createElement('p', null, 'Code'),
  system: true,
};

describe('Trigger.dev bypass for local development', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'resend_1' }, error: null });
    process.env = { ...saved, RESEND_FROM_SYSTEM: 'Comp AI <system@example.invalid>' };
    delete process.env.TRIGGER_SECRET_KEY;
    delete process.env.RESEND_TO_TEST;
  });

  afterAll(() => {
    process.env = saved;
  });

  it('stays off unless the flag is set', () => {
    expect(shouldSendDirect()).toBe(false);
  });

  it('stays off when a Trigger.dev key exists, even with the flag', () => {
    process.env.EMAIL_DIRECT_SEND_WITHOUT_TRIGGER = 'true';
    process.env.TRIGGER_SECRET_KEY = 'tr_dev_x';
    expect(shouldSendDirect()).toBe(false);
  });

  it('sends through Resend instead of queueing when enabled', async () => {
    process.env.EMAIL_DIRECT_SEND_WITHOUT_TRIGGER = 'true';

    const result = await triggerEmail(email);

    expect(result).toEqual({ id: 'resend_1' });
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Comp AI <system@example.invalid>',
        to: 'owner@example.invalid',
        subject: 'Your sign-in code',
        html: '<p>Code</p>',
      }),
    );
  });

  it('surfaces Resend errors', async () => {
    process.env.EMAIL_DIRECT_SEND_WITHOUT_TRIGGER = 'true';
    mockSend.mockResolvedValue({ data: null, error: { message: 'invalid key' } });

    await expect(triggerEmail(email)).rejects.toThrow('Failed to send email: invalid key');
  });
});
