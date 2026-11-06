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
 * Structural TipTap policy document for one family of a CSET-derived framework. Same
 * section order as the upstream templates; prose is a draft for review.
 */
export function buildPolicyContent(args: { family: string; framework: string; attribution: string; statements: string[] }): Node {
  const area = args.family.toLowerCase();
  return {
    type: 'doc',
    content: [
      heading('Purpose'),
      paragraph(
        `This policy establishes {{COMPANY}}'s requirements for ${area}, following the ` +
          `${args.framework} (${args.attribution}). It supports the organization's cyber resilience ` +
          'and any contractual, regulatory or insurance expectations that reference these practices.',
      ),
      heading('Scope'),
      paragraph(
        'This policy applies to all {{COMPANY}} systems, networks, facilities, data and personnel ' +
          '(including contractors and service providers) within the assessment scope, covering both ' +
          'information technology (IT) and operational technology (OT) where present.',
      ),
      heading('Policy'),
      paragraph(`{{COMPANY}} shall implement and maintain the following ${area} practices:`),
      bullets(args.statements),
      heading('Roles and Responsibilities'),
      paragraph(
        'The cybersecurity lead owns this policy and its supporting procedures. System and process ' +
          'owners implement the practices for their systems. All personnel comply with this policy and ' +
          'report suspected violations. The compliance function retains evidence of implementation.',
      ),
      heading('Compliance Measurement'),
      paragraph(
        'Compliance is verified through the evidence tasks linked to each control, periodic ' +
          `self-assessment against the ${args.framework}, and external assessments. Results and gaps are ` +
          'recorded in the risk mitigation plan.',
      ),
      heading('Exceptions'),
      paragraph(
        'Exceptions require a documented risk acceptance approved by the cybersecurity lead, a ' +
          'compensating control where one exists, and a review date.',
      ),
      heading('Non-Compliance'),
      paragraph('Violations may result in disciplinary action up to and including termination.'),
      heading('Review'),
      paragraph(
        'This policy is reviewed at least annually and upon significant changes to systems, ' +
          'operations or the referenced guidance.',
      ),
    ],
  };
}
