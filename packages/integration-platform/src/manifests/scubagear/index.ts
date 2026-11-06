import type { IntegrationManifest } from '../../types';
import { buildPolicyChecks, scubaReportCheck } from './checks';
import { SCUBA_BASELINE_VERSION } from './policies.generated';
import { SCUBA_RESULTS_FIELD } from './results';
import { SCUBA_PRODUCTS } from './types';
import { maxReportAgeDaysVariable, shouldPoliciesVariable } from './variables';

/**
 * CISA ScubaGear: the Secure Cloud Business Applications (SCuBA) baseline
 * assessment for Microsoft 365. ScubaGear itself runs on a Windows host with
 * PowerShell (Invoke-SCuBA) and writes ScubaResults_<uuid>.json; this
 * integration consumes that file. There is no live tenant access here: the
 * uploaded report is stored (encrypted) on the connection and every SCuBA
 * policy becomes a check mapped to a NIST SP 800-171 Rev 2 objective.
 */
export const scubaGearManifest: IntegrationManifest = {
  id: 'scubagear',
  name: 'CISA ScubaGear (SCuBA for Microsoft 365)',
  description: `Upload a ScubaGear results file and get one check per SCuBA policy (${SCUBA_BASELINE_VERSION} baselines: Entra ID, Exchange Online, SharePoint, Teams, Power Platform, Power BI, Security Suite), mapped to NIST SP 800-171 Rev 2 assessment objectives. Works for commercial, GCC and GCC High tenants.`,
  category: 'Security',
  logoUrl: 'https://img.logo.dev/cisa.gov?token=pk_AZatYxV5QDSfWpRDaBxzRQ&format=png&retina=true',
  docsUrl: 'https://github.com/cisagov/ScubaGear',
  supportsMultipleConnections: true,
  isActive: true,

  auth: {
    type: 'custom',
    config: {
      description: 'No credentials: the connection holds an uploaded ScubaGear report.',
      credentialFields: [
        {
          id: 'connectionName',
          label: 'Connection name',
          type: 'text',
          required: true,
          placeholder: 'Contoso GCC tenant',
          helpText: 'Shown in the connection list; use the client and tenant name.',
        },
        {
          id: 'environment',
          label: 'Microsoft 365 environment',
          type: 'select',
          required: true,
          options: [
            { value: 'commercial', label: 'Commercial' },
            { value: 'gcc', label: 'GCC' },
            { value: 'gcchigh', label: 'GCC High' },
            { value: 'dod', label: 'DoD' },
          ],
          helpText: 'The -M365Environment value used when running Invoke-SCuBA.',
        },
        {
          id: SCUBA_RESULTS_FIELD,
          label: 'ScubaGear results JSON (optional here)',
          type: 'textarea',
          required: false,
          placeholder: '{ "MetaData": { "Tool": "ScubaGear", ... }, "Results": { ... } }',
          helpText:
            'Usually left empty: after connecting, open the connection settings and upload the ScubaResults_<uuid>.json file there.',
        },
      ],
      setupInstructions: `1. On a Windows host with PowerShell 5.1 or 7, install ScubaGear: Install-Module ScubaGear; Initialize-SCuBA
2. Sign in as a reader of the tenant and run it, for example:
   Invoke-SCuBA -ProductNames * -M365Environment gcc
   (use commercial, gcc, gcchigh or dod to match the tenant)
3. ScubaGear writes a folder M365BaselineConformance_<date> with ScubaResults_<uuid>.json
4. Create this connection, then open its settings and upload that JSON file. Only the report metadata, summary and per-policy results are kept; the raw tenant export inside the file is dropped before storage.
5. Re-run ScubaGear and upload again at least every ${maxReportAgeDaysVariable.default} days (configurable); older reports are reported as stale.`,
    },
  },

  baseUrl: '',
  capabilities: ['checks'],

  services: [
    { id: 'report', name: 'Report', description: 'Upload present and current', enabledByDefault: true, implemented: true },
    ...(Object.keys(SCUBA_PRODUCTS) as Array<keyof typeof SCUBA_PRODUCTS>).map((product) => ({
      id: SCUBA_PRODUCTS[product].service,
      name: SCUBA_PRODUCTS[product].name,
      description: `SCuBA ${product} baseline policies`,
      enabledByDefault: true,
      implemented: true,
    })),
  ],

  variables: [shouldPoliciesVariable, maxReportAgeDaysVariable],

  checks: [scubaReportCheck, ...buildPolicyChecks()],
};

export { compactScubaResults, parseStoredResults, SCUBA_RESULTS_FIELD } from './results';
export { SCUBA_BASELINE_VERSION, SCUBA_POLICIES } from './policies.generated';
export { SCUBA_OBJECTIVES } from './objective-map';
export type { ScubaCompactResults, ScubaCompactPolicy, ScubaPolicyDef } from './types';
