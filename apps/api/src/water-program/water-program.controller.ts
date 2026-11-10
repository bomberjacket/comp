import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SaveTabletopDto } from './dto/save-tabletop.dto';
import { WriteSectionDto } from './dto/write-section.dto';
import { WaterEvidenceService } from './water-evidence.service';
import { WaterPlansService } from './water-plans.service';
import { WaterProgramService } from './water-program.service';
import { WaterReportService } from './water-report.service';
import { WaterTabletopService } from './water-tabletop.service';

/** Progress of the water and wastewater program steps for one framework instance. */
@ApiTags('Water program')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionGuard)
@Controller({ path: 'water-program', version: '1' })
export class WaterProgramController {
  constructor(
    private readonly service: WaterProgramService,
    private readonly plans: WaterPlansService,
    private readonly evidence: WaterEvidenceService,
    private readonly tabletop: WaterTabletopService,
    private readonly report: WaterReportService,
  ) {}

  @Get(':frameworkInstanceId')
  @RequirePermission('framework', 'read')
  @ApiOperation({ summary: 'The six program steps with live progress and links' })
  getProgram(@OrganizationId() organizationId: string, @Param('frameworkInstanceId') frameworkInstanceId: string) {
    return this.service.getProgram(frameworkInstanceId, organizationId);
  }

  @Get(':frameworkInstanceId/plans')
  @RequirePermission('policy', 'read')
  @ApiOperation({ summary: 'The two plan documents split into sections: guidance, prompts and the utility record' })
  getPlans(@OrganizationId() organizationId: string, @Param('frameworkInstanceId') frameworkInstanceId: string) {
    return this.plans.getPlans(frameworkInstanceId, organizationId);
  }

  @Put(':frameworkInstanceId/plans/:policyId/sections/:index')
  @RequirePermission('policy', 'update')
  @ApiOperation({ summary: "Save the utility's fill-in fields and notes for one plan section" })
  writeSection(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Param('policyId') policyId: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: WriteSectionDto,
  ) {
    return this.plans.writeSection({
      frameworkInstanceId,
      organizationId,
      policyId,
      index,
      fields: dto.fields ?? [],
      notes: dto.notes ?? dto.text ?? '',
    });
  }

  @Post(':frameworkInstanceId/plans/:policyId/sync')
  @RequirePermission('policy', 'update')
  @ApiOperation({ summary: "Write the platform's current values into the plan's auto-filled boxes (before publishing)" })
  syncPlan(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Param('policyId') policyId: string,
  ) {
    return this.plans.syncAuto(frameworkInstanceId, organizationId, policyId);
  }

  @Get(':frameworkInstanceId/report')
  @RequirePermission('framework', 'read')
  @ApiOperation({ summary: 'Assessment report, risk mitigation plan and tabletop after-action data in one read' })
  getReport(@OrganizationId() organizationId: string, @Param('frameworkInstanceId') frameworkInstanceId: string) {
    return this.report.getReport(frameworkInstanceId, organizationId);
  }

  @Get(':frameworkInstanceId/evidence')
  @RequirePermission('task', 'read')
  @ApiOperation({ summary: 'Evidence tasks per CPG goal with attachment counts and the related checklist answers' })
  getEvidence(@OrganizationId() organizationId: string, @Param('frameworkInstanceId') frameworkInstanceId: string) {
    return this.evidence.getEvidence(frameworkInstanceId, organizationId);
  }

  @Get(':frameworkInstanceId/tabletop')
  @RequirePermission('framework', 'read')
  @ApiOperation({ summary: 'Tabletop topics, sessions and the cadence' })
  getTabletop(@OrganizationId() organizationId: string, @Param('frameworkInstanceId') frameworkInstanceId: string) {
    return this.tabletop.getTabletop(frameworkInstanceId, organizationId);
  }

  @Post(':frameworkInstanceId/tabletop')
  @RequirePermission('framework', 'update')
  @ApiOperation({ summary: 'Plan or record a tabletop session' })
  createSession(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Body() dto: SaveTabletopDto,
  ) {
    return this.tabletop.saveSession({ frameworkInstanceId, organizationId, dto });
  }

  @Put(':frameworkInstanceId/tabletop/:sessionId')
  @RequirePermission('framework', 'update')
  @ApiOperation({ summary: 'Update a tabletop session' })
  updateSession(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SaveTabletopDto,
  ) {
    return this.tabletop.saveSession({ frameworkInstanceId, organizationId, sessionId, dto });
  }

  @Delete(':frameworkInstanceId/tabletop/:sessionId')
  @RequirePermission('framework', 'update')
  @ApiOperation({ summary: 'Delete a tabletop session' })
  deleteSession(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.tabletop.deleteSession(frameworkInstanceId, organizationId, sessionId);
  }
}
