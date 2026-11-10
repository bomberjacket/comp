import type { PageGuidance } from './guidance-plans';

export function checklistGuidance(args: { index: number; total: number; question: string; family: string; priority: boolean }): PageGuidance {
  const { index, total, question, family, priority } = args;
  const steps = [
    'Read the question, then the grey text under it: EPA\'s explanation of what a Yes looks like.',
    'Answer for how things are today, not how they are planned. If you are not sure, choose No.',
    'In the note, write how you know: what you looked at or who told you.',
    'Choose "Save and next".',
  ];
  const first =
    index === 0
      ? `This is the Environmental Protection Agency's cybersecurity checklist for drinking water and wastewater systems. It has ${total} questions, one per page. Your answers show which basic protections are in place and which are missing. Every No or In progress becomes an item on the fix list in step 3, so an honest No is more useful than a hopeful Yes. `
      : '';
  const prio = priority ? 'EPA marks this as a priority practice. If the answer is No, it goes to the top of the fix list. ' : '';
  return {
    about: `Question ${index + 1} of ${total} of EPA's checklist, in the group ${family}. Your answers show which basic protections are in place; every No becomes an item to fix in step 3.`,
    steps,
    narration:
      `${first}Question ${index + 1} of ${total}, in the group ${family}. ${prio}The question is: ${question} ` +
      'The grey text under the question is EPA\'s own explanation of why it matters and what a Yes looks like. ' +
      'Choose Yes only when the practice is fully in place today. Choose In progress when part of it is in place. Choose No when it is not in place, or when you do not know, because EPA counts unknown as No. Choose Not applicable only when the utility truly has no such system, and say why. ' +
      'Then use the note box to write how you know: what you looked at, or who told you. An assessor will ask. Choose Save and next to move on.',
  };
}

export function evidenceGuidance(args: { index: number; total: number; title: string; attachments: number; questions: number }): PageGuidance {
  const { index, total, title, attachments, questions } = args;
  const first =
    index === 0
      ? `This step proves the answers you gave on the checklist. A regulator, an insurer or an assessor will not take a Yes on trust; they ask to see something. There are ${total} goals, one per page, and each needs at least one piece of proof. `
      : '';
  const have = attachments === 0 ? 'Nothing is attached to this goal yet. ' : `${attachments} ${attachments === 1 ? 'file is' : 'files are'} already attached to this goal. `;
  return {
    about: `Goal ${index + 1} of ${total}: ${title}. This step proves the checklist answers. Each goal needs at least one document that shows the practice is really running.`,
    steps: [
      'Read "What to collect": the kinds of proof that are accepted for this goal.',
      'Find one in the utility: a policy page, a screenshot of a setting, an export, a training record, a test log.',
      'Choose "Attach evidence" and pick the file. A dated file from the utility\'s own system is best.',
      'Set the status to Done, then choose Next.',
    ],
    narration:
      `${first}Goal ${index + 1} of ${total}: ${title}. ${have}` +
      'The grey box, What to collect, lists the kinds of proof that are accepted for this goal. ' +
      `${questions > 0 ? `Under it you see the ${questions === 1 ? 'checklist answer' : `${questions} checklist answers`} that this proof backs up. ` : ''}` +
      'Find one real example in the utility. It can be a page of a policy, a screenshot of a setting, an export from a system, a training sign-in sheet or a backup test log. Good proof is dated and clearly comes from the utility\'s own system. ' +
      'Choose Attach evidence and pick the file. Then set the status to Done. If the practice is not in place yet, leave the status as To do; the fix belongs to step 3 first. Choose Next for the following goal.',
  };
}

export function vendorGuidance(vendorName: string | null): PageGuidance {
  if (!vendorName) {
    return {
      about: 'This step checks the companies that supply or maintain the utility\'s systems. No vendors are recorded yet, so there is nobody to score.',
      steps: ['Choose "Open vendors".', 'Add each supplier, integrator and service provider that touches the utility\'s systems.', 'Come back to this step to score them.'],
      narration:
        'This step checks the companies that supply or maintain the utility\'s systems. Suppliers and integrators often have remote access to the control system, and several water sector incidents began through them. No vendors are recorded yet, so there is nobody to score. Choose Open vendors and add each supplier, integrator and managed service provider that touches the utility\'s systems. Then come back to this step.',
    };
  }
  return {
    about: `Scoring ${vendorName} with EPA's procurement checklist. It shows how well the vendor's security matches what the utility needs, and what to write into the contract.`,
    steps: [
      'Pick the sheet: supplier for a product or service, integrator for a company that installs or manages systems.',
      'Weight each question 0 to 3 for how much it matters to the utility. Weight 0 leaves it out.',
      'Score the vendor\'s answer 0 to 3, and mark whether it is in the contract.',
      'Choose "Save checklist", then pick the next vendor.',
    ],
    narration:
      `You are scoring ${vendorName}. Suppliers and integrators often have remote access to the control system, so their security is part of the utility's security. This sheet is the Environmental Protection Agency's procurement checklist. Use it before you sign or renew a contract. ` +
      'First pick the sheet at the top. Use the supplier sheet for a company that sells a product or service. Use the integrator sheet for a company that installs, programs or manages systems for the utility. ' +
      'Each row is a question to ask the vendor. Give it two numbers. Weight, from 0 to 3, is how much the question matters to the utility; weight 0 leaves the question out. Score, from 0 to 3, is how well the vendor answered. ' +
      'The badges at the top add it up. A section with a large gap is what to negotiate into the contract. Mark the rows that are already in the contract, choose Save checklist, then pick the next vendor.',
  };
}

export function tabletopGuidance(args: { page: 'setup' | 'topic' | 'after'; topicIndex?: number; topics: number; topicTitle?: string }): PageGuidance {
  const { page, topicIndex = 0, topics, topicTitle = '' } = args;
  if (page === 'setup') {
    return {
      about: 'A tabletop is a meeting where the people who would handle an incident talk through a made-up one. It shows whether the plans from step 1 work before a real incident does. This page sets the meeting up.',
      steps: [
        'Give the session a title and describe the scenario, for example ransomware on the control system on a holiday weekend.',
        'Name the facilitator and who will take part: operators, the manager, IT or the integrator.',
        'Set the months until the next exercise. Twelve is the usual minimum.',
        'Choose "Save and next" to start the first topic.',
      ],
      narration:
        'This step checks that the program works. A tabletop exercise is a meeting, not a test of the systems. The people who would handle an incident sit together and talk through a made-up one, using the plans from step 1. It shows what is missing before a real incident does. It is the last step because it validates everything before it, and it repeats on a schedule. ' +
        'This page sets the meeting up. Give the session a title. Describe the scenario in a few sentences, for example ransomware on the control system on a holiday weekend. Name the facilitator who will run the meeting, and list who will take part: operators, the manager, and IT or the integrator. ' +
        `Then set the number of months until the next exercise; twelve is the usual minimum. Choose Save and next to begin. There are ${topics} topics, one per page.`,
    };
  }
  if (page === 'topic') {
    return {
      about: `Topic ${topicIndex + 1} of ${topics}: ${topicTitle}. Ask the group the questions and write down what they actually say. "We don't know" is a finding, not a failure.`,
      steps: [
        'Read the questions in the grey box aloud to the group.',
        'Under Discussion, write what people said, in their words.',
        'Under Gaps, write anything missing or unclear, and who will fix it.',
        'Choose "Save and next".',
      ],
      narration:
        `Topic ${topicIndex + 1} of ${topics}: ${topicTitle}. ` +
        'The grey box holds questions from the federal tabletop package for the water sector. Read them aloud to the group, in the context of your scenario. There are no right answers. Under Discussion, write what people actually said, in their words. When someone says we do not know, or I thought someone else did that, write it down: that is exactly what the exercise is for. ' +
        'Under Gaps and follow-up actions, write what is missing or unclear, and who will fix it. Then choose Save and next. A topic with a discussion is marked as covered when the session is recorded as held.',
    };
  }
  return {
    about: 'The after-action summary is the record that the exercise happened and what will change because of it. Recording the session as held sets the date the next one is due.',
    steps: [
      'Write what worked, what did not, and who fixes each gap by when.',
      'Enter the date the session was held.',
      'Choose "Record as held".',
      'Print the after-action report from the Report tab if the board or regulator wants a copy.',
    ],
    narration:
      'This is the last page. The after-action summary is the record that the exercise happened, and what will change because of it. Write three things: what worked, what did not, and who will fix each gap by what date. Keep it short; the detail is already in the topics. ' +
      'Then enter the date the session was held and choose Record as held. That marks the covered topics as done and sets the date the next exercise is due. If the board or the regulator wants a copy, the after-action report prints from the Report tab.',
  };
}
