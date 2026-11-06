import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { CsetPayload } from './cset-json';
import { AnswerSettingDto, ImportCsetDto, UpsertAnswersDto } from './dto/upsert-answers.dto';
import { RequirementAnswersService } from './requirement-answers.service';

/**
 * Question-by-question answers for frameworks that carry an answer profile (the
 * CISA CSET modules). Separate from /frameworks so the upstream controller stays
 * untouched.
 */
@ApiTags('Framework answers')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionGuard)
@Controller({ path: 'framework-answers', version: '1' })
export class RequirementAnswersController {
  constructor(private readonly service: RequirementAnswersService) {}

  @Get(':frameworkInstanceId')
  @RequirePermission('framework', 'read')
  @ApiOperation({ summary: 'Answer profile, domain setting and answers of a framework instance' })
  getAnswers(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
  ) {
    return this.service.getAnswers(frameworkInstanceId, organizationId);
  }

  @Put(':frameworkInstanceId')
  @RequirePermission('framework', 'update')
  @ApiOperation({ summary: 'Save answers (bulk upsert); moves the controls evidence tasks' })
  upsertAnswers(
    @OrganizationId() organizationId: string,
    @AuthContext() auth: AuthContextType,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Body() dto: UpsertAnswersDto,
  ) {
    return this.service.upsertAnswers({
      frameworkInstanceId,
      organizationId,
      userId: auth.userId,
      answers: dto.answers,
    });
  }

  @Put(':frameworkInstanceId/settings')
  @RequirePermission('framework', 'update')
  @ApiOperation({ summary: 'Choose which domains (IT, OT) an IT/OT framework is answered for' })
  updateSetting(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Body() dto: AnswerSettingDto,
  ) {
    return this.service.updateSetting(frameworkInstanceId, organizationId, dto);
  }

  @Get(':frameworkInstanceId/results')
  @RequirePermission('framework', 'read')
  @ApiOperation({ summary: 'Answer distribution per domain, family and control' })
  getResults(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
  ) {
    return this.service.getResults(frameworkInstanceId, organizationId);
  }

  @Post(':frameworkInstanceId/import/cset')
  @RequirePermission('framework', 'update')
  @ApiOperation({ summary: 'Import answers from a CSET assessment JSON export' })
  importCset(
    @OrganizationId() organizationId: string,
    @AuthContext() auth: AuthContextType,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Body() dto: ImportCsetDto,
  ) {
    return this.service.importCset({
      frameworkInstanceId,
      organizationId,
      userId: auth.userId,
      payload: dto.payload as CsetPayload,
    });
  }

  @Get(':frameworkInstanceId/export/cset')
  @RequirePermission('framework', 'read')
  @ApiOperation({ summary: 'Export answers in CSET assessment JSON shape' })
  exportCset(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
  ) {
    return this.service.exportCset(frameworkInstanceId, organizationId);
  }
}
