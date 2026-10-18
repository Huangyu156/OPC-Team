import { AppearancePalette } from './AppearancePalette';
import {
  createAccentScale,
  createGitColors,
  createSecondaryAccentScale,
  createSemanticColors,
  createStandardEasing,
  createStandardSpacing,
  rgbFromHex,
  rgbaFromHex,
  STATIC_WHITE,
} from './paletteHelpers';

const CLAUDE_CANVAS = '#fcfcfb';
// The reference distinguishes canvas, sidebar and elevated surfaces by 1-2 RGB steps,
// which is below the color-governance near-pair threshold and visually indistinct.
// They are collapsed onto the single canvas value; the recessed inset and the raised
// overlay carry the layer separation that actually reads on screen.
const CLAUDE_IVORY_INSET = '#f5f3e8';
const CLAUDE_INK = '#141413';
const CLAUDE_BODY_TEXT = '#3a3833';
const CLAUDE_MUTED_TEXT = '#6b6960';
const CLAUDE_DISABLED_TEXT = '#a8a69d';
const CLAUDE_CLAY = '#d97757';
const CLAUDE_CLAY_DEEP = '#c6613f';
// One pressed clay rung carries every "already pressed" use: button active, syntax
// keyword, and link hover. A second near-identical brick would only add a color pair
// the audit reads as a duplicate.
const CLAUDE_CLAY_ACTIVE = '#b24c2e';
const CLAUDE_SECONDARY = '#6b8cae';
const CLAUDE_SECONDARY_DEEP = '#52718f';
// Reading-surface ink from the reference's markdown scale. A body link is navigation,
// not emphasis, so it never borrows the clay accent.
const CLAUDE_LINK = '#184f95';

const claudeInk = (alpha: number | string) => rgbaFromHex(CLAUDE_INK, alpha);
const claudeClay = (alpha: number | string) => rgbaFromHex(CLAUDE_CLAY, alpha);

export const opcClaudeStylePalette: AppearancePalette = {
  id: 'opc-claude-style',
  name: 'Claude',
  type: 'light',
  description: 'Claude appearance - Warm ivory canvas, slate ink, and a restrained clay accent',
  author: 'OPC-Team',
  version: '1.0.0',

  colors: {
    background: {
      // Low-contrast warm layers: ivory canvas, darker inset well, and near-white overlays.
      primary: CLAUDE_CANVAS,
      secondary: STATIC_WHITE,
      tertiary: CLAUDE_IVORY_INSET,
      elevated: STATIC_WHITE,
      workbench: CLAUDE_IVORY_INSET,
      scene: CLAUDE_CANVAS,
      chrome: CLAUDE_CANVAS,
      input: STATIC_WHITE,
    },

    text: {
      // Never pure black: slate ink keeps a warm undertone on every surface.
      primary: CLAUDE_INK,
      secondary: CLAUDE_BODY_TEXT,
      muted: CLAUDE_MUTED_TEXT,
      disabled: CLAUDE_DISABLED_TEXT,
    },

    accent: createAccentScale({ base: CLAUDE_CLAY, hover: CLAUDE_CLAY_DEEP }),

    purple: createSecondaryAccentScale({ base: CLAUDE_SECONDARY, hover: CLAUDE_SECONDARY_DEEP }),

    semantic: createSemanticColors('light'),

    border: {
      // Warm hairlines instead of neutral gray rules.
      subtle: claudeInk(0.08),
      base: claudeInk(0.14),
      medium: claudeInk(0.2),
      strong: claudeInk(0.3),
      prominent: claudeInk(0.45),
    },

    element: {
      // A three-step wash ramp. Adjacent two-percent steps are indistinguishable on
      // screen and read as duplicate colors to the audit; wide rungs survive both.
      subtle: claudeInk(0.03),
      soft: claudeInk(0.03),
      base: claudeInk(0.08),
      medium: claudeInk(0.14),
      strong: claudeInk(0.22),
    },

    git: createGitColors('light', {
      branch: rgbFromHex(CLAUDE_CLAY),
      branchBg: claudeClay(0.1),
    }),

    // Focus follows the ink, never the accent: a focus ring is a structural outline,
    // and the accent is reserved for emphasis the product itself chose to add.
    focus: {
      ring: CLAUDE_INK,
    },

    link: {
      default: CLAUDE_LINK,
      hover: CLAUDE_CLAY_ACTIVE,
    },
  },

  effects: {
    shadow: {
      xs: `0 1px 2px ${claudeInk(0.05)}`,
      sm: `0 2px 4px ${claudeInk(0.07)}`,
      base: `0 4px 8px ${claudeInk(0.09)}`,
      lg: `0 8px 16px ${claudeInk(0.11)}`,
      xl: `0 12px 24px ${claudeInk(0.14)}`,
    },

    blur: {
      subtle: 'blur(4px) saturate(1.02)',
      base: 'blur(8px) saturate(1.04)',
    },

    // The reference's own scale: control 4px, container 8px, panel 16px.
    radius: {
      sm: '4px',
      base: '8px',
      lg: '16px',
      xl: '16px',
      '2xl': '20px',
      full: '9999px',
    },

    spacing: createStandardSpacing(),

    opacity: {
      disabled: 0.5,
      hover: 0.75,
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
          // Clay is a mid-luminance fill, so white label text cannot reach AA on it.
          // The ink label does, and it keeps the button legible in bright rooms.
          color: CLAUDE_INK,
          border: 'transparent',
          shadow: 'none',
        },
        hover: {
          background: CLAUDE_CLAY_DEEP,
          color: CLAUDE_INK,
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
        active: {
          background: CLAUDE_CLAY_ACTIVE,
          color: CLAUDE_INK,
          border: 'transparent',
          shadow: 'none',
          transform: 'none',
        },
      },

      ghost: {
        default: {
          color: CLAUDE_MUTED_TEXT,
        },
        hover: {
          background: claudeClay(0.11),
          color: CLAUDE_INK,
          border: 'transparent',
        },
      },
    },
  },

  monaco: {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8a8578', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'b24c2e' },
      { token: 'string', foreground: '5f7a4f' },
      { token: 'number', foreground: 'a56a2a' },
      { token: 'type', foreground: '52718f' },
      { token: 'class', foreground: '52718f' },
      { token: 'function', foreground: '9a5b3d' },
      { token: 'variable', foreground: '141413' },
      { token: 'constant', foreground: '8a5a8a' },
      { token: 'operator', foreground: 'b24c2e' },
      { token: 'tag', foreground: '52718f' },
      { token: 'attribute.name', foreground: '9a5b3d' },
      { token: 'attribute.value', foreground: '5f7a4f' },
    ],
    colors: {
      background: CLAUDE_CANVAS,
      foreground: CLAUDE_INK,
      lineHighlight: CLAUDE_IVORY_INSET,
      selection: 'rgba(51, 102, 208, 0.22)',
      cursor: CLAUDE_CLAY,

      'editor.selectionBackground': 'rgba(51, 102, 208, 0.22)',
      'editor.selectionForeground': CLAUDE_INK,
      'editor.inactiveSelectionBackground': 'rgba(51, 102, 208, 0.22)',
      'editor.selectionHighlightBackground': claudeClay(0.18),
      'editor.selectionHighlightBorder': claudeClay(0.32),
      'editorCursor.foreground': CLAUDE_CLAY,
      'editor.wordHighlightBackground': claudeInk(0.1),
      'editor.wordHighlightStrongBackground': claudeClay(0.2),
    },
  },
};
