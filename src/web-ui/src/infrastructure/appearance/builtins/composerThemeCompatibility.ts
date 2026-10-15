import type { AppearanceThemeTokenName } from '../types';

export function withLegacyComposerTokens(
  tokens: Partial<Record<AppearanceThemeTokenName, string>> | undefined,
): Partial<Record<AppearanceThemeTokenName, string>> {
  const result = { ...tokens };
  for (const [next, previous] of [
    ['--opcteam-color-composer-border', '--opcteam-color-field-border'],
    ['--opcteam-color-composer-context-background', '--opcteam-color-surface-subtle'],
  ] as const) {
    if (result[next] === undefined && tokens?.[previous] !== undefined) result[next] = tokens[previous];
  }
  return result;
}
