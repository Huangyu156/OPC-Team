import type { AppearanceThemeTokenName } from '../types';

export function withLegacyIndicatorTokens(
  tokens: Partial<Record<AppearanceThemeTokenName, string>> | undefined,
): Partial<Record<AppearanceThemeTokenName, string>> {
  const result = { ...tokens };
  for (const [next, previous] of [
    ['--opcteam-color-number-badge-background', '--opcteam-color-action-neutral-surface'],
    ['--opcteam-color-key-hint-content', '--opcteam-color-content-muted'],
  ] as const) {
    if (result[next] === undefined && tokens?.[previous] !== undefined) result[next] = tokens[previous];
  }
  return result;
}
