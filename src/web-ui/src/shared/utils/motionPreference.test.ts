// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MOTION_MODE_ATTRIBUTE,
  getInteractionMotion,
  getMotionAwareScrollBehavior,
  installInteractionModalityTracking,
  installMotionModeMirror,
  isReducedMotionPreferred,
  recordInteractionModality,
  resolveMotionMode,
  subscribeMotionModeChange,
} from './motionPreference';

function stubMotionMedia(matches: boolean) {
  const media = new EventTarget() as EventTarget & { matches: boolean };
  media.matches = matches;
  vi.stubGlobal('matchMedia', () => media);
  return media;
}

describe('getMotionAwareScrollBehavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    recordInteractionModality('programmatic');
  });

  it('keeps smooth scrolling when reduced motion is not requested', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));

    expect(getMotionAwareScrollBehavior('smooth')).toBe('smooth');
  });

  it('uses immediate scrolling when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));

    expect(getMotionAwareScrollBehavior('smooth')).toBe('auto');
  });

  it('does not query motion preferences for an immediate scroll', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', matchMedia);

    expect(getMotionAwareScrollBehavior('auto')).toBe('auto');
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it('reports the current reduced-motion preference', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));

    expect(isReducedMotionPreferred()).toBe(true);
  });

  it('defaults to full motion when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(isReducedMotionPreferred()).toBe(false);
  });

  it('exposes pointer motion only for the current pointer interaction', () => {
    recordInteractionModality('pointer');
    expect(getInteractionMotion()).toBe('pointer');

    recordInteractionModality('keyboard');
    expect(getInteractionMotion()).toBe('instant');
  });

  it('tracks pointer and keyboard modality in the capture phase', () => {
    const target = document.implementation.createHTMLDocument();
    const remove = installInteractionModalityTracking(target);

    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(getInteractionMotion()).toBe('pointer');

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(getInteractionMotion()).toBe('instant');
    remove();
  });
});

describe('resolveMotionMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the media query to the two published answers', () => {
    stubMotionMedia(false);
    expect(resolveMotionMode()).toBe('full');

    stubMotionMedia(true);
    expect(resolveMotionMode()).toBe('reduced');
  });

  it('resolves to full motion when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(resolveMotionMode()).toBe('full');
  });
});

describe('installMotionModeMirror', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mirrors the resolved mode onto the document element and follows changes', () => {
    const media = stubMotionMedia(false);
    const dispose = installMotionModeMirror();
    try {
      expect(document.documentElement.getAttribute(MOTION_MODE_ATTRIBUTE)).toBe('full');

      media.matches = true;
      media.dispatchEvent(new Event('change'));
      expect(document.documentElement.getAttribute(MOTION_MODE_ATTRIBUTE)).toBe('reduced');

      media.matches = false;
      media.dispatchEvent(new Event('change'));
      expect(document.documentElement.getAttribute(MOTION_MODE_ATTRIBUTE)).toBe('full');
    } finally {
      dispose();
    }
  });

  it('install is idempotent and teardown removes the attribute', () => {
    const media = stubMotionMedia(true);
    const dispose = installMotionModeMirror();
    try {
      const again = installMotionModeMirror();
      expect(again).toBe(dispose);
      expect(document.documentElement.getAttribute(MOTION_MODE_ATTRIBUTE)).toBe('reduced');
    } finally {
      dispose();
    }
    expect(document.documentElement.hasAttribute(MOTION_MODE_ATTRIBUTE)).toBe(false);

    // A change after teardown must not resurrect the attribute.
    media.dispatchEvent(new Event('change'));
    expect(document.documentElement.hasAttribute(MOTION_MODE_ATTRIBUTE)).toBe(false);
  });

  it('tolerates a repeated teardown', () => {
    stubMotionMedia(false);
    const dispose = installMotionModeMirror();
    dispose();
    dispose();
    expect(document.documentElement.hasAttribute(MOTION_MODE_ATTRIBUTE)).toBe(false);
  });
});

describe('subscribeMotionModeChange', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers the resolved answer and stops after dispose', () => {
    const media = stubMotionMedia(false);
    const seen: string[] = [];
    const dispose = subscribeMotionModeChange(mode => seen.push(mode));

    media.matches = true;
    media.dispatchEvent(new Event('change'));
    expect(seen).toEqual(['reduced']);

    dispose();
    media.matches = false;
    media.dispatchEvent(new Event('change'));
    expect(seen).toEqual(['reduced']);
  });
});
