import type { Department, Frequency, PolicyRow } from './types';
import { ids } from './ids';

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };

const heading = (text: string): Node => ({
  type: 'heading',
  attrs: { level: 2, textAlign: null },
  content: [{ type: 'text', text }],
});
const paragraph = (text: string): Node => ({
  type: 'paragraph',
  attrs: { textAlign: null },
  content: [{ type: 'text', text }],
});
const bullets = (items: string[]): Node => ({
  type: 'bulletList',
  content: items.map((t) => ({ type: 'listItem', content: [paragraph(t)] })),
});

/**
 * Plan skeletons for a water or wastewater utility. Section order follows AWWA's 2025
 * Cybersecurity Risk Management Plan and Cyber Incident Response Plan templates (the
 * headings only; the prompts under each are BNI's). Utilities download AWWA's own
 * templates from awwa.org for the full guidance text.
 */
export interface PlanDef {
  key: string;
  name: string;
  description: string;
  /** which CPG 2.0 functions this plan backs (policy link per goal control) */
  functions: string[];
  sections: Array<{ title: string; prompts: string[] }>;
}

export const PLANS: PlanDef[] = [
  {
    key: 'crmp',
    name: 'Cybersecurity Risk Management Plan (water utility, AWWA CRMP structure)',
    description:
      'Utility-wide cybersecurity risk management plan structured after the AWWA 2025 Cybersecurity Risk ' +
      'Management Plan template: team, risk assessment and reporting, training, third-party risk, incident ' +
      'response, continuity and plan maintenance. Backs the Govern, Identify and Protect goals.',
    functions: ['Govern', 'Identify', 'Protect'],
    sections: [
      { title: '1. Introduction', prompts: ['Purpose, scope (which treatment, distribution, collection and business systems) and the authority that approved this plan.'] },
      { title: '2. Cybersecurity Team', prompts: ['Named role accountable for cybersecurity and for OT cybersecurity (EPA checklist 1.B, 1.C); members, deputies and contact details; how IT and OT staff coordinate (1.D).'] },
      { title: '3. Risk Assessment, Monitoring, and Reporting', prompts: ['Asset inventory method and refresh cadence (1.A); vulnerability and KEV handling timelines (1.E); the EPA checklist / CPG assessment schedule and who receives results.'] },
      { title: '4. Employee Training and Awareness', prompts: ['Annual awareness training for all personnel (2.I) and OT-specific training (2.J); records kept.'] },
      { title: '5. Third-Party Risk Management', prompts: ['Cybersecurity criteria in procurement (1.I); the EPA procurement evaluation checklist for suppliers and integrators/MSPs; remote access and contract language.'] },
      { title: '6. Incident Response Plan', prompts: ['Reference to the Cyber Incident Response Plan (2.S); reporting path to EPA, CISA and state primacy agency (4.A).'] },
      { title: '7. Business Continuity and Disaster Recovery', prompts: ['Backups of systems necessary for operations and restoration tests (2.R); manual operation fallback; recovery priorities (5.A).'] },
      { title: '8. Plan Maintenance and Review', prompts: ['Annual review, after incidents and exercises; change log and approval.'] },
    ],
  },
  {
    key: 'cirp',
    name: 'Cyber Incident Response Plan (water utility, AWWA CIRP structure)',
    description:
      'Cyber incident response plan structured after the AWWA 2025 Cyber Incident Response Plan template: ' +
      'response team, detection, severity matrix, action checklist and post-incident actions. Backs the ' +
      'Detect, Respond and Recover goals and the written-plan item of the EPA checklist (2.S).',
    functions: ['Detect', 'Respond', 'Recover'],
    sections: [
      { title: 'Incident Response Team', prompts: ['Roles, alternates, 24x7 contact methods (including when primary communications are down); integrator/MSP and vendor contacts; legal, insurer, public information.'] },
      { title: 'Detecting an Incident', prompts: ['Sources of alerts (logs 2.T/2.U, malicious code detection, operator observations); how staff report suspected incidents and phishing; threat and TTP list in use (3.A).'] },
      { title: 'Severity Matrix', prompts: ['Severity levels tied to effects on water or wastewater service, public health and safety, and data; who declares each level.'] },
      { title: 'Cyber-Incident Action Checklist', prompts: ['Containment steps for OT and IT; manual operations; evidence preservation and chain of custody; notifications to EPA, CISA, state primacy agency, law enforcement and customers (4.A); vendor and MSP engagement.'] },
      { title: 'Post Incident Actions', prompts: ['Recovery and restoration from backups with integrity checks (5.A); criteria for declaring the incident closed.'] },
      { title: 'Evidence Retention', prompts: ['What is retained, where, for how long, and who may release it.'] },
      { title: 'Lessons Learned / After Action Report (AAR)', prompts: ['AAR within 30 days; tabletop exercises at least annually (CISA water CTEP) with senior leadership.'] },
      { title: 'Implementing Improvements/Corrective Actions', prompts: ['Corrective action tracker with owners and dates; feed into the risk management plan.'] },
    ],
  },
];

const ATTRIBUTION =
  'Structure after the AWWA Cybersecurity Risk Management Plan and Cyber Incident Response Plan templates ' +
  '(American Water Works Association, 2025 v1, https://www.awwa.org/cybersecurity); section prompts by ' +
  'BomberJacket Networks. Replace the prompts with the utility\'s own text.';

export function buildPlanPolicies(frameworkName: string, department: Department, frequency: Frequency): PolicyRow[] {
  return PLANS.map((plan) => ({
    id: ids.policy(plan.key),
    name: plan.name,
    description: `${plan.description} Part of the ${frameworkName}.`,
    frequency,
    department,
    content: {
      type: 'doc',
      content: [
        heading('Purpose'),
        paragraph(`This document is {{COMPANY}}'s ${plan.name.split(' (')[0]?.toLowerCase() ?? 'plan'}, maintained under the ${frameworkName}.`),
        ...plan.sections.flatMap((s) => [heading(s.title), bullets(s.prompts)]),
        heading('Source'),
        paragraph(ATTRIBUTION),
      ],
    },
  }));
}
