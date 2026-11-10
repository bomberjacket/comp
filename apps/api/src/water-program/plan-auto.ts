import { db } from '@db';
import type { PlanAutoKey } from './plan-sections.generated';
import { WATER_FRAMEWORK_ID } from './water-program.constants';
import { cadenceOf } from './water-tabletop.service';

const longDate = (d: Date): string => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Values of the plan boxes the platform fills in itself, from its own records. Shown
 * live in the plan writer and written into the plan when a section is saved or the
 * plan is published, so the document says where things are without the utility typing
 * what the platform already knows.
 */
export async function planAutoValues(frameworkInstanceId: string, organizationId: string): Promise<Record<PlanAutoKey, string>> {
  const [answered, expected, last, risks, sessions] = await Promise.all([
    db.requirementAnswer.count({ where: { frameworkInstanceId, organizationId } }),
    db.frameworkEditorRequirement.count({ where: { frameworkId: WATER_FRAMEWORK_ID } }),
    db.requirementAnswer.findFirst({
      where: { frameworkInstanceId, organizationId },
      orderBy: { answeredAt: 'desc' },
      select: { answeredAt: true, answeredBy: { select: { user: { select: { name: true } } } } },
    }),
    db.risk.count({ where: { organizationId } }),
    db.tabletopSession.findMany({
      where: { frameworkInstanceId, organizationId },
      select: { title: true, status: true, heldOn: true, cadenceMonths: true },
    }),
  ]);
  const cadence = cadenceOf(sessions);
  const held = sessions
    .filter((s) => s.status === 'held' && s.heldOn)
    .sort((a, b) => (b.heldOn as Date).getTime() - (a.heldOn as Date).getTime())[0];
  const who = last?.answeredBy?.user?.name;
  return {
    epa_assessment: last
      ? `Answered in this platform (EPA checklist, step 2 of the program guide). ${answered} of ${expected} questions answered; last answer recorded ${longDate(last.answeredAt)}${who ? ` by ${who}` : ''}.`
      : `Answered in this platform (EPA checklist, step 2 of the program guide). No questions answered yet.`,
    risk_register: `The Risks page of this platform. ${risks} ${risks === 1 ? 'risk is' : 'risks are'} recorded.`,
    last_exercise: held?.heldOn
      ? `${longDate(held.heldOn)}: ${held.title}. Recorded in this platform (step 6 of the program guide).`
      : 'Not yet exercised. No tabletop session has been recorded in this platform.',
    next_exercise: cadence.nextDue
      ? `Next exercise due ${longDate(new Date(cadence.nextDue))}, every ${cadence.cadenceMonths} months${cadence.overdue ? ' (overdue)' : ''}. Scheduled in this platform (step 6 of the program guide).`
      : 'Not scheduled yet. The date is set when the first tabletop session is recorded in this platform.',
  };
}
