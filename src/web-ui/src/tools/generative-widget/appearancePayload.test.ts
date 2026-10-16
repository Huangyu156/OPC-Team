import { createHash } from 'node:crypto';
import {
  cssVariables as systemCssVariables,
  tokens as systemTokens,
} from '@opc-team/design-tokens';
import { themeCssVariables } from '@opc-team/theme';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { widgetAppearanceAdapter } from '@/infrastructure/appearance/adapters/WidgetAppearanceAdapter';
import {
  WIDGET_APPEARANCE_FALLBACK_VARS,
  WIDGET_APPEARANCE_VAR_NAMES,
  WIDGET_TYPOGRAPHY_VARIABLE_NAMES,
  createWidgetAppearanceFallbackCss,
  readWidgetAppearancePayload,
} from './appearancePayload';

const CANONICAL_THEME_VARIABLE_NAMES = Object.values(themeCssVariables);
const SHARED_THEME_VARIABLE_NAMES_HASH = 'fda681dbbe8d44342b3a4765af224b243e6ecdbc5f4a3cf666dce762ce295b58';
// Button owns these state colors independently of the existing shared actions.
// Keep the original shared contract intact and enumerate this addition exactly.
const BUTTON_THEME_VARIABLE_NAMES = [
  '--opcteam-component-button-content',
  '--opcteam-component-button-fill-background',
  '--opcteam-component-button-fill-background-hover',
  '--opcteam-component-button-fill-background-pressed',
  '--opcteam-component-button-outline-border',
  '--opcteam-component-button-outline-border-interactive',
  '--opcteam-component-button-primary-background',
  '--opcteam-component-button-primary-background-hover',
  '--opcteam-component-button-primary-background-pressed',
  '--opcteam-component-button-primary-content-disabled',
  '--opcteam-component-button-text-content',
  '--opcteam-component-button-text-content-disabled',
  '--opcteam-component-button-text-content-hover',
] as const;
// Field editing borders and hints have dedicated semantics; preserve the shared
// contract fingerprint while asserting these two additions by their exact names.
const FIELD_STATE_THEME_VARIABLE_NAMES = [
  '--opcteam-color-field-border-active',
  '--opcteam-color-field-placeholder',
] as const;
// Grouped forms own a translucent fill independently of opaque tertiary surfaces
// and transient subtle feedback; keep this addition outside the shared fingerprint.
const FIELD_GROUP_THEME_VARIABLE_NAME = '--opcteam-color-field-group-background';
// Menu and navigation captions own their final contrast independently of body
// descriptions and field hints; assert this addition without changing the shared baseline.
const CAPTION_THEME_VARIABLE_NAME = '--opcteam-color-content-caption';
// Persistent action cards own their fill independently of transient feedback
// and form groups; keep the shared contract fingerprint unchanged.
const ACTION_CARD_THEME_VARIABLE_NAME = '--opcteam-color-action-card-background';
// Compact indicators own badge fill and key-hint contrast independently of
// shared action surfaces and muted prose; enumerate only these additions.
const INDICATOR_THEME_VARIABLE_NAMES = [
  '--opcteam-color-key-hint-content',
  '--opcteam-color-number-badge-background',
] as const;
// Composer and ChatComposer share editor borders and context tint independently
// of form fields and transient surfaces; enumerate these additions exactly.
const COMPOSER_THEME_VARIABLE_NAMES = [
  '--opcteam-color-composer-border',
  '--opcteam-color-composer-context-background',
] as const;
// Read-only diffs need distinct line, gutter, marker, word, and syntax roles.
// Generic added/removed colors cannot express those layered surfaces.
const CODE_DIFF_THEME_VARIABLE_NAMES = [
  '--opcteam-color-code-diff-added-gutter',
  '--opcteam-color-code-diff-added-line',
  '--opcteam-color-code-diff-added-marker',
  '--opcteam-color-code-diff-added-word',
  '--opcteam-color-code-diff-foreground',
  '--opcteam-color-code-diff-gutter-border',
  '--opcteam-color-code-diff-line-number',
  '--opcteam-color-code-diff-removed-gutter',
  '--opcteam-color-code-diff-removed-line',
  '--opcteam-color-code-diff-removed-marker',
  '--opcteam-color-code-diff-removed-word',
  '--opcteam-color-code-diff-syntax-comment',
  '--opcteam-color-code-diff-syntax-declaration',
  '--opcteam-color-code-diff-syntax-function',
  '--opcteam-color-code-diff-syntax-keyword',
  '--opcteam-color-code-diff-syntax-number',
  '--opcteam-color-code-diff-syntax-operator',
  '--opcteam-color-code-diff-syntax-property',
  '--opcteam-color-code-diff-syntax-punctuation',
  '--opcteam-color-code-diff-syntax-string',
  '--opcteam-color-code-diff-syntax-variable',
] as const;
const RETIRED_WIDGET_VARIABLE_NAMES = [
  '--background-primary',
  '--bg-primary',
  '--text-primary',
  '--accent-primary',
  '--opcteam-appearance-token-color-bg-primary',
  '--opcteam-appearance-token-color-text-primary',
  '--opcteam-appearance-token-color-accent-500',
  '--opcteam-appearance-token-btn-primary-bg',
  '--opcteam-color-accent-default-rgb',
  '--opcteam-color-status-success-content-bg',
  '--opcteam-color-status-success-content-border',
  '--opcteam-color-status-warning-content-bg',
  '--opcteam-color-status-warning-content-border',
  '--opcteam-color-status-danger-content-bg',
  '--opcteam-color-status-danger-content-border',
] as const;

function readPayloadWithHostValues(hostValues: Record<string, string> = {}) {
  widgetAppearanceAdapter.apply({
    id: 'test-appearance',
    mode: 'dark',
    vars: hostValues,
  }, undefined, { revision: 1, mode: 'dark', assets: {} });

  return readWidgetAppearancePayload();
}

function hashNames(names: readonly string[]): string {
  return createHash('sha256')
    .update(names.join('\n'))
    .digest('hex');
}

describe('generated widget appearance payload contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('derives its complete host payload allowlist from the canonical theme package', () => {
    expect(WIDGET_APPEARANCE_VAR_NAMES).toEqual(CANONICAL_THEME_VARIABLE_NAMES);
    expect(new Set(WIDGET_APPEARANCE_VAR_NAMES).size).toBe(WIDGET_APPEARANCE_VAR_NAMES.length);
    const buttonNames = WIDGET_APPEARANCE_VAR_NAMES.filter(name => name.startsWith('--opcteam-component-button-'));
    const fieldStateNames = WIDGET_APPEARANCE_VAR_NAMES.filter(name => FIELD_STATE_THEME_VARIABLE_NAMES.some(fieldName => fieldName === name));
    const indicatorNames = WIDGET_APPEARANCE_VAR_NAMES.filter(name => INDICATOR_THEME_VARIABLE_NAMES.some(indicatorName => indicatorName === name));
    const composerNames = WIDGET_APPEARANCE_VAR_NAMES.filter(name => COMPOSER_THEME_VARIABLE_NAMES.some(composerName => composerName === name));
    const codeDiffNames = WIDGET_APPEARANCE_VAR_NAMES.filter(name => name.startsWith('--opcteam-color-code-diff-'));
    const sharedNames = WIDGET_APPEARANCE_VAR_NAMES.filter(name => (
      !name.startsWith('--opcteam-component-button-')
      && !FIELD_STATE_THEME_VARIABLE_NAMES.some(fieldName => fieldName === name)
      && name !== FIELD_GROUP_THEME_VARIABLE_NAME
      && name !== CAPTION_THEME_VARIABLE_NAME
      && name !== ACTION_CARD_THEME_VARIABLE_NAME
      && !INDICATOR_THEME_VARIABLE_NAMES.some(indicatorName => indicatorName === name)
      && !COMPOSER_THEME_VARIABLE_NAMES.some(composerName => composerName === name)
      && !name.startsWith('--opcteam-color-code-diff-')
    ));
    expect(buttonNames).toEqual(BUTTON_THEME_VARIABLE_NAMES);
    expect(fieldStateNames).toEqual(FIELD_STATE_THEME_VARIABLE_NAMES);
    expect(indicatorNames).toEqual(INDICATOR_THEME_VARIABLE_NAMES);
    expect(composerNames).toEqual(COMPOSER_THEME_VARIABLE_NAMES);
    expect(codeDiffNames.sort()).toEqual(CODE_DIFF_THEME_VARIABLE_NAMES);
    expect(WIDGET_APPEARANCE_VAR_NAMES).toContain(FIELD_GROUP_THEME_VARIABLE_NAME);
    expect(WIDGET_APPEARANCE_VAR_NAMES).toContain(CAPTION_THEME_VARIABLE_NAME);
    expect(WIDGET_APPEARANCE_VAR_NAMES).toContain(ACTION_CARD_THEME_VARIABLE_NAME);
    expect({
      count: sharedNames.length,
      hash: hashNames(sharedNames),
      first: sharedNames[0],
      last: sharedNames[sharedNames.length - 1],
    }).toEqual({
      count: 128,
      hash: SHARED_THEME_VARIABLE_NAMES_HASH,
      first: '--opcteam-color-accent-border',
      last: '--opcteam-shadow-xs',
    });
  });

  it('uses the builtin canonical theme as the payload fallback', () => {
    const payload = readPayloadWithHostValues();

    expect(payload?.vars).toMatchObject(WIDGET_APPEARANCE_FALLBACK_VARS);
    expect(Object.keys(WIDGET_APPEARANCE_FALLBACK_VARS)).toEqual(WIDGET_APPEARANCE_VAR_NAMES);
    expect(Object.keys(payload?.vars ?? {}).sort()).toEqual([
      ...WIDGET_APPEARANCE_VAR_NAMES,
      ...WIDGET_TYPOGRAPHY_VARIABLE_NAMES,
    ].sort());
    expect(WIDGET_APPEARANCE_FALLBACK_VARS['--opcteam-color-surface-canvas']).toBe('transparent');
  });

  it('exports canonical state and status semantics without legacy aliases', () => {
    expect(WIDGET_APPEARANCE_VAR_NAMES).toEqual(expect.arrayContaining([
      '--opcteam-color-action-primary-background',
      '--opcteam-color-action-primary-hover',
      '--opcteam-color-action-primary-pressed',
      '--opcteam-color-code-change-added',
      '--opcteam-color-code-change-removed',
      '--opcteam-color-status-info-emphasis',
      '--opcteam-color-status-success-emphasis',
      '--opcteam-color-status-warning-emphasis',
      '--opcteam-color-status-danger-emphasis',
      '--opcteam-color-status-success-content',
      '--opcteam-color-status-success-surface',
      '--opcteam-color-status-success-border',
      '--opcteam-color-status-warning-surface',
      '--opcteam-color-status-danger-surface',
      '--opcteam-color-status-info-surface',
    ]));
    expect(WIDGET_APPEARANCE_VAR_NAMES).not.toEqual(
      expect.arrayContaining(RETIRED_WIDGET_VARIABLE_NAMES),
    );
    expect(WIDGET_APPEARANCE_VAR_NAMES.some(name => name.startsWith('--opcteam-appearance-token-')))
      .toBe(false);
  });

  it('passes canonical host overrides through unchanged', () => {
    const hostValues = {
      '--opcteam-color-action-primary-background': 'linear-gradient(test-primary)',
      '--opcteam-color-action-primary-content': '#101010',
      '--opcteam-color-action-primary-hover': 'linear-gradient(test-hover)',
      '--opcteam-color-action-primary-pressed': '#202020',
      '--opcteam-color-action-card-background': 'rgba(0, 0, 0, 0.07)',
      '--opcteam-color-composer-border': 'rgba(0, 0, 0, 0.14)',
      '--opcteam-color-composer-context-background': 'rgba(0, 0, 0, 0.06)',
      '--opcteam-color-content-caption': 'rgba(0, 0, 0, 0.45)',
      '--opcteam-component-button-primary-background': '#303030',
      '--opcteam-component-button-fill-background': 'rgba(0, 0, 0, 0.08)',
      '--opcteam-color-field-border-active': 'rgba(0, 0, 0, 0.20)',
      '--opcteam-color-field-group-background': 'rgba(0, 0, 0, 0.03)',
      '--opcteam-color-field-placeholder': 'rgba(0, 0, 0, 0.40)',
      '--opcteam-color-key-hint-content': 'rgba(0, 0, 0, 0.55)',
      '--opcteam-color-number-badge-background': 'rgba(0, 0, 0, 0.09)',
      '--opcteam-color-status-danger-surface': 'rgba(200, 0, 0, 0.12)',
      '--opcteam-color-status-danger-border': '#303030',
      '--opcteam-shadow-raised': '0 1px 2px #404040',
    };

    expect(readPayloadWithHostValues(hostValues)?.vars).toMatchObject(hostValues);
  });

  it('renders one self-contained fallback scope from canonical theme and system tokens', () => {
    const css = createWidgetAppearanceFallbackCss();

    for (const [name, value] of Object.entries(WIDGET_APPEARANCE_FALLBACK_VARS)) {
      expect(css).toContain(`      ${name}: ${value};`);
    }
    for (const [tokenName, value] of Object.entries(systemTokens)) {
      const variableName = systemCssVariables[tokenName as keyof typeof systemCssVariables];
      expect(css).toContain(`      ${variableName}: ${String(value)};`);
    }
    for (const retiredName of RETIRED_WIDGET_VARIABLE_NAMES) {
      expect(css).not.toContain(`${retiredName}:`);
    }
  });
});
