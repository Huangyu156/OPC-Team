const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const POINTER_INTENT_WINDOW_MS = 1500;

/**
 * Attribute carrying the resolved motion answer on the document element.
 * Stylesheets cannot rewrite their own media query, so the resolved value is
 * published once (never a user intent such as `auto`); CSS, future settings
 * surfaces and the skin layer read this instead of re-querying matchMedia.
 */
export const MOTION_MODE_ATTRIBUTE = 'data-opc-motion';

export type MotionAwareScrollBehavior = 'auto' | 'smooth';
export type InteractionModality = 'keyboard' | 'pointer' | 'programmatic';
export type InteractionMotion = 'instant' | 'pointer';
/** Resolved motion answer: only these two values are ever published. */
export type MotionMode = 'full' | 'reduced';

let lastInteractionModality: InteractionModality = 'programmatic';
let lastInteractionAt = Number.NEGATIVE_INFINITY;
let removeInteractionModalityListeners: (() => void) | null = null;
let removeMotionModeMirror: (() => void) | null = null;

function interactionNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

/**
 * Records the input source that should own the next state transition.
 *
 * Pointer intent is deliberately short-lived: a click-triggered async preload
 * may resolve on a later task, while unrelated background updates must not
 * inherit motion from an old click.
 */
export function recordInteractionModality(modality: InteractionModality): void {
  lastInteractionModality = modality;
  lastInteractionAt = interactionNow();
}

export function getInteractionMotion(): InteractionMotion {
  const pointerIsCurrent = lastInteractionModality === 'pointer'
    && interactionNow() - lastInteractionAt <= POINTER_INTENT_WINDOW_MS;
  return pointerIsCurrent ? 'pointer' : 'instant';
}

/**
 * Installs one capture-phase modality tracker for the application shell.
 * Keyboard activation stays instant; mouse, pen, and touch clicks can opt into
 * the subtle spatial transitions exposed by `getInteractionMotion`.
 */
export function installInteractionModalityTracking(
  target: Document | undefined = globalThis.document,
): () => void {
  if (!target) return () => {};
  if (removeInteractionModalityListeners) return removeInteractionModalityListeners;

  const handlePointerDown = () => recordInteractionModality('pointer');
  const handleKeyDown = () => recordInteractionModality('keyboard');
  target.addEventListener('pointerdown', handlePointerDown, true);
  target.addEventListener('keydown', handleKeyDown, true);

  removeInteractionModalityListeners = () => {
    target.removeEventListener('pointerdown', handlePointerDown, true);
    target.removeEventListener('keydown', handleKeyDown, true);
    removeInteractionModalityListeners = null;
  };
  return removeInteractionModalityListeners;
}

/**
 * Single truth source for "should this surface animate".
 *
 * Callers read the resolved answer instead of querying the media query
 * themselves; a platform without matchMedia resolves to full motion.
 */
export function resolveMotionMode(): MotionMode {
  const preference = globalThis.matchMedia?.(REDUCED_MOTION_QUERY);
  return preference?.matches ? 'reduced' : 'full';
}

/**
 * Installs the document-level mirror of the resolved motion mode.
 *
 * The attribute is written once on install and re-resolved on every media query
 * change, so CSS and non-React consumers see the same answer the hooks read.
 * Idempotent: repeated calls return the active disposer. Teardown removes the
 * attribute so a torn-down shell leaves no stale motion contract behind.
 */
export function installMotionModeMirror(
  target: Document | undefined = globalThis.document,
): () => void {
  if (!target) return () => {};
  if (removeMotionModeMirror) return removeMotionModeMirror;

  const apply = () => {
    target.documentElement?.setAttribute(MOTION_MODE_ATTRIBUTE, resolveMotionMode());
  };
  const media = globalThis.matchMedia?.(REDUCED_MOTION_QUERY) ?? null;
  apply();
  media?.addEventListener?.('change', apply);

  removeMotionModeMirror = () => {
    media?.removeEventListener?.('change', apply);
    target.documentElement?.removeAttribute(MOTION_MODE_ATTRIBUTE);
    removeMotionModeMirror = null;
  };
  return removeMotionModeMirror;
}

export function isReducedMotionPreferred(): boolean {
  return resolveMotionMode() === 'reduced';
}

/**
 * Subscribe to resolved motion-mode changes.
 *
 * The listener receives the resolved answer, never the raw media query event,
 * so consumers do not re-derive the truth source themselves. Each subscription
 * owns one MediaQueryList; dispose it when the owning component unmounts.
 */
export function subscribeMotionModeChange(
  listener: (mode: MotionMode) => void,
): () => void {
  const media = globalThis.matchMedia?.(REDUCED_MOTION_QUERY);
  if (!media?.addEventListener) return () => {};
  const handleChange = () => listener(resolveMotionMode());
  media.addEventListener('change', handleChange);
  return () => media.removeEventListener?.('change', handleChange);
}

/**
 * Preserve occasional spatial navigation while respecting reduced motion.
 * Automatic, keyboard-repeated, and other high-frequency paths should pass
 * `auto` directly instead of opting into smooth scrolling.
 */
export function getMotionAwareScrollBehavior(
  preferredBehavior: MotionAwareScrollBehavior,
): MotionAwareScrollBehavior {
  if (preferredBehavior !== 'smooth') {
    return preferredBehavior;
  }

  return isReducedMotionPreferred()
    ? 'auto'
    : preferredBehavior;
}
