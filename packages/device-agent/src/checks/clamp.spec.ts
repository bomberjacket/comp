import { describe, expect, it } from 'vitest';
import { clampDetails } from './clamp';

describe('clampDetails', () => {
  it('cuts every detail field to the API limits and leaves short values alone', () => {
    const long = clampDetails({
      checkType: 'smb1_disabled',
      passed: true,
      details: {
        method: 'm'.repeat(150),
        raw: 'r'.repeat(5000),
        message: 'x'.repeat(1500),
        exception: 'e'.repeat(900),
      },
      checkedAt: '2026-10-27T00:00:00.000Z',
    });
    expect(long.details.method).toHaveLength(100);
    expect(long.details.raw).toHaveLength(2000);
    expect(long.details.message).toHaveLength(1000);
    expect(long.details.exception).toHaveLength(500);

    const short = clampDetails({
      checkType: 'fips_mode',
      passed: false,
      details: { method: 'registry', raw: '0', message: 'off' },
      checkedAt: '2026-10-27T00:00:00.000Z',
    });
    expect(short.details).toEqual({ method: 'registry', raw: '0', message: 'off' });
    expect('exception' in short.details).toBe(false);
  });
});
