import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentOrg } from '../auth/current-org.decorator';
import type { TenantContext } from '../auth/tenant.service';
import { ServiceComponentsService } from './service-components.service';
import { CreateComponentDto } from './dto/create-component.dto';
import { UpdateComponentDto } from './dto/update-component.dto';

@Controller('service-components')
@UseGuards(TenantGuard)
export class ServiceComponentsController {
  constructor(private readonly components: ServiceComponentsService) {}

  @Get()
  findForItem(
    @CurrentOrg() org: TenantContext,
    @Query('itemId') itemId: string,
  ) {
    return this.components.findForItem(org.organizationId, itemId);
  }

  @Post()
  create(@CurrentOrg() org: TenantContext, @Body() dto: CreateComponentDto) {
    return this.components.create(org.organizationId, dto);
  }

  @Patch(':id')
  update(
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateComponentDto,
  ) {
    return this.components.update(org.organizationId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentOrg() org: TenantContext, @Param('id') id: string) {
    return this.components.remove(org.organizationId, id);
  }
}
