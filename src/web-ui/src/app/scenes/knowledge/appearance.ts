import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance/types';

/**
 * Knowledge scene Appearance contract.
 *
 * Parts mirror the visible structure: a base navigator on the left and an entry
 * or ledger workspace on the right. State tokens stay limited to the two the
 * scene actually renders so every state has a real DOM source.
 */
export const knowledgeSceneAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'knowledge',
  parts: [
    { id: 'root' },
    { id: 'sidebar' },
    { id: 'sidebarHeader' },
    { id: 'sidebarTitle' },
    { id: 'sidebarActions' },
    { id: 'sidebarContent' },
    { id: 'sidebarLoading' },
    { id: 'sidebarError' },
    { id: 'sidebarEmpty' },
    { id: 'baseList' },
    { id: 'baseItem' },
    { id: 'baseItemIcon' },
    { id: 'baseItemLabel' },
    { id: 'baseItemMeta' },
    { id: 'main' },
    { id: 'header' },
    { id: 'headerTitle' },
    { id: 'headerSubtitle' },
    { id: 'headerActions' },
    { id: 'toolbar' },
    { id: 'viewSwitch' },
    { id: 'search' },
    { id: 'searchChannel' },
    { id: 'searchAnswer' },
    { id: 'entries' },
    { id: 'loading' },
    { id: 'error' },
    { id: 'empty' },
    { id: 'entry' },
    { id: 'entryTitle' },
    { id: 'entryPreview' },
    { id: 'entryMeta' },
    { id: 'entryMetaItem' },
    { id: 'entryActions' },
    { id: 'ledger' },
    { id: 'ledgerLoading' },
    { id: 'ledgerError' },
    { id: 'ledgerEmpty' },
    { id: 'ledgerList' },
    { id: 'ledgerRow' },
    { id: 'ledgerAction' },
    { id: 'ledgerTime' },
    { id: 'ledgerReason' },
    { id: 'placeholder' },
    { id: 'unavailable' },
    { id: 'form' },
    { id: 'field' },
    { id: 'fieldLabel' },
  ],
  facets: [
    { id: 'view', attribute: 'data-opc-view', values: ['entries', 'ledger'] },
  ],
  states: [
    { id: 'selected', selector: { kind: 'self', suffix: '[data-opc-state~="selected"]' } },
    { id: 'empty', selector: { kind: 'self', suffix: '[data-opc-state~="empty"]' } },
    { id: 'hover', selector: { kind: 'self', suffix: ':hover' } },
    { id: 'focusVisible', selector: { kind: 'self', suffix: ':focus-visible' } },
  ],
};
