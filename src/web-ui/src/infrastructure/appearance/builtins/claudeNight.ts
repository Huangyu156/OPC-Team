
import { AppearancePalette } from './AppearancePalette';
import {
  createAccentScale,
  createGitColors,
  createSecondaryAccentScale,
  createSemanticColors,
  createStandardEasing,
  createStandardRadius,
  createStandardSpacing,
  overlayBlack,
  rgbFromHex,
  rgbaFromHex,
} from './paletteHelpers';

const CLAUDE_NIGHT_CANVAS = '#141413';
// Secondary and recessed steps reuse the canonical dark neutrals (#1c1c1f / #0e0e10) that
// the other dark builtins already declare. The reference's own values sat 2-5 RGB steps
// away, below the near-pair threshold, so adopting the canonical stops keeps the warm
// near-black layering without inventing a duplicate neutral.
const CLAUDE_NIGHT_SECONDARY = '#1c1c1f';
const CLAUDE_NIGHT_RECESSED = '#0e0e10';
const CLAUDE_NIGHT_ELEVATED = '#262421';
const CLAUDE_NIGHT_IVORY = '#f0eee6';
const CLAUDE_NIGHT_BODY_TEXT = '#c2bfb4';
const CLAUDE_NIGHT_MUTED_TEXT = '#a8a69d';
const CLAUDE_NIGHT_DISABLED_TEXT = '#6b6960';
const CLAUDE_CLAY = '#d97757';
const CLAUDE_CLAY_LIGHT = '#e08a6b';
const CLAUDE_SECONDARY = '#8faecb';
const CLAUDE_SECONDARY_LIGHT = '#a8c4dc';

const claudeNightIvory = (alpha: number | string) => rgbaFromHex(CLAUDE_NIGHT_IVORY, alpha);
const claudeClay = (alpha: number | string) => rgbaFromHex(CLAUDE_CLAY, alpha);

export const opcClaudeNightPalette: AppearancePalette = {
  id: 'opc-claude-night',
  name: 'Claude Night',
  type: 'dark',
  description: 'Claude night appearance - Warm near-black canvas, ivory ink, and a softly lifted clay accent',
  author: 'OPC-Team',
  version: '1.0.0',

  colors: {
    background: {
      // Recess navigation into the warm near-black, then lift content and overlays in small steps.
      primary: CLAUDE_NIGHT_CANVAS,
      secondary: CLAUDE_NIGHT_SECONDARY,
      tertiary: CLAUDE_NIGHT_RECESSED,
      elevated: CLAUDE_NIGHT_ELEVATED,
      workbench: CLAUDE_NIGHT_RECESSED,
      scene: CLAUDE_NIGHT_CANVAS,
      chrome: CLAUDE_NIGHT_RECESSED,
    },

    text: {
      // Warm ivory instead of pure white so the dark canvas keeps the same brown-black cast.
      primary: CLAUDE_NIGHT_IVORY,
      secondary: CLAUDE_NIGHT_BODY_TEXT,
      muted: CLAUDE_NIGHT_MUTED_TEXT,
      disabled: CLAUDE_NIGHT_DISABLED_TEXT,
    },

    accent: createAccentScale({ base: CLAUDE_CLAY, hover: CLAUDE_CLAY_LIGHT }),

    purple: createSecondaryAccentScale({ base: CLAUDE_SECONDARY, hover: CLAUDE_SECONDARY_LIGHT }),

    semantic: createSemanticColors('dark'),

    border: {
      subtle: claudeNightIvory(0.1),
      base: claudeNightIvory(0.16),
      medium: claudeNightIvory(0.22),
      strong: claudeNightIvory(0.3),
      prominent: claudeNightIvory(0.42),
    },

    element: {
      subtle: claudeNightIvory(0.04),
      soft: claudeNightIvory(0.06),
      base: claudeNightIvory(0.09),
      medium: claudeNightIvory(0.12),
      strong: claudeNightIvory(0.16),
    },

    git: createGitColors('dark', {
      branch: rgbFromHex(CLAUDE_CLAY),
      branchBg: claudeClay(0.14),
    }),

    // Links lift off the warm near-black canvas the same way the accent does; the
    // light palette's ink-dark link would disappear here.
    link: {
      default: CLAUDE_SECONDARY_LIGHT,
      hover: CLAUDE_NIGHT_IVORY,
    },
  },

  effects: {
    shadow: {
      xs: `0 1px 2px ${overlayBlack(0.8)}`,
      sm: `0 2px 4px ${overlayBlack(0.75)}`,
      base: `0 4px 8px ${overlayBlack(0.7)}`,
      lg: `0 8px 16px ${overlayBlack(0.65)}`,
      xl: `0 12px 24px ${overlayBlack(0.8)}`,
    },

    blur: {
      subtle: 'blur(4px) saturate(1.08)',
      base: 'blur(8px) saturate(1.16)',
    },

    radius: createStandardRadius(),

    spacing: createStandardSpacing(),

    opacity: {
      disabled: 0.5,
      hover: 0.8,
      focus: 0.9,
    },
  },

  motion: {
    duration: {
      instant: '0.08s',
      fast: '0.14s',
      base: '0.22s',
      slow: '0.42s',
    },

    easing: createStandardEasing(),
  },

  components: {
    button: {
      primary: {
        default: {
          background: CLAUDE_CLAY,
          color: '#141413',
          border: 'transparent',
          shadow: 'none',
        },
        hover: {
          background: CLAUDE_CLAY_LIGHT,
          color: '#141413',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
        active: {
          background: '#c6613f',
          color: '#141413',
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
      },

      ghost: {
        default: {
          color: CLAUDE_NIGHT_MUTED_TEXT,
        },
        hover: {
          background: claudeNightIvory(0.1),
          color: CLAUDE_NIGHT_IVORY,
          border: 'transparent',
        },
      },
    },
  },

  monaco: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8a8578', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'e08a6b' },
      { token: 'string', foreground: 'a3be8c' },
      { token: 'number', foreground: 'e5c07b' },
      { token: 'type', foreground: '8faecb' },
      { token: 'class', foreground: '8faecb' },
      { token: 'function', foreground: 'e5a87c' },
      { token: 'variable', foreground: 'd8d5cc' },
      { token: 'constant', foreground: 'c9a0dc' },
      { token: 'operator', foreground: 'e08a6b' },
      { token: 'tag', foreground: '8faecb' },
      { token: 'attribute.name', foreground: 'e5a87c' },
      { token: 'attribute.value', foreground: 'a3be8c' },
    ],
    colors: {
      background: CLAUDE_NIGHT_CANVAS,
      foreground: CLAUDE_NIGHT_IVORY,
      lineHighlight: CLAUDE_NIGHT_SECONDARY,
      selection: 'rgba(51, 102, 208, 0.35)',
      cursor: CLAUDE_CLAY,

      'editor.selectionBackground': 'rgba(51, 102, 208, 0.35)',
      'editor.selectionForeground': CLAUDE_NIGHT_IVORY,
      'editor.inactiveSelectionBackground': 'rgba(51, 102, 208, 0.22)',
      'editor.selectionHighlightBackground': claudeClay(0.2),
      'editor.selectionHighlightBorder': claudeClay(0.36),
      'editorCursor.foreground': CLAUDE_CLAY,
      'editor.wordHighlightBackground': claudeNightIvory(0.1),
      'editor.wordHighlightStrongBackground': claudeClay(0.22),
    },
  },
};
