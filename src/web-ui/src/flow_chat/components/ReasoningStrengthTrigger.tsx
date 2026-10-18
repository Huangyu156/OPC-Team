import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Menu, OverflowText, Tooltip, createOverlayPortal, subscribeOverlayInteraction } from '@opc-team/ui';
import { getAppearanceOverlayHost } from '@/infrastructure/appearance/runtime/AppearanceOverlayHost';
import { RetainedMountBoundary } from '@/shared/presence';
import { getModelSelectorDropdownLayout } from './modelSelectorDropdownPosition';
import { ReasoningStrengthSlider, type ReasoningStrengthStep } from './ReasoningStrengthSlider';
import './ReasoningStrengthTrigger.scss';

interface ReasoningStrengthTriggerProps {
  steps: ReasoningStrengthStep[];
  value: string;
  ariaLabel: string;
  title: string;
  weakerLabel: string;
  strongerLabel: string;
  presentation?: 'meter' | 'label';
  disabled?: boolean;
  pending?: boolean;
  onPreview?: (value: string) => void;
  onCommit: (value: string) => void;
  className?: string;
}

const TRIGGER_EXIT_DURATION_MS = 120;
const METER_STEP_COUNT = 4;

/**
 * Standalone effort seat that sits beside the model trigger instead of inside its menu.
 * The track lives in an overlay owned by this trigger, so the model card keeps carrying
 * only model and provider choices.
 */
export const ReasoningStrengthTrigger: React.FC<ReasoningStrengthTriggerProps> = ({
  steps,
  value,
  ariaLabel,
  title,
  weakerLabel,
  strongerLabel,
  presentation = 'label',
  disabled = false,
  pending = false,
  onPreview,
  onCommit,
  className,
}) => {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const activeIndex = Math.max(0, steps.findIndex(step => step.value === value));
  const activeStep = steps[activeIndex];
  const activeLabel = activeStep?.label ?? '';
  const meterFill = steps.length > 0
    ? Math.round(((activeIndex + 1) / steps.length) * METER_STEP_COUNT)
    : 0;

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setKeyboardOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    return subscribeOverlayInteraction(menuRef, 'mousedown', (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
    });
  }, [close, open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!anchor || !menu) return;
      const layout = getModelSelectorDropdownLayout(
        anchor,
        { width: menu.width, height: menu.height },
        'top',
        { width: window.innerWidth, height: window.innerHeight },
      );
      setMenuStyle(layout.style);
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  // A keyboard-opened menu hands the focus straight to the track, so the next key
  // press moves the level instead of tabbing out of the panel.
  useEffect(() => {
    if (!open || !keyboardOpen) return;
    menuRef.current?.querySelector<HTMLElement>('[data-testid="chat-model-selector-reasoning-slider"]')?.focus({ preventScroll: true });
  }, [keyboardOpen, open]);

  useEffect(() => {
    if (open && steps.length === 0) close(false);
  }, [close, open, steps.length]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };

  const state = pending ? 'pending' : disabled ? 'disabled' : open ? 'open' : 'idle';

  return (
    <div
      ref={rootRef}
      className={`opc-reasoning-strength ${className ?? ''}`}
      data-opc-component="model-selector"
      data-opc-part="reasoningTrigger"
      data-opc-state={state}
      data-opc-presentation={presentation}
    >
      <Tooltip content={`${ariaLabel}: ${activeLabel}`} disabled={open}>
        <button
          ref={triggerRef}
          type="button"
          data-testid="chat-model-selector-strength-trigger"
          data-overflow-trigger
          className="opc-reasoning-strength__trigger"
          aria-label={`${ariaLabel}: ${activeLabel}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-busy={pending || undefined}
          disabled={disabled || steps.length === 0}
          onClick={event => {
            const nextOpen = !open;
            setKeyboardOpen(event.detail === 0);
            setOpen(nextOpen);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              setKeyboardOpen(true);
              setOpen(true);
              return;
            }
            if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            }
          }}
        >
          {presentation === 'label' ? (
            <OverflowText behavior="fade" className="opc-reasoning-strength__label">
              {activeLabel}
            </OverflowText>
          ) : (
            <span className="opc-reasoning-strength__meter" aria-hidden="true">
              {Array.from({ length: METER_STEP_COUNT }, (_, index) => (
                <span
                  key={index}
                  className="opc-reasoning-strength__meter-cell"
                  data-filled={index < meterFill ? 'true' : undefined}
                />
              ))}
            </span>
          )}
        </button>
      </Tooltip>
      <RetainedMountBoundary present={open} retainForMs={TRIGGER_EXIT_DURATION_MS} minimumRetainMs={TRIGGER_EXIT_DURATION_MS}>
        {createOverlayPortal(
          <Menu
            id={menuId}
            ref={menuRef}
            className="opc-reasoning-strength__menu"
            data-opc-component="model-selector"
            data-opc-part="reasoningSliderMenu"
            data-testid="chat-model-selector-strength-menu"
            style={menuStyle}
            aria-hidden={!open}
            {...(!open ? { inert: '' } : {})}
            aria-label={title}
            onKeyDown={handleMenuKeyDown}
          >
            <div className="opc-reasoning-strength__panel">
              <span className="opc-reasoning-strength__caption">{title}</span>
              <ReasoningStrengthSlider
                steps={steps}
                value={value}
                ariaLabel={ariaLabel}
                weakerLabel={weakerLabel}
                strongerLabel={strongerLabel}
                pending={pending}
                onPreview={onPreview}
                onCommit={onCommit}
              />
            </div>
          </Menu>,
          getAppearanceOverlayHost(),
          null,
          { open, ownerRef: rootRef },
        )}
      </RetainedMountBoundary>
    </div>
  );
};
