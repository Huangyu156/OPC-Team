import { themeCssVariables, themes, type ThemeTokenName } from '@opc-team/theme';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import avatarPalette from '../../../flow_chat/assets/subagent-avatars/palette.json';
import { APPEARANCE_ROOT_TOKEN_NAMES } from '../appearanceTokenContract';

import { builtinAppearancePalettes } from './palettes';
import {
  getBuiltinAppearance,
  getBuiltinAppearanceThemeTokens,
} from './catalog';
import {
  PLUGIN_APPEARANCE_COLOR_KEYS,
  createPluginAppearanceColorProjection,
} from '../adapters/PluginAppearanceProjection';
import {
  createAccentScale,
  createGitColors,
  createSemanticColors,
  createSecondaryAccentScale,
  overlayBlack,
  overlayWhite,
  rgbFromHex,
  rgbaFromHex,
} from './paletteHelpers';

function hashAppearance(appearance: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(appearance))
    .digest('hex');
}

function statusContrast(content: string, tint: string, background: string): number {
  const parse = (value: string): number[] => value.startsWith('#')
    ? [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16))
    : value.match(/[\d.]+/g)!.map(Number);
  const backdrop = parse(background);
  const surface = parse(tint);
  const alpha = surface[3] ?? 1;
  const luminance = (rgb: number[]): number => rgb.map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const first = luminance(parse(content));
  const second = luminance(backdrop.map((channel, index) => surface[index] * alpha + channel * (1 - alpha)));
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('builtin appearance preset output', () => {
  it('keeps subagent hover colors distinct and readable in every conversation theme', () => {
    for (const palette of builtinAppearancePalettes) {
      const tokens = getBuiltinAppearanceThemeTokens(palette.id);
      for (const character of avatarPalette.characters) {
        const name = `--opcteam-domain-subagent-${character.file.replace('.svg', '')}` as const;
        const accent = tokens[name];
        expect(APPEARANCE_ROOT_TOKEN_NAMES).toContain(name);
        expect(accent).not.toBe(palette.colors.text.primary);
        if (palette.id === 'opc-dark') {
          expect([character.body, character.knob, character.stem, character.face]).toContain(accent);
        }
        const background = palette.colors.background.scene;
        expect(statusContrast(accent!, background, background), `${palette.id}: ${name}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps published light field states in root and chrome while preserving named palettes', () => {
    const settings = getBuiltinAppearance('opc-light')?.renderers?.['theme-tokens']?.settings;
    for (const tokens of [settings?.tokens, settings?.scopes?.chrome].filter(Boolean)) {
      for (const [name, value] of Object.entries(themes.light)) {
        if (name.startsWith('color.field.') || name === 'color.actionCard.background' || name.startsWith('color.composer.')) expect(tokens?.[themeCssVariables[name as ThemeTokenName]]).toBe(value);
      }
    }
    expect(settings?.tokens['--opcteam-color-number-badge-background']).toBe(themes.light['color.numberBadge.background']);
    expect(settings?.tokens['--opcteam-color-key-hint-content']).toBe(themes.light['color.keyHint.content']);
    expect(settings?.tokens['--opcteam-color-scrollbar-thumb']).toBe(themes.light['color.scrollbar.thumb']);
    expect(settings?.tokens['--opcteam-color-field-border']).toBe('rgba(0, 0, 0, 0.08)');
    expect(settings?.tokens['--opcteam-color-field-border-hover']).toBe('rgba(0, 0, 0, 0.20)');
    expect(settings?.tokens['--opcteam-color-field-border-active']).toBe('rgba(0, 0, 0, 0.20)');
    expect(settings?.tokens['--opcteam-color-field-border-focus']).toBe(themes.light['color.field.borderFocus']);
    expect(settings?.tokens['--opcteam-color-field-group-background']).toBe('rgba(0, 0, 0, 0.03)');
    expect(settings?.tokens['--opcteam-color-field-placeholder']).toBe('rgba(0, 0, 0, 0.40)');
    for (const palette of builtinAppearancePalettes) {
      if (palette.id === 'opc-light') continue;
      const tokens = getBuiltinAppearanceThemeTokens(palette.id);
      expect(tokens['--opcteam-color-action-card-background']).toBe(palette.colors.element.base);
      expect(tokens['--opcteam-color-field-border']).toBe(palette.colors.border.base);
      expect(tokens['--opcteam-color-field-border-focus']).toBe(palette.colors.accent[500]);
      expect(tokens['--opcteam-color-field-border-active']).toBe(palette.colors.accent[500]);
      expect(tokens['--opcteam-color-field-group-background']).toBe(palette.colors.background.tertiary);
      expect(tokens['--opcteam-color-field-placeholder']).toBe(palette.colors.text.muted);
    }
  });
  it('uses the public Button palette in default appearances without changing shared action colors', () => {
    for (const mode of ['light', 'dark'] as const) {
      const appearance = getBuiltinAppearance(`opc-${mode}`);
      const settings = appearance?.renderers?.['theme-tokens']?.settings;
      for (const [name, value] of Object.entries(themes[mode])) {
        if (!name.startsWith('component.button.')) continue;
        expect(settings?.tokens[themeCssVariables[name as ThemeTokenName]]).toBe(value);
      }
    }
    const light = getBuiltinAppearanceThemeTokens('opc-light');
    expect(light['--opcteam-component-button-content']).toBe('rgba(0, 0, 0, 0.80)');
    expect(light['--opcteam-component-button-text-content']).toBe('#059cb0');
    expect(light['--opcteam-color-action-primary-background']).toBe('#101a27');
    expect(light['--opcteam-color-action-neutral-content']).toBe('rgba(0, 0, 0, 0.80)');
  });

  it('preserves the action colors of branded presets through the Button contract', () => {
    for (const palette of builtinAppearancePalettes) {
      if (palette.id === 'opc-light' || palette.id === 'opc-dark') continue;
      const tokens = getBuiltinAppearanceThemeTokens(palette.id);
      expect(tokens['--opcteam-component-button-primary-background']).toBe(tokens['--opcteam-color-action-primary-background']);
      expect(tokens['--opcteam-component-button-text-content']).toBe(tokens['--opcteam-color-accent-default']);
      expect(tokens['--opcteam-component-button-content']).toBe(tokens['--opcteam-color-action-neutral-content']);
    }
  });

  it('keeps menu label and caption colors consistent between the public light theme and product portals', () => {
    const settings = getBuiltinAppearance('opc-light')!.renderers!['theme-tokens']!.settings;
    for (const tokens of [settings.tokens, ...(settings.scopes?.chrome ? [settings.scopes.chrome] : [])]) {
      expect(tokens['--opcteam-color-action-neutral-content']).toBe(themes.light['color.action.neutral.content']);
      expect(tokens['--opcteam-color-content-caption']).toBe(themes.light['color.content.caption']);
    }
    for (const palette of builtinAppearancePalettes.filter(p => p.id !== 'opc-light')) {
      expect(getBuiltinAppearanceThemeTokens(palette.id)['--opcteam-color-action-neutral-content']).toBe(palette.colors.text.secondary);
    }
  });

  it('formats hex palette references as stable rgb strings', () => {
    expect(rgbFromHex('#00e6ff')).toBe('rgb(0, 230, 255)');
    expect(rgbaFromHex('#00e6ff', 0.12)).toBe('rgba(0, 230, 255, 0.12)');
    expect(rgbaFromHex('#00e6ff', '0.12')).toBe('rgba(0, 230, 255, 0.12)');
    expect(overlayBlack(0.3)).toBe('rgba(0, 0, 0, 0.3)');
    expect(overlayWhite(0.08)).toBe('rgba(255, 255, 255, 0.08)');
  });

  it('uses the shared design-system palette for every builtin status and git lifecycle', () => {
    for (const appearance of builtinAppearancePalettes) {
      const mode = appearance.type;
      const values = themes[mode];
      const tokens = getBuiltinAppearanceThemeTokens(appearance.id);
      for (const [key, tone] of [['success', 'success'], ['warning', 'warning'], ['error', 'danger'], ['info', 'info']] as const) {
        expect(appearance.colors.semantic[key]).toBe(values[`color.status.${tone}.content`]);
        expect(appearance.colors.semantic[`${key}Bg`]).toBe(values[`color.status.${tone}.surface`]);
        expect(appearance.colors.semantic[`${key}Border`]).toBe(values[`color.status.${tone}.border`]);
        for (const role of ['emphasis', 'content', 'surface', 'border'] as const) {
          expect(tokens[`--opcteam-color-status-${tone}-${role}`]).toBe(values[`color.status.${tone}.${role}`]);
        }
      }
      expect(appearance.colors.git).toMatchObject({
        added: values['color.codeChange.added'],
        staged: values['color.codeChange.added'],
        deleted: values['color.codeChange.removed'],
        changes: values['color.status.warning.emphasis'],
      });
      expect(createGitColors(mode, { branch: 'currentColor', branchBg: 'transparent' })).toMatchObject(
        { ...appearance.colors.git, branch: 'currentColor', branchBg: 'transparent' },
      );
      expect(createSemanticColors(mode)).toEqual(appearance.colors.semantic);
      const chromeTokens = getBuiltinAppearance(appearance.id)?.renderers?.['theme-tokens']?.settings.scopes?.chrome;
      for (const tone of ['info', 'success', 'warning', 'danger'] as const) {
        const contentKey = `--opcteam-color-status-${tone}-content` as const;
        const surfaceKey = `--opcteam-color-status-${tone}-surface` as const;
        for (const background of Object.values(appearance.colors.background)) {
          expect(statusContrast(tokens[contentKey], tokens[surfaceKey], background), `${appearance.id} ${tone}`).toBeGreaterThanOrEqual(4.5);
        }
        if (chromeTokens && appearance.colors.chrome) {
          expect(chromeTokens[contentKey]).toBe(themes[appearance.colors.chrome.type ?? mode][`color.status.${tone}.content`]);
          for (const background of Object.values(appearance.colors.chrome.background)) {
            expect(statusContrast(chromeTokens[contentKey], chromeTokens[surfaceKey], background), `${appearance.id} chrome ${tone}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it('derives repeated palette families from compact authoring inputs', () => {
    expect(createAccentScale({
      base: '#60a5fa',
      hover: '#3b82f6',
    })).toEqual({
      50: 'rgba(96, 165, 250, 0.04)',
      100: 'rgba(96, 165, 250, 0.08)',
      200: 'rgba(96, 165, 250, 0.15)',
      300: 'rgba(96, 165, 250, 0.25)',
      400: 'rgba(96, 165, 250, 0.4)',
      500: '#60a5fa',
      600: '#3b82f6',
      700: 'rgba(59, 130, 246, 0.8)',
    });

    expect(createSecondaryAccentScale({
      base: '#8b5cf6',
      hover: '#7c3aed',
    })).toEqual({
      100: 'rgba(139, 92, 246, 0.08)',
      200: 'rgba(139, 92, 246, 0.15)',
      500: '#8b5cf6',
      600: '#7c3aed',
    });
  });

  it('does not carry retired runtime-only authoring stops in builtin appearance schemas', () => {
    for (const appearance of builtinAppearancePalettes) {
      expect(appearance.colors.accent).not.toHaveProperty('800');
      expect(appearance.colors.purple).not.toHaveProperty('50');
      expect(appearance.colors.purple).not.toHaveProperty('400');
      expect(appearance.colors.purple).not.toHaveProperty('800');
      expect(appearance.colors.background).not.toHaveProperty('quaternary');
      expect(appearance.colors.background).not.toHaveProperty('tooltip');
      expect(appearance.colors.element).not.toHaveProperty('elevated');
    }
  });

  it('keeps approved near-neutral preset stops scoped to their semantic roles', () => {
    const serializedAppearances = JSON.stringify(builtinAppearancePalettes).toLowerCase();
    const lightAppearance = builtinAppearancePalettes.find(appearance => appearance.id === 'opc-light');

    expect(lightAppearance?.colors.background.primary).toBe('#fdfdfd');
    expect(lightAppearance?.monaco?.colors.background).toBe('#ffffff');
    expect(lightAppearance?.monaco?.colors.lineHighlight).toBe('rgba(16, 26, 39, 0.03)');
    expect(serializedAppearances.match(/#fdfdfd/g)).toHaveLength(1);
    expect(serializedAppearances).not.toContain('#e2e6eb');
    expect(serializedAppearances).not.toContain('#f0f2f5');
  });

  it('keeps the default light appearance on the neutral, navy, and restrained semantic palette', () => {
    const lightAppearance = builtinAppearancePalettes.find(appearance => appearance.id === 'opc-light');
    const tokens = getBuiltinAppearanceThemeTokens('opc-light');

    expect(lightAppearance).toMatchObject({
      description: 'Light appearance - Crisp white surfaces, soft neutral grays, deep navy actions',
      version: '2.5.0',
      colors: {
        background: {
          primary: '#fdfdfd',
          secondary: '#ffffff',
          tertiary: '#f7f7f7',
          elevated: '#ffffff',
          workbench: '#f3f3f5',
          scene: '#ffffff',
          chrome: '#f8f8f9',
        },
        text: {
          primary: 'rgba(0, 0, 0, 0.80)',
          secondary: 'rgba(0, 0, 0, 0.60)',
          muted: '#6a6a6a',
          disabled: 'rgba(0, 0, 0, 0.30)',
        },
        accent: {
          50: 'rgba(16, 26, 39, 0.03)',
          100: '#f3f3f5',
          500: '#101a27',
          600: '#1c1c1f',
          700: '#000000',
        },
        semantic: createSemanticColors('light'),
        border: {
          base: 'rgba(16, 26, 39, 0.15)',
        },
        element: {
          subtle: 'rgba(16, 26, 39, 0.03)',
          soft: '#f3f3f5',
        },
      },
      components: {
        button: {
          primary: {
            default: { background: '#101a27', color: '#ffffff' },
            hover: { background: '#1c1c1f', color: '#ffffff' },
            active: { background: '#000000', color: '#ffffff' },
          },
        },
      },
      monaco: {
        colors: {
          background: '#ffffff',
          lineHighlight: 'rgba(16, 26, 39, 0.03)',
        },
      },
    });
    expect(tokens).toMatchObject({
      '--opcteam-color-surface-chrome': '#f8f8f9',
      '--opcteam-color-selection-surface': 'rgba(0, 0, 0, 0.08)',
      '--opcteam-component-config-page-section-background': '#f7f7f7',
      '--opcteam-component-config-page-section-border': 'rgba(16, 26, 39, 0.08)',
      '--opcteam-component-config-page-section-border-width': '1px',
      '--opcteam-component-config-page-divider': 'rgba(16, 26, 39, 0.08)',
    });
  });

  it('keeps settings row hover feedback separated from dark scene surfaces', () => {
    const darkAppearance = builtinAppearancePalettes.find(
      appearance => appearance.id === 'opc-dark',
    );
    const tokens = getBuiltinAppearanceThemeTokens('opc-dark');

    expect(tokens).toMatchObject({
      '--opcteam-color-surface-scene': '#1c1c1f',
      '--opcteam-color-surface-tertiary': '#0e0e10',
      '--opcteam-color-action-quiet-hover': 'rgba(255, 255, 255, 0.06)',
      '--opcteam-color-action-neutral-surface': 'rgba(255, 255, 255, 0.1)',
      '--opcteam-component-config-page-row-hover-background': 'rgba(255, 255, 255, 0.1)',
    });

    expect(tokens['--opcteam-component-config-page-row-hover-background'])
      .toBe(darkAppearance?.colors.element.base);
    expect(tokens['--opcteam-component-config-page-row-hover-background'])
      .not.toBe(darkAppearance?.colors.element.soft);

    for (const appearance of builtinAppearancePalettes.filter(
      entry => entry.type === 'dark' && !entry.components?.configPage?.rowHover,
    )) {
      expect(
        getBuiltinAppearanceThemeTokens(appearance.id)[
          '--opcteam-component-config-page-row-hover-background'
        ],
        appearance.id,
      ).toBe(appearance.colors.element.base);
    }
  });

  it('keeps monochrome content readable while projecting inverse structural chrome', () => {
    const monochrome = builtinAppearancePalettes.find(
      appearance => appearance.id === 'opc-monochrome',
    );
    const monochromePackage = getBuiltinAppearance('opc-monochrome');
    const tokens = getBuiltinAppearanceThemeTokens('opc-monochrome');
    const chromeTokens = monochromePackage?.renderers?.['theme-tokens']?.settings.scopes?.chrome;

    expect(monochrome).toMatchObject({
      type: 'light',
      description: 'Black-and-white contrast appearance - Deep black chrome, bright white workspace, soft neutral blocks',
      colors: {
        background: {
          primary: '#ffffff',
          scene: '#ffffff',
        },
        text: {
          primary: 'rgba(0, 0, 0, 0.80)',
          secondary: 'rgba(0, 0, 0, 0.60)',
          muted: '#6a6a6a',
        },
        border: {
          subtle: 'rgba(16, 26, 39, 0.08)',
          base: 'rgba(16, 26, 39, 0.15)',
          prominent: 'rgba(16, 26, 39, 0.48)',
        },
        element: {
          subtle: 'rgba(16, 26, 39, 0.03)',
          soft: '#f3f3f5',
          strong: 'rgba(0, 0, 0, 0.10)',
        },
        accent: {
          500: '#1c1c1f',
          600: '#000000',
        },
        chrome: {
          background: {
            primary: '#1c1c1f',
            secondary: '#262626',
          },
          text: {
            primary: '#f3f3f5',
            secondary: '#b0b0b0',
            muted: '#858585',
            disabled: '#555555',
          },
          accent: {
            500: '#f3f3f5',
            600: '#ffffff',
          },
        },
      },
      components: {
        button: {
          primary: {
            default: { background: '#1c1c1f', color: '#ffffff' },
            hover: { background: '#000000', color: '#ffffff' },
          },
        },
        configPage: {
          section: {
            background: '#f3f3f5',
            border: 'transparent',
            borderWidth: '0',
            shadow: 'none',
          },
          divider: 'rgba(16, 26, 39, 0.08)',
          rowHover: 'rgba(16, 26, 39, 0.03)',
        },
      },
    });
    expect(tokens).toMatchObject({
      '--opcteam-color-surface-canvas': '#ffffff',
      '--opcteam-color-content-primary': 'rgba(0, 0, 0, 0.80)',
      '--opcteam-color-content-secondary': 'rgba(0, 0, 0, 0.60)',
      '--opcteam-color-content-disabled': 'rgba(0, 0, 0, 0.30)',
      '--opcteam-color-border-subtle': 'rgba(16, 26, 39, 0.08)',
      '--opcteam-color-border-default': 'rgba(16, 26, 39, 0.15)',
      '--opcteam-color-surface-subtle': 'rgba(16, 26, 39, 0.03)',
      '--opcteam-color-action-quiet-hover': '#f3f3f5',
      '--opcteam-color-scrollbar-thumb': 'rgba(0, 0, 0, 0.2)',
      '--opcteam-component-config-page-section-background': '#f3f3f5',
      '--opcteam-component-config-page-section-border': 'transparent',
      '--opcteam-component-config-page-section-border-width': '0',
      '--opcteam-component-config-page-section-shadow': 'none',
      '--opcteam-component-config-page-divider': 'rgba(16, 26, 39, 0.08)',
    });
    expect(chromeTokens).toMatchObject({
      '--opcteam-color-surface-canvas': '#1c1c1f',
      '--opcteam-color-content-primary': '#f3f3f5',
      '--opcteam-color-action-quiet-hover': 'rgba(255, 255, 255, 0.06)',
    });
  });

  it('projects builtin appearances to a compact OpenCode-compatible plugin color key set', () => {
    expect(PLUGIN_APPEARANCE_COLOR_KEYS).toEqual([
      'primary',
      'secondary',
      'accent',
      'success',
      'warning',
      'error',
      'info',
    ]);

    for (const appearance of builtinAppearancePalettes) {
      const projection = createPluginAppearanceColorProjection(appearance);

      expect(Object.keys(projection).sort()).toEqual([...PLUGIN_APPEARANCE_COLOR_KEYS].sort());
      expect(projection.primary).toBe(appearance.colors.accent[500]);
      expect(projection.secondary).toBe(appearance.colors.purple?.[500] ?? appearance.colors.accent[600]);
      expect(projection.accent).toBe(appearance.colors.accent[600]);
      expect(projection.success).toBe(appearance.colors.semantic.success);
      expect(projection.warning).toBe(appearance.colors.semantic.warning);
      expect(projection.error).toBe(appearance.colors.semantic.error);
      expect(projection.info).toBe(appearance.colors.semantic.info);
    }
  });

  it('keeps resolved preset objects stable across helper refactors', () => {
    expect(builtinAppearancePalettes.map(appearance => ({
      id: appearance.id,
      type: appearance.type,
      hash: hashAppearance(appearance),
    }))).toMatchInlineSnapshot(`
      [
        {
          "hash": "c282bc0ec23e11fff707dbb757e725bd34cf8c2793456902d8096a1f2fb1bd51",
          "id": "opc-light",
          "type": "light",
        },
        {
          "hash": "d08b15d5e0c9beb3974ae7fe9e4aecb3a312d7399ad6e36425bcaa8d7bd4face",
          "id": "opc-monochrome",
          "type": "light",
        },
        {
          "hash": "d773193afc57e4a411c491b4c00906abf595948e823b39cda7c1ebd47960ab7d",
          "id": "opc-slate",
          "type": "dark",
        },
        {
          "hash": "b427bc9dfa6c3771f366946c22fbc53caf298f294c71b9deda43d8a0a6e99ab2",
          "id": "opc-dark",
          "type": "dark",
        },
        {
          "hash": "504eb971c80f0aadb8bac33ee975c90b95abea5af0d1a0f223992be87b5ef257",
          "id": "opc-midnight",
          "type": "dark",
        },
        {
          "hash": "29c1d588979df63290f8a926c9415457ffb3334d70ab7d1bc6bc6db8eb231a91",
          "id": "opc-china-style",
          "type": "light",
        },
        {
          "hash": "03d37af2ee8ed530b3e068aded57ca95c35fcec89850f8bf38abdf2dfe862cec",
          "id": "opc-china-night",
          "type": "dark",
        },
        {
          "hash": "0c846d29a637385352b6b6658c3006d5246a90819662ed00fbd3e23f495c0a22",
          "id": "opc-cyber",
          "type": "dark",
        },
        {
          "hash": "6a89b2fe93336994b4cca5bbd2acfae2c5bdb3a3a95d43bfbfc5b465a25b5b16",
          "id": "opc-tokyo-night",
          "type": "dark",
        },
        {
          "hash": "fd5395182d6ad31c952dd1c768853e3825d1523f3ca64fe8f95b829180fe33b4",
          "id": "opc-claude-style",
          "type": "light",
        },
        {
          "hash": "891dafa3868ba2a3971cea5443cb79b5286dc8b69e8a5c6e1c378adc2498d958",
          "id": "opc-claude-night",
          "type": "dark",
        },
      ]
    `);
  });
});
