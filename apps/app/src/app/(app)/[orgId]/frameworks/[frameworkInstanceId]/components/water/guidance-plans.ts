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

/** The Who's who page that opens step 1. */
export function rosterGuidance(filled: number, total: number): PageGuidance {
  return {
    about: `Who's who is one list of the utility's people and outside contacts. Both plans read from it, so each name is typed once. ${filled} of ${total} entries are filled in.`,
    steps: [
      'For each role, type the person\'s name, title, mobile phone and an email that still works in an outage.',
      'If one person holds two roles, choose "Same person as" instead of typing them again.',
      'Fill in the outside contacts, or tick "The utility has none".',
      'Tick the vendors that have network or remote access; add any that are missing.',
      'Choose "Save and continue to the plans".',
    ],
    narration:
      `This page is called Who's who. It is a single list of the people and outside contacts the utility relies on for cybersecurity. Both plans, the Cybersecurity Risk Management Plan and the Cyber Incident Response Plan, ask who holds each role. Instead of asking you twice, the platform asks once here and fills in both plans from this list. So far ${filled} of ${total} entries are filled in. ` +
      'The page has four parts. The first part is People and their roles. For each role, type the name, the title, a mobile phone, and an email address that would still work if the utility\'s own email were down. At a small utility one person often holds several roles. In that case, open the list beside the role and choose Same person as, then pick the other role. The incident commander starts out as the same person as the cybersecurity lead; change that if it is someone else. ' +
      'The second part is Outside contacts: the state agency that regulates the utility, the F B I field office, the cyber insurance carrier, and Water I S A C. If the utility has no insurer or is not a member, tick the box that says the utility has none. Below that is the vendor list, which is the same list as the Vendors page. Tick each company that has network or remote access to the utility\'s systems or that supports the control system. Only the ticked companies are carried into the plans, so leave ordinary suppliers unticked. If a company is missing, add it with a few words on what it does and what it can reach. ' +
      'The last part holds facts that both plans use, such as where the manual operation procedures are kept. ' +
      'When you are done, choose Save and continue to the plans. You can come back at any time: the first button at the top of the plans, numbered one, opens this page again, and a change you make here reaches both plans.',
  };
}

export function planGuidance(args: {
  planKey: 'crmp' | 'cirp';
  planName: string;
  index: number;
  total: number;
  sectionTitle: string;
  fieldCount: number;
  written: number;
  published: boolean;
  /** The publish confirmation is showing: percent of the boxes filled. */
  publishPercent?: number;
}): PageGuidance {
  const { planKey, planName, index, total, sectionTitle, fieldCount, written, published, publishPercent } = args;
  if (publishPercent !== undefined && publishPercent < 100) {
    return {
      about: `You are about to publish the ${planName} with ${publishPercent} percent of the requested information filled in. That is allowed; the choice is the utility's.`,
      steps: [
        'Look at the list of sections that still have empty boxes.',
        'Choose "Go back and fill in" to complete them, or "Publish anyway".',
        'A published plan can still be completed later and published again.',
      ],
      narration: `You are about to publish the ${planName}, and ${publishPercent} percent of the requested information is filled in. Publishing an incomplete plan is allowed; that choice belongs to the utility. Before you decide, look at the list of sections that still have empty boxes. An assessor who reads the plan will notice what is missing, so fill in what you can. If the information is not available yet, choose Publish anyway. You can come back later, fill in the rest, and publish the plan again as a new version. To keep working instead, choose Go back and fill in.`,
    };
  }
  const title = sectionTitle.replace(/^\d+\.\s*/, '');
  if (written === total && !published) {
    return {
      about: `Every box in every section of the ${planName} is filled in. The plan is ready to become official.`,
      steps: [
        'Choose "Open in the policy editor" and read the whole plan once.',
        'Come back, go to the last section and choose "Publish plan".',
        'Then pick the other plan at the top, if it is not written yet.',
      ],
      narration: `Every box in every section of the ${planName} is filled in, so the plan is ready to become official. Before you publish, open it in the policy editor and read it from top to bottom once, the way an auditor would. Then come back here, go to the last section and choose Publish plan. Publishing records this version as the approved one. After that, pick the other plan at the top of this box if it is not written yet.`,
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
      index >= total - 1
        ? 'This is the last section. Choose "Save and publish plan"; you are shown how complete the plan is before you confirm.'
        : 'Choose "Save and continue". Your answers go into the plan under the heading "Utility record".',
    ],
    narration:
      `${intro}You are on section ${index + 1} of ${total}, ${title}. ${purpose} ` +
      'The page has three parts. First, the grey box. That is standard wording that BomberJacket wrote for this section. It is already in the plan and it stays there, so you do not retype it. Read it so you know what the section says. ' +
      `Second, under Your part, there are ${fieldCount} boxes to fill in. Each box asks for one fact that only the utility knows, such as a name, a date or a place. The grey text inside an empty box is an example of the kind of answer expected. ` +
      'Type short, plain answers. If you do not know an answer yet, write who will find out and by when. The last box, Additional notes, is optional and is for anything the other boxes do not cover. ' +
      (index >= total - 1
        ? 'This is the last section. When you are done, choose Save and publish plan. Your answers are saved, and you are shown how complete the plan is before you confirm. If boxes are still empty you can publish anyway, or go back and fill them in. '
        : 'When you are done, choose Save and continue. Your answers are saved and the next section opens. Moving to another section always saves what you typed, so there is no separate save step. ') +
      'Your answers are added to the plan under the heading Utility record, each with its label. The circle beside the section turns green when every box is filled.',
  };
}
