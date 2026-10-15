/**
 * Prism themes for Flow Chat embedded code previews.
 */
import type { CSSProperties } from 'react';
import { buildSharedPrismStyle } from '@/shared/prism/prismTheme';

export function buildCodePreviewPrismStyle(isLight: boolean): Record<string, CSSProperties> {
  return buildSharedPrismStyle(isLight, {
    pre: {
      margin: 0,
      padding: 0,
      fontSize: 'var(--opcteam-type-flow-code-font-size)',
      lineHeight: 'var(--opcteam-type-flow-code-line-height)',
      fontFamily: 'var(--opcteam-type-flow-code-font-family)',
      fontWeight: 'var(--opcteam-type-flow-code-font-weight)',
    },
    code: {
      fontSize: 'var(--opcteam-type-flow-code-font-size)',
      lineHeight: 'var(--opcteam-type-flow-code-line-height)',
      fontFamily: 'var(--opcteam-type-flow-code-font-family)',
      fontWeight: 'var(--opcteam-type-flow-code-font-weight)',
    },
  });
}
