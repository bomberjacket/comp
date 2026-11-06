import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { exportToCset, importFromCset, type CsetPayload } from './cset-json';
import type { AnswerInputDto, AnswerSettingDto } from './dto/upsert-answers.dto';
import {
  CSET_CODE_TO_VALUE,
  computeResults,
  effectiveDomains,
  taskStatusFor,
  type AnswerDomain,
  type AnswerValue,
} from './results';

const NEEDS_JUSTIFICATION = new Set<AnswerValue>(['not_applicable', 'alternate']);

/**
 * Answers for question-based frameworks (CISA CSET modules). A framework qualifies
 * when its `FrameworkAnswerProfile` exists; every call resolves the instance in the
 * caller's organization first. Saving answers also moves the control's evidence
 * task so upstream's task-derived views stay consistent.
 */
@Injectable()
export class RequirementAnswersService {
  private readonly logger = new Logger(RequirementAnswersService.name);

  private async context(frameworkInstanceId: string, organizationId: string) {
    const fi = await db.frameworkInstance.findUnique({
      where: { id: frameworkInstanceId, organizationId },
      include: {
        framework: { include: { answerProfile: true } },
        answerSetting: true,
      },
    });
    if (!fi) throw new NotFoundException('Framework instance not found');
    const profile = fi.framework?.answerProfile;
    if (!fi.framework || !profile)
      throw new NotFoundException('This framework is not answered question by question');
    return {
      fi,
      framework: fi.framework,
      profile,
      domains: effectiveDomains(profile.domainMode, (fi.answerSetting?.domains ?? []) as AnswerDomain[]),
      chosenDomains: (fi.answerSetting?.domains ?? []) as AnswerDomain[],
    };
  }

  /** Requirement rows of the instance with the control each maps to. */
  private async requirementsOf(frameworkInstanceId: string, frameworkId: string) {
    const [defs, maps] = await Promise.all([
      db.frameworkEditorRequirement.findMany({
        where: { frameworkId },
        select: { id: true, identifier: true, name: true, requirementFamily: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { identifier: 'asc' }],
      }),
      db.requirementMap.findMany({
        where: { frameworkInstanceId, archivedAt: null, requirementId: { not: null } },
        select: { requirementId: true, controlId: true, control: { select: { name: true } } },
      }),
    ]);
    const controlOf = new Map(maps.map((m) => [m.requirementId as string, m]));
    return {
      requirements: defs.map((d) => ({
        id: d.id,
        identifier: d.identifier,
        name: d.name,
        family: d.requirementFamily,
        controlId: controlOf.get(d.id)?.controlId ?? null,
      })),
      controls: [...new Map(maps.map((m) => [m.controlId, { id: m.controlId, name: m.control.name }])).values()],
    };
  }

  async getAnswers(frameworkInstanceId: string, organizationId: string) {
    const ctx = await this.context(frameworkInstanceId, organizationId);
    const answers = await db.requirementAnswer.findMany({
      where: { frameworkInstanceId },
      select: {
        id: true,
        requirementId: true,
        domain: true,
        answer: true,
        justification: true,
        comment: true,
        markForReview: true,
        answeredAt: true,
        answeredBy: { select: { user: { select: { name: true, email: true } } } },
      },
    });
    return {
      profile: {
        answerOptions: ctx.profile.answerOptions,
        answerValues: ctx.profile.answerOptions.map((c) => CSET_CODE_TO_VALUE[c]).filter(Boolean),
        domainMode: ctx.profile.domainMode,
        scoring: ctx.profile.scoring,
      },
      domains: ctx.domains,
      chosenDomains: ctx.chosenDomains,
      answers,
    };
  }

  async upsertAnswers(args: {
    frameworkInstanceId: string;
    organizationId: string;
    userId: string | undefined;
    answers: AnswerInputDto[];
  }) {
    const { frameworkInstanceId, organizationId, userId, answers } = args;
    const ctx = await this.context(frameworkInstanceId, organizationId);
    const allowed = new Set(ctx.profile.answerOptions.map((c) => CSET_CODE_TO_VALUE[c]));
    const mapped = new Set(
      (
        await db.requirementMap.findMany({
          where: { frameworkInstanceId, archivedAt: null, requirementId: { not: null } },
          select: { requirementId: true },
        })
      ).map((m) => m.requirementId as string),
    );
    const member = userId
      ? await db.member.findFirst({ where: { userId, organizationId, deactivated: false }, select: { id: true } })
      : null;

    const rows = answers.map((a) => {
      const domain: AnswerDomain = a.domain ?? (ctx.profile.domainMode === 'it_ot' ? 'it' : 'all');
      if (!mapped.has(a.requirementId))
        throw new BadRequestException(`Requirement ${a.requirementId} is not part of this framework`);
      if (!allowed.has(a.answer))
        throw new BadRequestException(`Answer ${a.answer} is not one of this framework's options`);
      if (ctx.profile.domainMode === 'single' ? domain !== 'all' : domain === 'all')
        throw new BadRequestException(`Domain ${domain} does not fit this framework`);
      if (NEEDS_JUSTIFICATION.has(a.answer) && !a.justification?.trim())
        throw new BadRequestException(`A justification is required for ${a.answer}`);
      return { ...a, domain };
    });

    await db.$transaction(
      rows.map((a) =>
        db.requirementAnswer.upsert({
          where: {
            frameworkInstanceId_requirementId_domain: {
              frameworkInstanceId,
              requirementId: a.requirementId,
              domain: a.domain,
            },
          },
          create: {
            organizationId,
            frameworkInstanceId,
            requirementId: a.requirementId,
            domain: a.domain,
            answer: a.answer,
            justification: a.justification?.trim() || null,
            comment: a.comment?.trim() || null,
            markForReview: a.markForReview ?? false,
            answeredById: member?.id ?? null,
          },
          update: {
            answer: a.answer,
            justification: a.justification?.trim() || null,
            comment: a.comment === undefined ? undefined : a.comment.trim() || null,
            markForReview: a.markForReview ?? undefined,
            answeredById: member?.id ?? null,
            answeredAt: new Date(),
          },
        }),
      ),
    );
    await this.syncTasks(frameworkInstanceId, ctx.domains, rows.map((a) => a.requirementId));
    return this.getAnswers(frameworkInstanceId, organizationId);
  }

  /**
   * Moves each affected control's evidence task to match the answers: done when
   * every requirement (per domain) is yes/alternate/not applicable, not_relevant when
   * all are not applicable, otherwise todo. Tasks in review are left alone.
   */
  async syncTasks(frameworkInstanceId: string, domains: AnswerDomain[], requirementIds: string[] | null) {
    const maps = await db.requirementMap.findMany({
      where: {
        frameworkInstanceId,
        archivedAt: null,
        requirementId: requirementIds ? { in: requirementIds } : { not: null },
      },
      select: { controlId: true },
    });
    const controlIds = [...new Set(maps.map((m) => m.controlId))];
    if (controlIds.length === 0) return;
    const [allMaps, answers, links] = await Promise.all([
      db.requirementMap.findMany({
        where: { frameworkInstanceId, archivedAt: null, controlId: { in: controlIds }, requirementId: { not: null } },
        select: { controlId: true, requirementId: true },
      }),
      db.requirementAnswer.findMany({
        where: { frameworkInstanceId },
        select: { requirementId: true, domain: true, answer: true, justification: true },
      }),
      db.frameworkControlTaskLink.findMany({
        where: { frameworkInstanceId, controlId: { in: controlIds } },
        select: { controlId: true, task: { select: { id: true, status: true } } },
      }),
    ]);
    const typed = answers.map((a) => ({
      requirementId: a.requirementId as string,
      domain: a.domain as AnswerDomain,
      answer: a.answer as AnswerValue,
      justification: a.justification,
    }));
    for (const controlId of controlIds) {
      const reqIds = allMaps.filter((m) => m.controlId === controlId).map((m) => m.requirementId as string);
      const status = taskStatusFor(reqIds, domains, typed);
      if (!status) continue;
      const justification =
        status === 'not_relevant'
          ? [
              ...new Set(
                typed
                  .filter((a) => reqIds.includes(a.requirementId) && a.justification)
                  .map((a) => (a.justification as string).trim()),
              ),
            ].join('; ') || 'All items answered not applicable'
          : null;
      for (const link of links.filter((l) => l.controlId === controlId)) {
        if (link.task.status === 'in_review' || link.task.status === status) continue;
        await db.task.update({
          where: { id: link.task.id },
          data: {
            status,
            notRelevantJustification: justification,
            lastCompletedAt: status === 'done' ? new Date() : undefined,
          },
        });
      }
    }
  }

  async updateSetting(frameworkInstanceId: string, organizationId: string, dto: AnswerSettingDto) {
    const ctx = await this.context(frameworkInstanceId, organizationId);
    if (ctx.profile.domainMode !== 'it_ot')
      throw new BadRequestException('This framework is not answered per IT/OT domain');
    const domains = [...new Set(dto.domains)] as AnswerDomain[];
    await db.frameworkInstanceAnswerSetting.upsert({
      where: { frameworkInstanceId },
      create: { frameworkInstanceId, domains },
      update: { domains },
    });
    await this.syncTasks(frameworkInstanceId, effectiveDomains('it_ot', domains), null);
    return this.getAnswers(frameworkInstanceId, organizationId);
  }

  async getResults(frameworkInstanceId: string, organizationId: string) {
    const ctx = await this.context(frameworkInstanceId, organizationId);
    const { requirements, controls } = await this.requirementsOf(frameworkInstanceId, ctx.framework.id);
    const answers = await db.requirementAnswer.findMany({
      where: { frameworkInstanceId },
      select: { requirementId: true, domain: true, answer: true },
    });
    return computeResults({
      profile: ctx.profile,
      domains: ctx.chosenDomains,
      requirements,
      controls,
      answers: answers.map((a) => ({
        requirementId: a.requirementId as string,
        domain: a.domain as AnswerDomain,
        answer: a.answer as AnswerValue,
      })),
    });
  }

  async importCset(args: {
    frameworkInstanceId: string;
    organizationId: string;
    userId: string | undefined;
    payload: CsetPayload;
  }) {
    const ctx = await this.context(args.frameworkInstanceId, args.organizationId);
    const { requirements } = await this.requirementsOf(args.frameworkInstanceId, ctx.framework.id);
    const result = importFromCset(args.payload, requirements, ctx.profile.domainMode);
    const allowed = new Set(ctx.profile.answerOptions.map((c) => CSET_CODE_TO_VALUE[c]));
    const importable = result.answers.filter((a) => allowed.has(a.answer));
    if (importable.length > 0) {
      await this.upsertAnswers({
        frameworkInstanceId: args.frameworkInstanceId,
        organizationId: args.organizationId,
        userId: args.userId,
        answers: importable.map((a) => ({
          requirementId: a.requirementId,
          domain: a.domain,
          answer: a.answer,
          comment: a.comment ?? undefined,
          justification: NEEDS_JUSTIFICATION.has(a.answer) ? a.comment ?? 'Imported from CSET' : undefined,
        })),
      });
    }
    this.logger.log(
      `CSET import into ${args.frameworkInstanceId}: ${importable.length} answers, ${result.unmatched.length} unmatched, ${result.seen} seen`,
    );
    return {
      imported: importable.length,
      skipped: result.answers.length - importable.length,
      unmatched: result.unmatched,
      seen: result.seen,
    };
  }

  async exportCset(frameworkInstanceId: string, organizationId: string): Promise<CsetPayload> {
    const ctx = await this.context(frameworkInstanceId, organizationId);
    const { requirements } = await this.requirementsOf(frameworkInstanceId, ctx.framework.id);
    const answers = await db.requirementAnswer.findMany({
      where: { frameworkInstanceId },
      select: { requirementId: true, domain: true, answer: true, comment: true },
    });
    return exportToCset({
      frameworkName: ctx.framework.name,
      modelName: ctx.framework.name,
      kind: ctx.profile.scoring === 'standard' ? 'standard' : 'maturity',
      domainMode: ctx.profile.domainMode,
      requirements,
      answers: answers.map((a) => ({
        requirementId: a.requirementId as string,
        domain: a.domain as AnswerDomain,
        answer: a.answer as AnswerValue,
        comment: a.comment,
      })),
    });
  }
}
