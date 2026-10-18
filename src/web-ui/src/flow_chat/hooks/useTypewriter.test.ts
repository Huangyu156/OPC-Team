// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  TYPEWRITER_BASE_CHARS_PER_SEC,
  TYPEWRITER_BURST_IMMEDIATE_CHARS,
  TYPEWRITER_FINISH_CHARS_PER_SEC,
  TYPEWRITER_FINISH_MAX_CHARS_PER_PAINT,
  TYPEWRITER_MAX_CHARS_PER_PAINT,
  TYPEWRITER_MAX_CHARS_PER_SEC,
  commitTypewriterReveal,
  computeTypewriterCharsPerSec,
  safeGraphemeRevealEnd,
  useTypewriter,
  type TypewriterOptions,
  type TypewriterResult,
} from './useTypewriter';

describe('computeTypewriterCharsPerSec', () => {
  it('starts near the base rate with an empty backlog', () => {
    expect(computeTypewriterCharsPerSec(0)).toBe(TYPEWRITER_BASE_CHARS_PER_SEC);
  });

  it('soft-accelerates as backlog grows', () => {
    const small = computeTypewriterCharsPerSec(10);
    const large = computeTypewriterCharsPerSec(100);
    expect(small).toBeGreaterThan(TYPEWRITER_BASE_CHARS_PER_SEC);
    expect(large).toBeGreaterThan(small);
  });

  it('never exceeds the live ceiling while streaming', () => {
    expect(computeTypewriterCharsPerSec(10_000)).toBe(TYPEWRITER_MAX_CHARS_PER_SEC);
  });

  it('uses the absolute finish rate once the model stream ends', () => {
    expect(computeTypewriterCharsPerSec({ backlog: 20, finishing: true }))
      .toBe(TYPEWRITER_FINISH_CHARS_PER_SEC);
    expect(computeTypewriterCharsPerSec({ backlog: 1, finishing: true }))
      .toBe(TYPEWRITER_FINISH_CHARS_PER_SEC);
    expect(TYPEWRITER_FINISH_CHARS_PER_SEC).toBeGreaterThan(TYPEWRITER_MAX_CHARS_PER_SEC);
  });
});

describe('commitTypewriterReveal', () => {
  it('does not reveal more than the per-paint cap', () => {
    const result = commitTypewriterReveal({
      backlog: 200,
      fractionalCarry: 50,
    });
    expect(result.chars).toBe(TYPEWRITER_MAX_CHARS_PER_PAINT);
    expect(result.fractionalCarry).toBe(50 - TYPEWRITER_MAX_CHARS_PER_PAINT);
  });

  it('honors a higher finish-mode paint cap', () => {
    const result = commitTypewriterReveal({
      backlog: 200,
      fractionalCarry: 80,
      maxCharsPerPaint: TYPEWRITER_FINISH_MAX_CHARS_PER_PAINT,
    });
    expect(result.chars).toBe(TYPEWRITER_FINISH_MAX_CHARS_PER_PAINT);
  });

  it('does not reveal more than the backlog', () => {
    const result = commitTypewriterReveal({
      backlog: 2,
      fractionalCarry: 10,
    });
    expect(result.chars).toBe(2);
    expect(result.fractionalCarry).toBe(8);
  });

  it('keeps fractional remainder below one character', () => {
    const result = commitTypewriterReveal({
      backlog: 20,
      fractionalCarry: 2.75,
    });
    expect(result.chars).toBe(2);
    expect(result.fractionalCarry).toBeCloseTo(0.75);
  });

  it('returns zero when there is nothing to reveal', () => {
    expect(commitTypewriterReveal({ backlog: 0, fractionalCarry: 4 })).toEqual({
      chars: 0,
      fractionalCarry: 0,
    });
  });
});

describe('safeGraphemeRevealEnd', () => {
  it('never exposes half a surrogate pair', () => {
    expect(safeGraphemeRevealEnd('A😀B', 2)).toBe(3);
  });

  it('keeps combining and ZWJ emoji sequences together', () => {
    expect(safeGraphemeRevealEnd('e\u0301!', 1)).toBe(2);
    const family = '👨‍👩‍👧‍👦';
    expect(safeGraphemeRevealEnd(`${family}!`, 1)).toBe(family.length);
  });

  it('clamps offsets to the text bounds', () => {
    expect(safeGraphemeRevealEnd('abc', -4)).toBe(0);
    expect(safeGraphemeRevealEnd('abc', 100)).toBe(3);
  });

  it('can segment from a previously known boundary for long streams', () => {
    const prefix = 'a'.repeat(10_000);
    expect(safeGraphemeRevealEnd(`${prefix}😀!`, prefix.length + 1, prefix.length))
      .toBe(prefix.length + 2);
  });
});

interface HarnessProps {
  text: string;
  animate: boolean;
  options?: TypewriterOptions;
  onResult: (result: TypewriterResult) => void;
}

function Harness({ text, animate, options, onResult }: HarnessProps) {
  const result = useTypewriter(text, animate, options);
  onResult(result);
  return React.createElement('span', null, result.displayText);
}

const cleanups: (() => void)[] = [];

function renderTypewriter(props: HarnessProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (next: HarnessProps) => {
    act(() => {
      root.render(React.createElement(Harness, next));
    });
  };
  render(props);
  const unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  cleanups.push(unmount);
  return {
    container,
    rerender: (next: Omit<HarnessProps, 'onResult'>) => render({ ...next, onResult: props.onResult }),
    unmount,
  };
}

describe('useTypewriter burst backfill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  });

  afterEach(() => {
    cleanups.splice(0).forEach(fn => fn());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('jumps to the full text when a single commit exceeds the burst limit', () => {
    let latest: TypewriterResult = { displayText: '', isRevealing: false };
    const view = renderTypewriter({ text: '', animate: true, onResult: r => { latest = r; } });
    // A peer reconnect replays a large block in one commit: at 720 chars per
    // second the typewriter would hold the reveal gate for backlog / 720
    // seconds, so this commit is painted whole instead.
    const burst = 'x'.repeat(TYPEWRITER_BURST_IMMEDIATE_CHARS + 1);
    view.rerender({ text: burst, animate: true });
    expect(latest.displayText).toBe(burst);
    // The gate is released the moment the stream ends instead of draining the
    // backfill at the typewriter rate.
    view.rerender({ text: burst, animate: false });
    expect(latest.isRevealing).toBe(false);
    expect(latest.displayText).toBe(burst);
  });

  it('keeps animating when the commit stays under the burst limit', () => {
    let latest: TypewriterResult = { displayText: '', isRevealing: false };
    const view = renderTypewriter({ text: '', animate: true, onResult: r => { latest = r; } });
    view.rerender({ text: 'hello', animate: true });
    expect(latest.displayText).not.toBe('hello');
    expect(latest.isRevealing).toBe(true);
  });

  it('honours a caller-provided burstImmediateChars', () => {
    let latest: TypewriterResult = { displayText: '', isRevealing: false };
    const view = renderTypewriter({
      text: '',
      animate: true,
      options: { burstImmediateChars: 4 },
      onResult: r => { latest = r; },
    });
    view.rerender({
      text: 'abcdefgh',
      animate: true,
      options: { burstImmediateChars: 4 },
    });
    expect(latest.displayText).toBe('abcdefgh');
    view.rerender({
      text: 'abcdefgh',
      animate: false,
      options: { burstImmediateChars: 4 },
    });
    expect(latest.isRevealing).toBe(false);
  });

  it('treats burstImmediateChars = 0 as disabling the guard', () => {
    let latest: TypewriterResult = { displayText: '', isRevealing: false };
    const view = renderTypewriter({
      text: '',
      animate: true,
      options: { burstImmediateChars: 0 },
      onResult: r => { latest = r; },
    });
    view.rerender({
      text: 'y'.repeat(TYPEWRITER_BURST_IMMEDIATE_CHARS + 1),
      animate: true,
      options: { burstImmediateChars: 0 },
    });
    expect(latest.displayText).not.toBe('y'.repeat(TYPEWRITER_BURST_IMMEDIATE_CHARS + 1));
    expect(latest.isRevealing).toBe(true);
  });
});
