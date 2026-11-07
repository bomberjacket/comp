import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WaterProgramService } from './water-program.service';

/** Progress of the water and wastewater program steps for one framework instance. */
@ApiTags('Water program')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionGuard)
@Controller({ path: 'water-program', version: '1' })
export class WaterProgramController {
  constructor(private readonly service: WaterProgramService) {}

  @Get(':frameworkInstanceId')
  @RequirePermission('framework', 'read')
  @ApiOperation({ summary: 'The five program steps with live progress and links' })
  getProgram(@OrganizationId() organizationId: string, @Param('frameworkInstanceId') frameworkInstanceId: string) {
    return this.service.getProgram(frameworkInstanceId, organizationId);
  }
}
