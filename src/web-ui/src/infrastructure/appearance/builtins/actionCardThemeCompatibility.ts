import type { AppearanceThemeTokenName } from '../types';

export function withLegacyActionCardToken(
  tokens: Partial<Record<AppearanceThemeTokenName, string>> | undefined,
): Partial<Record<AppearanceThemeTokenName, string>> {
  const result = { ...tokens };
  if (result['--opcteam-color-action-card-background'] === undefined
    && tokens?.['--opcteam-color-action-neutral-surface'] !== undefined) {
    result['--opcteam-color-action-card-background'] = tokens['--opcteam-color-action-neutral-surface'];
  }
  return result;
}
