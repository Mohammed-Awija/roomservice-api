import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ServiceComponentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
  ) {}

  /**
   * Given an org slug + location id, return the guest-facing context:
   * org name, location name, and the design tokens the page should render with.
   * Services are fetched separately via the tree.
   */
  async getGuestContext(slug: string, locationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, defaultLanguage: true },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    const location = await this.prisma.location.findFirst({
      where: { id: locationId, organizationId: organization.id },
      select: { id: true, name: true, displayName: true },
    });
    if (!location) throw new NotFoundException('Location not found');

    // Always sanitized, and always complete — the guest page can render these
    // straight into CSS without re-checking anything.
    const resolvedTokens = await this.templates.resolveForOrganization(
      organization.id,
    );

    return {
      organization: {
        name: organization.name,
        defaultLanguage: organization.defaultLanguage,
      },
      location: {
        id: location.id,
        name: location.displayName ?? location.name,
      },
      resolvedTokens,
    };
  }

  /**
   * A display-only price for menu cards, so the `priceDisplay` variant has
   * something to position. This is *not* a computed total: it reads the item's
   * admin-set PRICE component straight from config. Ordering and the request
   * path are untouched — the authoritative money still lives in
   * `resolveComponentValues`.
   */
  private async attachDisplayPrices<T extends { id: string; type: string }>(
    organizationId: string,
    nodes: T[],
  ): Promise<(T & { price: { amount: number; currency: string } | null })[]> {
    const itemIds = nodes.filter((n) => n.type === 'ITEM').map((n) => n.id);
    if (itemIds.length === 0) {
      return nodes.map((n) => ({ ...n, price: null }));
    }

    const priceComponents = await this.prisma.serviceComponent.findMany({
      where: {
        organizationId,
        offeringNodeId: { in: itemIds },
        type: 'PRICE',
      },
      orderBy: [{ displayOrder: 'asc' }],
      select: { offeringNodeId: true, config: true },
    });

    const byNode = new Map<string, { amount: number; currency: string }>();
    for (const component of priceComponents) {
      if (byNode.has(component.offeringNodeId)) continue; // first one wins
      const config = asRecord(component.config);
      const amount = readNumber(config, 'amount');
      if (amount === undefined) continue;
      byNode.set(component.offeringNodeId, {
        amount,
        currency: readString(config, 'currency') ?? '',
      });
    }

    return nodes.map((n) => ({ ...n, price: byNode.get(n.id) ?? null }));
  }

  async getMenuChildren(
    slug: string,
    locationId: string,
    parentId: string | null,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    // At the top level, only show nodes assigned to this location
    if (parentId === null) {
      const links = await this.prisma.locationOffering.findMany({
        where: { organizationId: org.id, locationId },
        select: { offeringNodeId: true },
      });
      const assignedIds = links.map((l) => l.offeringNodeId);
      if (assignedIds.length === 0) return [];

      const topLevel = await this.prisma.offeringNode.findMany({
        where: {
          organizationId: org.id,
          parentId: null,
          enabled: true,
          id: { in: assignedIds },
        },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, type: true, icon: true },
      });
      return this.attachDisplayPrices(org.id, topLevel);
    }

    // Below the top level, show all enabled children (subtree comes with the assigned top node)
    const children = await this.prisma.offeringNode.findMany({
      where: { organizationId: org.id, parentId, enabled: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, type: true, icon: true },
    });
    return this.attachDisplayPrices(org.id, children);
  }

  async getItemComponents(slug: string, itemId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    // Verify the item belongs to this org and is an ITEM
    const item = await this.prisma.offeringNode.findFirst({
      where: {
        id: itemId,
        organizationId: org.id,
        type: 'ITEM',
        enabled: true,
      },
      select: { id: true, name: true },
    });
    if (!item) throw new NotFoundException('Item not found');

    const components = await this.prisma.serviceComponent.findMany({
      where: { organizationId: org.id, offeringNodeId: itemId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        type: true,
        label: true,
        config: true,
        setBy: true,
        required: true,
      },
    });

    return { item, components };
  }

  async createRequest(
    slug: string,
    locationId: string,
    input: {
      offeringNodeId: string;
      componentValues?: unknown[];
      guestName?: string;
      notes?: string;
    },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const location = await this.prisma.location.findFirst({
      where: { id: locationId, organizationId: org.id },
      select: { id: true },
    });
    if (!location) throw new NotFoundException('Location not found');

    // Verify the item belongs to this org, is an ITEM, and is enabled
    const item = await this.prisma.offeringNode.findFirst({
      where: {
        id: input.offeringNodeId,
        organizationId: org.id,
        type: 'ITEM',
        enabled: true,
      },
      select: { id: true, name: true },
    });
    if (!item) throw new NotFoundException('Item not available');

    // Never store what the client sent as-is: money and admin-set values are
    // re-derived from the components' own config, server-side.
    const componentValues = await this.resolveComponentValues(
      org.id,
      item.id,
      input.componentValues ?? [],
    );

    await this.prisma.request.create({
      data: {
        organizationId: org.id,
        locationId,
        offeringNodeId: item.id,
        itemName: item.name,
        componentValues,
        guestName: input.guestName?.slice(0, 100),
        notes: input.notes?.slice(0, 500),
      },
    });

    return { success: true };
  }

  /**
   * Turns the guest's submitted componentValues into the authoritative snapshot
   * stored on the request.
   *
   * The client is trusted for exactly one thing: what the guest typed or picked.
   * Everything else is derived here from the component rows:
   *  - admin-set values (PRICE, and the admin-set temporal types) are read from
   *    config and injected regardless of what the client sent, so a guest can't
   *    dictate them (or drop them);
   *  - QUANTITY_PRICED totals are recomputed from the stored unit prices, so any
   *    client-supplied total is ignored;
   *  - `type` and `label` are taken from the component row, not the payload.
   *
   * A value referencing a component that doesn't belong to this item is rejected
   * outright rather than silently dropped.
   */
  private async resolveComponentValues(
    organizationId: string,
    offeringNodeId: string,
    submitted: unknown[],
  ): Promise<Prisma.InputJsonValue[]> {
    const components = await this.prisma.serviceComponent.findMany({
      where: { organizationId, offeringNodeId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (components.length === 0) return [];

    const byId = new Map(components.map((c) => [c.id, c]));

    // Index what the guest sent, rejecting anything aimed at another item/org.
    const submittedById = new Map<string, Record<string, unknown>>();
    for (const entry of submitted) {
      const record = asRecord(entry);
      const componentId = record === null ? undefined : record.componentId;
      if (
        record === null ||
        typeof componentId !== 'string' ||
        !byId.has(componentId)
      ) {
        throw new BadRequestException(
          'Request references a component that does not belong to this item',
        );
      }
      submittedById.set(componentId, record);
    }

    // Walk the server-side component list so ordering and admin-set values come
    // from us, not from the payload.
    const values: Prisma.InputJsonValue[] = [];
    for (const component of components) {
      // Display-only (INFO_DISPLAY, LINK, WIFI_QR): nothing to record. A guest
      // may not smuggle a value onto the request by submitting one anyway.
      if (component.setBy === 'NONE') continue;

      if (component.setBy === 'ADMIN') {
        const value = adminValueFromConfig(component.type, component.config);
        if (value !== undefined) {
          values.push({
            componentId: component.id,
            type: component.type,
            label: component.label,
            value,
          });
        }
        continue;
      }

      const entry = submittedById.get(component.id);
      if (!entry) continue;

      if (component.type === 'QUANTITY_PRICED') {
        const priced = priceQuantities(component.config, entry.value);
        if (!priced) continue;
        values.push({
          componentId: component.id,
          type: component.type,
          label: component.label,
          value: priced.value,
          computedTotal: priced.computedTotal,
        });
        continue;
      }

      // Selects: the guest sends option id(s); labels and prices are resolved
      // here from config so a picked option can't be re-priced or re-labelled.
      if (
        component.type === 'SINGLE_SELECT' ||
        component.type === 'MULTI_SELECT'
      ) {
        const resolved = resolveSelect(
          component.type,
          component.config,
          entry.value,
        );
        if (!resolved) continue;
        values.push({
          componentId: component.id,
          type: component.type,
          label: component.label,
          value: resolved.value,
          ...(resolved.computedTotal !== undefined
            ? { computedTotal: resolved.computedTotal }
            : {}),
        });
        continue;
      }

      // Guest-entered, non-financial: the value is whatever the guest supplied.
      // It came off a parsed JSON body, so it is already JSON-shaped.
      values.push({
        componentId: component.id,
        type: component.type,
        label: component.label,
        value: (entry.value ?? null) as Prisma.InputJsonValue,
      });
    }

    return values;
  }
}

// --- helpers: component config is free-form JSON, so every read is guarded ---

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(record: Record<string, unknown> | null, key: string) {
  const raw = record?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const raw = record?.[key];
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}

type PricedTier = { id: string; label: string; unitPrice: number };

function readTiers(config: Prisma.JsonValue): PricedTier[] {
  const raw = asRecord(config)?.tiers;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const tier = asRecord(entry);
    const id = readString(tier, 'id');
    const unitPrice = readNumber(tier, 'unitPrice');
    if (id === undefined || unitPrice === undefined || unitPrice < 0) return [];
    return [{ id, label: readString(tier, 'label') ?? id, unitPrice }];
  });
}

/**
 * The value an admin-set component contributes, derived from its own config.
 * Mirrors the guest registry's `adminValue`, but this side is authoritative.
 * Types with nothing to record (e.g. IMAGE) return undefined.
 */
function adminValueFromConfig(
  type: ServiceComponentType,
  config: Prisma.JsonValue,
): Prisma.InputJsonValue | undefined {
  const c = asRecord(config);
  switch (type) {
    case 'PRICE': {
      const amount = readNumber(c, 'amount');
      if (amount === undefined) return undefined;
      return { amount, currency: readString(c, 'currency') ?? '' };
    }
    case 'DATE':
      return readString(c, 'adminDate');
    case 'TIME_RANGE': {
      const start = readString(c, 'adminStart');
      const end = readString(c, 'adminEnd');
      return start && end ? { start, end } : undefined;
    }
    default:
      return undefined;
  }
}

/** Guard against a runaway quantity producing a nonsense total. */
const MAX_QUANTITY_PER_TIER = 999;

/**
 * Recomputes a QUANTITY_PRICED value from the component's stored unit prices.
 * Only the guest's quantities are taken from the payload; any total they sent is
 * discarded. Tier labels and unit prices are snapshotted alongside so the request
 * still reads correctly if the admin later edits or deletes a tier.
 */
function priceQuantities(
  config: Prisma.JsonValue,
  submittedValue: unknown,
): { value: Prisma.InputJsonValue; computedTotal: number } | null {
  const tiers = readTiers(config);
  if (tiers.length === 0) return null;

  const quantitiesRaw = asRecord(asRecord(submittedValue)?.quantities) ?? {};

  const quantities: Record<string, number> = {};
  const lines: Prisma.InputJsonValue[] = [];
  let computedTotal = 0;

  for (const tier of tiers) {
    const raw = quantitiesRaw[tier.id];
    if (raw === undefined || raw === null) continue;

    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      throw new BadRequestException('Quantities must be non-negative integers');
    }
    if (raw > MAX_QUANTITY_PER_TIER) {
      throw new BadRequestException(
        `Quantity may not exceed ${MAX_QUANTITY_PER_TIER}`,
      );
    }
    if (raw === 0) continue;

    const subtotal = round2(tier.unitPrice * raw);
    quantities[tier.id] = raw;
    lines.push({
      tierId: tier.id,
      label: tier.label,
      quantity: raw,
      unitPrice: tier.unitPrice,
      subtotal,
    });
    computedTotal += subtotal;
  }

  if (lines.length === 0) return null;

  return {
    value: {
      quantities,
      lines,
      currency: readString(asRecord(config), 'currency') ?? '',
    },
    computedTotal: round2(computedTotal),
  };
}

type SelectOption = { id: string; label: string; price?: number };

function readSelectOptions(config: Prisma.JsonValue): SelectOption[] {
  const raw = asRecord(config)?.options;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const opt = asRecord(entry);
    const id = readString(opt, 'id');
    if (id === undefined) return [];
    // A negative price in config is treated as free rather than a discount —
    // never let a stored price drag a total below the honest sum.
    const price = readNumber(opt, 'price');
    return [
      {
        id,
        label: readString(opt, 'label') ?? id,
        ...(price !== undefined && price >= 0 ? { price } : {}),
      },
    ];
  });
}

/** Selects submit an option id (single) or an array of ids (multi). */
function readSelectedIds(value: unknown): string[] {
  if (typeof value === 'string') return value === '' ? [] : [value];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

type PricingMode = 'NONE' | 'ABSOLUTE' | 'ADDITIVE';

function readPricingMode(config: Prisma.JsonValue): PricingMode {
  const raw = readString(asRecord(config), 'pricingMode');
  return raw === 'ABSOLUTE' || raw === 'ADDITIVE' ? raw : 'NONE';
}

/**
 * Resolves a guest's select answer against the component's stored config.
 *
 * The guest controls only *which* option ids they picked. Everything priced is
 * derived here: an unknown id is rejected, labels and prices come from config,
 * and the subtotal is computed per the component's pricing mode:
 *  - NONE:     no money; the value is just the chosen label(s), exactly as before.
 *  - ABSOLUTE: subtotal = sum of the chosen options' own prices.
 *  - ADDITIVE: subtotal = basePrice + sum of the chosen options' surcharges.
 *
 * Priced modes also snapshot the chosen options (label + price as charged) so a
 * later config edit can't rewrite what a past request cost.
 */
function resolveSelect(
  type: ServiceComponentType,
  config: Prisma.JsonValue,
  submittedValue: unknown,
): { value: Prisma.InputJsonValue; computedTotal?: number } | null {
  const options = readSelectOptions(config);
  const isMulti = type === 'MULTI_SELECT';

  // A single select can only resolve to one option.
  const ids = readSelectedIds(submittedValue).slice(0, isMulti ? undefined : 1);

  const chosen = ids.map((id) => {
    const option = options.find((o) => o.id === id);
    if (!option) {
      throw new BadRequestException('Selected option does not exist');
    }
    return option;
  });
  if (chosen.length === 0) return null;

  const mode = readPricingMode(config);

  // NONE: store the label(s), same shape guests have always submitted.
  if (mode === 'NONE') {
    const labels = chosen.map((o) => o.label);
    return { value: isMulti ? labels : labels[0] };
  }

  const currency = readString(asRecord(config), 'currency') ?? '';
  const base =
    mode === 'ADDITIVE' ? (readNumber(asRecord(config), 'basePrice') ?? 0) : 0;
  const optionsTotal = chosen.reduce((sum, o) => sum + (o.price ?? 0), 0);

  return {
    value: {
      mode,
      currency,
      ...(mode === 'ADDITIVE' ? { basePrice: round2(base) } : {}),
      selected: chosen.map((o) => ({
        optionId: o.id,
        label: o.label,
        price: o.price ?? 0,
      })),
    },
    computedTotal: round2(base + optionsTotal),
  };
}

/** Money as floats: round to cents so 0.1 + 0.2 doesn't leak into a total. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
