import type { AppearanceThemeTokenName } from '../types';

export function withLegacyCaptionToken(
  tokens: Partial<Record<AppearanceThemeTokenName, string>> | undefined,
): Partial<Record<AppearanceThemeTokenName, string>> {
  const result = { ...tokens };
  if (result['--opcteam-color-content-caption'] === undefined
    && tokens?.['--opcteam-color-content-muted'] !== undefined) {
    result['--opcteam-color-content-caption'] = tokens['--opcteam-color-content-muted'];
  }
  return result;
}
