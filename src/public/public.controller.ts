import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PublicService } from './public.service';
import { CreatePublicRequestDto } from './dto/create-request.dto';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  // Guest context: org + location (services now come from the tree)
  @Get('o/:slug/l/:locationId')
  getGuestContext(
    @Param('slug') slug: string,
    @Param('locationId') locationId: string,
  ) {
    return this.publicService.getGuestContext(slug, locationId);
  }

  // Menu children at a given level (parentId omitted = top level)
  @Get('o/:slug/l/:locationId/menu')
  getMenu(
    @Param('slug') slug: string,
    @Param('locationId') locationId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.publicService.getMenuChildren(
      slug,
      locationId,
      parentId ?? null,
    );
  }

  // An item's service components
  @Get('o/:slug/items/:itemId/components')
  getItemComponents(
    @Param('slug') slug: string,
    @Param('itemId') itemId: string,
  ) {
    return this.publicService.getItemComponents(slug, itemId);
  }

  @Post('o/:slug/l/:locationId/requests')
  createRequest(
    @Param('slug') slug: string,
    @Param('locationId') locationId: string,
    @Body() dto: CreatePublicRequestDto,
  ) {
    return this.publicService.createRequest(slug, locationId, {
      offeringNodeId: dto.offeringNodeId,
      componentValues: dto.componentValues,
      guestName: dto.guestName,
      notes: dto.notes,
    });
  }
}
