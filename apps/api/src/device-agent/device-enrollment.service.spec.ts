import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

jest.mock('@db', () => ({
  db: {
    member: { findFirst: jest.fn() },
    deviceEnrollmentToken: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    device: { update: jest.fn() },
    session: { delete: jest.fn() },
  },
}));
jest.mock('./device-agent-session.helper', () => ({
  createDeviceAgentSession: jest.fn(),
}));
jest.mock('./device-registration.helpers', () => ({
  registerWithSerial: jest.fn(),
  registerWithoutSerial: jest.fn(),
}));

import { db } from '@db';
import { createDeviceAgentSession } from './device-agent-session.helper';
import {
  DeviceEnrollmentService,
  generateEnrollmentToken,
  hashEnrollmentToken,
  tokenPrefix,
} from './device-enrollment.service';
import {
  registerWithSerial,
  registerWithoutSerial,
} from './device-registration.helpers';

const mockDb = db as jest.Mocked<typeof db>;
const mockCreateSession = createDeviceAgentSession as jest.Mock;
const mockWithSerial = registerWithSerial as jest.Mock;
const mockWithoutSerial = registerWithoutSerial as jest.Mock;

const deviceDto = {
  name: 'web-01',
  hostname: 'web-01.shop.local',
  platform: 'linux' as const,
  osVersion: 'Ubuntu 24.04.2 LTS',
  agentVersion: '1.0.0',
};

describe('DeviceEnrollmentService', () => {
  let service: DeviceEnrollmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceEnrollmentService();
  });

  describe('token helpers', () => {
    it('generates a prefixed 64-hex token and a short display prefix', () => {
      const token = generateEnrollmentToken();
      expect(token).toMatch(/^cae_[0-9a-f]{64}$/);
      expect(tokenPrefix(token)).toBe(token.slice(0, 12));
      expect(hashEnrollmentToken(token)).toMatch(/^[0-9a-f]{64}$/);
      expect(hashEnrollmentToken(token)).not.toBe(
        hashEnrollmentToken(`${token}x`),
      );
    });
  });

  describe('createToken', () => {
    it('refuses API-key callers (no owning member) and non-members', async () => {
      await expect(
        service.createToken({
          organizationId: 'org_1',
          userId: undefined,
          dto: { name: 'x' },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      (mockDb.member.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createToken({
          organizationId: 'org_1',
          userId: 'user_1',
          dto: { name: 'x' },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('stores only the hash and returns the plaintext once with defaults applied', async () => {
      (mockDb.member.findFirst as jest.Mock).mockResolvedValue({ id: 'mem_1' });
      (mockDb.deviceEnrollmentToken.create as jest.Mock).mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'det_1',
          name: data.name,
          expiresAt: data.expiresAt,
          maxUses: data.maxUses,
          createdAt: new Date(),
        }),
      );
      const before = Date.now();
      const result = await service.createToken({
        organizationId: 'org_1',
        userId: 'user_1',
        dto: { name: 'Ansible' },
      });
      expect(result.token).toMatch(/^cae_/);
      const createArgs = (mockDb.deviceEnrollmentToken.create as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data.tokenHash).toBe(hashEnrollmentToken(result.token));
      expect(createArgs.data).not.toHaveProperty('token');
      expect(createArgs.data.memberId).toBe('mem_1');
      expect(createArgs.data.maxUses).toBe(100);
      const days = (result.expiresAt.getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);
    });
  });

  describe('listTokens', () => {
    it('derives a status for each token', async () => {
      const past = new Date(Date.now() - 1000);
      const future = new Date(Date.now() + 86_400_000);
      (mockDb.deviceEnrollmentToken.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'a',
          expiresAt: future,
          maxUses: 10,
          useCount: 0,
          revokedAt: null,
        },
        { id: 'b', expiresAt: past, maxUses: 10, useCount: 0, revokedAt: null },
        {
          id: 'c',
          expiresAt: future,
          maxUses: 1,
          useCount: 1,
          revokedAt: null,
        },
        {
          id: 'd',
          expiresAt: future,
          maxUses: 10,
          useCount: 0,
          revokedAt: past,
        },
      ]);
      const { tokens } = await service.listTokens({ organizationId: 'org_1' });
      expect(tokens.map((t) => t.status)).toEqual([
        'active',
        'expired',
        'exhausted',
        'revoked',
      ]);
    });
  });

  describe('enroll', () => {
    const validToken = () => ({
      id: 'det_1',
      tokenPrefix: 'cae_abcdef12',
      organizationId: 'org_1',
      expiresAt: new Date(Date.now() + 86_400_000),
      maxUses: 5,
      useCount: 2,
      revokedAt: null,
      member: {
        id: 'mem_1',
        userId: 'user_1',
        deactivated: false,
        organizationId: 'org_1',
      },
      organization: { id: 'org_1', name: 'Test Shop' },
    });

    it('rejects unknown, expired, revoked and exhausted tokens with one message', async () => {
      const dto = { ...deviceDto, token: 'cae_' + 'f'.repeat(64) };
      (mockDb.deviceEnrollmentToken.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      await expect(service.enroll(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      for (const broken of [
        { ...validToken(), expiresAt: new Date(Date.now() - 1) },
        { ...validToken(), revokedAt: new Date() },
        { ...validToken(), useCount: 5 },
        {
          ...validToken(),
          member: { ...validToken().member, deactivated: true },
        },
      ]) {
        (
          mockDb.deviceEnrollmentToken.findUnique as jest.Mock
        ).mockResolvedValue(broken);
        await expect(service.enroll(dto)).rejects.toThrow(
          'Enrollment token is invalid, expired or revoked',
        );
      }
      expect(mockCreateSession).not.toHaveBeenCalled();
    });

    it('looks the token up by hash, registers the device for the owning member, links the session and counts the use', async () => {
      const plain = 'cae_' + 'a'.repeat(64);
      (mockDb.deviceEnrollmentToken.findUnique as jest.Mock).mockResolvedValue(
        validToken(),
      );
      mockCreateSession.mockResolvedValue({
        sessionId: 'ses_new',
        token: 'tok_new',
        expiresAt: new Date(),
      });
      mockWithoutSerial.mockResolvedValue({
        id: 'dev_1',
        agentSessionId: 'ses_old',
      });
      (mockDb.session.delete as jest.Mock).mockResolvedValue({});

      const result = await service.enroll({ ...deviceDto, token: plain });

      expect(
        (mockDb.deviceEnrollmentToken.findUnique as jest.Mock).mock.calls[0][0]
          .where,
      ).toEqual({
        tokenHash: hashEnrollmentToken(plain),
      });
      expect(mockCreateSession).toHaveBeenCalledWith({ userId: 'user_1' });
      expect(mockWithoutSerial).toHaveBeenCalledWith({
        member: { id: 'mem_1' },
        dto: expect.objectContaining({
          organizationId: 'org_1',
          hostname: 'web-01.shop.local',
        }),
      });
      expect(mockWithSerial).not.toHaveBeenCalled();
      expect(mockDb.session.delete).toHaveBeenCalledWith({
        where: { id: 'ses_old' },
      });
      expect(mockDb.device.update).toHaveBeenCalledWith({
        where: { id: 'dev_1' },
        data: { agentSessionId: 'ses_new' },
      });
      expect(mockDb.deviceEnrollmentToken.update).toHaveBeenCalledWith({
        where: { id: 'det_1' },
        data: { useCount: { increment: 1 }, lastUsedAt: expect.any(Date) },
      });
      expect(result).toMatchObject({
        sessionToken: 'tok_new',
        deviceId: 'dev_1',
        organizationId: 'org_1',
        organizationName: 'Test Shop',
        userId: 'user_1',
      });
    });

    it('uses the serial path when a serial number is supplied', async () => {
      (mockDb.deviceEnrollmentToken.findUnique as jest.Mock).mockResolvedValue(
        validToken(),
      );
      mockCreateSession.mockResolvedValue({
        sessionId: 's',
        token: 't',
        expiresAt: new Date(),
      });
      mockWithSerial.mockResolvedValue({ id: 'dev_2', agentSessionId: null });
      await service.enroll({
        ...deviceDto,
        token: 'cae_' + 'b'.repeat(64),
        serialNumber: 'VMware-42',
      });
      expect(mockWithSerial).toHaveBeenCalled();
      expect(mockDb.session.delete).not.toHaveBeenCalled();
    });
  });
});
