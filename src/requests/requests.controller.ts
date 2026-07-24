import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentOrg } from '../auth/current-org.decorator';
import type { TenantContext } from '../auth/tenant.service';
import { RequestsService } from './requests.service';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('requests')
@UseGuards(TenantGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  findAll(@CurrentOrg() org: TenantContext) {
    return this.requests.findAll(org.organizationId);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.requests.updateStatus(org.organizationId, id, dto.status);
  }
}
