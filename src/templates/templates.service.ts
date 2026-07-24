import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import {
  DEFAULT_TOKENS,
  DesignTokens,
  TOKEN_SCHEMA_VERSION,
  sanitizeTokens,
  validateTokens,
} from './design-tokens';
import { findPreset } from './presets';

/** An org can't hoard templates; keeps the gallery and the query bounded. */
const MAX_TEMPLATES_PER_ORG = 20;
const MAX_NAME_LENGTH = 50;

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Templates belonging to this org, with tokens already sanitized. */
  async findAll(organizationId: string) {
    const templates = await this.prisma.template.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }],
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { publishedTemplateId: true },
    });

    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      schemaVersion: template.schemaVersion,
      tokens: sanitizeTokens(template.tokens),
      isPublished: org?.publishedTemplateId === template.id,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    }));
  }

  /**
   * Create a template: from a preset, from imported tokens, or empty.
   *
   * An org's *first* template is published immediately so a brand-new account
   * isn't left with a gallery and no live theme. Once a pointer exists it is
   * never reassigned here — new templates land unpublished, which is what makes
   * staged editing work (duplicate → edit → publish) without draft machinery.
   */
  async create(organizationId: string, dto: CreateTemplateDto) {
    await this.assertUnderCap(organizationId);

    // Clone a built-in preset, or take tokens straight from the request
    // (the import path lands here too, and gets the same validation).
    let tokens: unknown = dto.tokens ?? {};
    let name = dto.name?.trim();

    if (dto.presetId) {
      const preset = findPreset(dto.presetId);
      if (!preset) throw new BadRequestException('Unknown preset');
      tokens = preset.tokens;
      name = name || preset.name;
    }

    const errors = validateTokens(tokens);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Invalid design tokens',
        errors,
      });
    }

    const template = await this.prisma.template.create({
      data: {
        organizationId,
        name: this.cleanName(name),
        schemaVersion: TOKEN_SCHEMA_VERSION,
        tokens: tokens as Prisma.InputJsonValue,
      },
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { publishedTemplateId: true },
    });
    if (!org?.publishedTemplateId) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { publishedTemplateId: template.id },
      });
    }

    return {
      id: template.id,
      name: template.name,
      schemaVersion: template.schemaVersion,
      tokens: sanitizeTokens(template.tokens),
      isPublished: !org?.publishedTemplateId,
    };
  }

  async update(organizationId: string, id: string, dto: UpdateTemplateDto) {
    // Never trust the id alone — scope the lookup to the caller's org.
    const existing = await this.prisma.template.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    const data: Prisma.TemplateUpdateInput = {};

    if (dto.name !== undefined) data.name = this.cleanName(dto.name);

    if (dto.tokens !== undefined) {
      // Reject bad tokens loudly here; the read path additionally sanitizes, so
      // even a row written by some other means can't reach a guest page raw.
      const errors = validateTokens(dto.tokens);
      if (errors.length > 0) {
        throw new BadRequestException({
          message: 'Invalid design tokens',
          errors,
        });
      }
      data.tokens = dto.tokens as Prisma.InputJsonValue;
      // Tokens are always written in the current shape, so record that.
      data.schemaVersion = TOKEN_SCHEMA_VERSION;
    }

    const updated = await this.prisma.template.update({ where: { id }, data });

    return {
      id: updated.id,
      name: updated.name,
      schemaVersion: updated.schemaVersion,
      tokens: sanitizeTokens(updated.tokens),
    };
  }

  /** Copy an existing template into a new, unpublished row. */
  async duplicate(organizationId: string, id: string) {
    await this.assertUnderCap(organizationId);

    const source = await this.prisma.template.findFirst({
      where: { id, organizationId },
    });
    if (!source) throw new NotFoundException('Template not found');

    const copy = await this.prisma.template.create({
      data: {
        organizationId,
        name: this.cleanName(`${source.name} copy`),
        schemaVersion: source.schemaVersion,
        tokens: source.tokens as Prisma.InputJsonValue,
      },
    });

    return {
      id: copy.id,
      name: copy.name,
      schemaVersion: copy.schemaVersion,
      tokens: sanitizeTokens(copy.tokens),
      isPublished: false,
    };
  }

  /**
   * Point the org at this template. One UPDATE — the swap is atomic on its own,
   * so there's no need to wrap it; a reader either sees the old pointer or the
   * new one, never a half state.
   */
  async publish(organizationId: string, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!template) throw new NotFoundException('Template not found');

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { publishedTemplateId: id },
    });

    return { id, isPublished: true };
  }

  async remove(organizationId: string, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!template) throw new NotFoundException('Template not found');

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { publishedTemplateId: true },
    });
    if (org?.publishedTemplateId === id) {
      // Deleting the live theme would silently reset every guest page to the
      // built-in default — make the admin publish something else first.
      throw new ConflictException(
        'This template is live on your guest pages. Publish another template before deleting it.',
      );
    }

    await this.prisma.template.delete({ where: { id } });
    return { success: true };
  }

  /** Portable JSON: no ids, no org fields — safe to hand to another property. */
  async export(organizationId: string, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, organizationId },
    });
    if (!template) throw new NotFoundException('Template not found');

    return {
      name: template.name,
      schemaVersion: template.schemaVersion,
      tokens: sanitizeTokens(template.tokens),
    };
  }

  private cleanName(name: string | undefined): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new BadRequestException('Template name is required');
    return trimmed.slice(0, MAX_NAME_LENGTH);
  }

  private async assertUnderCap(organizationId: string) {
    const count = await this.prisma.template.count({
      where: { organizationId },
    });
    if (count >= MAX_TEMPLATES_PER_ORG) {
      throw new ConflictException(
        `You can keep up to ${MAX_TEMPLATES_PER_ORG} templates. Delete one to make room.`,
      );
    }
  }

  /**
   * The tokens a guest page should render with: the org's published template
   * merged over the defaults, sanitized. No published template (or a row that
   * has since been deleted) yields the built-in theme.
   */
  async resolveForOrganization(organizationId: string): Promise<DesignTokens> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { publishedTemplateId: true },
    });
    if (!org?.publishedTemplateId) return DEFAULT_TOKENS;

    const template = await this.prisma.template.findFirst({
      where: { id: org.publishedTemplateId, organizationId },
      select: { tokens: true },
    });
    if (!template) return DEFAULT_TOKENS;

    return sanitizeTokens(template.tokens);
  }
}
