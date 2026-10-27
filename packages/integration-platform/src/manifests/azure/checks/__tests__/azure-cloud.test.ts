import { describe, expect, it } from 'bun:test';
import type { CheckContext, CheckFindingResult, CheckPassingResult } from '../../../../types';
import { azureGovManifest, azureManifest, createAzureManifest } from '../../index';
import { armBase, armListAllWithCoverage, azureCloud, azureCloudFromToken } from '../shared';
import { storageHttpsTlsCheck } from '../storage';

const b64url = (s: string) =>
  Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>) =>
  `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(claims))}.sig`;

const COMMERCIAL_V1 = jwt({
  iss: 'https://sts.windows.net/tid/',
  aud: 'https://management.azure.com/',
});
const COMMERCIAL_V2 = jwt({
  iss: 'https://login.microsoftonline.com/tid/v2.0',
  aud: 'https://management.azure.com',
});
const GOV_V1 = jwt({
  iss: 'https://login.microsoftonline.us/tid/',
  aud: 'https://management.usgovcloudapi.net/',
});
const GOV_V2 = jwt({
  iss: 'https://login.microsoftonline.us/tid/v2.0',
  aud: '797f4846-ba00-4fd7-ba43-dac1f8f63013',
});

function ctxWith(
  token: string,
  fetchFn: (url: string) => unknown,
  metadata: Record<string, unknown> = {},
) {
  const passed: CheckPassingResult[] = [];
  const failed: CheckFindingResult[] = [];
  const fetched: string[] = [];
  const ctx = {
    accessToken: token,
    credentials: {},
    variables: { subscription_id: 'sub-1' },
    connectionId: 'c',
    organizationId: 'o',
    metadata,
    log: () => {},
    warn: () => {},
    error: () => {},
    pass: (r: CheckPassingResult) => passed.push(r),
    fail: (r: CheckFindingResult) => failed.push(r),
    fetch: async (url: string) => {
      fetched.push(url);
      return fetchFn(url);
    },
  } as unknown as CheckContext;
  return { ctx, passed, failed, fetched };
}

describe('Azure cloud detection', () => {
  it('reads the cloud from the token issuer or audience and defaults to commercial', () => {
    expect(azureCloudFromToken(COMMERCIAL_V1)).toBe('commercial');
    expect(azureCloudFromToken(COMMERCIAL_V2)).toBe('commercial');
    expect(azureCloudFromToken(GOV_V1)).toBe('government');
    expect(azureCloudFromToken(GOV_V2)).toBe('government');
    expect(azureCloudFromToken('tok')).toBe('commercial');
    expect(azureCloudFromToken(undefined)).toBe('commercial');
    expect(azureCloudFromToken('a.!!!notbase64.c')).toBe('commercial');
  });

  it('lets connection metadata override the token and maps clouds to ARM hosts', () => {
    expect(armBase({ accessToken: GOV_V1 })).toBe('https://management.usgovcloudapi.net');
    expect(armBase({ accessToken: COMMERCIAL_V2 })).toBe('https://management.azure.com');
    expect(azureCloud({ accessToken: COMMERCIAL_V2, metadata: { azureCloud: 'government' } })).toBe(
      'government',
    );
    expect(azureCloud({ accessToken: GOV_V2, metadata: { azureCloud: 'commercial' } })).toBe(
      'commercial',
    );
  });
});

describe('Azure Government manifest', () => {
  it('uses the .us sign-in, management and portal hosts with the same checks as commercial', () => {
    expect(azureGovManifest.id).toBe('azure-gov');
    expect(azureGovManifest.baseUrl).toBe('https://management.usgovcloudapi.net');
    if (azureGovManifest.auth.type !== 'oauth2') throw new Error('expected oauth2');
    expect(azureGovManifest.auth.config.tokenUrl).toBe(
      'https://login.microsoftonline.us/common/oauth2/v2.0/token',
    );
    expect(azureGovManifest.auth.config.scopes).toContain(
      'https://management.usgovcloudapi.net/user_impersonation',
    );
    expect(azureGovManifest.auth.config.createAppUrl).toContain('https://portal.azure.us/');
    expect(azureGovManifest.auth.config.setupInstructions).toContain('GCC High');
    expect(azureGovManifest.checks?.map((c) => c.id)).toEqual(
      azureManifest.checks?.map((c) => c.id),
    );
    expect(createAzureManifest('commercial').id).toBe('azure');
    expect(azureManifest.baseUrl).toBe('https://management.azure.com');
  });
});

describe('Azure Government routing', () => {
  it('sends every ARM call to the Government host when the token came from it', async () => {
    const { ctx, passed, fetched } = ctxWith(GOV_V2, () => ({
      value: [
        {
          id: 'sa1',
          name: 'sa1',
          properties: { supportsHttpsTrafficOnly: true, minimumTlsVersion: 'TLS1_2' },
        },
      ],
    }));
    await storageHttpsTlsCheck.run(ctx);
    expect(passed).toHaveLength(1);
    expect(fetched.length).toBeGreaterThan(0);
    for (const url of fetched)
      expect(url.startsWith('https://management.usgovcloudapi.net/')).toBe(true);
  });

  it('follows a Government nextLink and refuses a commercial one under a Government token', async () => {
    const gov = ctxWith(GOV_V1, (url) =>
      url.includes('skiptoken')
        ? { value: [{ id: 2 }] }
        : {
            value: [{ id: 1 }],
            nextLink: 'https://management.usgovcloudapi.net/subscriptions/sub-1/x?skiptoken=1',
          },
    );
    const ok = await armListAllWithCoverage<{ id: number }>({
      ctx: gov.ctx,
      url: 'https://management.usgovcloudapi.net/subscriptions/sub-1/x?api-version=1',
    });
    expect(ok.items.map((i) => i.id)).toEqual([1, 2]);
    expect(ok.coverageGaps).toEqual([]);

    const crossed = ctxWith(GOV_V1, () => ({
      value: [{ id: 1 }],
      nextLink: 'https://management.azure.com/subscriptions/sub-1/x?skiptoken=1',
    }));
    const stopped = await armListAllWithCoverage<{ id: number }>({
      ctx: crossed.ctx,
      url: 'https://management.usgovcloudapi.net/subscriptions/sub-1/x?api-version=1',
    });
    expect(stopped.items.map((i) => i.id)).toEqual([1]);
    expect(stopped.coverageGaps).toEqual(['unexpected-next-link-host']);
    expect(crossed.fetched).toHaveLength(1);
  });
});
