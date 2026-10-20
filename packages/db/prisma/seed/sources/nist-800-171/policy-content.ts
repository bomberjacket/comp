import type { FamilyDef } from './types';

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
 * Structural TipTap policy document. Section order follows the upstream templates
 * (Purpose, Scope, Policy, Roles and Responsibilities, Compliance Measurement,
 * Exceptions, Non-Compliance, Review). Prose is a draft for CCA review.
 */
export function buildPolicyContent(fam: FamilyDef, statements: string[]): Node {
  const area = fam.name.toLowerCase();
  return {
    type: 'doc',
    content: [
      heading('Purpose'),
      paragraph(
        `This policy establishes {{COMPANY}}'s requirements for ${area} in accordance with the ` +
          `${fam.code} family of NIST SP 800-171 (Rev 2 family ${fam.r2 ?? 'n/a'}; Rev 3 family ${fam.r3}). ` +
          'It protects Controlled Unclassified Information (CUI) and Federal Contract Information (FCI) ' +
          "handled under {{COMPANY}}'s Department of Defense and other federal contracts.",
      ),
      heading('Scope'),
      paragraph(
        'This policy applies to all {{COMPANY}} systems, system components, facilities, and personnel ' +
          '(including contractors and third parties) that store, process, or transmit CUI, and to the ' +
          'security protection assets that support them, as defined in the CMMC assessment scope.',
      ),
      heading('Policy'),
      paragraph(`{{COMPANY}} shall implement and maintain the following ${area} requirements:`),
      bullets(statements),
      heading('Roles and Responsibilities'),
      paragraph(
        'The Information Security Officer owns this policy and its supporting procedures. System ' +
          'owners implement the requirements for their systems. All personnel comply with this policy ' +
          'and report suspected violations. The compliance function retains evidence of implementation.',
      ),
      heading('Compliance Measurement'),
      paragraph(
        'Compliance is verified through the evidence tasks linked to each assessment objective, periodic ' +
          'self-assessment against NIST SP 800-171A, and CMMC assessments. Results are recorded in the ' +
          'System Security Plan and the Plan of Action and Milestones.',
      ),
      heading('Exceptions'),
      paragraph(
        'Exceptions require a documented risk acceptance approved by the Information Security Officer, ' +
          'an entry in the Plan of Action and Milestones, and a review date.',
      ),
      heading('Non-Compliance'),
      paragraph(
        'Violations may result in disciplinary action up to and including termination, and may be ' +
          'reportable to the contracting officer under the applicable contract clauses.',
      ),
      heading('Review'),
      paragraph(
        'This policy is reviewed at least annually and upon significant changes to systems, ' +
          'contracts, or the NIST SP 800-171 requirements.',
      ),
    ],
  };
}
