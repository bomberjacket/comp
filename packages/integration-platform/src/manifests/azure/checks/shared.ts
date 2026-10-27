import type { CheckContext } from '../../../types';
import { remediationForReadFailure, toHttpReadFailure } from '../../http-read-failure';

/**
 * Azure clouds. CMMC Level 2 work on GCC lives in commercial Azure; GCC High
 * tenants (ITAR / foreign military sales only) keep their subscriptions in
 * Azure Government, which has its own sign-in, management and portal hosts.
 */
export type AzureCloud = 'commercial' | 'government';

export const AZURE_CLOUDS: Record<
  AzureCloud,
  { arm: string; login: string; portal: string; label: string }
> = {
  commercial: {
    arm: 'https://management.azure.com',
    login: 'https://login.microsoftonline.com',
    portal: 'https://portal.azure.com',
    label: 'Microsoft Azure',
  },
  government: {
    arm: 'https://management.usgovcloudapi.net',
    login: 'https://login.microsoftonline.us',
    portal: 'https://portal.azure.us',
    label: 'Microsoft Azure Government',
  },
};

const GOVERNMENT_HOSTS = /microsoftonline\.us|usgovcloudapi\.net|usgovtrafficmanager\.net/i;

/**
 * Which cloud minted an access token, from its issuer and audience claims.
 * The checks share one code path for both clouds, and the context does not
 * carry the manifest, so the token itself (which is about to be sent to that
 * cloud anyway) is the one reliable signal. Nothing is verified here; a bad
 * token fails at the API, not in routing. Unknown or opaque tokens default to
 * commercial.
 */
export function azureCloudFromToken(token: string | undefined): AzureCloud {
  const payload = token?.split('.')[1];
  if (!payload) return 'commercial';
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    const claims = JSON.parse(json) as { iss?: unknown; aud?: unknown };
    const parts = [claims.iss, ...(Array.isArray(claims.aud) ? claims.aud : [claims.aud])];
    return GOVERNMENT_HOSTS.test(parts.filter((p) => typeof p === 'string').join(' '))
      ? 'government'
      : 'commercial';
  } catch {
    return 'commercial';
  }
}

/** The cloud a context talks to: an explicit `metadata.azureCloud`, else the token. */
export function azureCloud(ctx: {
  accessToken?: string;
  metadata?: Record<string, unknown>;
}): AzureCloud {
  const explicit = ctx.metadata?.azureCloud;
  if (explicit === 'government' || explicit === 'commercial') return explicit;
  return azureCloudFromToken(ctx.accessToken);
}

/** The Azure Resource Manager host for a context, e.g. `https://management.azure.com`. */
export function armBase(ctx: { accessToken?: string; metadata?: Record<string, unknown> }): string {
  return AZURE_CLOUDS[azureCloud(ctx)].arm;
}

const ARM_PAGE_CAP = 50;

/** Fan-out bound for auto-discovered subscriptions (13 checks × N subs). */
const MAX_SUBSCRIPTIONS = 50;

/** The legacy single-subscription variable (auto-saved by Cloud Tests
 * detection or typed manually). Kept as the no-selection default so existing
 * connections keep their exact pre-picker scan scope. */
function legacySubscriptionId(ctx: CheckContext): string | null {
  const configured = ctx.variables.subscription_id;
  return typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : null;
}

/**
 * Resolve the Azure subscriptions a check should evaluate.
 *
 * Scanning MORE than one subscription is strictly opt-in: customers select
 * subscriptions (one, several, or all) via the `subscription_ids` variable.
 * Without a selection the behavior is identical to before the picker existed —
 * the saved `subscription_id`, else the first Enabled subscription — so a
 * deploy never silently expands an existing customer's scan scope.
 *
 * Returns [] only after emitting an explicit "could not verify" finding, so a
 * scope failure never leaves the mapped tasks silently stale.
 */
export async function resolveAzureSubscriptionIds(ctx: CheckContext): Promise<string[]> {
  const selected = ctx.variables.subscription_ids;
  if (Array.isArray(selected)) {
    const cleaned = selected
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (cleaned.length > MAX_SUBSCRIPTIONS) {
      // Bound the fan-out (13 checks x N subs) to protect the run budget —
      // and surface the gap as a FINDING: scanning less than the customer
      // selected must never hide in a run log.
      const unscanned = cleaned.slice(MAX_SUBSCRIPTIONS);
      ctx.fail({
        title: `Subscription selection exceeds the scan limit (${cleaned.length} selected, ${MAX_SUBSCRIPTIONS} scanned)`,
        description: `${unscanned.length} selected subscription(s) were not scanned because runs are limited to ${MAX_SUBSCRIPTIONS} subscriptions. Resources in the unscanned subscriptions are unverified.`,
        resourceType: 'azure-subscription',
        resourceId: 'subscription-scope',
        severity: 'medium',
        remediation: `Reduce the selection to at most ${MAX_SUBSCRIPTIONS} subscriptions, or contact support to raise the limit for this connection.`,
        evidence: {
          selected: cleaned.length,
          scanned: MAX_SUBSCRIPTIONS,
          unscannedSubscriptionIds: unscanned,
        },
      });
      return cleaned.slice(0, MAX_SUBSCRIPTIONS);
    }
    if (cleaned.length > 0) return cleaned;
  }

  // No explicit selection: preserve the pre-picker behavior exactly.
  const legacy = legacySubscriptionId(ctx);
  if (legacy) return [legacy];

  try {
    const data = await ctx.fetch<{
      value?: Array<{ subscriptionId: string; state?: string }>;
    }>(`${armBase(ctx)}/subscriptions?api-version=2020-01-01`);
    // Only Enabled subscriptions — a Disabled/PastDue one would fail every
    // API call and drown the run in false "could not verify" findings.
    const enabled = (data.value ?? [])
      .filter((s) => s.state === 'Enabled')
      .map((s) => s.subscriptionId);
    if (enabled.length > 0) {
      if (enabled.length > 1) {
        ctx.log(
          `Azure: ${enabled.length} enabled subscriptions visible but none selected — scanning "${enabled[0]}" only. Select subscriptions in the integration settings to scan more.`,
        );
      }
      return [enabled[0]!];
    }
    ctx.fail({
      title: 'Could not verify Azure subscription scope',
      description:
        'No enabled Azure subscription is visible to the connection, so nothing could be scanned.',
      resourceType: 'azure-subscription',
      resourceId: 'unknown',
      severity: 'medium',
      remediation:
        'Grant the connection Reader access to at least one subscription (or select subscriptions in the integration settings), then re-run the check.',
      evidence: { enabledSubscriptionsVisible: 0 },
    });
    return [];
  } catch (err) {
    const failure = toHttpReadFailure(err);
    ctx.fail({
      title: 'Could not verify Azure subscription scope',
      description: `Azure subscriptions could not be listed (${failure.error}), so nothing could be scanned.`,
      resourceType: 'azure-subscription',
      resourceId: 'unknown',
      severity: 'medium',
      remediation: remediationForReadFailure(
        failure,
        'Grant the connection Reader access to the subscription(s), then re-run the check.',
      ),
      evidence: { readError: failure.error },
    });
    return [];
  }
}

/** Paginate an Azure ARM list endpoint (`{ value: T[], nextLink? }`). */
export type ArmListCoverageGap = 'page-cap' | 'unexpected-next-link-host';

export interface ArmListResult<T> {
  items: T[];
  coverageGaps: ArmListCoverageGap[];
}

export async function armListAllWithCoverage<T>({
  ctx,
  url,
}: {
  ctx: CheckContext;
  url: string;
}): Promise<ArmListResult<T>> {
  const out: T[] = [];
  const coverageGaps: ArmListCoverageGap[] = [];
  const host = armBase(ctx);
  let nextUrl: string | undefined = url;
  let pages = 0;
  while (nextUrl && pages < ARM_PAGE_CAP) {
    const data: { value?: T[]; nextLink?: string } = await ctx.fetch(nextUrl);
    if (Array.isArray(data.value)) out.push(...data.value);
    nextUrl = data.nextLink;
    // nextLink is an absolute URL from the API; only follow it if it stays on
    // this cloud's ARM host, so the injected bearer token can't be sent elsewhere.
    if (nextUrl && !nextUrl.startsWith(`${host}/`)) {
      ctx.warn('Azure ARM nextLink pointed to an unexpected host; stopping pagination', {
        nextLink: nextUrl,
      });
      coverageGaps.push('unexpected-next-link-host');
      nextUrl = undefined;
    }
    pages++;
  }
  if (nextUrl) {
    ctx.warn('Azure ARM list hit the page cap; results may be truncated', {
      url,
      pages,
    });
    coverageGaps.push('page-cap');
  }
  return { items: out, coverageGaps };
}

/** Paginate an Azure ARM list endpoint (`{ value: T[], nextLink? }`). */
export async function armListAll<T>(ctx: CheckContext, url: string): Promise<T[]> {
  const result = await armListAllWithCoverage<T>({ ctx, url });
  return result.items;
}

/**
 * Paginate an ARM list endpoint, emitting a "could not verify" finding (and
 * returning null) if the read throws. Use this for a check's primary list so a
 * permission/transient failure surfaces as explicit evidence with remediation
 * rather than aborting the check with a bare error or a false verdict.
 */
export async function armListAllOrFail<T>(
  ctx: CheckContext,
  url: string,
  opts: { what: string; resourceType: string; subscriptionId: string },
): Promise<T[] | null> {
  try {
    return await armListAll<T>(ctx, url);
  } catch (err) {
    const failure = toHttpReadFailure(err);
    ctx.fail({
      title: `Could not verify ${opts.what}`,
      description: `${opts.what} could not be listed from Azure (${failure.error}), so this check is unverified.`,
      resourceType: opts.resourceType,
      resourceId: opts.subscriptionId,
      severity: 'medium',
      remediation: remediationForReadFailure(
        failure,
        'Ensure the connection has Reader access to the subscription, then re-run the check.',
      ),
      evidence: { readError: failure.error },
    });
    return null;
  }
}
