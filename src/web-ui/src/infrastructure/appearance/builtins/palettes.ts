export { opcDarkPalette } from './dark';
export { opcLightPalette } from './light';
export { opcMonochromePalette } from './monochrome';
export { opcMidnightPalette } from './midnight';
export { opcChinaStylePalette } from './chinaStyle';
export { opcChinaNightPalette } from './chinaNight';
export { opcCyberPalette } from './cyber';
export { opcSlatePalette } from './slate';
export { opcTokyoNightPalette } from './tokyoNight';
export { opcClaudeStylePalette } from './claudeStyle';
export { opcClaudeNightPalette } from './claudeNight';

import { opcDarkPalette } from './dark';
import { opcLightPalette } from './light';
import { opcMonochromePalette } from './monochrome';
import { opcMidnightPalette } from './midnight';
import { opcChinaStylePalette } from './chinaStyle';
import { opcChinaNightPalette } from './chinaNight';
import { opcCyberPalette } from './cyber';
import { opcSlatePalette } from './slate';
import { opcTokyoNightPalette } from './tokyoNight';
import { opcClaudeStylePalette } from './claudeStyle';
import { opcClaudeNightPalette } from './claudeNight';
import type { AppearancePalette, AppearancePaletteId } from './AppearancePalette';

export const DEFAULT_LIGHT_APPEARANCE_ID: AppearancePaletteId = 'opc-light';
export const DEFAULT_DARK_APPEARANCE_ID: AppearancePaletteId = 'opc-dark';

export const builtinAppearancePalettes: readonly AppearancePalette[] = Object.freeze([
  opcLightPalette,
  opcMonochromePalette,
  opcSlatePalette,
  opcDarkPalette,
  opcMidnightPalette,
  opcChinaStylePalette,
  opcChinaNightPalette,
  opcCyberPalette,
  opcTokyoNightPalette,
  opcClaudeStylePalette,
  opcClaudeNightPalette,
]);
