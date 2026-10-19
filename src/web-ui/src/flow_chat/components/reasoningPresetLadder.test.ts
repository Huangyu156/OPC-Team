import { describe, expect, it } from 'vitest';
import type { ReasoningPresetDescriptor } from '@/infrastructure/config/types';
import {
  RANKED_LADDER_MINIMUM_STEPS,
  reasoningLadderShape,
  reasoningStrengthSteps,
  reasoningStrengthValue,
} from './reasoningPresetLadder';

const t = (key: string): string => key;

function level(id: string, order: number): ReasoningPresetDescriptor {
  return {
    id,
    label: id,
    order,
    source: 'adapter',
    actions: [{ type: 'effort', value: id }],
  };
}

function budget(id: string, order: number, tokens: number): ReasoningPresetDescriptor {
  return {
    id,
    label: id,
    order,
    source: 'adapter',
    actions: [{ type: 'budget_tokens', value: tokens }],
  };
}

function automatic(id: string, order: number): ReasoningPresetDescriptor {
  return {
    id,
    label: id,
    order,
    source: 'adapter',
    actions: [{ type: 'toggle', enabled: true }],
  };
}

describe('reasoningLadderShape', () => {
  it('hides the ladder when the catalog advertises nothing', () => {
    expect(reasoningLadderShape([])).toBe('hidden');
  });

  it('keeps the segmented control below the minimum stop count', () => {
    expect(RANKED_LADDER_MINIMUM_STEPS).toBe(3);
    expect(reasoningLadderShape([level('low', 0), level('high', 1)])).toBe('segmented');
  });

  it('earns a slider for three or more comparable effort levels', () => {
    expect(reasoningLadderShape([level('low', 0), level('medium', 1), level('high', 2)])).toBe('ranked');
  });

  it('never turns a budget or toggle catalog into a slider', () => {
    expect(reasoningLadderShape([
      budget('think-1k', 0, 1024),
      budget('think-8k', 1, 8192),
      level('high', 2),
    ])).toBe('segmented');
    expect(reasoningLadderShape([
      level('low', 0),
      level('medium', 1),
      level('high', 2),
      automatic('auto', 3),
    ])).toBe('segmented');
  });

  it('falls back to the segmented control when two stops share one strength', () => {
    const duplicated = [level('high', 0), { ...level('xhigh', 1), actions: [{ type: 'effort' as const, value: 'high' }] }, level('low', 2)];
    expect(reasoningLadderShape(duplicated)).toBe('segmented');
  });
});

describe('reasoningStrengthSteps', () => {
  it('orders the stops by strength rather than by catalog order', () => {
    const steps = reasoningStrengthSteps([level('high', 0), level('low', 1), level('medium', 2)], t);
    expect(steps.map(step => step.value)).toEqual(['preset:low', 'preset:medium', 'preset:high']);
    expect(steps.map(step => step.rank)).toEqual([3, 4, 5]);
  });

  it('keeps the submit-ready value prefix and the localized label', () => {
    const steps = reasoningStrengthSteps([level('max', 0)], t);
    expect(steps).toEqual([{ value: 'preset:max', label: 'reasoningSelector.levels.max', rank: 7 }]);
  });
});

describe('reasoningStrengthValue', () => {
  const steps = reasoningStrengthSteps([level('low', 0), level('medium', 1), level('high', 2)], t);

  it('selects the matching step for the committed preset', () => {
    expect(reasoningStrengthValue(steps, level('medium', 1))).toBe('preset:medium');
  });

  it('rests on the weakest stop when nothing is committed', () => {
    expect(reasoningStrengthValue(steps, undefined)).toBe('preset:low');
    expect(reasoningStrengthValue([], undefined)).toBe('');
  });

  it('rests on the weakest stop when the committed preset is not on the ladder', () => {
    expect(reasoningStrengthValue(steps, budget('think-8k', 9, 8192))).toBe('preset:low');
  });
});
