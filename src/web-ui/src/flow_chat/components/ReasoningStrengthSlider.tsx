import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { OverflowText } from '@opc-team/ui';
import { isReducedMotionPreferred } from '@/shared/utils/motionPreference';
import './ReasoningStrengthSlider.scss';

export interface ReasoningStrengthStep {
  /** Stable id handed back on preview and commit. */
  value: string;
  /** Localized label rendered next to the current step and as aria-valuetext. */
  label: string;
  /** 0-based position in the ascending strength ladder. */
  rank: number;
}

export interface ReasoningStrengthSliderProps {
  /** Ascending ladder, at least 2 steps. */
  steps: ReasoningStrengthStep[];
  /** Currently committed step value. */
  value: string;
  /** Localized name of the whole control, used as the slider's aria-label. */
  ariaLabel: string;
  /** Localized name of the whole control, rendered as the card header label. */
  title?: string;
  /** Localized caption for the weak end of the axis. */
  weakerLabel: string;
  /** Localized caption for the strong end of the axis. */
  strongerLabel: string;
  disabled?: boolean;
  /** A commit is currently in flight; keep the knob where it is. */
  pending?: boolean;
  /** Fired when the knob lands on a step without committing. */
  onPreview?: (value: string) => void;
  /** Fired once per settle. */
  onCommit: (value: string) => void;
  className?: string;
}

type SliderState = 'idle' | 'dragging' | 'pending' | 'disabled';

interface PointerSession {
  pointerId: number;
  originX: number;
  originY: number;
  dragging: boolean;
  lastIndex: number;
}

interface PointerResolution {
  /** Track ratio of the pointer, clamped into the track. */
  ratio: number;
  /** How far, in CSS pixels, the pointer sits outside the track. */
  overhangPx: number;
}

/** Trailing merge window for keyboard commits, in milliseconds. */
const KEYBOARD_COMMIT_DELAY_MS = 200;

/** Pointer travel, in CSS pixels, before the control reports a drag. */
const DRAG_START_DISTANCE_PX = 3;

/** Distance, in CSS pixels, a dragging pointer may leave the track before the knob lands. */
const DRAG_EXIT_TOLERANCE_PX = 6;

/**
 * Sine damping coefficient for the within-segment visual path. The value must stay
 * below 1: at 1 the path stalls before every step boundary, and above 1 the knob would
 * travel past the next step and then backtrack, which reads as a non-monotonic jump.
 */
const DAMPING_COEFFICIENT = 0.8;

/** Ignore visual path updates smaller than this so pointer moves do not re-render for nothing. */
const RATIO_EPSILON = 0.0005;

/**
 * Fallback knob width in CSS pixels. The live width is measured from the rendered knob, which
 * follows `--opcteam-space-4`, and this value only covers the first press (or a host without
 * layout). The knob is drawn from its leading edge over a span shortened by its own width, so
 * the pointer has to be mapped onto that same shortened band for the knob centre to sit exactly
 * under the pointer, the way a native range thumb does. A wrong width can only shift the two
 * extreme ends by a few pixels; it cannot desynchronise a step from its tick.
 */
const KNOB_INLINE_SIZE_PX = 16;

/**
 * Rows in the top-step dot matrix. Five rows of roughly four device pixels read as a pixel field;
 * a sixth row would resolve to three-pixel blocks and blur into a texture instead of a grid.
 */
const MATRIX_ROWS = 5;

/** Groove height in CSS pixels, used only until the rendered groove can be measured. */
const MATRIX_GROOVE_FALLBACK_PX = 26;

/** Flash period in milliseconds, matching two loop tokens for a host without computed styles. */
const MATRIX_FLASH_FALLBACK_MS = 1440;

/** One cell of the top-step dot matrix, ready to render. */
interface MatrixCell {
  key: string;
  /** Brightness step 0..7; the stylesheet turns it into a flash colour. */
  tone: number;
  /** Static feather from the weak end to the strong end. */
  opacity: number;
  /** Delay of the sweep-in animation, in milliseconds. */
  enterDelayMs: number;
  /** Delay of the flash loop, in milliseconds. */
  flashDelayMs: number;
  /** Per-cell flash duration, in milliseconds. */
  flashDurationMs: number;
}

/** Resolved matrix geometry in CSS pixels, plus the cells it produces. */
interface MatrixField {
  cols: number;
  blockPx: number;
  gapPx: number;
  padBlockStartPx: number;
  padBlockEndPx: number;
  padInlineStartPx: number;
  padInlineEndPx: number;
  cells: MatrixCell[];
}

/** Resolved track geometry in device pixels, before conversion back to CSS pixels. */
interface MatrixGeometry {
  cols: number;
  blockPx: number;
  gapPx: number;
  padBlockStartPx: number;
  padBlockEndPx: number;
  padInlineStartPx: number;
  padInlineEndPx: number;
}

/**
 * Stable pseudo-random value in [0, 1) for one matrix coordinate. Both coordinates are mixed into
 * the seed before the avalanche step, so neighbouring cells do not drift into a diagonal band the
 * way a single linear index would.
 */
function cellUnit(row: number, column: number, seed: number): number {
  let hash = Math.imul(row + 1, 0x9e3779b1) ^ Math.imul(column + 1, 0x85ebca6b) ^ Math.imul(seed + 1, 0x27d4eb2f);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

/**
 * Static feather along the travel axis. The weak end stays empty, the strong end is fully lit, and
 * a smoothstep bridges the two so the field has no visible edge where the ramp starts.
 */
function cellFade(fx: number): number {
  if (fx <= 0.05) return 0;
  if (fx >= 0.75) return 1;
  const t = (fx - 0.05) / 0.7;
  return t * t * (3 - 2 * t);
}

/**
 * Fit as many whole blocks as the track holds. The block size is rounded to a whole device pixel
 * so every square is crisp, and the leftover space is split evenly into padding instead of being
 * absorbed by one fat cell. All rounding happens in device pixels, never in CSS pixels.
 */
function solveMatrix(widthDev: number, heightDev: number, dpr: number): MatrixGeometry {
  const gap = Math.max(1, Math.round(1 * dpr));
  const margin = Math.max(1, Math.round(0.5 * dpr));
  const block = Math.max(3, Math.floor((heightDev - 2 * margin - (MATRIX_ROWS - 1) * gap) / MATRIX_ROWS));
  const cols = Math.max(1, Math.floor((widthDev + gap) / (block + gap)));
  const restX = widthDev - (cols * block + (cols - 1) * gap);
  const restY = heightDev - (MATRIX_ROWS * block + (MATRIX_ROWS - 1) * gap);
  const padTop = Math.floor(restY / 2);
  const padLeft = Math.floor(restX / 2);
  return {
    cols,
    blockPx: block / dpr,
    gapPx: gap / dpr,
    padBlockStartPx: padTop / dpr,
    padBlockEndPx: (restY - padTop) / dpr,
    padInlineStartPx: padLeft / dpr,
    padInlineEndPx: (restX - padLeft) / dpr,
  };
}

/**
 * Resolve the flash period from the same motion token the stylesheet derives its animation
 * duration from, so the per-cell phase offsets and the CSS loop stay in lockstep. A host without
 * computed styles, or one that has collapsed the token to zero for reduced motion, gets the
 * fallback; reduced motion is handled by the caller and never reaches the animation path.
 */
function resolveFlashPeriodMs(element: HTMLElement | null): number {
  if (!element || typeof getComputedStyle !== 'function') return MATRIX_FLASH_FALLBACK_MS;
  const raw = getComputedStyle(element).getPropertyValue('--opcteam-motion-duration-loop').trim();
  if (!raw) return MATRIX_FLASH_FALLBACK_MS;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return MATRIX_FLASH_FALLBACK_MS;
  const period = (raw.endsWith('ms') ? value : value * 1000) * 2;
  return Number.isFinite(period) && period > 0 ? period : MATRIX_FLASH_FALLBACK_MS;
}

/**
 * Build the matrix field. Tone, entry delay, flash offset and flash duration are all keyed off a
 * hash of the cell coordinate, so a given cell keeps its identity across renders and a resize
 * produces a fresh field rather than a reshuffle of the one on screen.
 */
function buildMatrix(geometry: MatrixGeometry, flashPeriodMs: number, reducedMotion: boolean): MatrixField {
  const cells: MatrixCell[] = [];
  for (let row = 0; row < MATRIX_ROWS; row += 1) {
    for (let column = 0; column < geometry.cols; column += 1) {
      const fx = geometry.cols > 1 ? column / (geometry.cols - 1) : 1;
      const tone = Math.floor(cellUnit(row, column, 1) * 8) % 8;
      const opacity = cellFade(fx);
      if (reducedMotion) {
        cells.push({ key: `${row}-${column}`, tone, opacity, enterDelayMs: 0, flashDelayMs: 0, flashDurationMs: 0 });
        continue;
      }
      cells.push({
        key: `${row}-${column}`,
        tone,
        opacity,
        // The field sweeps in from the strong end, so the weak end starts last.
        enterDelayMs: (1 - fx) * flashPeriodMs * 0.31 + cellUnit(row, column, 4) * flashPeriodMs * 0.055,
        flashDelayMs: cellUnit(row, column, 2) * flashPeriodMs * 0.95 + flashPeriodMs * 0.21,
        flashDurationMs: flashPeriodMs * (0.92 + cellUnit(row, column, 3) * 0.16),
      });
    }
  }
  return { ...geometry, cells };
}

/**
 * Sweep-in style for one cell. Written inline because the delay is a function of the cell's
 * distance from the strong end, which only the measured field knows.
 */
function matrixCellStyle(cell: MatrixCell): React.CSSProperties {
  if (cell.enterDelayMs <= 0) return {};
  return { animationDelay: `${cell.enterDelayMs.toFixed(0)}ms` };
}

/**
 * Flash style for one square. The static feather lives here rather than on the cell because the
 * cell already owns an opacity animation whose end state would overwrite it.
 */
function matrixSquareStyle(cell: MatrixCell): React.CSSProperties {
  const style: React.CSSProperties = { opacity: cell.opacity };
  if (cell.flashDurationMs > 0) {
    style.animationDelay = `${cell.flashDelayMs.toFixed(0)}ms`;
    style.animationDuration = `${cell.flashDurationMs.toFixed(0)}ms`;
  }
  return style;
}

/**
 * Two fields are equal when their geometry and every cell's tone match. Cell delays never need
 * comparing: they are a pure function of the coordinate and the flash period, and the period only
 * changes when the geometry does.
 */
function sameMatrixField(current: MatrixField | null, next: MatrixField): boolean {
  if (!current) return false;
  if (current.cols !== next.cols || current.blockPx !== next.blockPx || current.gapPx !== next.gapPx) return false;
  if (current.cells.length !== next.cells.length) return false;
  return current.cells.every((cell, index) => cell.tone === next.cells[index]?.tone);
}

/**
 * Keys this control owns. Arrow keys follow numeric strength, not the visual axis:
 * ArrowRight/ArrowUp always increase the index and ArrowLeft/ArrowDown always decrease
 * it, in both LTR and RTL, because the ladder is a numeric scale and never mirrors with
 * the writing direction. Home/End jump to the ends and PageUp/PageDown move by 10% of the
 * ladder, clamped, again with the same numeric direction.
 */
const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function stepRatio(index: number, stepCount: number): number {
  if (stepCount <= 1) return 0;
  // Clamp the finished ratio, not the index: clamping the index first pins every step
  // above the first one to the same position.
  return clamp01(index / (stepCount - 1));
}

/**
 * Sine damping normalized into one segment interval. The raw sine value is blended back
 * onto the linear progress so the curve reaches exactly 0 at the segment start and exactly
 * 1 at the segment end: without that normalization the knob would leave a gap before the
 * next step and then jump when the step boundary moved.
 */
function dampSegmentProgress(progress: number): number {
  const bounded = clamp01(progress);
  const sine = Math.sin((bounded * Math.PI) / 2);
  return bounded + DAMPING_COEFFICIENT * (sine - bounded);
}

/**
 * Map a continuous ladder position (0..stepCount-1) onto the damped visual path. Integer
 * positions land exactly on their tick, so a step is always drawn on the step it represents.
 */
function dampedLadderPosition(position: number, stepCount: number): number {
  const maxIndex = Math.max(0, stepCount - 1);
  const bounded = Math.min(maxIndex, Math.max(0, position));
  const segment = Math.floor(bounded);
  return segment + dampSegmentProgress(bounded - segment);
}

function dampedLadderRatio(position: number, stepCount: number): number {
  const maxIndex = Math.max(0, stepCount - 1);
  if (maxIndex === 0) return 0;
  return dampedLadderPosition(position, stepCount) / maxIndex;
}

export const ReasoningStrengthSlider: React.FC<ReasoningStrengthSliderProps> = ({
  steps,
  value,
  ariaLabel,
  title,
  weakerLabel,
  strongerLabel,
  disabled = false,
  pending = false,
  onPreview,
  onCommit,
  className,
}) => {
  const stepCount = steps.length;
  const maxIndex = Math.max(0, stepCount - 1);

  const committedIndex = React.useMemo(() => {
    const foundIndex = steps.findIndex(step => step.value === value);
    return foundIndex < 0 ? 0 : Math.min(foundIndex, maxIndex);
  }, [steps, value, maxIndex]);

  const [displayIndex, setDisplayIndex] = useState(committedIndex);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // The top-step matrix is sized from the rendered groove, never from a guessed width, so the
  // column count follows the actual popover width in every host.
  const [matrixField, setMatrixField] = useState<MatrixField | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const grooveRef = useRef<HTMLSpanElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const onCommitRef = useRef(onCommit);
  const onPreviewRef = useRef(onPreview);
  const pendingCommitRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; value: string | null }>({
    timer: null,
    value: null,
  });
  const pointerRef = useRef<PointerSession | null>(null);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);

  const flushPendingCommit = useCallback(() => {
    const pendingCommit = pendingCommitRef.current;
    const queuedValue = pendingCommit.value;
    if (pendingCommit.timer !== null) {
      clearTimeout(pendingCommit.timer);
      pendingCommit.timer = null;
    }
    pendingCommit.value = null;
    if (queuedValue === null) return;
    onCommitRef.current(queuedValue);
  }, []);

  const queueCommit = useCallback((nextValue: string) => {
    const pendingCommit = pendingCommitRef.current;
    if (pendingCommit.timer !== null) clearTimeout(pendingCommit.timer);
    pendingCommit.value = nextValue;
    pendingCommit.timer = setTimeout(() => {
      pendingCommit.timer = null;
      const settledValue = pendingCommit.value;
      pendingCommit.value = null;
      if (settledValue === null) return;
      onCommitRef.current(settledValue);
    }, KEYBOARD_COMMIT_DELAY_MS);
  }, []);

  // A queued value must never be lost: an unmount flushes it once.
  useEffect(() => flushPendingCommit, [flushPendingCommit]);

  useLayoutEffect(() => {
    // During a pointer drag the pointer owns the knob, and an uncommitted keyboard value
    // owns it until it settles, so the committed prop must not yank it away.
    if (pointerRef.current !== null) return;
    if (pendingCommitRef.current.timer !== null) return;
    setDisplayIndex(committedIndex);
  }, [committedIndex, disabled, pending, stepCount]);

  const resolvePointer = (clientX: number, clientY: number): PointerResolution | null => {
    const railRect = railRef.current?.getBoundingClientRect();
    const usableRect = railRect && railRect.width > 0
      ? railRect
      : rootRef.current?.getBoundingClientRect();
    if (!usableRect || !Number.isFinite(usableRect.width) || usableRect.width <= 0) return null;
    // The knob is drawn from its leading edge over a span shortened by one knob width, so its
    // centre covers only the inner band of the rail. Mapping the pointer onto that same band
    // keeps the knob centred under the pointer and puts every integer step exactly on its tick.
    const measuredKnob = knobRef.current?.offsetWidth ?? 0;
    const knobInlineSize = measuredKnob > 0 ? measuredKnob : KNOB_INLINE_SIZE_PX;
    const bandWidth = Math.max(1, usableRect.width - knobInlineSize);
    const rawRatio = (clientX - usableRect.left - knobInlineSize / 2) / bandWidth;
    // Reading direction mirrors only the axis; the step index stays numeric, so the ratio
    // is flipped for RTL to keep the pointer over the step it is drawn over.
    const direction = railRef.current ? getComputedStyle(railRef.current).direction : 'ltr';
    const orientedRatio = direction === 'rtl' ? 1 - rawRatio : rawRatio;
    // Distance outside the rail box, on both axes, in CSS pixels. The knob keeps steering from
    // within the tolerance band on either side of every edge and lands once the pointer is past it.
    const overhangPx = Math.max(
      0,
      usableRect.left - clientX,
      clientX - usableRect.right,
      usableRect.top - clientY,
      clientY - usableRect.bottom,
    );
    return { ratio: clamp01(orientedRatio), overhangPx };
  };

  const applyPointerRatio = (resolution: PointerResolution, session: PointerSession) => {
    // The hit test reads the raw pointer coordinate. The damping curve below only shapes
    // where the knob is drawn, so the selected step is always the nearest step to the pointer.
    const rawPosition = resolution.ratio * maxIndex;
    const nextIndex = Math.min(maxIndex, Math.max(0, Math.round(rawPosition)));
    if (nextIndex !== session.lastIndex) {
      session.lastIndex = nextIndex;
      setDisplayIndex(nextIndex);
      const nextStep = steps[nextIndex];
      if (nextStep) onPreviewRef.current?.(nextStep.value);
    }
    // Land in place: past the tolerance band the knob stops following the pointer and sits on
    // the step the hit test already chose, instead of tracking a coordinate outside the track.
    if (resolution.overhangPx > DRAG_EXIT_TOLERANCE_PX) {
      const settledRatio = stepRatio(nextIndex, stepCount);
      setDragRatio(current => (current !== null && Math.abs(current - settledRatio) < RATIO_EPSILON ? current : settledRatio));
      return;
    }
    const nextRatio = dampedLadderRatio(rawPosition, stepCount);
    setDragRatio(current => (current !== null && Math.abs(current - nextRatio) < RATIO_EPSILON ? current : nextRatio));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!NAVIGATION_KEYS.has(event.key)) return;
    // The focused slider owns these keys: keep them out of ancestors and page scrolling.
    event.preventDefault();
    event.stopPropagation();
    if (disabled || pending || maxIndex === 0) return;

    const pageStep = Math.max(1, Math.round(stepCount * 0.1));
    let targetIndex: number;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        targetIndex = displayIndex - 1;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        targetIndex = displayIndex + 1;
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = maxIndex;
        break;
      case 'PageUp':
        targetIndex = displayIndex + pageStep;
        break;
      case 'PageDown':
        targetIndex = displayIndex - pageStep;
        break;
      default:
        return;
    }

    const nextIndex = Math.min(maxIndex, Math.max(0, targetIndex));
    if (nextIndex === displayIndex) return;
    const nextStep = steps[nextIndex];
    if (!nextStep) return;
    // The knob and the step name move immediately; the commit is merged by a trailing timer
    // so a burst of key presses settles into exactly one commit with the final step.
    setDisplayIndex(nextIndex);
    onPreviewRef.current?.(nextStep.value);
    queueCommit(nextStep.value);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || pending) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // Any keyboard value that has not settled yet is delivered before the pointer takes over,
    // so the pointer settle is the last commit the caller sees.
    flushPendingCommit();
    const session: PointerSession = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      dragging: false,
      lastIndex: displayIndex,
    };
    pointerRef.current = session;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const resolution = resolvePointer(event.clientX, event.clientY);
    if (resolution) applyPointerRatio(resolution, session);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (disabled || pending) return;
    if (!session.dragging) {
      const travel = Math.hypot(event.clientX - session.originX, event.clientY - session.originY);
      // Press-and-hold must not switch to dragging: only real travel disables the transition.
      if (travel <= DRAG_START_DISTANCE_PX) return;
      session.dragging = true;
      setDragging(true);
    }
    const resolution = resolvePointer(event.clientX, event.clientY);
    if (resolution) applyPointerRatio(resolution, session);
  };

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    if (session.dragging) setDragging(false);
    // Releasing snaps the knob off the damped path and back onto the settled step.
    setDragRatio(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (disabled || pending) return;
    const settledStep = steps[Math.min(maxIndex, Math.max(0, session.lastIndex))];
    if (!settledStep) return;
    onCommitRef.current(settledStep.value);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    finishPointer(event);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    finishPointer(event);
  };

  // Ticks are keyed by the step rank and rebuilt only when the ladder length changes, so the
  // track never remounts while the committed value moves.
  const tickRatios = React.useMemo(
    () => Array.from({ length: stepCount }, (_, index) => ({
      rank: steps[index]?.rank ?? index,
      ratio: stepRatio(index, stepCount),
    })),
    [stepCount, steps],
  );

  const activeStep = steps[displayIndex];
  const visualRatio = dragRatio ?? stepRatio(displayIndex, stepCount);
  const sliderState: SliderState = disabled ? 'disabled' : pending ? 'pending' : dragging ? 'dragging' : 'idle';
  const reducedMotion = isReducedMotionPreferred();
  const rootClassName = className ? `opc-reasoning-slider ${className}` : 'opc-reasoning-slider';
  // The top step is the only one that lights the knob and the header value up, so the
  // stylesheet reads one attribute instead of comparing indices it cannot see.
  const atApex = displayIndex === maxIndex && stepCount > 1;
  // One inherited custom property drives both the fill and the knob, so nothing but a style
  // value changes as steps or the committed value move; the nodes themselves never remount.
  const rootStyle = { '--_slider-ratio': visualRatio.toFixed(4) } as React.CSSProperties;

  // Grid geometry lives in an inline style because the block size depends on the measured track
  // and the current device scale, neither of which a stylesheet can see.
  const matrixStyle: React.CSSProperties | undefined = React.useMemo(() => {
    if (!atApex || !matrixField) return undefined;
    return {
      columnGap: `${matrixField.gapPx}px`,
      rowGap: `${matrixField.gapPx}px`,
      // Top and bottom are resolved separately: the leftover device pixels split one by one, so a
      // 26px groove still centres the rows exactly instead of rounding the whole padding down.
      paddingBlockStart: `${matrixField.padBlockStartPx}px`,
      paddingBlockEnd: `${matrixField.padBlockEndPx}px`,
      paddingInlineStart: `${matrixField.padInlineStartPx}px`,
      paddingInlineEnd: `${matrixField.padInlineEndPx}px`,
      gridTemplateColumns: `repeat(${matrixField.cols}, ${matrixField.blockPx}px)`,
      gridAutoRows: `${matrixField.blockPx}px`,
    };
  }, [atApex, matrixField]);

  useLayoutEffect(() => {
    // The matrix only exists at the top step; measuring it otherwise would cost a layout read
    // on every step change for a layer nobody can see.
    if (!atApex) return undefined;
    const groove = grooveRef.current;
    if (!groove) return undefined;
    let disposed = false;

    const measure = () => {
      if (disposed) return;
      const rect = groove.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      const geometry = solveMatrix(
        Math.round(rect.width * dpr),
        Math.round((rect.height || MATRIX_GROOVE_FALLBACK_PX) * dpr),
        dpr,
      );
      const flashPeriodMs = resolveFlashPeriodMs(groove);
      const next = buildMatrix(geometry, flashPeriodMs, reducedMotion);
      setMatrixField(current => (sameMatrixField(current, next) ? current : next));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return () => { disposed = true; };
    const observer = new ResizeObserver(measure);
    observer.observe(groove);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [atApex, reducedMotion]);

  return (
    <div
      ref={rootRef}
      className={rootClassName}
      style={rootStyle}
      data-opc-component="model-selector"
      data-opc-part="reasoningSliderTrack"
      data-testid="chat-model-selector-reasoning-slider"
      data-reasoning-slider-state={sliderState}
      data-reasoning-reduced-motion={reducedMotion ? 'true' : undefined}
      data-apex={atApex ? 'true' : undefined}
      data-overflow-trigger="true"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={steps.length - 1}
      aria-valuenow={displayIndex}
      aria-valuetext={activeStep?.label ?? ''}
      aria-disabled={disabled}
      onKeyDown={handleKeyDown}
      onBlur={flushPendingCommit}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="opc-reasoning-slider__header" aria-hidden="true">
        {title ? <span className="opc-reasoning-slider__title">{title}</span> : null}
        <div className="opc-reasoning-slider__value">
          <OverflowText behavior="fade">{activeStep?.label ?? ''}</OverflowText>
        </div>
      </div>
      <div
        className="opc-reasoning-slider__axis"
        data-opc-component="model-selector"
        data-opc-part="reasoningSliderAxis"
      >
        <span className="opc-reasoning-slider__caption">{weakerLabel}</span>
        <span className="opc-reasoning-slider__caption">{strongerLabel}</span>
      </div>
      <div
        ref={railRef}
        className="opc-reasoning-slider__rail"
        data-opc-component="model-selector"
        data-opc-part="reasoningSliderRail"
      >
        <span ref={grooveRef} className="opc-reasoning-slider__groove" aria-hidden="true" />
        <div
          className="opc-reasoning-slider__fill"
          data-opc-component="model-selector"
          data-opc-part="reasoningSliderFill"
        />
        <div
          className="opc-reasoning-slider__ticks"
          data-opc-component="model-selector"
          data-opc-part="reasoningSliderTicks"
          aria-hidden="true"
        >
          {tickRatios.map((tick) => (
            <span
              key={tick.rank}
              className="opc-reasoning-slider__tick"
              style={{ '--_slider-tick-ratio': tick.ratio.toFixed(4) } as React.CSSProperties}
            />
          ))}
        </div>
        {atApex ? (
          <div
            className="opc-reasoning-slider__matrix"
            data-opc-component="model-selector"
            data-opc-part="reasoningSliderMatrix"
            aria-hidden="true"
            style={matrixStyle}
          >
            {matrixField?.cells.map(cell => (
              <span
                key={cell.key}
                className="opc-reasoning-slider__matrix-cell"
                style={matrixCellStyle(cell)}
              >
                <span className="opc-reasoning-slider__matrix-square" data-tone={cell.tone} style={matrixSquareStyle(cell)} />
              </span>
            ))}
          </div>
        ) : null}
        <div
          ref={knobRef}
          className="opc-reasoning-slider__knob"
          data-opc-component="model-selector"
          data-opc-part="reasoningSliderKnob"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};
