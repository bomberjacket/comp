import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckInDto } from './check-in.dto';

/**
 * Mirrors the global ValidationPipe config from main.ts:
 *   whitelist: true, forbidNonWhitelisted: true, transform: true,
 *   enableImplicitConversion: true
 */
async function validateCheckIn(plain: Record<string, unknown>) {
  const dto = plainToInstance(CheckInDto, plain, {
    enableImplicitConversion: true,
  });
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('CheckInDto', () => {
  it('accepts a check-in without osVersion (agents that predate the field)', async () => {
    const errors = await validateCheckIn({ deviceId: 'dev_1', checks: [] });
    expect(errors).toHaveLength(0);
  });

  it('accepts a check-in carrying osVersion', async () => {
    const errors = await validateCheckIn({
      deviceId: 'dev_1',
      checks: [],
      osVersion: '15.8.1',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty osVersion', async () => {
    const errors = await validateCheckIn({
      deviceId: 'dev_1',
      checks: [],
      osVersion: '',
    });
    expect(errors.map((e) => e.property)).toContain('osVersion');
  });

  it('rejects an osVersion longer than 100 chars', async () => {
    const errors = await validateCheckIn({
      deviceId: 'dev_1',
      checks: [],
      osVersion: 'x'.repeat(101),
    });
    expect(errors.map((e) => e.property)).toContain('osVersion');
  });

  it('accepts canonical and extended check ids', async () => {
    const errors = await validateCheckIn({
      deviceId: 'dev_1',
      checks: [
        {
          checkType: 'disk_encryption',
          passed: true,
          checkedAt: '2026-10-26T12:00:00.000Z',
        },
        {
          checkType: 'fips_mode',
          passed: false,
          checkedAt: '2026-10-26T12:00:00.000Z',
        },
        {
          checkType: 'log_forwarding',
          passed: true,
          checkedAt: '2026-10-26T12:00:00.000Z',
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed check id', async () => {
    const errors = await validateCheckIn({
      deviceId: 'dev_1',
      checks: [
        {
          checkType: 'FIPS Mode!',
          passed: true,
          checkedAt: '2026-10-26T12:00:00.000Z',
        },
      ],
    });
    expect(errors.map((e) => e.property)).toContain('checks');
  });
});
