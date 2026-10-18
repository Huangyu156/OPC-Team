// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
const cleanups: (() => void)[] = [];
function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  let mounted = true;
  const unmount = () => { if (mounted) { act(() => root.unmount()); container.remove(); mounted = false; } };
  cleanups.push(unmount);
  return { container, rerender: (next: React.ReactNode) => act(() => root.render(next)), unmount };
}
function cleanup() { cleanups.splice(0).forEach(fn => fn()); }
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARRIVAL_BURST_LIMIT,
  SLOW_FRAME_MS,
  SLOW_FRAME_STREAK,
  SLOW_FRAME_YIELD_MS,
  STAGGER_DIVISOR,
  STAGGER_MAX_MS,
  STAGGER_MIN_MS,
  STREAMING_TEXT_REVEAL_MS,
  resolveStaggerDelay,
  useStreamingTextReveal,
} from './useStreamingTextReveal';

function Fixture({ text, streaming = true, enabled = true }: { text: string; streaming?: boolean; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useStreamingTextReveal(ref, text, streaming, enabled);
  return <div ref={ref}><p>{text}</p><button>Copy</button></div>;
}
/**
 * Multi-node fixture: each extra part renders in its own paragraph, so the
 * appended region contains several text runs and therefore several resolved
 * ranges with different stagger offsets.
 */
function MultiLine({ parts, streaming = true }: { parts: string[]; streaming?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const text = `History${parts.join('')}`;
  useStreamingTextReveal(ref, text, streaming);
  return (
    <div ref={ref}>
      <p>History</p>
      {parts.map((part, index) => <p key={index}>{part}</p>)}
    </div>
  );
}
let highlights: Map<string, Set<Range>>;
const visibleRanges = () => [...highlights.values()].flatMap(value => [...value]).map(range => range.toString());
/** Paint bucket (the ::highlight level) currently holding a range, or null. */
const levelOfRange = (text: string): number | null => {
  for (const [name, ranges] of highlights) {
    for (const range of ranges) {
      if (range.toString() === text) return Number(name.slice(name.lastIndexOf('-') + 1));
    }
  }
  return null;
};
beforeEach(() => {
  vi.useFakeTimers();
  highlights = new Map();
  vi.stubGlobal('CSS', { highlights });
  vi.stubGlobal('Highlight', Set);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('streaming text arrival paint', () => {
  it('skips DOM scanning while disabled and clears active paint without replay on re-enable', () => {
    const scan = vi.spyOn(document, 'createTreeWalker');
    try {
      const view = render(<Fixture text="A" enabled={false} />);
      view.rerender(<Fixture text="AB" enabled={false} />);
      expect(scan).not.toHaveBeenCalled();
      expect(visibleRanges()).toEqual([]);
      view.rerender(<Fixture text="AB" />);
      expect(visibleRanges()).toEqual([]);
      view.rerender(<Fixture text="ABC" />);
      expect(visibleRanges()).toEqual(['C']);
      scan.mockClear();
      view.rerender(<Fixture text="ABCD" enabled={false} />);
      expect(scan).not.toHaveBeenCalled();
      expect(highlights.size).toBe(0);
      expect(view.container.querySelector('[data-stream-reveal-active]')).toBeNull();
      view.rerender(<Fixture text="ABCDE" />);
      expect(visibleRanges()).toEqual([]);
      view.rerender(<Fixture text="ABCDEF" />);
      expect(visibleRanges()).toEqual(['F']);
    } finally {
      scan.mockRestore();
    }
  });

  it('fades only appended glyphs without replacing text nodes or wrapping spans', () => {
    const view = render(<Fixture text="Already here" />);
    const textNode = view.container.querySelector('p')!.firstChild;
    expect(visibleRanges()).toEqual([]);
    view.rerender(<Fixture text="Already here 新文字👨‍👩‍👧‍👦" />);
    expect(visibleRanges()).toEqual([' 新文字👨‍👩‍👧‍👦']);
    expect(view.container.querySelector('p')!.firstChild).toBe(textNode);
    expect(view.container.querySelector('span')).toBeNull();
    expect(visibleRanges().join('')).not.toContain('Copy');
    expect(view.container.querySelectorAll('[data-stream-reveal-active]')).toHaveLength(1);
    expect(view.container.querySelector('p')!.hasAttribute('data-stream-reveal-active')).toBe(true);
    act(() => vi.advanceTimersByTime(STREAMING_TEXT_REVEAL_MS + 20));
    expect(visibleRanges()).toEqual([]);
    expect(highlights.size).toBe(0);
    expect(view.container.querySelector('[data-stream-reveal-active]')).toBeNull();
  });
  it('does not restart earlier arrivals when another batch arrives or the stream completes', () => {
    const view = render(<Fixture text="A" />);
    view.rerender(<Fixture text="AB" />);
    act(() => vi.advanceTimersByTime(96));
    view.rerender(<Fixture text="ABC" />);
    expect(visibleRanges().sort()).toEqual(['B', 'C']);
    view.rerender(<Fixture text="ABC" streaming={false} />);
    expect(view.container.querySelector('p')!.hasAttribute('data-stream-reveal-active')).toBe(true);
    act(() => vi.advanceTimersByTime(80));
    expect(visibleRanges()).toEqual(['C']);
    act(() => vi.advanceTimersByTime(100));
    expect(visibleRanges()).toEqual([]);
  });
  it('settles history, remounts and replacements immediately', () => {
    const view = render(<Fixture text="History" streaming={false} />);
    view.rerender(<Fixture text="History extended" streaming={false} />);
    expect(visibleRanges()).toEqual([]);
    view.rerender(<Fixture text="Different response" />);
    expect(visibleRanges()).toEqual([]);
    view.unmount();
    render(<Fixture text="Already streaming on remount" />);
    expect(visibleRanges()).toEqual([]);
  });
  it('keeps parallel renderer ownership independent and releases ranges on unmount', () => {
    const first = render(<Fixture text="A" />);
    const second = render(<Fixture text="X" />);
    first.rerender(<Fixture text="AB" />);
    second.rerender(<Fixture text="XY" />);
    expect(visibleRanges()).toEqual(['B', 'Y']);
    first.unmount();
    expect(visibleRanges()).toEqual(['Y']);
    expect(second.container.querySelector('p')!.hasAttribute('data-stream-reveal-active')).toBe(true);
    second.unmount();
    expect(visibleRanges()).toEqual([]);
    expect(highlights.size).toBe(0);
  });
  it('honors reduced motion and works without the highlight API', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const view = render(<Fixture text="A" />);
    view.rerender(<Fixture text="AB" />);
    expect(visibleRanges()).toEqual([]);
    vi.stubGlobal('CSS', {});
    view.rerender(<Fixture text="ABC" />);
    expect(view.container.textContent).toBe('ABCCopy');
  });

  it('retains the parent marker across frames and new arrivals, removing it only on settlement', () => {
    const view = render(<Fixture text="A" />);
    const parent = view.container.querySelector('p')!;
    const add = vi.spyOn(parent, 'setAttribute');
    const remove = vi.spyOn(parent, 'removeAttribute');
    view.rerender(<Fixture text="AB" />);
    act(() => vi.advanceTimersByTime(80));
    view.rerender(<Fixture text="ABC" />);
    act(() => vi.advanceTimersByTime(96));
    expect(add.mock.calls.filter(([name]) => name === 'data-stream-reveal-active')).toHaveLength(1);
    expect(remove.mock.calls.filter(([name]) => name === 'data-stream-reveal-active')).toHaveLength(0);
    act(() => vi.advanceTimersByTime(100));
    expect(remove.mock.calls.filter(([name]) => name === 'data-stream-reveal-active')).toHaveLength(1);
    expect(highlights.size).toBe(0);
  });

  it('scopes rich text to its actual parents and cleans detached parents on replacement', () => {
    function Rich({ suffix, replaced = false }: { suffix: string; replaced?: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      useStreamingTextReveal(ref, replaced ? 'Replacement' : `History${suffix}`, true);
      return <div ref={ref}>{replaced ? <p>Replacement</p> : <>
        <p>History</p><p><a href="#test">{suffix}</a></p>
      </>}</div>;
    }
    const view = render(<Rich suffix="" />);
    view.rerender(<Rich suffix="New" />);
    const link = view.container.querySelector('a')!;
    expect([...view.container.querySelectorAll('[data-stream-reveal-active]')]).toEqual([link]);
    expect(visibleRanges()).toEqual(['New']);
    view.rerender(<Rich suffix="" replaced />);
    expect(link.hasAttribute('data-stream-reveal-active')).toBe(false);
    expect(view.container.querySelector('[data-stream-reveal-active]')).toBeNull();
    expect(highlights.size).toBe(0);
  });

  it('clears active paint on visibility changes without deleting unrelated highlights', () => {
    const foreign = new Set<Range>();
    highlights.set('search', foreign);
    const view = render(<Fixture text="A" />);
    view.rerender(<Fixture text="AB" />);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(view.container.querySelector('[data-stream-reveal-active]')).toBeNull();
    expect([...highlights.keys()]).toEqual(['search']);
    hidden.mockRestore();
    act(() => vi.advanceTimersByTime(200));
    expect([...highlights.keys()]).toEqual(['search']);
  });

  it('clears active paint when reduced motion becomes enabled', () => {
    const media = new EventTarget() as EventTarget & { matches: boolean };
    media.matches = false;
    vi.stubGlobal('matchMedia', () => media);
    const view = render(<Fixture text="A" />);
    view.rerender(<Fixture text="AB" />);
    media.matches = true;
    act(() => media.dispatchEvent(new Event('change')));
    expect(highlights.size).toBe(0);
    expect(view.container.querySelector('[data-stream-reveal-active]')).toBeNull();
  });

  it('keeps a shared text-parent marker until its last renderer owner releases it', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const ref = { current: element };
    function Owner({ source }: { source: string }) {
      useStreamingTextReveal(ref, source, true);
      return null;
    }
    element.textContent = 'A';
    const view = render(<><Owner key="one" source="A" /><Owner key="two" source="A" /></>);
    try {
      element.textContent = 'AB';
      view.rerender(<><Owner key="one" source="AB" /><Owner key="two" source="AB" /></>);
      expect(visibleRanges()).toEqual(['B', 'B']);
      view.rerender(<><Owner key="two" source="AB" /></>);
      expect(visibleRanges()).toEqual(['B']);
      expect(element.hasAttribute('data-stream-reveal-active')).toBe(true);
      view.unmount();
      expect(element.hasAttribute('data-stream-reveal-active')).toBe(false);
      expect(highlights.size).toBe(0);
    } finally {
      view.unmount();
      element.remove();
    }
  });
});

describe('arrival stagger', () => {
  it('derives a clamped per-segment delay from the segment offset', () => {
    expect(resolveStaggerDelay(0)).toBe(STAGGER_MIN_MS);
    expect(resolveStaggerDelay(STAGGER_DIVISOR / 2)).toBe(STAGGER_MIN_MS);
    expect(resolveStaggerDelay(STAGGER_DIVISOR * 2)).toBe(STAGGER_MIN_MS * 2);
    expect(resolveStaggerDelay(STAGGER_DIVISOR * 400)).toBe(STAGGER_MAX_MS);
    // Offsets are never negative, but the clamp must stay total.
    expect(resolveStaggerDelay(-100)).toBe(STAGGER_MIN_MS);
  });

  it('puts segments of one batch on different levels at the same frame', () => {
    const early = 'a'.repeat(200);
    const middle = 'b'.repeat(200);
    const late = 'c'.repeat(200);
    const view = render(<MultiLine parts={[]} />);
    view.rerender(<MultiLine parts={[early, middle, late]} />);
    // Offsets 0 / 200 / 400 inside one arrival resolve to delays 1 / 4 / 8 ms.
    expect(resolveStaggerDelay(0)).toBe(1);
    expect(resolveStaggerDelay(200)).toBe(4);
    expect(resolveStaggerDelay(400)).toBe(8);
    // One arrival covers all three runs, so only the delay separates them.
    expect(visibleRanges().sort()).toEqual([early, middle, late].sort());
    act(() => vi.advanceTimersByTime(16));
    const earlyLevel = levelOfRange(early);
    const middleLevel = levelOfRange(middle);
    const lateLevel = levelOfRange(late);
    expect(earlyLevel).not.toBeNull();
    expect(middleLevel).not.toBeNull();
    expect(lateLevel).not.toBeNull();
    // The ladder is monotonic: an earlier segment is further along.
    expect(earlyLevel!).toBeGreaterThan(middleLevel!);
    expect(middleLevel!).toBeGreaterThan(lateLevel!);
  });

  it('keeps one text walk and one range per run per commit while staggering', () => {
    const walk = vi.spyOn(document, 'createTreeWalker');
    const createRange = vi.spyOn(document, 'createRange');
    try {
      const view = render(<MultiLine parts={[]} />);
      walk.mockClear();
      createRange.mockClear();
      view.rerender(<MultiLine parts={['aa', 'bb', 'cc']} />);
      // One walk per commit even though three runs are resolved.
      expect(walk).toHaveBeenCalledTimes(1);
      expect(createRange).toHaveBeenCalledTimes(3);
      act(() => vi.advanceTimersByTime(64));
      // Frames move the existing ranges; they never re-walk or re-create them.
      expect(walk).toHaveBeenCalledTimes(1);
      expect(createRange).toHaveBeenCalledTimes(3);
    } finally {
      walk.mockRestore();
      createRange.mockRestore();
    }
  });
});

describe('arrival burst limit', () => {
  it('does not build an arrival for a commit wider than the burst limit', () => {
    const view = render(<Fixture text="History" />);
    const burst = 'z'.repeat(ARRIVAL_BURST_LIMIT + 1);
    view.rerender(<Fixture text={`History${burst}`} />);
    // Reconnect / replay sized payload: content is visible, nothing is faded.
    expect(visibleRanges()).toEqual([]);
    expect(highlights.size).toBe(0);
    expect(view.container.querySelector('[data-stream-reveal-active]')).toBeNull();
  });

  it('resumes fading for live chunks after a skipped burst', () => {
    const view = render(<Fixture text="History" />);
    const burst = 'z'.repeat(ARRIVAL_BURST_LIMIT + 1);
    view.rerender(<Fixture text={`History${burst}`} />);
    expect(visibleRanges()).toEqual([]);
    view.rerender(<Fixture text={`History${burst}live`} />);
    expect(visibleRanges()).toEqual(['live']);
  });
});

describe('slow frame yielding', () => {
  it('drops the cascade after consecutive slow frames and resumes later', () => {
    // Just over the frame budget, so every gap counts as slow.
    const slowFrame = SLOW_FRAME_MS + 10;
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), slowFrame),
    );
    const view = render(<Fixture text="A" />);
    // Keep content arriving while frames are slow, which is exactly the case
    // the watchdog protects: the cascade stays in flight across several frames.
    for (let index = 0; index < SLOW_FRAME_STREAK + 2; index++) {
      view.rerender(<Fixture text={`A${'b'.repeat(index + 1)}`} />);
      act(() => vi.advanceTimersByTime(slowFrame));
    }
    // The cascade was dropped: nothing is painted and no style scope remains.
    expect(highlights.size).toBe(0);
    expect(view.container.querySelector('[data-stream-reveal-active]')).toBeNull();
    // Content stays fully visible while the cascade is yielding.
    expect(view.container.textContent).toContain('bbbbbb');
    // New arrivals inside the yield window are not animated at all.
    view.rerender(<Fixture text={`A${'b'.repeat(SLOW_FRAME_STREAK + 2)}c`} />);
    expect(visibleRanges()).toEqual([]);
    expect(view.container.textContent).toContain('c');
    // After the yield window the cascade comes back.
    act(() => vi.advanceTimersByTime(SLOW_FRAME_YIELD_MS));
    view.rerender(<Fixture text={`A${'b'.repeat(SLOW_FRAME_STREAK + 2)}cd`} />);
    expect(visibleRanges()).toEqual(['d']);
  });

  it('does not treat an idle gap between chunks as a slow frame', () => {
    // A real slow frame is 50 ms between two frames of one run. A chunk that
    // arrives seconds after the previous run finished is idle time, not jank.
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), SLOW_FRAME_MS + 10),
    );
    const view = render(<Fixture text="A" />);
    view.rerender(<Fixture text="AB" />);
    act(() => vi.advanceTimersByTime(STREAMING_TEXT_REVEAL_MS + STAGGER_MAX_MS + 400));
    expect(highlights.size).toBe(0);
    act(() => vi.advanceTimersByTime(SLOW_FRAME_YIELD_MS));
    view.rerender(<Fixture text="ABC" />);
    expect(visibleRanges()).toEqual(['C']);
  });
});

describe('reduced motion engine teardown', () => {
  it('stops scheduling frames and ignores later batches once reduced motion is enabled', () => {
    const media = new EventTarget() as EventTarget & { matches: boolean };
    media.matches = false;
    vi.stubGlobal('matchMedia', () => media);
    const requestFrame = vi.fn(
      (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    const view = render(<Fixture text="A" />);
    view.rerender(<Fixture text="AB" />);
    expect(visibleRanges()).toEqual(['B']);
    media.matches = true;
    act(() => media.dispatchEvent(new Event('change')));
    expect(highlights.size).toBe(0);
    const scheduledAfterTeardown = requestFrame.mock.calls.length;
    act(() => vi.advanceTimersByTime(400));
    expect(requestFrame.mock.calls.length).toBe(scheduledAfterTeardown);
    // A later commit reads the new resolved mode and does not restart the engine.
    view.rerender(<Fixture text="ABC" />);
    expect(visibleRanges()).toEqual([]);
    expect(view.container.querySelector('[data-stream-reveal-active]')).toBeNull();
    expect(view.container.textContent).toBe('ABCCopy');
  });
});

