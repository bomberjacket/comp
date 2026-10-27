import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.COMP_AGENT_NO_AUTORUN = '1';

vi.mock('../checks', () => ({
  runAllChecks: vi.fn(async () => [
    {
      checkType: 'disk_encryption',
      passed: true,
      details: { method: 'test', raw: '', message: 'ok' },
      checkedAt: new Date().toISOString(),
    },
  ]),
}));
vi.mock('../main/device-info', () => ({
  getDeviceInfo: () => ({
    name: 'web-01',
    hostname: 'web-01.shop.local',
    platform: 'linux',
    osVersion: 'Ubuntu 24.04.2 LTS',
    serialNumber: 'VM-1',
  }),
  getCurrentOSVersion: () => 'Ubuntu 24.04.2 LTS',
}));

import { ApiError, checkIn, enroll } from './client';
import { main, parseArgs, runOnce } from './main';
import { readState, writeState } from './state';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'comp-agent-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseArgs', () => {
  it('reads commands, --flag value, --flag=value and bare flags', () => {
    expect(parseArgs(['enroll', '--token', 'abc', '--api=http://x', '--once'])).toEqual({
      command: 'enroll',
      flags: { token: 'abc', api: 'http://x', once: true },
    });
    expect(parseArgs([]).command).toBe('help');
  });
});

describe('state', () => {
  it('round-trips, redacts and refuses incomplete files', () => {
    const state = {
      apiUrl: 'http://api',
      deviceId: 'dev_1',
      organizationId: 'org_1',
      organizationName: 'Shop',
      userId: 'user_1',
      sessionToken: 'secret-token-value',
      enrolledAt: '2026-10-26T00:00:00.000Z',
    };
    writeState(dir, state);
    expect(readState(dir)).toEqual(state);
    if (process.platform !== 'win32') {
      expect(statSync(path.join(dir, 'state.json')).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(path.join(dir, 'state.json'), 'utf-8')).toContain('secret-token-value');
    rmSync(path.join(dir, 'state.json'));
    expect(readState(dir)).toBeNull();
  });
});

describe('client', () => {
  it('posts the enrollment and surfaces API error messages', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        sessionToken: 't',
        sessionExpiresAt: 'x',
        deviceId: 'dev_1',
        organizationId: 'org_1',
        organizationName: 'Shop',
        userId: 'u',
      }),
    );
    const result = await enroll(
      'http://api',
      'cae_x',
      { name: 'n', hostname: 'h', platform: 'linux', osVersion: 'v' },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.deviceId).toBe('dev_1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/v1/device-agent/enroll');
    expect(JSON.parse(init.body as string)).toMatchObject({ token: 'cae_x', hostname: 'h' });

    const denied = vi.fn(async () =>
      jsonResponse(401, { message: 'Enrollment token is invalid, expired or revoked' }),
    );
    await expect(
      enroll(
        'http://api',
        'bad',
        { name: 'n', hostname: 'h', platform: 'linux', osVersion: 'v' },
        denied as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      status: 401,
      message: 'Enrollment token is invalid, expired or revoked',
    });
  });

  it('sends the bearer token on check-in', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { isCompliant: true, nextCheckIn: 'x' }));
    await checkIn(
      'http://api',
      'tok',
      { deviceId: 'dev_1', checks: [] },
      fetchMock as unknown as typeof fetch,
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(new ApiError(500, 'x').status).toBe(500);
  });
});

describe('main', () => {
  it('enrolls, writes state, then runs once and records the check-in', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/enroll')) {
        return jsonResponse(200, {
          sessionToken: 'tok1',
          sessionExpiresAt: 'x',
          deviceId: 'dev_1',
          organizationId: 'org_1',
          organizationName: 'Shop',
          userId: 'u',
        });
      }
      return jsonResponse(200, {
        isCompliant: false,
        nextCheckIn: 'x',
        upgradedSessionToken: 'tok2',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const code = await main(
      [
        'enroll',
        '--token',
        'cae_test',
        '--api',
        'http://api/',
        '--state-dir',
        dir,
        '--name',
        'srv',
      ],
      {},
    );
    expect(code).toBe(0);
    const state = readState(dir);
    expect(state).toMatchObject({ apiUrl: 'http://api', deviceId: 'dev_1', sessionToken: 'tok1' });
    const enrollBody = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(enrollBody.name).toBe('srv');

    const run = await runOnce(dir);
    expect(run).toEqual({ ok: true, compliant: false });
    expect(readState(dir)).toMatchObject({ sessionToken: 'tok2', lastCompliant: false });
  });

  it('treats 401 as fatal and refuses to run when not enrolled', async () => {
    expect(await runOnce(dir)).toEqual({ ok: false, fatal: true });
    writeState(dir, {
      apiUrl: 'http://api',
      deviceId: 'dev_1',
      organizationId: 'org_1',
      organizationName: 'Shop',
      userId: 'u',
      sessionToken: 'tok',
      enrolledAt: 'x',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { message: 'Unauthorized' })),
    );
    expect(await runOnce(dir)).toEqual({ ok: false, fatal: true });
    expect(await main(['run', '--once', '--state-dir', dir], {})).toBe(1);
  });

  it('answers status, unenroll, version and help', async () => {
    expect(await main(['status', '--state-dir', dir], {})).toBe(3);
    expect(await main(['version'], {})).toBe(0);
    expect(await main(['help'], {})).toBe(0);
    expect(await main(['bogus'], {})).toBe(2);
    expect(await main(['enroll', '--state-dir', dir], {})).toBe(2);
    expect(await main(['unenroll', '--state-dir', dir], {})).toBe(0);
  });
});
