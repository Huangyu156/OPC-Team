# UI Adaptation Guide — Claude Style Appearance

Practical, as-built guide for how OPC-Team's appearance layer works and what it takes
to add a Claude-derived appearance to it. Companion to
[spec.md](./spec.md).

Everything below was verified against the repository at the commit that introduced
`opc-claude-style` and `opc-claude-night`.

## 1. How an appearance reaches the UI

```
src/web-ui/src/infrastructure/appearance/
  builtins/claudeStyle.ts        AppearancePalette  (semantic colors, effects, monaco)
  builtins/claudeNight.ts        AppearancePalette
  builtins/palettes.ts           builtinAppearancePalettes: frozen ordered array
        │
        ▼
  builtins/buildBuiltinAppearance.ts
        │   maps semantic palette fields → design-system token names
        │   ('color.surface.canvas', 'color.action.primary.background', …)
        ▼
  @opc-team/theme  themeCssVariables[name]
        │   token name → '--opcteam-*' custom property
        ▼
  runtime/AppearanceService.ts     selection, persistence, transactions
  runtime/AppearanceRuntime.ts     applies the resolved token set to the DOM
        │
        ▼
  Components · Monaco · Terminal · Widgets · Mobile · First paint
```

Two consequences matter when adapting a UI:

1. **Components are not edited.** A palette reaches every surface that consumes design
   tokens. If a component ignores semantic tokens and hardcodes a color, that is a
   component bug, not an integration task.
2. **Selection is id-based and persisted.** The palette supplies no runtime code, so
   there is no per-theme activation path to write.

## 2. The `AppearancePalette` contract

Defined in `src/web-ui/src/infrastructure/appearance/builtins/AppearancePalette.ts`.
`AppearancePaletteId` is `string`, so adding an appearance never changes a union type.

| Group | Purpose |
|---|---|
| `id`, `name`, `type`, `description`, `author`, `version` | Identity. `type` is `'dark' \| 'light'` and selects the design-system base token set. |
| `colors.background` | `primary`, `secondary`, `tertiary`, `elevated`, `workbench`, `scene`, optional `chrome`. |
| `colors.text` | `primary`, `secondary`, `muted`, `disabled`. |
| `colors.accent` | Numeric stops `50,100,200,300,400,500,600,700`; `500` is the accent, `600` its hover. |
| `colors.purple` | Optional secondary accent; `createSecondaryAccentScale` uses `100/200/500/600`. |
| `colors.semantic` | `info`/`success`/`warning`/`error` each with `*`, `*Bg`, `*Border`. |
| `colors.border` | `subtle`, `base`, `medium`, `strong`, `prominent`. |
| `colors.element` | `subtle`, `soft`, `base`, `medium`, `strong`. |
| `colors.git` | `branch`, `branchBg`, `changes`, `added`, `deleted`, `staged`. |
| `colors.scrollbar`, `colors.chrome` | Optional. |
| `effects` | `shadow`, `blur`, `radius`, `spacing`, `opacity`. |
| `motion` | `duration`, `easing`. |
| `components.button` | `primary` (default/hover/active: background, color, border, shadow, transform) and `ghost` (default color, hover). |
| `components.configPage` | `section`, `divider`, `rowHover`. |
| `monaco` | `base` (`vs`/`vs-dark`/`hc-black`/`hc-light`), `inherit`, `rules`, `colors`. |
| `layout` | Currently only `sceneViewportBorder`. |

### Palette helper functions

`builtins/paletteHelpers.ts` provides the pieces every palette needs, so a new
appearance should compose them rather than hand-roll values:

- `rgbaFromHex(hex, alpha)`, `rgbFromHex(hex)`, `overlayBlack(a)`, `overlayWhite(a)`
- `createAccentScale({ base, hover?, stops?, alpha? })`
- `createSecondaryAccentScale({ base, hover?, stops?, alpha? })`
- `createSemanticColors(mode)` — reads the design system, so semantic colors always
  match the audited mode baseline
- `createGitColors(mode, { branch, branchBg })`
- `createStandardRadius()` / `createCompactRadius()` / `createSlateRadius()`
- `createStandardSpacing()`, `createStandardEasing()`
- `createDarkNeutralBorder()`, `createDarkNeutralElement()`, `createDarkNeutralScrollbar()`

## 3. Token projection reference

`builtins/buildBuiltinAppearance.ts` is the single place that decides which palette
field drives which design token. A representative slice:

| Palette field | Design token |
|---|---|
| `background.primary` | `color.surface.canvas` |
| `background.secondary` | `color.surface.panel`, `color.field.background` |
| `background.elevated` | `color.surface.raised` |
| `background.tertiary` | `color.surface.tertiary`, `color.field.groupBackground` |
| `background.workbench` | `color.surface.workbench` |
| `background.scene` | `color.surface.scene` |
| `background.chrome` | `color.surface.chrome` |
| `element.subtle` | `color.surface.subtle`, `color.action.quiet.hover` |
| `element.base` | `color.actionCard.background`, `color.numberBadge.background`, `color.action.neutral.surface` |
| `text.primary` | `color.content.primary` |
| `text.secondary` | `color.content.secondary`, `color.action.neutral.content` |
| `text.muted` | `color.content.caption`, `color.content.muted`, `color.field.placeholder`, `color.keyHint.content` |
| `text.disabled` | `color.content.disabled`, `color.action.neutral.contentDisabled` |
| `accent[500]` | `color.accent.default`, `color.field.borderFocus`, `color.field.borderActive`, `color.focus.ring` |
| `accent[600]` | `color.accent.hover`, `color.action.secondary.content` |
| `accent[100/200/300]` | `color.action.secondary.background/hover/pressed` |
| `purple[500]` / `purple[600]` | `color.accent.secondary` / `color.accent.secondaryHover` |
| `border.subtle` | `color.border.subtle` |
| `border.base` | `color.border.default`, `color.field.border`, `color.composer.border` |
| `border.medium` | `color.field.borderHover` |
| `border.strong` | `color.border.strong` |
| `components.button.primary.*` | `color.action.primary.background/hover/pressed/content` |
| `semantic.*` | `color.status.{info,success,warning,danger}.{content,surface,border}` |
| `effects.shadow.*` | `shadow.xs/sm/base/lg` |

Two behaviours worth knowing:

- `color.action.primary.background` and its hover/pressed/content siblings **prefer
  `components.button.primary`** and fall back to the accent scale. Set the button block
  when the CTA must differ from the accent.
- When `components.configPage` is omitted, the dark-palette config-page row-hover token
  is derived from `colors.element.base`. Omitting it is the safe default.

## 4. Adding another appearance — exact steps

1. **Create the palette.** Add `builtins/<name>.ts` modelled on
   `builtins/claudeStyle.ts` / `builtins/claudeNight.ts` (or `chinaStyle.ts` /
   `midnight.ts`). Export one `AppearancePalette` const.
2. **Register it** in `builtins/palettes.ts`: add the `export { … } from './<name>'`
   line, the matching `import` line, and append the palette to the frozen
   `builtinAppearancePalettes` array. Array order is user-visible and is asserted by the
   snapshot.
3. **Localize it** in all three locales —
   `src/web-ui/src/locales/{en-US,zh-CN,zh-TW}/settings/application.json`, under
   `appearance.presets`, keyed by id, with `{name, description}`. `i18n:audit` enforces
   key parity across locales.
4. **Regenerate the derived manifests**:
   ```bash
   pnpm run generate-startup-appearance-bootstrap   # desktop first-paint + prompt snapshots
   pnpm run capabilities:generate                   # capability catalog + generated docs
   ```
   The bootstrap generator needs `design-system/packages/theme/dist/index.js`; run
   `pnpm run design-system:build` first if it is missing.
5. **Update the palette-register snapshot**:
   ```bash
   pnpm --dir src/web-ui run type-check
   cd src/web-ui && npx vitest run src/infrastructure/appearance/builtins -u
   ```
6. **Reconcile theme color governance.** The `themePreset` color domain bounds the
   colors declared by the builtin palette set, and that budget is saturated at the
   current palette count — a genuinely new identity will exceed it. In order:
   ```bash
   # report every near pair (colorDistance <= 10 && alphaDelta <= 0.03)
   node scripts/audit-theme-colors.mjs --json --no-baseline --top 0
   pnpm run theme:color-audit:test    # fails on any pair missing a decision entry
   ```
   First **merge** every stop that is within a few RGB steps of an existing one: the
   reference's own near-identical surface steps are below the perceptual threshold and
   the audit is right to flag them. Then add one decision entry per remaining pair to
   `scripts/theme-color-near-pair-decisions.json` (`root` `src/web-ui`, `domain`
   `themePreset`, exact `key` text from the audit, `decision: "keep"`, an existing
   `owner` path, a reason of at least 60 characters, and a reevaluation criterion of at
   least 30). Only after both steps, and only for the `themePreset` keys that remain
   above their frozen maximum, adjust those values and disclose the change — see the
   *Color governance* section of [spec.md](./spec.md) for the worked example.
7. **Run the audits** (§6).

### Files that must NOT be edited for a new appearance

| File | Why |
|---|---|
| `scripts/theme-color-governance-baseline*.json` and any baseline | Ratchet contracts, read by `theme:color-audit:all`. Never raise one to make an audit pass. The `themePreset` domain is the single known exception path, and only after merging sub-threshold stops and recording every near-pair decision — and the adjustment must be disclosed, scoped to `themePreset` keys, and set to the measured value. See [spec.md](./spec.md) *Color governance*. |
| `design-system/packages/theme/src/*.tokens.json` | Mode token sources, not appearances. |
| `scripts/theme-visual-governance-contract.json` | Only needed if the id is added to a surface's `themes` array, which then requires `focused-visual-review` evidence. Not required for a new palette. |
| `Opc-Installer/**`, `src/apps/cli/src/ui/theme.rs` | Separate product surfaces with their own theme lists. |

## 5. What the appearance layer cannot express

| Want | Reality |
|---|---|
| Serif / custom reading type | **Not available — and prohibited, not merely absent.** No typography field on `AppearancePalette`. Font stacks are build-owned per surface by `src/web-ui/src/font-profiles/{apple-system,harmony-bundled}.css`, the only files allowed to declare `--opcteam-font-family-sans`, `--opcteam-font-family-control`, `--opcteam-font-family-mono`. No serif stack token exists. Six named `-reintroduced` gates in `scripts/audit-typography-tokens.mjs` (added by `e9655cb2d`) fail the build if appearance-carried typography comes back, and `FontPreference` is size-only. Restyling type for one appearance would restyle it for all. A global serif profile under `src/font-profiles/` is the only sanctioned route, and it is a product-wide decision. |
| Per-appearance component CSS | Not available, and not needed: components read tokens. Fix the component if it hardcodes a color. |
| A per-appearance icon set or background image | Only via the package/asset path (`storage`/`getPreviewAsset`), not through a builtin palette. |
| Animation timing beyond `motion.duration` / `motion.easing` | The reference's `data-dsh-motion` system/reduced/full modes have no appearance-level equivalent. Reduced motion is a host/OS concern here. |

## 6. Verification checklist

Run from the repository root:

```bash
pnpm --dir src/web-ui run type-check
pnpm run generate-startup-appearance-bootstrap
pnpm run capabilities:generate
cd src/web-ui && npx vitest run src/infrastructure/appearance && cd ../..
pnpm run appearance:contract-audit
pnpm run theme:visual-contract
pnpm run i18n:audit
pnpm run theme:color-audit:test
pnpm run theme:color-audit:all
pnpm run check:web
```

Expected for the committed Claude integration: type-check clean; 143/143 appearance tests;
both generators report success with no stale artifact; appearance audit passes (246
surfaces, 2957 DOM contracts, 3390 Web UI files) with only the 13 pre-existing
shared-style owner warnings; theme visual contract reports `10 surfaces, 10 required
surfaces covered`; i18n audit reports 0 warnings; `theme:color-audit:test` 50/50;
`theme:color-audit:all` reports `all 24 selected surfaces passed`; `check:web` exits 0.

### Invariants a new palette must satisfy

Enforced by `builtins/appearancePresetOutput.test.ts` and
`builtins/startupAppearanceBootstrap.test.ts`:

- Every subagent-avatar domain token resolves with contrast ≥ 4.5 against
  `colors.background.scene`, and `colors.text.primary` must not collide with it.
- `color.actionCard.background` = `element.base`; `color.field.border` = `border.base`;
  `color.field.borderFocus`/`Active` = `accent[500]`; `color.field.groupBackground` =
  `background.tertiary`; `color.field.placeholder` = `text.muted`.
- `color.action.primary.background` = `components.button.primary.background`;
  `color.action.primary.content` = `accent[500]` unless the button block overrides it.
- `color.action.neutral.content` = `text.secondary`.
- `colors.semantic` must equal `createSemanticColors(mode)`; `colors.git` must match the
  design-system git values.
- Status content must hold ≥ 4.5 contrast on **every** `background` stop — so a new
  background value must stay clearly light (light mode) or clearly dark (dark mode).
- Forbidden: `accent[800]`, `purple[50]`, `purple[400]`, `purple[800]`,
  `background.quaternary`, `background.tooltip`, `element.elevated`.
- Forbidden literals anywhere in any palette: `#fdfdfd` (reserved for `opc-light`),
  `#e2e6eb`, `#f0f2f5`.
- A dark palette that omits `components.configPage` gets its row-hover token from
  `element.base` — which is the assertion, not a bug.
- The manifest length equals `builtinAppearancePalettes.length`, and both generated JSON
  files on disk must equal the in-memory manifests.

## 7. Compatibility and rollback

**Unknown persisted id.** Older builds resolve an unknown selection through
`AppearanceService`'s unavailable-selection path: fall back to the system appearance,
report `unavailableSelectionId`, and leave the stored value untouched. Do not add a
migration for an additive appearance.

**Rollback.** Delete the two `builtins/claude*.ts` files, revert `palettes.ts`, the
three locale entries and the regenerated artifacts, then rerun step 4 and step 5. No
schema, config or persisted-format change is involved, so a rollback cannot strand user
data beyond that surface reporting `unavailableSelectionId` until a build that knows the
id returns.

## 8. Troubleshooting

| Symptom | Cause |
|---|---|
| `… is stale. Run \`pnpm run generate-startup-appearance-bootstrap\`` | A manifest was not regenerated after a palette change. Rerun the generator. |
| `design-system/packages/theme/dist/index.js` not found | Run `pnpm run design-system:build`. |
| Builtins tests fail only on the inline snapshot | Expected after adding a palette; rerun with `-u`. |
| Palette invariant failures on status contrast | A background stop is too close to mid-gray; darken or lighten it. |
| Palette invariant failure mentioning `#fdfdfd` | The palette uses a literal reserved for `opc-light`; pick a different near-white. |
| Appearance audit warns about shared visual classes | Pre-existing component-level debt; unrelated to palette work. |
| Theme appears in settings but a region ignores it | That component does not consume design tokens. Fix the component. |
| `ops_replace` reports `changed: 0` on a palette file | The file is CRLF; use the `edit` tool (after `read`) instead. |
| `theme:color-audit:test` reports undecided `themePreset` near pairs | Every reported pair needs an entry in `scripts/theme-color-near-pair-decisions.json`. Merge the pair first if it is within a few RGB steps. |
| `theme:color-audit:all` reports `themePreset.occurrences` / `uniqueColors` above baseline | The `themePreset` budget tracks the builtin palette set and is saturated by design. Merge sub-threshold stops, record decisions, then adjust only the `themePreset` keys to the measured values and disclose it. |

## Revision history

| Version | Date | Changes |
|---|---|---|
| 0.1.0 | 2026-10-18 | Initial guide; assumed a `design-system/packages/theme` theme package, serif CSS overrides, store changes and an xterm theme object. |
| 1.0.0 | 2026-10-18 | Rewritten as-built: real pipeline, real token projection table, exact registration steps, evidenced typography limitation, real verification commands and invariants, compatibility and troubleshooting. |
| 1.1.0 | 2026-10-18 | Added the theme color governance step (merge sub-threshold stops first, then record decisions, then disclose any `themePreset` budget change), renumbered the audit step, refreshed the checklist, added two troubleshooting rows. |
| 1.2.0 | 2026-10-18 | Typography row upgraded from "not available" to "prohibited by architecture", citing the six `-reintroduced` audit gates, commit `e9655cb2d` and the size-only `FontPreference` contract. |
