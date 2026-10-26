import type { CheckContext } from '../../types';
import { remediationForReadFailure, toHttpReadFailure } from '../http-read-failure';
import type { GraphList } from './types';

/**
 * Microsoft clouds. CMMC Level 2 work lives on GCC, which uses the commercial
 * endpoints; GCC High (ITAR / foreign military sales only) uses the `.us` ones.
 */
export type MicrosoftCloud = 'commercial' | 'gcc-high';

export const MICROSOFT_CLOUDS: Record<
  MicrosoftCloud,
  { login: string; graph: string; label: string }
> = {
  commercial: {
    login: 'https://login.microsoftonline.com',
    graph: 'https://graph.microsoft.com',
    label: 'Microsoft 365 (commercial and GCC)',
  },
  'gcc-high': {
    login: 'https://login.microsoftonline.us',
    graph: 'https://graph.microsoft.us',
    label: 'Microsoft 365 GCC High',
  },
};

/** Entra directory role template ids that count as privileged (stable across tenants). */
export const PRIVILEGED_ROLE_TEMPLATES: Record<string, string> = {
  '62e90394-69f5-4237-9190-012177145e10': 'Global Administrator',
  'e8611ab8-c189-46e8-94e1-60213ab1f814': 'Privileged Role Administrator',
  '9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3': 'Application Administrator',
  '158c047a-c907-4556-b7ef-446551a6b5f7': 'Cloud Application Administrator',
  'fe930be7-5e62-47db-91af-98c3a49a38b1': 'User Administrator',
  '194ae4cb-b126-40b2-bd5b-6091b380977d': 'Security Administrator',
  '29232cdf-9323-42fd-ade2-1d097af3e4de': 'Exchange Administrator',
  'f28a1f50-f6e7-4571-818b-6a12f2af6b6c': 'SharePoint Administrator',
  '3a2c62db-5318-420d-8d74-23affee5d9d5': 'Intune Administrator',
  'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9': 'Conditional Access Administrator',
  '7be44c8a-adaf-4e2a-84d6-ab2649e08a13': 'Privileged Authentication Administrator',
  'c4e39bd9-1100-46d3-8c65-fb160da0071f': 'Authentication Administrator',
  '966707d0-3269-4727-9be2-8c3a10f19b9d': 'Password Administrator',
  '729827e3-9c14-49f7-bb1b-9608f156bbb8': 'Helpdesk Administrator',
  'e3973bdf-4987-49ae-837a-ba8e231c7286': 'Azure DevOps Administrator',
  '0964bb5e-9bdb-4d7b-ac29-58e794862a40': 'Search Administrator',
  'fdd7a751-b60b-444a-984c-02652fe8fa1c': 'Groups Administrator',
  '7698a772-787b-4ac8-901f-60d6b08affd2': 'Cloud Device Administrator',
  'd37c8bed-0711-4417-ba38-b4abe66ce4c2': 'Network Administrator',
  'a9ea8996-122f-4c74-9520-8edcd192826c': 'Fabric Administrator',
  '11648597-926c-4cf3-9c36-bcebb0ba8dcc': 'Power Platform Administrator',
  '8ac3fc64-6eca-42ea-9e69-59f4c7b60eb2': 'Hybrid Identity Administrator',
  '5d6b6bb7-de71-4623-b4af-96380a352509': 'Security Reader',
  '4a5d8f65-41da-4de4-8968-e035b65339cf': 'Reports Reader',
  '17315797-102d-40b4-93e0-432062caca18': 'Compliance Administrator',
  'e6d1a23a-da11-4be4-9570-befc86d067a7': 'Compliance Data Administrator',
  '3edaf663-341e-4475-9f94-5c398ef6c070': 'Billing Administrator',
  '69091246-20e8-4a56-aa4d-066075b2a7a8': 'Teams Administrator',
  '44367163-eba1-44c3-98af-f5787879f96a': 'Dynamics 365 Administrator',
  '7495fdc4-34c4-4d15-a289-98788ce399fd': 'Azure Information Protection Administrator',
  '45d8d3c5-c802-45c6-b32a-1d70b5e1e86e': 'Identity Governance Administrator',
  '8835291a-918c-4fd7-a9ce-faa49f0cf7d9': 'Attack Simulation Administrator',
  '2b745bdf-0803-4d80-aa65-822c4493daac': 'Office Apps Administrator',
  '31e939ad-9672-4796-9c2e-873181342d2d': 'Authentication Policy Administrator',
  'b0f54661-2d74-4c50-afa3-1ec803f12efe': 'Global Reader',
};

/** Page through a Graph collection (`{ value: T[], "@odata.nextLink"? }`). */
export async function graphListAll<T>(
  ctx: CheckContext,
  path: string,
  params?: Record<string, string>,
): Promise<T[]> {
  return ctx.fetchWithCursor<T>(path, {
    cursorPath: '@odata.nextLink',
    dataPath: 'value',
    params,
    maxPages: 200,
  });
}

/**
 * List a Graph collection, or emit one "could not verify" finding and return
 * null, so a missing permission or a transient failure shows up as evidence
 * with remediation instead of a bare error or a false verdict.
 */
export async function graphListAllOrFail<T>(
  ctx: CheckContext,
  path: string,
  opts: { what: string; resourceType: string; permission: string; params?: Record<string, string> },
): Promise<T[] | null> {
  try {
    return await graphListAll<T>(ctx, path, opts.params);
  } catch (err) {
    emitUnverified(ctx, opts, err);
    return null;
  }
}

/** The "could not verify" finding for a Graph read that threw. */
export function emitUnverified(
  ctx: CheckContext,
  opts: { what: string; resourceType: string; permission: string },
  err: unknown,
): void {
  const failure = toHttpReadFailure(err);
  ctx.fail({
    title: `Could not verify ${opts.what}`,
    description: `${opts.what} could not be read from Microsoft Graph (${failure.error}), so this check is unverified.`,
    resourceType: opts.resourceType,
    resourceId: 'tenant',
    severity: 'medium',
    remediation: remediationForReadFailure(
      failure,
      `Grant the connection the ${opts.permission} permission (admin consent), then re-run the check.`,
    ),
    evidence: { readError: failure.error, permission: opts.permission },
  });
}

export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86_400_000);
}

/** Objects of type GraphList used by tests and variables. */
export type { GraphList };
