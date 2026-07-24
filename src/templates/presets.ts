import { DEFAULT_TOKENS, DesignTokens } from './design-tokens';

/**
 * Built-in starting points, shipped as code — never as Template rows.
 *
 * "Use template" clones one of these into an org-owned row; the preset itself is
 * immutable and has no id in the database. That keeps them versionable with the
 * codebase and impossible for a tenant to mutate or delete.
 *
 * Contrast note: primary buttons render white label text on `brand`, so every
 * preset's brand colour is kept dark enough for white to stay legible. Until a
 * v3 "on-brand" token exists, that's a hand-maintained invariant here.
 */
export type Preset = {
  id: string;
  name: string;
  description: string;
  tokens: DesignTokens;
};

export const PRESETS: Preset[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'The default ServeyceQr look — calm, neutral, works anywhere.',
    tokens: DEFAULT_TOKENS,
  },
  {
    id: 'boutique',
    name: 'Boutique',
    description: 'Warm serif with soft corners and large imagery.',
    tokens: {
      colors: {
        brand: '#7C2D12',
        accent: '#C2410C',
        background: '#FDF6EC',
        surface: '#FFFBF5',
        textPrimary: '#431407',
        textSecondary: '#8A6F5C',
      },
      fontPair: 'playfair-lato',
      radius: 'round',
      shadow: 'strong',
      variants: {
        cardStyle: 'image-led',
        priceDisplay: 'badge',
        sectionLayout: 'grid',
      },
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Monochrome and flat. Dense list for long menus.',
    tokens: {
      colors: {
        brand: '#171717',
        accent: '#525252',
        background: '#FAFAFA',
        surface: '#FFFFFF',
        textPrimary: '#171717',
        textSecondary: '#737373',
      },
      fontPair: 'inter',
      radius: 'none',
      shadow: 'none',
      variants: {
        cardStyle: 'compact',
        priceDisplay: 'inline',
        sectionLayout: 'list',
      },
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Dark surfaces with light text. Contrast tuned by hand.',
    tokens: {
      // Curated so text sits well above 4.5:1 on both background and surface.
      colors: {
        brand: '#2563EB',
        accent: '#60A5FA',
        background: '#0B1120',
        surface: '#1A2233',
        textPrimary: '#F1F5F9',
        textSecondary: '#94A3B8',
      },
      fontPair: 'inter',
      radius: 'soft',
      shadow: 'none',
      variants: {
        cardStyle: 'standard',
        priceDisplay: 'inline',
        sectionLayout: 'grid',
      },
    },
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Saturated brand colour with prices called out as badges.',
    tokens: {
      colors: {
        brand: '#6D28D9',
        accent: '#DB2777',
        background: '#FAF5FF',
        surface: '#FFFFFF',
        textPrimary: '#2E1065',
        textSecondary: '#6B21A8',
      },
      fontPair: 'nunito',
      radius: 'round',
      shadow: 'strong',
      variants: {
        cardStyle: 'standard',
        priceDisplay: 'badge',
        sectionLayout: 'grid',
      },
    },
  },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
