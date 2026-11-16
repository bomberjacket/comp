import type { WaterPlanView } from './water-plans.service';
import type { TabletopCadence } from './water-tabletop.service';

/** One record the platform holds that counts as evidence for a goal. */
export interface SystemEvidenceItem {
  label: string;
  provided: boolean;
  /** What the record says, or what is still missing and where to supply it. */
  detail: string;
}

export type EvidenceSource = 'system' | 'you';

export interface GoalEvidencePlan {
  /** Who supplies the evidence today. */
  source: EvidenceSource;
  system: SystemEvidenceItem[];
  /** A way the platform could supply it later; not built yet. */
  planned?: string;
}

export interface SystemEvidenceInputs {
  plans: WaterPlanView[];
  vendors: number;
  vendorsScored: number;
  integratorSheets: number;
  cadence: TabletopCadence;
  members: number;
  membersTrained: number;
}

const PLANNED_BUSINESS =
  'Can be checked automatically on the business network once a Microsoft 365 or Google Workspace connection is mapped to this goal (not built yet). The control system side stays with you.';
const PLANNED_MALCOLM = 'Can come from passive network monitoring (CISA Malcolm) once that is connected (not built yet).';

const PLANNED: Record<string, string> = {
  '3.B': PLANNED_BUSINESS,
  '3.D': PLANNED_BUSINESS,
  '3.E': PLANNED_BUSINESS,
  '3.F': PLANNED_BUSINESS,
  '3.G': PLANNED_BUSINESS,
  '3.K': PLANNED_BUSINESS,
  '3.L': PLANNED_BUSINESS,
  '3.M': PLANNED_BUSINESS,
  '2.A': PLANNED_MALCOLM,
  '2.E': PLANNED_MALCOLM,
  '3.I': PLANNED_MALCOLM,
  '3.R': PLANNED_MALCOLM,
  '3.S': PLANNED_MALCOLM,
};

/** Goal id at the start of an evidence task title, e.g. "1.A Establish ..." gives "1.A". */
export const goalIdOf = (title: string): string => title.trim().split(/\s+/)[0] ?? '';

/**
 * Which evidence the platform already holds for a CPG 2.0 goal of the water program,
 * read from the records made in the other steps: the two plans, the vendor score
 * sheets, the tabletop sessions and the training records.
 */
export function goalEvidencePlan(goalId: string, inputs: SystemEvidenceInputs): GoalEvidencePlan {
  const plan = (key: 'crmp' | 'cirp') => inputs.plans.find((p) => p.key === key);
  const crmp = plan('crmp');
  const cirp = plan('cirp');

  /** A filled box of a plan section, as an evidence item. */
  const box = (p: WaterPlanView | undefined, sectionTitle: string, label: string, itemLabel: string): SystemEvidenceItem => {
    const section = p?.sections.find((s) => s.title === sectionTitle);
    const value = section?.fields.find((f) => f.label === label)?.value.trim() ?? '';
    const where = `${p?.name.split(' (')[0] ?? 'the plan'}, section "${sectionTitle}"`;
    return value
      ? { label: itemLabel, provided: true, detail: `${value.split('\n')[0]} (${where})` }
      : { label: itemLabel, provided: false, detail: `Not filled in yet: "${label}" in ${where}. Step 1 of the guide.` };
  };
  const published = (p: WaterPlanView | undefined, name: string): SystemEvidenceItem => {
    const percent = p && p.totalFields > 0 ? Math.round((p.filledFields / p.totalFields) * 100) : 0;
    return p?.status === 'published'
      ? { label: `${name} is published`, provided: true, detail: `Published, ${percent}% of the requested information filled in.` }
      : { label: `${name} is published`, provided: false, detail: `Still a draft, ${percent}% filled in. Publish it in step 1 of the guide.` };
  };
  const exercised: SystemEvidenceItem =
    inputs.cadence.lastHeldOn && !inputs.cadence.overdue
      ? { label: 'The plan was exercised within its cadence', provided: true, detail: `Tabletop held ${inputs.cadence.lastHeldOn}, next due ${inputs.cadence.nextDue}.` }
      : {
          label: 'The plan was exercised within its cadence',
          provided: false,
          detail: inputs.cadence.lastHeldOn
            ? `The last tabletop was ${inputs.cadence.lastHeldOn}; the next one was due ${inputs.cadence.nextDue}. Step 6 of the guide.`
            : 'No tabletop session has been held yet. Step 6 of the guide.',
        };

  const system: Record<string, SystemEvidenceItem[]> = {
    '1.A': [
      box(crmp, '2. Cybersecurity Team', 'Cybersecurity lead', 'A named cybersecurity lead'),
      box(crmp, '2. Cybersecurity Team', 'OT cybersecurity lead', 'A named OT cybersecurity lead'),
      published(crmp, 'The risk management plan'),
    ],
    '1.C': [published(cirp, 'The incident response plan'), box(cirp, 'Incident Response Team', 'Incident commander', 'A named incident commander'), exercised],
    '1.E': [
      inputs.vendors > 0 && inputs.vendorsScored > 0
        ? { label: 'Vendors scored with the EPA procurement checklist', provided: true, detail: `${inputs.vendorsScored} of ${inputs.vendors} vendors scored, ${inputs.integratorSheets} with the integrator and service provider sheet.` }
        : { label: 'Vendors scored with the EPA procurement checklist', provided: false, detail: `${inputs.vendorsScored} of ${inputs.vendors} vendors scored. Step 5 of the guide.` },
      box(crmp, '5. Third-Party Risk Management', 'Vendors, integrators and service providers with network or remote access', 'A list of vendors with access'),
    ],
    '3.J': [
      inputs.members > 0 && inputs.membersTrained > 0
        ? { label: 'Training completions recorded in this platform', provided: true, detail: `${inputs.membersTrained} of ${inputs.members} people have completed training here.` }
        : { label: 'Training completions recorded in this platform', provided: false, detail: 'No one has completed training in this platform. If training is given elsewhere, attach those records below.' },
      box(crmp, '4. Employee Training and Awareness', 'When training is given', 'A training schedule'),
    ],
    '5.B': [
      box(cirp, 'Cyber-Incident Action Checklist', 'Who makes each external notification', 'Who reports an incident, and to whom'),
      box(crmp, '6. Incident Response Plan', 'State primacy agency reporting contact', 'The state reporting contact'),
      published(cirp, 'The incident response plan'),
    ],
    '6.A': [
      box(crmp, '7. Business Continuity and Disaster Recovery', 'Recovery order and target times', 'A recovery order with target times'),
      box(crmp, '7. Business Continuity and Disaster Recovery', 'Date and result of the last restore test', 'A dated restore test'),
      box(cirp, 'Post Incident Actions', 'Who signs off recovery', 'Who signs off recovery'),
    ],
  };
  const items = system[goalId];
  return items ? { source: 'system', system: items } : { source: 'you', system: [], ...(PLANNED[goalId] ? { planned: PLANNED[goalId] } : {}) };
}
