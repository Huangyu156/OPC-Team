import type { ReasoningPresetDescriptor } from '@/infrastructure/config/types';
import type { ReasoningStrengthStep } from './ReasoningStrengthSlider';
import {
  isAutomaticReasoningPreset,
  presetDisplayLabel,
  presetSemanticKey,
  reasoningPresetChoices,
  reasoningPresetKind,
} from './reasoningPresetPresentation';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Relative strength of every effort name an executing adapter is known to emit. */
const effortStrength: Readonly<Record<string, number>> = {
  off: 0,
  none: 0,
  minimal: 1,
  light: 2,
  low: 3,
  medium: 4,
  high: 5,
  xhigh: 6,
  max: 7,
  ultra: 8,
};

/** A slider only earns its keep once the player can move between at least three stops. */
export const RANKED_LADDER_MINIMUM_STEPS = 3;

export type ReasoningLadderShape = 'ranked' | 'segmented' | 'hidden';

function ladderRank(preset: ReasoningPresetDescriptor): number {
  const meaning = presetSemanticKey(preset);
  const strength = meaning ? effortStrength[meaning] : undefined;
  return strength ?? preset.order;
}

/**
 * The shape is a fact about the advertised catalog, never a per-model UI preference:
 * a catalog made only of comparable effort levels gets a real slider; anything carrying a
 * budget, a request patch, or a special intent (including an automatic stop) keeps the
 * segmented control, because the ladder cannot express those choices.
 */
export function reasoningLadderShape(presets: ReasoningPresetDescriptor[]): ReasoningLadderShape {
  const choices = reasoningPresetChoices(presets);
  if (choices.length === 0) return 'hidden';
  const ranked = choices.length >= RANKED_LADDER_MINIMUM_STEPS
    && choices.every(preset => reasoningPresetKind(preset) === 'level')
    && new Set(choices.map(ladderRank)).size === choices.length;
  return ranked ? 'ranked' : 'segmented';
}

/** Ascending steps for the slider, keyed with the value the submit path expects. */
export function reasoningStrengthSteps(
  presets: ReasoningPresetDescriptor[],
  t: Translate,
): ReasoningStrengthStep[] {
  return reasoningPresetChoices(presets)
    .filter(preset => !isAutomaticReasoningPreset(preset) && reasoningPresetKind(preset) === 'level')
    .map(preset => ({
      value: `preset:${preset.id}`,
      label: presetDisplayLabel(preset, t),
      rank: ladderRank(preset),
    }))
    .sort((left, right) => left.rank - right.rank);
}

/**
 * Committed step for the current selection. An automatic or default-only catalog has
 * no position of its own, so the ladder rests on its weakest stop instead of guessing
 * a level the adapter never advertised.
 */
export function reasoningStrengthValue(
  steps: ReasoningStrengthStep[],
  selected: ReasoningPresetDescriptor | undefined,
): string {
  const match = selected ? steps.find(step => step.value === `preset:${selected.id}`) : undefined;
  return match?.value ?? steps[0]?.value ?? '';
}
