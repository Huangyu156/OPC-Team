import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const remoteConnectDialogAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'remote-connect-dialog',
  parts: [
    { id: 'root' },
    { id: 'sidebar' },
    { id: 'sidebarBrand' },
    { id: 'main' },
    { id: 'overview' },
    { id: 'overviewSection' },
    { id: 'overviewAction' },
    { id: 'sectionMarker' },
    { id: 'viewHeader' },
    { id: 'subtabs' },
    { id: 'panel' },
    { id: 'body' },
    { id: 'pairingCard' },
    { id: 'connections' },
    { id: 'botCard' },
    { id: 'status' },
    { id: 'error' },
  ],
  facets: [
    { id: 'view', attribute: 'data-opc-view', values: ['overview', 'network', 'bot', 'account'] },
    { id: 'group', attribute: 'data-opc-group', values: ['network', 'bot', 'account'] },
  ],
  states: [
    { id: 'authenticated', selector: { kind: 'self', suffix: '[data-opc-state~="authenticated"]' } },
    { id: 'connected', selector: { kind: 'self', suffix: '[data-opc-state~="connected"]' } },
    { id: 'disabled', selector: { kind: 'self', suffix: '[data-opc-state~="disabled"]' } },
  ],
};

export const remoteAccountPanelAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'remote-account-panel',
  parts: [
    { id: 'root' },
    { id: 'error' },
    { id: 'loading' },
    { id: 'scroll' },
    { id: 'form' },
    { id: 'actions' },
    { id: 'deviceList' },
    { id: 'deviceCard' },
  ],
  facets: [
    { id: 'view', attribute: 'data-opc-view', values: ['login', 'devices'] },
  ],
  states: [
    { id: 'offline', selector: { kind: 'self', suffix: '[data-opc-state~="offline"]' } },
    { id: 'current', selector: { kind: 'self', suffix: '[data-opc-state~="current"]' } },
    { id: 'syncing', selector: { kind: 'self', suffix: '[data-opc-state~="syncing"]' } },
  ],
};
