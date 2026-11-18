import { BadRequestException, Body, Controller, Logger, OnApplicationBootstrap, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { db } from '@db';
import { IsBoolean, IsEmail, IsOptional } from 'class-validator';
import { PlatformAdminGuard } from './platform-admin.guard';
import { sendSetupLink } from './setup-link';

class SendSetupLinkDto {
  @IsEmail()
  email: string;

  /** Clear a lost authenticator app and end the person's sessions before sending. */
  @IsOptional()
  @IsBoolean()
  resetAuthenticator?: boolean;
}

/**
 * A BNI platform admin authorises a person to sign in by sending them a one-time setup
 * link. The person must already be on an organization's People list or hold a pending
 * invitation; being added there does not by itself let anyone sign in.
 */
@ApiExcludeController()
@ApiTags('Admin')
@Controller({ path: 'admin/setup-links', version: '1' })
@UseGuards(PlatformAdminGuard)
export class SetupLinkController implements OnApplicationBootstrap {
  private readonly logger = new Logger(SetupLinkController.name);

  @Post()
  async send(@Req() req: { userId?: string }, @Body() dto: SendSetupLinkDto) {
    const email = dto.email.trim().toLowerCase();
    const [member, invitation] = await Promise.all([
      db.member.findFirst({
        where: { deactivated: false, user: { email: { equals: email, mode: 'insensitive' } } },
        select: { organizationId: true },
      }),
      db.invitation.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, status: 'pending', expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: 'desc' },
        select: { id: true, organizationId: true },
      }),
    ]);
    if (!member && !invitation) {
      throw new BadRequestException('Add this person to an organization first (People, or an invitation), then send the setup link.');
    }
    const result = await sendSetupLink({
      email,
      createUser: true,
      resetAuthenticator: dto.resetAuthenticator,
      next: invitation ? `/invite/${invitation.id}` : undefined,
    });
    const organizationId = member?.organizationId ?? invitation?.organizationId;
    if (req.userId && organizationId) {
      await db.auditLog
        .create({
          data: {
            userId: req.userId,
            memberId: null,
            organizationId,
            entityType: null,
            entityId: null,
            description: `[Platform Admin] Sent a sign-in setup link to ${email}${dto.resetAuthenticator ? ' and reset the authenticator' : ''}`,
            data: { action: 'Sent a sign-in setup link', resource: 'admin', permission: 'platform-admin', email, resetAuthenticator: !!dto.resetAuthenticator },
          },
        })
        .catch((err) => this.logger.error('Failed to write the setup-link audit entry', err));
    }
    return { sent: true, email: result?.email ?? email, accountCreated: !!result?.created };
  }

  /**
   * Break-glass for a locked-out platform admin: start the API once with
   * AUTH_BOOTSTRAP_SETUP_EMAIL set to that admin's address and a setup link is emailed.
   * It only ever works for an existing platform admin account.
   */
  async onApplicationBootstrap(): Promise<void> {
    const email = process.env.AUTH_BOOTSTRAP_SETUP_EMAIL?.trim().toLowerCase();
    if (!email) return;
    try {
      const admin = await db.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, role: 'admin' },
        select: { id: true },
      });
      if (!admin) {
        this.logger.warn('AUTH_BOOTSTRAP_SETUP_EMAIL is not a platform admin account; no setup link sent');
        return;
      }
      await sendSetupLink({ email });
      this.logger.warn('AUTH_BOOTSTRAP_SETUP_EMAIL: setup link emailed to the platform admin. Remove the variable now.');
    } catch (err) {
      this.logger.error('AUTH_BOOTSTRAP_SETUP_EMAIL: could not send the setup link', err);
    }
  }
}
