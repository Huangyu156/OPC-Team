import type { AppearanceThemeTokenName } from '../types';

// Old packages used content.muted for hints and borderFocus for editing. Explicit field colors
// take precedence; missing values continue to come from the selected base theme.
export function withLegacyFieldTokens(
  tokens: Partial<Record<AppearanceThemeTokenName, string>> | undefined,
): Partial<Record<AppearanceThemeTokenName, string>> {
  const result = { ...tokens };
  const legacy = tokens?.['--opcteam-color-content-muted'];
  if (result['--opcteam-color-field-placeholder'] === undefined && legacy !== undefined) {
    result['--opcteam-color-field-placeholder'] = legacy;
  }
  const legacyFocus = tokens?.['--opcteam-color-field-border-focus'];
  if (result['--opcteam-color-field-border-active'] === undefined && legacyFocus !== undefined) {
    result['--opcteam-color-field-border-active'] = legacyFocus;
  }
  const legacyGroup = tokens?.['--opcteam-color-surface-tertiary'];
  if (result['--opcteam-color-field-group-background'] === undefined && legacyGroup !== undefined) {
    result['--opcteam-color-field-group-background'] = legacyGroup;
  }
  return result;
}
