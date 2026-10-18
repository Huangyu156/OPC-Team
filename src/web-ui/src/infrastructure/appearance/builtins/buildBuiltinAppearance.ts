import { themeCssVariables, themes, type ThemeTokenName } from '@opc-team/theme';

import type { AppearancePalette } from './AppearancePalette';
import { withLegacyButtonTokens } from './buttonThemeCompatibility';
import { DEFAULT_DARK_APPEARANCE_ID, DEFAULT_LIGHT_APPEARANCE_ID } from './palettes';
import { createSubagentAvatarTokens } from './subagentAvatarTokens';
import type {
  AppearanceColorValue,
  AppearanceDurationValue,
  AppearanceLengthValue,
  AppearanceNumberValue,
  AppearancePackage,
  AppearanceThemeTokenName,
} from '../types';
import {
  WIDGET_APPEARANCE_VARIABLE_NAMES,
  type WidgetAppearanceVariableName,
} from '../adapters/widgetAppearanceVariables';

const OVERLAY_WHITE_04 = 'rgba(255, 255, 255, 0.04)';

function color(value: string): AppearanceColorValue {
  const trimmed = value.trim();
  if (trimmed === 'transparent') return { kind: 'transparent' };
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return { kind: 'hex', value: trimmed };
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(trimmed);
  if (rgb) {
    return {
      kind: 'rgb',
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      ...(rgb[4] === undefined ? {} : { a: Number(rgb[4]) }),
    };
  }
  const hsl = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(trimmed);
  if (hsl) {
    return {
      kind: 'hsl',
      h: Number(hsl[1]),
      s: Number(hsl[2]),
      l: Number(hsl[3]),
      ...(hsl[4] === undefined ? {} : { a: Number(hsl[4]) }),
    };
  }
  throw new Error(`Appearance palette color is invalid: ${value}`);
}

function length(value: string): AppearanceLengthValue {
  const trimmed = value.trim();
  if (trimmed === '0') return { kind: 'zero' };
  const match = /^(-?[\d.]+)(px|rem|%)$/.exec(trimmed);
  if (!match) throw new Error(`Appearance palette length is invalid: ${value}`);
  const unit = match[2] === '%' ? 'percent' : match[2];
  return { kind: unit, value: Number(match[1]) } as AppearanceLengthValue;
}

function duration(value: string): AppearanceDurationValue {
  const trimmed = value.trim();
  const match = /^([\d.]+)(ms|s)$/.exec(trimmed);
  if (!match) throw new Error(`Appearance palette duration is invalid: ${value}`);
  return { kind: 'ms', value: Number(match[1]) * (match[2] === 's' ? 1000 : 1) };
}

function number(value: number): AppearanceNumberValue {
  return { kind: 'number', value };
}

type ThemeValue = string | number | boolean;

function themeValuesToCssTokens(
  values: Readonly<Record<ThemeTokenName, ThemeValue>>,
  palette: AppearancePalette,
): Record<AppearanceThemeTokenName, string> {
  const tokens = Object.fromEntries(
    (Object.entries(values) as [ThemeTokenName, ThemeValue][])
      .map(([name, value]) => [themeCssVariables[name], String(value)]),
  ) as Record<AppearanceThemeTokenName, string>;
  if (palette.id === DEFAULT_LIGHT_APPEARANCE_ID || palette.id === DEFAULT_DARK_APPEARANCE_ID) {
    if (palette.id === DEFAULT_LIGHT_APPEARANCE_ID) {
      // Neutral action labels are primary text in the public theme. The generic
      // palette's secondary text projection used to make product menus too faint.
      tokens['--opcteam-color-action-neutral-content'] = String(themes.light['color.action.neutral.content']);
      tokens['--opcteam-color-scrollbar-thumb'] = String(themes.light['color.scrollbar.thumb']);
      tokens['--opcteam-color-number-badge-background'] = String(themes.light['color.numberBadge.background']);
      tokens['--opcteam-color-key-hint-content'] = String(themes.light['color.keyHint.content']);
      tokens['--opcteam-color-action-card-background'] = String(themes.light['color.actionCard.background']);
      tokens['--opcteam-color-content-caption'] = String(themes.light['color.content.caption']);
      // Default light fields use the published neutral states in both root and
      // chrome. Branded palettes and imported overrides retain their own colors.
      for (const name of Object.keys(themes.light) as ThemeTokenName[]) {
        if (name.startsWith('color.field.') || name.startsWith('color.composer.')) {
          tokens[themeCssVariables[name] as AppearanceThemeTokenName] = String(themes.light[name]);
        }
      }
    }
    return tokens;
  }
  // Branded presets retain their existing action palette; the default product
  // themes consume the component colors published by the design system.
  const legacyTokens = Object.fromEntries(
    Object.entries(tokens).filter(([name]) => !name.startsWith('--opcteam-component-button-')),
  );
  for (const [name, value] of Object.entries(withLegacyButtonTokens(legacyTokens))) {
    if (value !== undefined) tokens[name as AppearanceThemeTokenName] = value;
  }
  return tokens;
}

function createThemeTokenValues(palette: AppearancePalette): Record<ThemeTokenName, ThemeValue> {
  const { colors, effects } = palette;
  const purple = colors.purple ?? {
    100: colors.element.subtle,
    200: colors.element.soft,
    500: colors.accent[500],
    600: colors.accent[600],
  };
  const scrollbar = colors.scrollbar ?? {
    thumb: palette.type === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
    thumbHover: palette.type === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
  };
  const button = palette.components?.button;
  const focusRing = colors.focus?.ring ?? colors.accent[500];
  const values: Record<ThemeTokenName, ThemeValue> = { ...themes[palette.type] };

  Object.assign(values, {
    'color.surface.canvas': colors.background.primary,
    'color.surface.panel': colors.background.secondary,
    'color.surface.raised': colors.background.elevated,
    'color.surface.scene': colors.background.scene,
    'color.surface.workbench': colors.background.workbench,
    'color.surface.tertiary': colors.background.tertiary,
    'color.surface.chrome': colors.background.chrome
      ?? colors.chrome?.background.chrome
      ?? colors.chrome?.background.primary
      ?? colors.background.primary,
    'color.surface.subtle': colors.element.subtle,
    'color.scrollbar.thumb': scrollbar.thumb,
    'color.scrollbar.thumbHover': scrollbar.thumbHover,
    'color.content.primary': colors.text.primary,
    'color.content.caption': colors.text.muted,
    'color.keyHint.content': colors.text.muted,
    'color.numberBadge.background': colors.element.base,
    'color.content.secondary': colors.text.secondary,
    'color.content.muted': colors.text.muted,
    'color.content.disabled': colors.text.disabled,
    'color.accent.default': colors.accent[500],
    'color.accent.hover': colors.accent[600],
    'color.accent.secondary': purple[500],
    'color.accent.secondaryHover': purple[600],
    'color.border.subtle': colors.border.subtle,
    'color.border.default': colors.border.base,
    'color.border.strong': colors.border.strong,
    'color.action.neutral.border': colors.border.base,
    'color.action.neutral.content': colors.text.secondary,
    'color.action.neutral.contentDisabled': colors.text.disabled,
    'color.action.neutral.fillBorder': colors.element.base,
    'color.actionCard.background': colors.element.base,
    'color.action.neutral.surface': colors.element.base,
    'color.action.neutral.surfaceHover': colors.element.medium,
    'color.action.neutral.surfacePressed': colors.element.strong,
    'color.action.primary.background': button?.primary.default.background ?? colors.accent[500],
    'color.action.primary.hover': button?.primary.hover.background ?? colors.accent[600],
    'color.action.primary.pressed': button?.primary.active.background ?? colors.accent[700],
    'color.action.primary.content': button?.primary.default.color ?? values['color.content.inverse'],
    'color.action.secondary.background': colors.accent[100],
    'color.action.secondary.hover': colors.accent[200],
    'color.action.secondary.pressed': colors.accent[300],
    'color.action.secondary.content': colors.accent[600],
    'color.action.quiet.hover': colors.element.soft,
    'color.action.quiet.pressed': colors.element.base,
    'color.action.quiet.content': colors.text.secondary,
    'color.selection.surface': colors.element.medium,
    'color.field.groupBackground': colors.background.tertiary,
    'color.field.background': colors.background.input ?? colors.background.secondary,
    'color.field.backgroundHover': colors.element.subtle,
    'color.composer.border': colors.border.base,
    'color.composer.contextBackground': colors.element.subtle,
    'color.field.border': colors.border.base,
    'color.field.borderHover': colors.border.medium,
    'color.field.borderFocus': focusRing,
    'color.field.borderActive': focusRing,
    'color.field.placeholder': colors.text.muted,
    'color.focus.ring': focusRing,
    'color.link.default': colors.link?.default ?? values['color.link.default'],
    'color.link.hover': colors.link?.hover ?? values['color.link.hover'],
    'color.status.info.content': colors.semantic.info,
    'color.status.info.surface': colors.semantic.infoBg,
    'color.status.info.border': colors.semantic.infoBorder,
    'color.status.success.content': colors.semantic.success,
    'color.status.success.surface': colors.semantic.successBg,
    'color.status.success.border': colors.semantic.successBorder,
    'color.status.warning.content': colors.semantic.warning,
    'color.status.warning.surface': colors.semantic.warningBg,
    'color.status.warning.border': colors.semantic.warningBorder,
    'color.status.danger.content': colors.semantic.error,
    'color.status.danger.surface': colors.semantic.errorBg,
    'color.status.danger.border': colors.semantic.errorBorder,
    'shadow.xs': effects.shadow.xs,
    'shadow.sm': effects.shadow.sm,
    'shadow.base': effects.shadow.base,
    'shadow.lg': effects.shadow.lg,
    'shadow.xl': effects.shadow.xl,
    'shadow.raised': effects.shadow.sm,
    'effect.blur.subtle': effects.blur.subtle,
    'effect.blur.base': effects.blur.base,
    'opacity.disabled': effects.opacity.disabled,
    'opacity.hover': effects.opacity.hover,
    'opacity.focus': effects.opacity.focus,
    'opacity.muted': effects.opacity.hover,
  } satisfies Partial<Record<ThemeTokenName, ThemeValue>>);

  return values;
}

function createChromeThemeTokens(
  palette: AppearancePalette,
): Record<AppearanceThemeTokenName, string> | undefined {
  const chrome = palette.colors.chrome;
  if (!chrome) return undefined;
  const values = createThemeTokenValues(palette);
  const statusTheme = themes[chrome.type ?? palette.type];
  for (const name of Object.keys(statusTheme) as ThemeTokenName[]) {
    if (name.startsWith('color.status.')) values[name] = statusTheme[name];
  }
  const scrollbar = chrome.scrollbar ?? palette.colors.scrollbar ?? {
    thumb: palette.type === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
    thumbHover: palette.type === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
  };
  // Chrome focus keeps following the palette's focus ink when it declares one;
  // otherwise it stays on the accent so existing chrome palettes are unchanged.
  const chromeFocusRing = palette.colors.focus?.ring ?? chrome.accent[500];

  Object.assign(values, {
    'color.surface.canvas': chrome.background.primary,
    'color.surface.panel': chrome.background.secondary,
    'color.surface.raised': chrome.background.elevated,
    'color.surface.scene': chrome.background.scene,
    'color.surface.workbench': chrome.background.workbench,
    'color.surface.tertiary': chrome.background.tertiary,
    'color.surface.chrome': chrome.background.chrome ?? chrome.background.primary,
    'color.surface.subtle': chrome.element.subtle,
    'color.content.primary': chrome.text.primary,
    'color.content.caption': chrome.text.muted,
    'color.keyHint.content': chrome.text.muted,
    'color.numberBadge.background': chrome.element.base,
    'color.content.secondary': chrome.text.secondary,
    'color.content.muted': chrome.text.muted,
    'color.content.disabled': chrome.text.disabled,
    'color.accent.default': chrome.accent[500],
    'color.accent.hover': chrome.accent[600],
    'color.border.subtle': chrome.border.subtle,
    'color.border.default': chrome.border.base,
    'color.border.strong': chrome.border.strong,
    'color.action.neutral.border': chrome.border.base,
    'color.action.neutral.content': chrome.text.secondary,
    'color.action.neutral.contentDisabled': chrome.text.disabled,
    'color.action.neutral.fillBorder': chrome.element.base,
    'color.actionCard.background': chrome.element.base,
    'color.action.neutral.surface': chrome.element.base,
    'color.action.neutral.surfaceHover': chrome.element.medium,
    'color.action.neutral.surfacePressed': chrome.element.strong,
    'color.action.secondary.background': chrome.accent[100],
    'color.action.secondary.hover': chrome.accent[200],
    'color.action.secondary.pressed': chrome.accent[300],
    'color.action.secondary.content': chrome.accent[600],
    'color.action.quiet.hover': chrome.element.soft,
    'color.action.quiet.pressed': chrome.element.base,
    'color.action.quiet.content': chrome.text.secondary,
    'color.selection.surface': chrome.element.medium,
    'color.field.groupBackground': chrome.background.tertiary,
    'color.field.background': chrome.background.input ?? chrome.background.secondary,
    'color.field.backgroundHover': chrome.element.subtle,
    'color.composer.border': chrome.border.base,
    'color.composer.contextBackground': chrome.element.subtle,
    'color.field.border': chrome.border.base,
    'color.field.borderHover': chrome.border.medium,
    'color.field.borderFocus': chromeFocusRing,
    'color.field.borderActive': chromeFocusRing,
    'color.field.placeholder': chrome.text.muted,
    'color.focus.ring': chromeFocusRing,
    'color.scrollbar.thumb': scrollbar.thumb,
    'color.scrollbar.thumbHover': scrollbar.thumbHover,
  } satisfies Partial<Record<ThemeTokenName, ThemeValue>>);

  return themeValuesToCssTokens(values, palette);
}

function createAppearanceOwnedTokens(
  palette: AppearancePalette,
): Record<AppearanceThemeTokenName, string> {
  const { colors } = palette;
  const purple = colors.purple ?? {
    100: colors.element.subtle,
    200: colors.element.soft,
    500: colors.accent[500],
    600: colors.accent[600],
  };
  const configPage = palette.components?.configPage;
  // On the default dark palette, the quiet hover tint composites over the
  // tertiary section surface to almost exactly the surrounding scene color.
  // Use the stronger neutral layer for dark settings rows so hover feedback
  // remains visually contained by the section instead of appearing as a gap.
  const configPageRowHover = configPage?.rowHover
    ?? (palette.type === 'dark' ? colors.element.base : colors.element.soft);
  return {
    ...themeValuesToCssTokens(createThemeTokenValues(palette), palette),
    ...createSubagentAvatarTokens(palette),
    '--opcteam-component-config-page-section-background': configPage?.section.background ?? colors.background.tertiary,
    '--opcteam-component-config-page-section-border': configPage?.section.border ?? colors.border.subtle,
    '--opcteam-component-config-page-section-border-width': configPage?.section.borderWidth ?? '1px',
    '--opcteam-component-config-page-section-shadow': configPage?.section.shadow
      ?? `inset 0 1px 0 ${OVERLAY_WHITE_04}`,
    '--opcteam-component-config-page-divider': configPage?.divider ?? colors.border.subtle,
    '--opcteam-component-config-page-row-hover-background': configPageRowHover,
    '--opcteam-component-scene-viewport-border-width': palette.layout?.sceneViewportBorder === false ? '0' : '1px',
    '--opcteam-component-badge-padding-block': '2px',
    // Annotation selections retain the UIKit cyan across named product themes.
    '--opcteam-component-conversation-excerpt-accent': String(themes.light['color.accent.default']),
    // Update glass retains its cyan companion when a dark theme's accent becomes blue.
    '--opcteam-component-update-material-cyan': String(themes.light['color.accent.default']),
    '--opcteam-domain-context-compression': purple[500],
    '--opcteam-domain-generative-ui': '#06b6d4',
    '--opcteam-domain-mini-app': purple[500],
    '--opcteam-domain-mermaid-diagram': colors.semantic.success,
    '--opcteam-domain-tool-search': colors.accent[600],
    '--opcteam-domain-tool-web-search': '#06b6d4',
    '--opcteam-domain-tool-git': colors.semantic.warning,
    '--opcteam-domain-tool-terminal': '#14b8a6',
    '--opcteam-domain-tool-mcp': purple[500],
    '--opcteam-domain-tool-assistant-action': purple[500],
    '--opcteam-domain-tool-review-summary': '#06b6d4',
    '--opcteam-domain-capability-docs': colors.semantic.success,
    '--opcteam-domain-capability-testing': colors.semantic.warning,
    '--opcteam-domain-capability-creative': purple[500],
    '--opcteam-domain-capability-ops': '#06b6d4',
    '--opcteam-domain-insights-positive': colors.semantic.success,
    '--opcteam-domain-insights-time': purple[500],
    '--opcteam-domain-insights-neutral': colors.semantic.warning,
    '--opcteam-domain-insights-issue': colors.semantic.error,
    '--opcteam-domain-progress-compacting': '#14b8a6',
    '--opcteam-domain-template-memories': purple[500],
    '--opcteam-domain-review-member-default': '#64748b',
    '--opcteam-domain-review-worker': colors.accent[600],
    '--opcteam-domain-review-judge': purple[500],
    '--opcteam-domain-teal-action': '#14b8a6',
    '--opcteam-domain-todo': '#14b8a6',
    '--opcteam-domain-git-branch': colors.git.branch,
    '--opcteam-domain-git-branch-background': colors.git.branchBg,
    '--opcteam-domain-git-branch-background-hover': colors.element.medium,
    '--opcteam-domain-git-changes': colors.git.changes,
    '--opcteam-domain-git-added': colors.git.added,
    '--opcteam-domain-git-deleted': colors.git.deleted,
    '--opcteam-domain-git-staged': colors.git.staged,
    '--opcteam-domain-git-lane-0': colors.accent[600],
    '--opcteam-domain-git-lane-1': colors.semantic.success,
    '--opcteam-domain-git-lane-2': colors.semantic.warning,
    '--opcteam-domain-git-lane-3': purple[500],
    '--opcteam-domain-git-lane-4': colors.semantic.error,
    '--opcteam-domain-git-lane-5': '#06b6d4',
    '--opcteam-domain-git-lane-6': '#14b8a6',
    '--opcteam-domain-git-lane-7': '#64748b',
    '--opcteam-domain-text-stroke-0': colors.semantic.warning,
    '--opcteam-domain-text-stroke-1': colors.semantic.error,
    '--opcteam-domain-text-stroke-2': colors.accent[600],
    '--opcteam-domain-text-stroke-3': '#06b6d4',
    '--opcteam-domain-text-stroke-4': purple[500],
    '--opcteam-domain-inspector-active-border': colors.accent[600],
    '--opcteam-domain-inspector-active-background': `color-mix(in srgb, ${colors.accent[600]} 15%, transparent)`,
    '--opcteam-domain-inspector-active-border-subtle': `color-mix(in srgb, ${colors.accent[600]} 40%, transparent)`,
    '--opcteam-domain-inspector-selected-border': colors.semantic.success,
    '--opcteam-domain-inspector-selected-background': `color-mix(in srgb, ${colors.semantic.success} 18%, transparent)`,
    '--opcteam-domain-inspector-browser-tooltip-background': 'rgba(10, 10, 10, 0.92)',
    '--opcteam-domain-inspector-main-tooltip-background': 'rgba(15, 23, 42, 0.95)',
    '--opcteam-domain-inspector-tooltip-text': '#e2e8f0',
    '--opcteam-domain-inspector-tooltip-shadow': 'rgba(0, 0, 0, 0.5)',
    '--opcteam-domain-language-blue': '#3178c6',
    '--opcteam-domain-language-cyan': '#00add8',
    '--opcteam-domain-language-yellow': '#f7df1e',
    '--opcteam-domain-language-orange': '#e38c00',
    '--opcteam-domain-language-red': colors.semantic.error,
    '--opcteam-domain-language-green': colors.semantic.success,
    '--opcteam-domain-language-purple': purple[500],
    '--opcteam-domain-language-slate': '#64748b',
    '--opcteam-domain-prism-light-foreground': '#24292f',
    '--opcteam-domain-prism-light-comment': '#6e7781',
    '--opcteam-domain-prism-light-keyword': '#cf222e',
    '--opcteam-domain-prism-light-string': '#0550ae',
    '--opcteam-domain-prism-light-function': '#8250df',
    '--opcteam-domain-prism-light-number': '#0550ae',
    '--opcteam-domain-prism-light-tag': '#116329',
    '--opcteam-domain-prism-light-punctuation': '#57606a',
    '--opcteam-domain-prism-light-property': '#953800',
    '--opcteam-domain-prism-dark-foreground': '#d4d4d4',
    '--opcteam-domain-prism-dark-comment': '#6a9955',
    '--opcteam-domain-prism-dark-keyword': '#c586c0',
    '--opcteam-domain-prism-dark-string': '#ce9178',
    '--opcteam-domain-prism-dark-function': '#dcdcaa',
    '--opcteam-domain-prism-dark-number': '#b5cea8',
    '--opcteam-domain-prism-dark-tag': '#569cd6',
    '--opcteam-domain-prism-dark-punctuation': '#d4d4d4',
    '--opcteam-domain-prism-dark-property': '#9cdcfe',
  };
}

function createWidgetAppearanceVars(
  themeTokens: Readonly<Record<string, string>>,
): Record<WidgetAppearanceVariableName, string> {
  return Object.fromEntries(WIDGET_APPEARANCE_VARIABLE_NAMES.map(name => {
    const value = themeTokens[name];
    if (!value) throw new Error(`Builtin Appearance does not define Widget token ${name}`);
    return [name, value];
  })) as Record<WidgetAppearanceVariableName, string>;
}

export function buildBuiltinAppearance(palette: AppearancePalette): AppearancePackage {
  const themeTokens = createAppearanceOwnedTokens(palette);
  const chromeThemeTokens = createChromeThemeTokens(palette);
  const purple = palette.colors.purple ?? {
    100: palette.colors.element.subtle,
    200: palette.colors.element.soft,
    500: palette.colors.accent[500],
    600: palette.colors.accent[600],
  };
  const colors = {
    'bg-primary': color(palette.colors.background.primary),
    'bg-elevated': color(palette.colors.background.elevated),
    'text-primary': color(palette.colors.text.primary),
    'text-secondary': color(palette.colors.text.secondary),
    'text-muted': color(palette.colors.text.muted),
    'accent': color(palette.colors.accent[500]),
    'accent-active': color(palette.colors.accent[600]),
    'border-subtle': color(palette.colors.border.subtle),
    'border-base': color(palette.colors.border.base),
    'border-strong': color(palette.colors.border.strong),
    'element-subtle': color(palette.colors.element.subtle),
    'element-soft': color(palette.colors.element.soft),
    'element-base': color(palette.colors.element.base),
    'element-medium': color(palette.colors.element.medium),
    'error': color(palette.colors.semantic.error),
    'error-bg': color(palette.colors.semantic.errorBg),
    'error-border': color(palette.colors.semantic.errorBorder),
    'success': color(palette.colors.semantic.success),
    'success-bg': color(palette.colors.semantic.successBg),
    'purple': color(purple[500]),
    'purple-bg': color(purple[100]),
  };
  const monaco = palette.monaco;
  const xtermAnsi = palette.type === 'dark' ? {
    black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510', blue: '#2472c8',
    magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5', brightBlack: '#666666',
    brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543', brightBlue: '#3b8eea',
    brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#e5e5e5',
  } : {
    black: '#000000', red: '#cd3131', green: '#107C10', yellow: '#949800', blue: '#0451a5',
    magenta: '#bc05bc', cyan: '#0598bc', white: '#555555', brightBlack: '#666666',
    brightRed: '#cd3131', brightGreen: '#14CE14', brightYellow: '#b5ba00', brightBlue: '#0451a5',
    brightMagenta: '#bc05bc', brightCyan: '#0598bc', brightWhite: '#a5a5a5',
  };
  const monacoColors: Record<string, string> = {
    'editor.background': monaco?.colors.background ?? palette.colors.background.scene,
    'editor.foreground': monaco?.colors.foreground ?? palette.colors.text.primary,
    'editorLineNumber.foreground': palette.colors.text.muted,
    'editorCursor.foreground': monaco?.colors.cursor ?? palette.colors.accent[500],
    'editor.selectionBackground': monaco?.colors.selection ?? palette.colors.accent[300],
    'editor.inactiveSelectionBackground': palette.colors.accent[200],
    'editor.selectionHighlightBackground': palette.colors.accent[200],
    'editor.selectionHighlightBorder': palette.colors.accent[400],
    'editor.wordHighlightBackground': palette.colors.accent[100],
    'editor.wordHighlightStrongBackground': palette.colors.accent[200],
    'editor.lineHighlightBackground': monaco?.colors.lineHighlight ?? palette.colors.background.secondary,
    focusBorder: '#00000000',
    contrastBorder: '#00000000',
    'diffEditor.insertedTextBorder': '#00000000',
    'diffEditor.removedTextBorder': '#00000000',
  };
  Object.entries(monaco?.colors ?? {}).forEach(([key, value]) => {
    if (!['background', 'foreground', 'lineHighlight', 'selection', 'cursor'].includes(key)) {
      monacoColors[key] = value;
    }
  });

  return {
    schema: 'opc.appearance',
    schemaVersion: 2,
    id: palette.id,
    name: palette.name,
    version: /^\d+\.\d+\.\d+/.test(palette.version ?? '') ? palette.version! : '1.0.0',
    mode: palette.type,
    requiredCapabilities: ['renderers.v1'],
    globals: {
      colors,
      lengths: {
        'border-one': { kind: 'px', value: 1 },
        'radius-sm': length(palette.effects.radius.sm),
        'radius-base': length(palette.effects.radius.base),
        'radius-lg': length(palette.effects.radius.lg),
        'gap-1': length(palette.effects.spacing[1]),
        'gap-2': length(palette.effects.spacing[2]),
        'gap-3': length(palette.effects.spacing[3]),
        'gap-4': length(palette.effects.spacing[4]),
        'gap-6': length(palette.effects.spacing[6]),
      },
      numbers: {
        'opacity-disabled': number(palette.effects.opacity.disabled),
      },
      durations: {
        fast: duration(palette.motion.duration.fast),
        base: duration(palette.motion.duration.base),
      },
      easings: {
        standard: { kind: 'easing', value: 'standard' },
      },
    },
    renderers: {
      'theme-tokens': {
        version: 1,
        settings: {
          tokens: themeTokens,
          ...(chromeThemeTokens ? { scopes: { chrome: chromeThemeTokens } } : {}),
        },
      },
      monaco: {
        version: 1,
        settings: {
          id: `opc-appearance-${palette.id}`,
          base: monaco?.base ?? (palette.type === 'dark' ? 'vs-dark' : 'vs'),
          inherit: monaco?.inherit ?? true,
          rules: monaco?.rules ?? [],
          colors: monacoColors,
        },
      },
      xterm: {
        version: 1,
        settings: {
          surfaces: {
            terminal: {
              background: palette.colors.background.scene,
              foreground: palette.colors.text.primary,
              cursor: palette.colors.text.primary,
              cursorAccent: palette.colors.background.secondary,
              selectionBackground: palette.type === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(173, 214, 255, 0.45)',
              selectionInactiveBackground: palette.type === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(173, 214, 255, 0.25)',
              ...xtermAnsi,
            },
            output: {
              background: palette.colors.background.scene,
              foreground: palette.colors.text.primary,
              cursor: 'transparent',
              cursorAccent: 'transparent',
              selectionBackground: palette.type === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(173, 214, 255, 0.45)',
              selectionInactiveBackground: palette.type === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(173, 214, 255, 0.25)',
              ...xtermAnsi,
            },
          },
        },
      },
      mermaid: {
        version: 1,
        settings: {
          mode: palette.type,
          palette: {
            nodeFill: palette.colors.element.base,
            nodeFillHover: palette.colors.element.medium,
            nodeText: palette.colors.text.primary,
            nodeStroke: palette.colors.border.strong,
            nodeStrokeHover: palette.colors.accent[500],
            clusterFill: palette.colors.background.secondary,
            clusterText: palette.colors.text.secondary,
            clusterStroke: palette.colors.border.base,
            edgeStroke: palette.colors.text.muted,
            edgeLabelBackground: palette.colors.background.elevated,
            edgeLabelText: palette.colors.text.secondary,
            noteFill: palette.colors.semantic.warningBg,
            noteText: palette.colors.text.primary,
            noteStroke: palette.colors.semantic.warning,
            activationFill: palette.colors.element.medium,
            activationStroke: palette.colors.border.strong,
            success: palette.colors.semantic.success,
            warning: palette.colors.semantic.warning,
            error: palette.colors.semantic.error,
            errorBackground: palette.colors.semantic.errorBg,
            info: palette.colors.accent[500],
            highlight: palette.colors.accent[500],
            pieColors: [
              palette.colors.accent[500], palette.colors.semantic.success, palette.colors.semantic.warning,
              palette.colors.semantic.error, purple[500], palette.colors.accent[400],
              palette.colors.accent[600], palette.colors.text.muted,
            ],
          },
        },
      },
      'generative-widget': {
        version: 1,
        settings: {
          id: `builtin.${palette.id}`,
          mode: palette.type,
          vars: createWidgetAppearanceVars(themeTokens),
        },
      },
      'opc-canvas': {
        version: 1,
        settings: {
          id: `builtin.${palette.id}`,
          mode: palette.type,
          bg: palette.colors.background.primary,
          panel: palette.colors.background.secondary,
          fg: palette.colors.text.primary,
          muted: palette.colors.text.muted,
          border: palette.colors.border.base,
          accent: palette.colors.accent[500],
          success: palette.colors.semantic.success,
          warning: palette.colors.semantic.warning,
          danger: palette.colors.semantic.error,
          info: palette.colors.semantic.info,
        },
      },
    },
  };
}
