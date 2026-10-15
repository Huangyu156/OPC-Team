import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const sessionNavigationAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'session-navigation',
  parts: [{ id: 'viewToggle', propertyProfile: 'control', visualRole: 'control' }],
  facets: [
    { id: 'action', attribute: 'data-opc-action', values: ['toggle-session-view'] },
  ],
  states: [
    { id: 'grouped', selector: { kind: 'self', suffix: '[data-opc-state~="grouped"]' } },
    { id: 'all', selector: { kind: 'self', suffix: '[data-opc-state~="all"]' } },
  ],
};
