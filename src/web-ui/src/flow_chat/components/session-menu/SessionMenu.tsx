/**
 * Session menu shared by the floating chat surfaces (floating window mode and
 * the floating chat bubble).
 *
 * One "+" trigger opening one dropdown: one unified new session action, then
 * the recent sessions to switch to. Both surfaces mount this component
 * rather than each growing its own header affordances, so the interaction stays
 * identical and there is a single place to change it.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { subscribeOverlayInteraction, createOverlayPortal, OverflowText, Menu, MenuItem, MenuList, MenuSeparator } from '@openbitfun/ui';
import { Tooltip, Icon } from '@openbitfun/ui';
import { getAppearanceOverlayHost } from '@/infrastructure/appearance/runtime/AppearanceOverlayHost';
import { useAnchoredPopoverPosition } from '@/shared/utils/useAnchoredPopoverPosition';
import { activateMainSession } from '../../services/sessionActivation';
import { useFlowChatSessions } from './useFlowChatSessions';
import { resolveSessionTitle } from '../../utils/sessionTitle';
import { SessionTitleNumber } from '../SessionTitleNumber';
import './SessionMenu.scss';

interface SessionMenuProps {
  /** Notified when the dropdown opens/closes, so hosts can close their own menus. */
  onOpenChange?: (open: boolean) => void;
}

export const SessionMenu: React.FC<SessionMenuProps> = ({ onOpenChange }) => {
  const { t } = useTranslation('flow-chat');
  const { activeSessionId, sessions, titleNumbers } = useFlowChatSessions();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownLayout = useAnchoredPopoverPosition({
    open: isMenuOpen,
    anchorRef: triggerRef,
    popoverRef: dropdownRef,
    preferredPlacement: 'bottom',
    gap: 4,
    layoutRevision: sessions.length,
  });

  const setOpen = useCallback((open: boolean) => {
    setIsMenuOpen(open);
    onOpenChange?.(open);
  }, [onOpenChange]);

  const toggleMenu = useCallback(() => setOpen(!isMenuOpen), [isMenuOpen, setOpen]);

  const createSession = useCallback(() => {
    window.dispatchEvent(new CustomEvent('toolbar-create-session'));
    setOpen(false);
  }, [setOpen]);

  const switchSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    e.preventDefault();
    void activateMainSession(sessionId).then((activated) => {
      if (activated) setOpen(false);
    });
  }, [setOpen]);

  useEffect(() => {
    let removeOverlayMousedown0: (() => void) | undefined;
    if (!isMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };

    const timer = setTimeout(() => {
      removeOverlayMousedown0 = subscribeOverlayInteraction(dropdownRef, 'mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      removeOverlayMousedown0?.();
    };
  }, [isMenuOpen, setOpen]);

  // Escape closes the menu rather than the host surface behind it.
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || !isMenuOpen) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
  }, [isMenuOpen, setOpen]);

  return (
    <div
      ref={rootRef}
      className="opc-session-menu"
      data-opc-component="session-menu"
      data-opc-part="root"
      data-opc-state={isMenuOpen ? 'open' : undefined}
      onKeyDown={handleKeyDown}
    >
      <Tooltip content={t('toolCards.toolbar.openSessionMenu')}>
        <button
          ref={triggerRef}
          type="button"
          className={[
            'opc-session-menu__trigger',
            isMenuOpen ? 'opc-session-menu__trigger--open' : '',
          ].filter(Boolean).join(' ')}
          data-opc-component="session-menu"
          data-opc-part="trigger"
          onClick={toggleMenu}
          aria-expanded={isMenuOpen}
          aria-haspopup="listbox"
        >
          <Icon name="plus" size="sm" />
        </button>
      </Tooltip>

      {isMenuOpen && createOverlayPortal(
        <Menu
          className="opc-session-menu__dropdown"
          data-opc-component="session-menu"
          data-opc-part="dropdown"
          data-opc-placement={dropdownLayout?.placement ?? 'bottom'}
          ref={dropdownRef}
          style={{
            top: `${dropdownLayout?.top ?? 0}px`,
            left: `${dropdownLayout?.left ?? 0}px`,
            visibility: dropdownLayout ? 'visible' : 'hidden',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <MenuList className="opc-session-menu__actions" data-opc-component="session-menu" data-opc-part="actions">
            <MenuItem data-overflow-trigger
              type="button"
              className="opc-session-menu__item-row opc-session-menu__item-row--new opc-session-menu__item--new"
              data-opc-component="session-menu"
              data-opc-part="item"
              data-opc-item-kind="create"
              data-opc-session-kind="unified"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                createSession();
              }}
              leading={(
                <span className="opc-session-menu__item-icon" data-opc-component="session-menu" data-opc-part="itemIcon">
                  <Icon name="plus" size="sm" />
                </span>
              )}
            >
              <OverflowText className="opc-session-menu__item-label" data-opc-component="session-menu" data-opc-part="itemLabel">
                {t('toolCards.toolbar.newSessionItem')}
              </OverflowText>
            </MenuItem>
            <MenuSeparator className="opc-session-menu__divider" data-opc-component="session-menu" data-opc-part="divider" />
          </MenuList>

          <MenuList
            className="opc-session-menu__scroll"
            data-opc-component="session-menu"
            data-opc-part="scroll"
            aria-label={t('session.switchSession')}
          >
            {sessions.map((session) => {
              const titleNumber = titleNumbers?.get(session.sessionId);
              return (
                <MenuItem
                  key={session.sessionId}
                  type="button"
                  role="menuitemradio"
                  checked={session.sessionId === activeSessionId}
                  className={[
                    'opc-session-menu__item-row',
                    session.sessionId === activeSessionId ? 'opc-session-menu__item-row--active' : '',
                  ].filter(Boolean).join(' ')}
                  data-opc-component="session-menu"
                  data-opc-part="item"
                  data-opc-item-kind="session"
                  data-opc-state={session.sessionId === activeSessionId ? 'active' : undefined}
                  // Root cause: the index used to be a MenuItem child, which ActionItem
                  // nests inside the label's own overflow slot. That slot is a block box,
                  // so a wider index wrapped onto its own line and jammed against the row
                  // edge instead of holding a trailing column. The metadata prop renders it
                  // in ActionItem's dedicated trailing slot (flex: 0 0 auto, nowrap), so the
                  // menu reserves and aligns that space without pushing the label.
                  metadata={titleNumber ? <SessionTitleNumber number={titleNumber} /> : undefined}
                  onMouseDown={(e) => switchSession(e, session.sessionId)}
                >
                  <OverflowText>{resolveSessionTitle(session, t)}</OverflowText>
                </MenuItem>
              );
            })}
          </MenuList>
        </Menu>,
        getAppearanceOverlayHost(),
      )}
    </div>
  );
};

export default SessionMenu;
