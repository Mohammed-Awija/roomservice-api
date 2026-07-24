import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateComponentDto } from './dto/create-component.dto';
import { UpdateComponentDto } from './dto/update-component.dto';

@Injectable()
export class ServiceComponentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateComponentDto) {
    const node = await this.prisma.offeringNode.findFirst({
      where: { id: dto.offeringNodeId, organizationId },
    });
    if (!node) throw new NotFoundException('Item not found');
    if (node.type !== 'ITEM') {
      throw new BadRequestException('Components can only be added to items');
    }

    return this.prisma.serviceComponent.create({
      data: {
        organizationId,
        offeringNodeId: dto.offeringNodeId,
        type: dto.type,
        label: dto.label,
        config: dto.config ?? {},
        setBy: dto.setBy ?? 'GUEST',
        required: dto.required ?? false,
        displayOrder: dto.displayOrder ?? 0,
      },
    });
  }

  async findForItem(organizationId: string, offeringNodeId: string) {
    return this.prisma.serviceComponent.findMany({
      where: { organizationId, offeringNodeId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async update(organizationId: string, id: string, dto: UpdateComponentDto) {
    const existing = await this.prisma.serviceComponent.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Component not found');
    return this.prisma.serviceComponent.update({
      where: { id },
      data: {
        label: dto.label,
        config: dto.config,
        setBy: dto.setBy,
        required: dto.required,
        displayOrder: dto.displayOrder,
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.prisma.serviceComponent.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Component not found');
    return this.prisma.serviceComponent.delete({ where: { id } });
  }
}
