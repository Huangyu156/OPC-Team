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

  const rootRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
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
  // One inherited custom property drives both the fill and the knob, so nothing but a style
  // value changes as steps or the committed value move; the nodes themselves never remount.
  const rootStyle = { '--_slider-ratio': visualRatio.toFixed(4) } as React.CSSProperties;

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
      <div className="opc-reasoning-slider__value" aria-hidden="true">
        <OverflowText behavior="fade">{activeStep?.label ?? ''}</OverflowText>
      </div>
      <div
        className="opc-reasoning-slider__axis"
        data-opc-component="model-selector"
        data-opc-part="reasoningSliderAxis"
      >
        <span className="opc-reasoning-slider__caption">{weakerLabel}</span>
        <div
          ref={railRef}
          className="opc-reasoning-slider__rail"
          data-opc-component="model-selector"
          data-opc-part="reasoningSliderRail"
        >
          <span className="opc-reasoning-slider__groove" aria-hidden="true" />
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
          <div
            ref={knobRef}
            className="opc-reasoning-slider__knob"
            data-opc-component="model-selector"
            data-opc-part="reasoningSliderKnob"
            aria-hidden="true"
          />
        </div>
        <span className="opc-reasoning-slider__caption">{strongerLabel}</span>
      </div>
    </div>
  );
};
