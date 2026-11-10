/** What a wizard page shows as orientation, and what the voice says about it. */
export interface PageGuidance {
  /** One or two sentences on screen: what this page is for. */
  about: string;
  /** Numbered steps on screen. */
  steps: string[];
  /** The spoken explanation: purpose, the parts of the screen, the steps, what happens next. */
  narration: string;
}

/** Why each plan section exists, in plain words, by plan and section position. */
const SECTION_PURPOSE: Record<'crmp' | 'cirp', string[]> = {
  crmp: [
    'It says what the plan is for, which systems it covers and who approved it. An auditor, an insurer or a new board member reads this part first.',
    'It names the people responsible for cybersecurity and what each one decides. Without names, nobody owns the work.',
    'It explains how the utility finds its weak points, how often it checks, and who hears the results.',
    'It sets who is trained, on what, and how often. People are the most common way an attacker gets in.',
    'It covers vendors, integrators and anyone with remote access. Many water sector incidents start through a supplier connection.',
    'It points to the separate Cyber Incident Response Plan and says who may activate it.',
    'It explains how the utility keeps water flowing and restores its systems: manual operation, backups and restore tests.',
    'It keeps the plan current: when it is reviewed, who updates it, and what events force an early review.',
  ],
  cirp: [
    'It names who responds to an incident, what each person does, and how to reach them when email and phones may be down.',
    'It tells staff what an incident looks like and how to report one. Fast reporting is what limits the damage.',
    'It sets how serious an incident is and who must be called at each level, so nobody has to decide that under pressure.',
    'It is the step by step list the team follows during an incident, from the first report to recovery.',
    'It covers what happens once the incident is contained: restoring service, notifying regulators and customers, and reporting.',
    'It says what evidence to keep, where, and for how long, for law enforcement, the insurer and the regulator.',
    'It requires a review meeting and a written report after every incident and exercise.',
    'It turns the findings of that review into assigned fixes with owners and dates.',
  ],
};

export function planGuidance(args: {
  planKey: 'crmp' | 'cirp';
  planName: string;
  index: number;
  total: number;
  sectionTitle: string;
  fieldCount: number;
  written: number;
  published: boolean;
}): PageGuidance {
  const { planKey, planName, index, total, sectionTitle, fieldCount, written, published } = args;
  const title = sectionTitle.replace(/^\d+\.\s*/, '');
  if (written === total && !published) {
    return {
      about: `Every box in every section of the ${planName} is filled in. The plan is ready to become official.`,
      steps: [
        'Choose "Open in the policy editor" and read the whole plan once.',
        'Come back and choose "Publish plan".',
        'Then pick the other plan at the top, if it is not written yet.',
      ],
      narration: `Every box in every section of the ${planName} is filled in, so the plan is ready to become official. Before you publish, open it in the policy editor and read it from top to bottom once, the way an auditor would. Then come back here and choose Publish plan. Publishing records this version as the approved one. After that, pick the other plan at the top of this box if it is not written yet.`,
    };
  }
  const purpose = SECTION_PURPOSE[planKey][index] ?? '';
  const intro =
    index === 0
      ? `This step produces a written plan, the ${planName}. It has ${total} sections, listed on the left, and you fill them in one at a time. You do not write the plan from a blank page. `
      : '';
  return {
    about: `Section ${index + 1} of ${total} of the ${planName}: ${title}. ${purpose}`,
    steps: [
      'Read the grey box. That standard wording is already in the plan; you do not retype it.',
      `Under "Your part", fill in the ${fieldCount} boxes. Each asks for one fact about the utility; the grey text in a box is an example.`,
      'If you do not know one yet, write who will find out and by when.',
      'Choose "Save and next". Your answers go into the plan under the heading "Utility record".',
    ],
    narration:
      `${intro}You are on section ${index + 1} of ${total}, ${title}. ${purpose} ` +
      'The page has three parts. First, the grey box. That is standard wording that BomberJacket wrote for this section. It is already in the plan and it stays there, so you do not retype it. Read it so you know what the section says. ' +
      `Second, under Your part, there are ${fieldCount} boxes to fill in. Each box asks for one fact that only the utility knows, such as a name, a date or a place. The grey text inside an empty box is an example of the kind of answer expected. ` +
      'Type short, plain answers. If you do not know an answer yet, write who will find out and by when. The last box, Additional notes, is optional and is for anything the other boxes do not cover. ' +
      `When you are done, choose Save and next. Your answers are added to the plan under the heading Utility record, each with its label. The circle beside the section turns green when every box is filled. When all ${total} sections are green, the Publish plan button becomes available.`,
  };
}
