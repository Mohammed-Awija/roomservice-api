/**
 * Design token schema v1 — the contract between stored templates and the
 * guest-facing CSS.
 *
 * SECURITY: these values are emitted into a `<style>` / `style` attribute on a
 * public, unauthenticated page. A stored token is *input*, not trusted data —
 * an admin (or anything that ever writes to the row) could put arbitrary text
 * there. So nothing is ever interpolated raw: every value is validated on write
 * and re-sanitized on read against the whitelists below, and anything that
 * doesn't match is replaced by the default. Unknown keys are dropped entirely.
 *
 * Deliberately small. Spacing, density and animation are later versions;
 * `schemaVersion` plus read-time defaulting lets v2 add fields without
 * backfilling existing rows.
 */

/**
 * v1 → v2 added `variants`. Rows written as v1 are read back as complete v2
 * token sets without any backfill — see `sanitizeTokens` for the mechanism.
 */
export const TOKEN_SCHEMA_VERSION = 2;

export const COLOR_KEYS = [
  'brand',
  'accent',
  'background',
  'surface',
  'textPrimary',
  'textSecondary',
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** Curated font pairings. Anything outside this list is rejected. */
export const FONT_PAIRS = [
  'system',
  'inter',
  'playfair-lato',
  'dm-serif-mulish',
  'nunito',
] as const;
export type FontPair = (typeof FONT_PAIRS)[number];

export const RADII = ['none', 'soft', 'round'] as const;
export type Radius = (typeof RADII)[number];

export const SHADOWS = ['none', 'soft', 'strong'] as const;
export type Shadow = (typeof SHADOWS)[number];

// --- v2: presentation variants for the guest menu ---

export const CARD_STYLES = ['standard', 'compact', 'image-led'] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const PRICE_DISPLAYS = ['inline', 'badge', 'bottom'] as const;
export type PriceDisplay = (typeof PRICE_DISPLAYS)[number];

export const SECTION_LAYOUTS = ['list', 'grid'] as const;
export type SectionLayout = (typeof SECTION_LAYOUTS)[number];

export type Variants = {
  cardStyle: CardStyle;
  priceDisplay: PriceDisplay;
  sectionLayout: SectionLayout;
};

export type DesignTokens = {
  colors: Record<ColorKey, string>;
  fontPair: FontPair;
  radius: Radius;
  shadow: Shadow;
  variants: Variants;
};

/**
 * The built-in theme. Matches the hand-built guest palette that shipped before
 * templates existed, so an org with no published template looks unchanged.
 */
export const DEFAULT_TOKENS: DesignTokens = {
  colors: {
    brand: '#1B3A4B',
    accent: '#B08D57',
    background: '#F5F2EC',
    surface: '#FFFFFF',
    textPrimary: '#1B3A4B',
    textSecondary: '#6B7280',
  },
  fontPair: 'system',
  radius: 'soft',
  shadow: 'soft',
  variants: {
    cardStyle: 'standard',
    priceDisplay: 'inline',
    // NOTE: the guest menu has always rendered `grid grid-cols-2`, so `grid` —
    // not `list` — is the value that preserves existing orgs' appearance.
    sectionLayout: 'grid',
  },
};

/** Six-digit hex only. No `rgb()`, no named colours, no CSS functions. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Turns whatever is stored on the row into a guaranteed-safe token set.
 * Never throws and never passes a value through unchecked — an invalid or
 * missing field silently falls back to the default.
 *
 * THIS IS THE SCHEMA-VERSION MECHANISM. It is a *total* function from `unknown`
 * to a complete set of tokens at the current schema version: every field is
 * read defensively and defaulted when absent or invalid. A v1 row simply has no
 * `variants` key, which is indistinguishable from a missing field — so it reads
 * back as v2 with variant defaults, with no backfill and no version branch.
 * The same is true of any future purely-additive version.
 *
 * `schemaVersion` on the row is therefore diagnostic, not a branch point. It
 * only becomes load-bearing for a *breaking* change — a field renamed, or one
 * whose meaning shifts — where the old value must be transformed rather than
 * defaulted. That would be handled by a translation step keyed on the stored
 * version, applied here before the reads below.
 */
export function sanitizeTokens(stored: unknown): DesignTokens {
  const raw = asRecord(stored);
  if (!raw) return DEFAULT_TOKENS;

  const rawColors = asRecord(raw.colors) ?? {};
  const colors = {} as Record<ColorKey, string>;
  for (const key of COLOR_KEYS) {
    const candidate = rawColors[key];
    colors[key] = isValidHex(candidate)
      ? candidate.toUpperCase()
      : DEFAULT_TOKENS.colors[key];
  }

  // Absent on every v1 row — defaulted exactly like any other missing field.
  const rawVariants = asRecord(raw.variants) ?? {};
  const defaults = DEFAULT_TOKENS.variants;

  return {
    colors,
    fontPair: pickEnum(raw.fontPair, FONT_PAIRS, DEFAULT_TOKENS.fontPair),
    radius: pickEnum(raw.radius, RADII, DEFAULT_TOKENS.radius),
    shadow: pickEnum(raw.shadow, SHADOWS, DEFAULT_TOKENS.shadow),
    variants: {
      cardStyle: pickEnum(
        rawVariants.cardStyle,
        CARD_STYLES,
        defaults.cardStyle,
      ),
      priceDisplay: pickEnum(
        rawVariants.priceDisplay,
        PRICE_DISPLAYS,
        defaults.priceDisplay,
      ),
      sectionLayout: pickEnum(
        rawVariants.sectionLayout,
        SECTION_LAYOUTS,
        defaults.sectionLayout,
      ),
    },
  };
}

/**
 * Write-time validation. Returns the list of problems; empty means valid.
 * Stricter than `sanitizeTokens` on purpose: a write should be rejected with a
 * clear error rather than silently coerced, so an admin learns their value was
 * wrong instead of wondering why the colour never changed.
 */
export function validateTokens(input: unknown): string[] {
  const errors: string[] = [];
  const raw = asRecord(input);
  if (!raw) return ['tokens must be an object'];

  const knownKeys = new Set([
    'colors',
    'fontPair',
    'radius',
    'shadow',
    'variants',
  ]);
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) errors.push(`unknown token key: ${key}`);
  }

  if (raw.colors !== undefined) {
    const colors = asRecord(raw.colors);
    if (!colors) {
      errors.push('colors must be an object');
    } else {
      for (const key of Object.keys(colors)) {
        if (!(COLOR_KEYS as readonly string[]).includes(key)) {
          errors.push(`unknown color key: ${key}`);
        } else if (!isValidHex(colors[key])) {
          errors.push(`colors.${key} must be a 6-digit hex like #1B3A4B`);
        }
      }
    }
  }

  const enums: [string, readonly string[]][] = [
    ['fontPair', FONT_PAIRS],
    ['radius', RADII],
    ['shadow', SHADOWS],
  ];
  for (const [key, allowed] of enums) {
    const value = raw[key];
    if (
      value !== undefined &&
      !(typeof value === 'string' && allowed.includes(value))
    ) {
      errors.push(`${key} must be one of: ${allowed.join(', ')}`);
    }
  }

  if (raw.variants !== undefined) {
    const variants = asRecord(raw.variants);
    if (!variants) {
      errors.push('variants must be an object');
    } else {
      const variantEnums: [string, readonly string[]][] = [
        ['cardStyle', CARD_STYLES],
        ['priceDisplay', PRICE_DISPLAYS],
        ['sectionLayout', SECTION_LAYOUTS],
      ];
      const knownVariantKeys = new Set(variantEnums.map(([k]) => k));
      for (const key of Object.keys(variants)) {
        if (!knownVariantKeys.has(key)) {
          errors.push(`unknown variant key: ${key}`);
        }
      }
      for (const [key, allowed] of variantEnums) {
        const value = variants[key];
        if (
          value !== undefined &&
          !(typeof value === 'string' && allowed.includes(value))
        ) {
          errors.push(`variants.${key} must be one of: ${allowed.join(', ')}`);
        }
      }
    }
  }

  return errors;
}
