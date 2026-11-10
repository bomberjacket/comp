import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { WATER_FRAMEWORK_ID } from './water-program.constants';

export interface EvidenceTaskView {
  taskId: string;
  title: string;
  /** Paragraphs of the task description: what to collect and why. */
  description: string[];
  status: string;
  attachments: number;
  /** EPA checklist questions answered under the same CPG goal, with the current answer. */
  questions: Array<{ identifier: string; name: string; answer: string | null }>;
}

@Injectable()
export class WaterEvidenceService {
  /** Evidence tasks of the water framework: one per CPG 2.0 goal, with attachment counts. */
  async evidenceTasks(organizationId: string) {
    const links = await db.frameworkEditorControlTaskTemplateLink.findMany({
      where: { frameworkId: WATER_FRAMEWORK_ID, taskTemplate: { name: { startsWith: 'Evidence:' } } },
      select: { taskTemplateId: true, controlTemplateId: true },
    });
    const tasks = await db.task.findMany({
      where: { organizationId, taskTemplateId: { in: links.map((l) => l.taskTemplateId) } },
      select: { id: true, title: true, description: true, status: true, taskTemplateId: true },
      orderBy: { title: 'asc' },
    });
    return { links, tasks };
  }

  async getEvidence(frameworkInstanceId: string, organizationId: string): Promise<EvidenceTaskView[]> {
    const instance = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId, frameworkId: WATER_FRAMEWORK_ID },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Water framework instance not found');
    const { links, tasks } = await this.evidenceTasks(organizationId);
    const controlByTemplate = new Map(links.map((l) => [l.taskTemplateId, l.controlTemplateId]));
    const [counts, controls, answers] = await Promise.all([
      db.attachment.groupBy({
        by: ['entityId'],
        where: { organizationId, entityType: 'task', entityId: { in: tasks.map((t) => t.id) } },
        _count: { _all: true },
      }),
      db.frameworkEditorControlTemplate.findMany({
        where: { id: { in: links.map((l) => l.controlTemplateId) } },
        select: {
          id: true,
          requirements: { where: { frameworkId: WATER_FRAMEWORK_ID }, select: { id: true, identifier: true, name: true, sortOrder: true } },
        },
      }),
      db.requirementAnswer.findMany({
        where: { frameworkInstanceId, organizationId },
        select: { requirementId: true, answer: true },
      }),
    ]);
    const countByTask = new Map(counts.map((c) => [c.entityId, c._count._all]));
    const answerByReq = new Map(answers.map((a) => [a.requirementId, a.answer as string]));
    const reqsByControl = new Map(controls.map((c) => [c.id, c.requirements]));
    return tasks.map((t) => {
      const reqs = reqsByControl.get(controlByTemplate.get(t.taskTemplateId ?? '') ?? '') ?? [];
      return {
        taskId: t.id,
        title: t.title.replace(/^Evidence: /, ''),
        description: (t.description ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
        status: t.status,
        attachments: countByTask.get(t.id) ?? 0,
        questions: [...reqs]
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((r) => ({ identifier: r.identifier, name: r.name, answer: answerByReq.get(r.id) ?? null })),
      };
    });
  }
}
