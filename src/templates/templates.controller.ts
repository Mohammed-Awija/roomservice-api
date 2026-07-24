import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentOrg } from '../auth/current-org.decorator';
import type { TenantContext } from '../auth/tenant.service';
import { TemplatesService } from './templates.service';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { PRESETS } from './presets';

@Controller('templates')
@UseGuards(TenantGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /**
   * Built-in presets. Static code constants, but served from here so the
   * gallery renders from one source of truth rather than a duplicated copy.
   * Declared before `:id` routes so "presets" isn't parsed as an id.
   */
  @Get('presets')
  listPresets() {
    return PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      tokens: preset.tokens,
    }));
  }

  @Get()
  findAll(@CurrentOrg() org: TenantContext) {
    return this.templates.findAll(org.organizationId);
  }

  @Post()
  create(@CurrentOrg() org: TenantContext, @Body() dto: CreateTemplateDto) {
    return this.templates.create(org.organizationId, dto);
  }

  @Get(':id/export')
  export(@CurrentOrg() org: TenantContext, @Param('id') id: string) {
    return this.templates.export(org.organizationId, id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentOrg() org: TenantContext, @Param('id') id: string) {
    return this.templates.duplicate(org.organizationId, id);
  }

  @Post(':id/publish')
  publish(@CurrentOrg() org: TenantContext, @Param('id') id: string) {
    return this.templates.publish(org.organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(org.organizationId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentOrg() org: TenantContext, @Param('id') id: string) {
    return this.templates.remove(org.organizationId, id);
  }
}
