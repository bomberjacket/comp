import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '@db';
import { createDeviceAgentSession } from './device-agent-session.helper';
import {
  registerWithSerial,
  registerWithoutSerial,
} from './device-registration.helpers';
import { CreateEnrollmentTokenDto } from './dto/create-enrollment-token.dto';
import { EnrollDeviceDto } from './dto/enroll-device.dto';

export const ENROLLMENT_TOKEN_PREFIX = 'cae_';
const DEFAULT_EXPIRES_DAYS = 30;
const DEFAULT_MAX_USES = 100;

export function hashEnrollmentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateEnrollmentToken(): string {
  return `${ENROLLMENT_TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
}

/** The part of a token safe to show in a list, e.g. `cae_3f9a1c…`. */
export function tokenPrefix(token: string): string {
  return token.slice(0, ENROLLMENT_TOKEN_PREFIX.length + 8);
}

/**
 * Headless enrollment: a server with no desktop and no browser cannot run the
 * portal login that the tray agent uses. An organization admin creates an
 * enrollment token in the app (stored hashed, shown once), deploys it with
 * the headless agent, and the agent trades it for the same long-lived
 * device-agent session the tray agent ends up with. Devices enrolled this way
 * are attributed to the member who created the token.
 */
@Injectable()
export class DeviceEnrollmentService {
  private readonly logger = new Logger(DeviceEnrollmentService.name);

  async createToken({
    organizationId,
    userId,
    dto,
  }: {
    organizationId: string;
    userId: string | undefined;
    dto: CreateEnrollmentTokenDto;
  }) {
    if (!userId) {
      throw new ForbiddenException(
        'Enrollment tokens must be created from a signed-in session so enrolled devices have an owner',
      );
    }
    const member = await db.member.findFirst({
      where: { userId, organizationId, deactivated: false },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this organization');
    }

    const token = generateEnrollmentToken();
    const expiresInDays = dto.expiresInDays ?? DEFAULT_EXPIRES_DAYS;
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );
    const record = await db.deviceEnrollmentToken.create({
      data: {
        name: dto.name,
        tokenHash: hashEnrollmentToken(token),
        tokenPrefix: tokenPrefix(token),
        organizationId,
        memberId: member.id,
        expiresAt,
        maxUses: dto.maxUses ?? DEFAULT_MAX_USES,
      },
      select: {
        id: true,
        name: true,
        expiresAt: true,
        maxUses: true,
        createdAt: true,
      },
    });

    // The plaintext token is returned exactly once.
    return { ...record, token };
  }

  async listTokens({ organizationId }: { organizationId: string }) {
    const tokens = await db.deviceEnrollmentToken.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        expiresAt: true,
        maxUses: true,
        useCount: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        member: { select: { user: { select: { name: true, email: true } } } },
      },
    });
    const now = Date.now();
    return {
      tokens: tokens.map((t) => ({
        ...t,
        status:
          t.revokedAt !== null
            ? 'revoked'
            : t.expiresAt.getTime() <= now
              ? 'expired'
              : t.useCount >= t.maxUses
                ? 'exhausted'
                : 'active',
      })),
    };
  }

  async revokeToken({
    organizationId,
    tokenId,
  }: {
    organizationId: string;
    tokenId: string;
  }) {
    const token = await db.deviceEnrollmentToken.findFirst({
      where: { id: tokenId, organizationId },
      select: { id: true, revokedAt: true },
    });
    if (!token) {
      throw new NotFoundException('Enrollment token not found');
    }
    if (!token.revokedAt) {
      await db.deviceEnrollmentToken.update({
        where: { id: token.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async enroll(dto: EnrollDeviceDto) {
    const token = await db.deviceEnrollmentToken.findUnique({
      where: { tokenHash: hashEnrollmentToken(dto.token) },
      include: {
        member: {
          select: {
            id: true,
            userId: true,
            deactivated: true,
            organizationId: true,
          },
        },
        organization: { select: { id: true, name: true } },
      },
    });
    // One message for every failure so a caller cannot probe which part is wrong.
    const rejected = new UnauthorizedException(
      'Enrollment token is invalid, expired or revoked',
    );
    if (!token || token.revokedAt || token.expiresAt.getTime() <= Date.now())
      throw rejected;
    if (token.useCount >= token.maxUses) throw rejected;
    if (!token.member || token.member.deactivated) throw rejected;

    const session = await createDeviceAgentSession({
      userId: token.member.userId,
    });
    const registerDto = {
      name: dto.name,
      hostname: dto.hostname,
      platform: dto.platform,
      osVersion: dto.osVersion,
      organizationId: token.organizationId,
      serialNumber: dto.serialNumber,
      hardwareModel: dto.hardwareModel,
      agentVersion: dto.agentVersion,
    };
    const member = { id: token.member.id };
    const device = dto.serialNumber
      ? await registerWithSerial({ member, dto: registerDto })
      : await registerWithoutSerial({ member, dto: registerDto });

    if (device.agentSessionId && device.agentSessionId !== session.sessionId) {
      try {
        await db.session.delete({ where: { id: device.agentSessionId } });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2025') {
          this.logger.error(
            `Failed to delete stale agent session ${device.agentSessionId} for device ${device.id}: ${err}`,
          );
          throw err;
        }
      }
    }

    await db.device.update({
      where: { id: device.id },
      data: { agentSessionId: session.sessionId },
    });
    await db.deviceEnrollmentToken.update({
      where: { id: token.id },
      data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    });

    this.logger.log(
      `Headless enrollment: device ${device.id} (${dto.hostname}) in org ${token.organizationId} with token ${token.tokenPrefix}…`,
    );

    return {
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
      deviceId: device.id,
      organizationId: token.organizationId,
      organizationName: token.organization.name,
      userId: token.member.userId,
    };
  }
}
