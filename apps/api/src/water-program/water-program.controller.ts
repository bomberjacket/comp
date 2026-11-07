import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WriteSectionDto } from './dto/write-section.dto';
import { WaterPlansService } from './water-plans.service';
import { WaterProgramService } from './water-program.service';

/** Progress of the water and wastewater program steps for one framework instance. */
@ApiTags('Water program')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionGuard)
@Controller({ path: 'water-program', version: '1' })
export class WaterProgramController {
  constructor(
    private readonly service: WaterProgramService,
    private readonly plans: WaterPlansService,
  ) {}

  @Get(':frameworkInstanceId')
  @RequirePermission('framework', 'read')
  @ApiOperation({ summary: 'The five program steps with live progress and links' })
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
  @ApiOperation({ summary: "Save the utility's text for one plan section" })
  writeSection(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Param('policyId') policyId: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: WriteSectionDto,
  ) {
    return this.plans.writeSection({ frameworkInstanceId, organizationId, policyId, index, text: dto.text });
  }
}
