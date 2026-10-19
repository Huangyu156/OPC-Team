import { useLayoutEffect, useRef, type RefObject } from 'react';
import { resolveMotionMode, subscribeMotionModeChange } from '@/shared/utils/motionPreference';

export const STREAMING_TEXT_REVEAL_MS = 160;
const LEVELS = 32;
const NAME = 'opc-stream-reveal-';
const ACTIVE_ATTRIBUTE = 'data-stream-reveal-active';

/**
 * Same-batch cascade, mirroring the upstream chat-reveal parameters.
 *
 * Glyphs that land in one content commit do not start together: each one waits
 * `clamp(offset / STAGGER_DIVISOR, STAGGER_MIN_MS, STAGGER_MAX_MS)` before its
 * own fade clock starts. The offset is the glyph's position inside its arrival,
 * so a wide commit reads as a ladder instead of one synchronized flash.
 */
export const STAGGER_DIVISOR = 50;
export const STAGGER_MIN_MS = 1;
export const STAGGER_MAX_MS = 8;

/**
 * A single arrival wider than this many characters is not faded at all.
 * Peer reconnect refresh and cursor replay can deliver thousands of glyphs in
 * one commit; fading that batch would animate a transcript-sized block for no
 * perceptual gain and spend the frame budget on ranges nobody reads.
 * Upstream uses the same guard (`BURST_LIMIT = 10000`).
 */
export const ARRIVAL_BURST_LIMIT = 10_000;

/**
 * Slow-frame yielding. When consecutive animation frames miss their budget the
 * machine cannot keep both the cascade and the renderer responsive; dropping the
 * cascade keeps content visible and stops scheduling the work it cannot pay for.
 * Values mirror upstream `reveal-paint.ts`: 50 ms per frame, 4 frames, 3 s pause.
 */
export const SLOW_FRAME_MS = 50;
export const SLOW_FRAME_STREAK = 4;
export const SLOW_FRAME_YIELD_MS = 3000;

// Several renderer owners may share a text parent; only the last releases it.
const activeElementOwners = new WeakMap<Element, number>();
type TextHighlight = Set<Range>;
type HighlightAPI = {
  CSS?: { highlights?: Map<string, TextHighlight> };
  Highlight?: new (...ranges: Range[]) => TextHighlight;
};
interface Arrival { start: number; end: number; at: number }
interface TextRun { node: Text; start: number; end: number }
interface OwnedRange {
  registry: Map<string, TextHighlight>;
  name: string;
  highlight: TextHighlight;
  range: Range;
}
interface ResolvedRange { range: Range; delay: number }

function pruneEmptyBuckets(entries: OwnedRange[]): void {
  for (const { registry, name, highlight } of entries) {
    if (highlight.size === 0 && registry.get(name) === highlight) registry.delete(name);
  }
}

/** Delay before this glyph's own fade clock starts. Exported for contract tests. */
export function resolveStaggerDelay(offset: number): number {
  return Math.min(STAGGER_MAX_MS, Math.max(STAGGER_MIN_MS, offset / STAGGER_DIVISOR));
}

function readRuns(root: HTMLElement): { runs: TextRun[]; text: string } {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest('button, [aria-hidden="true"], .katex-mathml')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const runs: TextRun[] = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const start = text.length;
    text += node.textContent ?? '';
    runs.push({ node: node as Text, start, end: text.length });
  }
  return { runs, text };
}

/**
 * Paint-only arrival treatment for streaming Markdown surfaces that opt in.
 * Ranges leave React's text nodes, selection, wrapping and virtualizer geometry
 * untouched. Each owner removes only its own ranges from the shared buckets.
 * Existing text on mount (including virtualized remounts) is already settled.
 */
export function useStreamingTextReveal(
  rootRef: RefObject<HTMLDivElement>, source: string, streaming: boolean, enabled = true,
): void {
  const previous = useRef<{ source: string; text: string } | null>(null);
  const arrivals = useRef<Arrival[]>([]);
  const owned = useRef<OwnedRange[]>([]);
  const activeElements = useRef(new Set<Element>());
  const frame = useRef<number | null>(null);
  const frameView = useRef<Window | null>(null);
  // Slow-frame watchdog state. Only animation frames feed it: the synchronous
  // paint after a content commit is not a frame and must not reset the streak.
  const lastFrameAt = useRef<number | null>(null);
  const slowStreak = useRef(0);
  const yieldUntil = useRef(0);
  const cancelFrame = () => {
    if (frame.current !== null) frameView.current?.cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  const releaseRanges = () => {
    const released = owned.current;
    for (const { highlight, range } of released) highlight.delete(range);
    owned.current = [];
    return released;
  };
  const updateActiveElements = (next: Set<Element>) => {
    for (const element of activeElements.current) {
      if (next.has(element)) continue;
      const owners = (activeElementOwners.get(element) ?? 1) - 1;
      if (owners > 0) activeElementOwners.set(element, owners);
      else {
        activeElementOwners.delete(element);
        element.removeAttribute(ACTIVE_ATTRIBUTE);
      }
    }
    for (const element of next) {
      if (activeElements.current.has(element)) continue;
      const owners = activeElementOwners.get(element) ?? 0;
      activeElementOwners.set(element, owners + 1);
      if (owners === 0) element.setAttribute(ACTIVE_ATTRIBUTE, '');
    }
    activeElements.current = next;
  };
  const stop = () => {
    cancelFrame();
    pruneEmptyBuckets(releaseRanges());
    updateActiveElements(new Set());
    lastFrameAt.current = null;
    slowStreak.current = 0;
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useLayoutEffect(() => {
    if (!enabled) {
      stopRef.current();
      arrivals.current = [];
      previous.current = null;
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const view = root.ownerDocument.defaultView;
    frameView.current = view;
    const api = view as (Window & HighlightAPI) | null;
    const registry = api?.CSS?.highlights;
    const Highlight = api?.Highlight;
    const before = previous.current;
    // Do not traverse settled history on unrelated renderer updates.
    if (before?.source === source && arrivals.current.length === 0) return;
    const current = readRuns(root);
    previous.current = { source, text: current.text };
    const reduced = resolveMotionMode() === 'reduced';
    if (!view || !registry || !Highlight || reduced || root.ownerDocument.hidden) {
      stopRef.current();
      arrivals.current = [];
      return;
    }
    const now = view.performance.now();
    const appended = before && source.startsWith(before.source) && source.length > before.source.length;
    if (before && (!source.startsWith(before.source) || !current.text.startsWith(before.text))) arrivals.current = [];
    // Reinterpreting Markdown may replace earlier nodes. Never replay those
    // letters; only a genuinely appended visible suffix gets a new arrival.
    const appendedChars = before ? current.text.length - before.text.length : 0;
    if (
      streaming && appended && current.text.startsWith(before.text)
      && appendedChars <= ARRIVAL_BURST_LIMIT
      // A yielded machine keeps content visible and skips the cascade entirely.
      && now >= yieldUntil.current
    ) {
      arrivals.current.push({ start: before.text.length, end: current.text.length, at: now });
    }
    cancelFrame();
    // Resolve ranges once per content commit. Animation frames only move those
    // ranges between paint buckets; they do not walk a long transcript again.
    // Stagger adds a per-range delay and nothing else: the TreeWalker and the
    // Range objects below are the same ones the un-staggered implementation
    // created.
    const resolved = arrivals.current.map(arrival => {
      const ranges: ResolvedRange[] = [];
      let low = 0;
      let high = current.runs.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (current.runs[middle].end <= arrival.start) low = middle + 1;
        else high = middle;
      }
      for (let index = low; index < current.runs.length; index++) {
        const run = current.runs[index];
        if (run.start >= arrival.end) break;
        const start = Math.max(arrival.start, run.start);
        const end = Math.min(arrival.end, run.end);
        if (start >= end) continue;
        const range = root.ownerDocument.createRange();
        range.setStart(run.node, start - run.start);
        range.setEnd(run.node, end - run.start);
        ranges.push({ range, delay: resolveStaggerDelay(start - arrival.start) });
      }
      return { arrival, ranges };
    });
    const paint = (frameNow: number, fromFrame: boolean) => {
      cancelFrame();
      if (!root.isConnected || root.ownerDocument.hidden) {
        stopRef.current();
        arrivals.current = [];
        return;
      }
      if (fromFrame) {
        const previousFrameAt = lastFrameAt.current;
        lastFrameAt.current = frameNow;
        if (previousFrameAt !== null) {
          slowStreak.current = frameNow - previousFrameAt > SLOW_FRAME_MS
            ? slowStreak.current + 1
            : 0;
          if (slowStreak.current >= SLOW_FRAME_STREAK) {
            // Frames cannot keep up. Show the text and stop paying for the
            // cascade; new arrivals resume after the yield window.
            yieldUntil.current = frameNow + SLOW_FRAME_YIELD_MS;
            stopRef.current();
            arrivals.current = [];
            return;
          }
        }
      }
      const released = releaseRanges();
      const nextElements = new Set<Element>();
      const settleAt = STREAMING_TEXT_REVEAL_MS + STAGGER_MAX_MS;
      arrivals.current = arrivals.current.filter(arrival => frameNow - arrival.at < settleAt);
      for (const { arrival, ranges } of resolved) {
        if (frameNow - arrival.at >= settleAt) continue;
        for (const { range, delay } of ranges) {
          // Each resolved segment runs its own fade clock, offset by the
          // stagger delay derived from its position inside the arrival. No
          // extra Range is created for this: the per-run ranges above are
          // reused, so a commit still resolves exactly one walk and one map.
          const age = frameNow - arrival.at - delay;
          if (age >= STREAMING_TEXT_REVEAL_MS) continue;
          const parent = range.startContainer.parentElement;
          if (!parent || !root.contains(parent)) continue;
          const progress = Math.max(0, age / STREAMING_TEXT_REVEAL_MS);
          const level = Math.min(LEVELS - 1, Math.floor((1 - (1 - progress) ** 2) * LEVELS));
          const name = `${NAME}${level}`;
          let highlight = registry.get(name);
          if (!highlight) {
            highlight = new Highlight();
            registry.set(name, highlight);
          }
          highlight.add(range);
          owned.current.push({ registry, name, highlight, range });
          nextElements.add(parent);
        }
      }
      // Keep scope stable across frames/batches. Only actual arriving text
      // parents get the 32 pseudo styles, never the whole transcript. Global
      // Local desktop trace: this scope reduced two opening style updates from
      // 128.3/223.3 ms to 45.4/61.4 ms, and pre-reveal style work from 451.5 ms
      // to 172.4 ms. Overall opening latency still includes other work.
      updateActiveElements(nextElements);
      // Prune after adding the new frame, preserving shared buckets still in use.
      pruneEmptyBuckets(released);
      if (arrivals.current.length) {
        frame.current = view.requestAnimationFrame(next => paint(next, true));
      } else {
        // The run ended. Reset the watchdog: the idle gap until the next commit
        // can be seconds long, and counting it as a slow frame would let spaced
        // out streaming suppress its own cascade.
        lastFrameAt.current = null;
        slowStreak.current = 0;
      }
    };
    // Layout timing styles newly committed glyphs before their first paint.
    paint(now, false);
  }, [source, streaming, rootRef, enabled]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const document = rootRef.current?.ownerDocument;
    const clear = () => { stopRef.current(); arrivals.current = []; };
    // Both signals tear the engine down: the paint is released and no further
    // frames are scheduled. Reduced motion is re-read from the single truth
    // source rather than kept as a local copy of the media query.
    const unsubscribe = subscribeMotionModeChange(mode => { if (mode === 'reduced') clear(); });
    const onVisibility = () => { if (document?.hidden) clear(); };
    document?.addEventListener('visibilitychange', onVisibility);
    return () => {
      clear();
      unsubscribe();
      document?.removeEventListener('visibilitychange', onVisibility);
    };
  }, [rootRef, enabled]);
}
