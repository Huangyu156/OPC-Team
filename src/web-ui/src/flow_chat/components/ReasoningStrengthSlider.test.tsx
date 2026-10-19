/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReasoningStrengthSlider, type ReasoningStrengthStep } from './ReasoningStrengthSlider';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('@/shared/utils/motionPreference', () => ({
  isReducedMotionPreferred: () => motion.reduced,
}));

// The shared text primitive measures geometry and raises tooltips through a portal; neither
// behaviour is under test here, so it renders as a plain span.
vi.mock('@opc-team/ui', () => ({
  OverflowText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

const ladder = (count: number): ReasoningStrengthStep[] => Array.from({ length: count }, (_, index) => ({
  value: `s${index}`,
  label: `Step ${index}`,
  rank: index,
}));

const LONG_LABEL = 'Extended reasoning with extended deliberation across every remaining turn';

const RAIL_RECT = {
  left: 100,
  right: 300,
  top: 0,
  bottom: 30,
  width: 200,
  height: 30,
  x: 100,
  y: 0,
  toJSON: () => ({}),
};

/** Track centre of `ratio` under the same band mapping the component uses (16px knob). */
const xFor = (ratio: number) => 100 + 8 + (200 - 16) * ratio;

/**
 * The visual path the component draws for a continuous ladder position: sine damping inside
 * each segment, normalized back onto the segment so integer positions land on their tick.
 */
const dampedRatio = (position: number, stepCount: number) => {
  const maxIndex = stepCount - 1;
  const segment = Math.floor(position);
  const progress = position - segment;
  const damped = progress + 0.8 * (Math.sin((progress * Math.PI) / 2) - progress);
  return (segment + damped) / maxIndex;
};

describe('ReasoningStrengthSlider', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onCommit = vi.fn<(value: string) => void>();
  const onPreview = vi.fn<(value: string) => void>();

  const slider = () => container.querySelector<HTMLElement>('[role="slider"]')!;
  const rail = () => container.querySelector<HTMLElement>('[data-opc-part="reasoningSliderRail"]')!;
  const knob = () => container.querySelector<HTMLElement>('[data-opc-part="reasoningSliderKnob"]')!;
  const valueOf = () => Math.round(parseFloat(slider().style.getPropertyValue('--_slider-ratio')) * 10000);

  const render = async (
    steps: ReasoningStrengthStep[] = ladder(5),
    value = 's0',
    extra: Partial<React.ComponentProps<typeof ReasoningStrengthSlider>> = {},
  ) => {
    await act(async () => root.render(
      <ReasoningStrengthSlider
        steps={steps}
        value={value}
        ariaLabel="Reasoning strength"
        weakerLabel="Less"
        strongerLabel="More"
        onCommit={onCommit}
        onPreview={onPreview}
        {...extra}
      />,
    ));
    rail().getBoundingClientRect = () => RAIL_RECT as DOMRect;
  };

  const key = async (name: string) => {
    await act(async () => slider().dispatchEvent(new KeyboardEvent('keydown', {
      key: name, bubbles: true, cancelable: true,
    })));
  };

  const pointer = async (type: string, x: number, y: number, button = 0) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    await act(async () => slider().dispatchEvent(event));
  };

  const advance = async (ms: number) => {
    await act(async () => { vi.advanceTimersByTime(ms); });
  };

  beforeEach(() => {
    motion.reduced = false;
    onCommit.mockReset();
    onPreview.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.useFakeTimers();
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('exposes the slider ARIA contract and tracks the committed value and the ladder length', async () => {
    await render(ladder(5), 's2');
    expect(slider().getAttribute('aria-valuemin')).toBe('0');
    expect(slider().getAttribute('aria-valuemax')).toBe('4');
    expect(slider().getAttribute('aria-valuenow')).toBe('2');
    expect(slider().getAttribute('aria-valuetext')).toBe('Step 2');
    expect(slider().getAttribute('aria-label')).toBe('Reasoning strength');
    expect(slider().getAttribute('aria-disabled')).toBe('false');
    expect(slider().getAttribute('tabindex')).toBe('0');
    expect(slider().getAttribute('data-reasoning-slider-state')).toBe('idle');

    await render(ladder(5), 's4');
    expect(slider().getAttribute('aria-valuenow')).toBe('4');
    expect(slider().getAttribute('aria-valuetext')).toBe('Step 4');

    await render(ladder(7), 's4');
    expect(slider().getAttribute('aria-valuemax')).toBe('6');
    expect(container.querySelectorAll('.opc-reasoning-slider__tick')).toHaveLength(7);
  });

  it('moves one step with each arrow key and jumps with Home and End', async () => {
    await render(ladder(5), 's2');
    await key('ArrowLeft');
    expect(slider().getAttribute('aria-valuenow')).toBe('1');
    await key('ArrowDown');
    expect(slider().getAttribute('aria-valuenow')).toBe('0');
    await key('ArrowRight');
    expect(slider().getAttribute('aria-valuenow')).toBe('1');
    await key('ArrowUp');
    expect(slider().getAttribute('aria-valuenow')).toBe('2');
    await key('End');
    expect(slider().getAttribute('aria-valuenow')).toBe('4');
    await key('Home');
    expect(slider().getAttribute('aria-valuenow')).toBe('0');
    // Already at the first step: the ladder does not move and nothing is committed below it.
    await key('ArrowLeft');
    expect(slider().getAttribute('aria-valuenow')).toBe('0');
  });

  it('steps PageUp and PageDown by ten percent of the ladder and clamps at both ends', async () => {
    await render(ladder(20), 's10');
    await key('PageUp');
    expect(slider().getAttribute('aria-valuenow')).toBe('12');
    await key('PageDown');
    expect(slider().getAttribute('aria-valuenow')).toBe('10');
    await key('PageDown');
    expect(slider().getAttribute('aria-valuenow')).toBe('8');
    await key('End');
    await key('PageUp');
    expect(slider().getAttribute('aria-valuenow')).toBe('19');
    await key('Home');
    await key('PageDown');
    expect(slider().getAttribute('aria-valuenow')).toBe('0');
  });

  it('previews every key press but merges the commit into one trailing settle', async () => {
    await render(ladder(5), 's0');
    await key('ArrowRight');
    await key('ArrowRight');
    await key('ArrowRight');
    // The knob and the step name follow the keys immediately.
    expect(slider().getAttribute('aria-valuenow')).toBe('3');
    expect(onPreview.mock.calls.map(call => call[0])).toEqual(['s1', 's2', 's3']);
    expect(onCommit).not.toHaveBeenCalled();

    await advance(199);
    expect(onCommit).not.toHaveBeenCalled();
    await advance(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('s3');
  });

  it('flushes an uncommitted keyboard value on blur and on unmount', async () => {
    await render(ladder(5), 's1');
    await key('ArrowRight');
    await act(async () => slider().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith('s2');

    onCommit.mockReset();
    await key('ArrowRight');
    await key('ArrowRight');
    expect(onCommit).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith('s4');
    // The timer must not fire a second time after the flush.
    await advance(400);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('lands the knob on the nearest step on pointerdown and previews it without starting a drag', async () => {
    await render(ladder(5), 's0');
    await pointer('pointerdown', xFor(0.5), 15);
    expect(slider().getAttribute('aria-valuenow')).toBe('2');
    expect(onPreview).toHaveBeenCalledWith('s2');
    expect(slider().getAttribute('data-reasoning-slider-state')).toBe('idle');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('starts dragging only after the pointer travels more than three pixels, then commits once', async () => {
    await render(ladder(5), 's0');
    await pointer('pointerdown', xFor(0.5), 15);
    await pointer('pointermove', xFor(0.5) + 2, 15);
    expect(slider().getAttribute('data-reasoning-slider-state')).toBe('idle');
    await pointer('pointermove', xFor(0.5) + 6, 15);
    expect(slider().getAttribute('data-reasoning-slider-state')).toBe('dragging');
    await pointer('pointermove', xFor(1), 15);
    expect(slider().getAttribute('aria-valuenow')).toBe('4');
    await pointer('pointerup', xFor(1), 15);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('s4');
    expect(slider().getAttribute('data-reasoning-slider-state')).toBe('idle');
  });

  it('walks the damped path between steps while the hit test follows the raw coordinate', async () => {
    await render(ladder(5), 's0');
    await pointer('pointerdown', xFor(0.5), 15);
    await pointer('pointermove', xFor(0.31), 15);
    // 0.31 of the track is 1.24 of the ladder, so the nearest step is still index 1 ...
    expect(slider().getAttribute('aria-valuenow')).toBe('1');
    // ... but the knob is drawn on the damped path, which sits past the linear ratio 0.31.
    expect(valueOf()).toBe(Math.round(dampedRatio(1.24, 5) * 10000));
    expect(valueOf()).toBeGreaterThan(3100);
  });

  it('lands in place when a dragging pointer leaves the track by more than six pixels', async () => {
    await render(ladder(5), 's0');
    await pointer('pointerdown', xFor(0.5), 15);
    await pointer('pointermove', xFor(0.5) + 8, 15);
    expect(slider().getAttribute('data-reasoning-slider-state')).toBe('dragging');
    await pointer('pointermove', xFor(0.25), 400);
    expect(slider().getAttribute('aria-valuenow')).toBe('1');
    // The knob sits exactly on the settled step instead of tracking the pointer off the track.
    expect(valueOf()).toBe(2500);
    await pointer('pointerup', xFor(0.25), 400);
    expect(onCommit).toHaveBeenCalledWith('s1');
  });

  it('ignores every input while a commit is pending and keeps the knob on the committed step', async () => {
    await render(ladder(5), 's1', { pending: true });
    expect(slider().getAttribute('data-reasoning-slider-state')).toBe('pending');
    expect(valueOf()).toBe(2500);

    await pointer('pointerdown', xFor(1), 15);
    await key('End');
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(slider().getAttribute('aria-valuenow')).toBe('1');
    expect(valueOf()).toBe(2500);
  });

  it('disables pointer, keyboard and tab order when disabled', async () => {
    await render(ladder(5), 's3', { disabled: true });
    expect(slider().getAttribute('data-reasoning-slider-state')).toBe('disabled');
    expect(slider().getAttribute('aria-disabled')).toBe('true');
    expect(slider().getAttribute('tabindex')).toBe('-1');

    await pointer('pointerdown', xFor(0), 15);
    await pointer('pointerup', xFor(0), 15);
    await key('ArrowLeft');
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(slider().getAttribute('aria-valuenow')).toBe('3');
  });

  it('publishes the reduced-motion answer for the stylesheet', async () => {
    await render(ladder(5), 's2');
    expect(slider().getAttribute('data-reasoning-reduced-motion')).toBeNull();

    motion.reduced = true;
    await render(ladder(5), 's2');
    expect(slider().getAttribute('data-reasoning-reduced-motion')).toBe('true');
  });

  it('keeps one knob node across value, label and steps changes', async () => {
    await render(ladder(5), 's1');
    const first = knob();
    await render(ladder(5), 's3');
    expect(knob()).toBe(first);
    await render([...ladder(5)].map(step => ({ ...step, label: `${step.label} (${LONG_LABEL})` })), 's3');
    expect(knob()).toBe(first);
    expect(slider().getAttribute('aria-valuetext')).toContain(LONG_LABEL);
  });

  it('draws every step at its own position on a ladder longer than five', async () => {
    // Regression: clamping the step index instead of the finished ratio pinned every step
    // above the first one to the same spot, so only a five-step ladder looked correct.
    await render(ladder(6), 's0');
    expect(valueOf()).toBe(0);
    await render(ladder(6), 's1');
    expect(valueOf()).toBe(2000);
    await render(ladder(6), 's5');
    expect(valueOf()).toBe(10000);
    expect(slider().getAttribute('aria-valuenow')).toBe('5');
  });
});
