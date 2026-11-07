import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { UpsertChecklistDto } from './dto/upsert-checklist.dto';
import { VendorChecklistsService } from './vendor-checklists.service';

/**
 * EPA's water-sector cybersecurity procurement checklists (supplier, integrator/MSP)
 * filled per vendor. Separate from /vendors so the upstream controller stays untouched.
 */
@ApiTags('Vendor checklists')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionGuard)
@Controller({ path: 'vendor-checklists', version: '1' })
export class VendorChecklistsController {
  constructor(private readonly service: VendorChecklistsService) {}

  @Get('definitions')
  @RequirePermission('vendor', 'read')
  @ApiOperation({ summary: 'The checklist items, sections and EPA weight/score scales' })
  getDefinitions() {
    return this.service.getDefinitions();
  }

  @Get('vendors/:vendorId')
  @RequirePermission('vendor', 'read')
  @ApiOperation({ summary: 'Both checklists for a vendor with EPA weighted scores' })
  list(@OrganizationId() organizationId: string, @Param('vendorId') vendorId: string) {
    return this.service.list(vendorId, organizationId);
  }

  @Put('vendors/:vendorId/:kind')
  @RequirePermission('vendor', 'update')
  @ApiOperation({ summary: 'Save a filled checklist (epa_supplier or epa_integrator_msp) for a vendor' })
  upsert(
    @OrganizationId() organizationId: string,
    @AuthContext() auth: AuthContextType,
    @Param('vendorId') vendorId: string,
    @Param('kind') kind: string,
    @Body() dto: UpsertChecklistDto,
  ) {
    return this.service.upsert({ vendorId, organizationId, kind, dto, userId: auth.userId });
  }
}
