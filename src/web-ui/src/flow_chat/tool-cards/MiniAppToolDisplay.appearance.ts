import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const miniAppToolDisplayAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'mini-app-tool-display',
  parts: [
    { id: 'root' }, { id: 'info' }, { id: 'operation' }, { id: 'command' },
    { id: 'output' }, { id: 'errorIndicator' }, { id: 'result' }, { id: 'rows' },
    { id: 'row' }, { id: 'label' }, { id: 'value' }, { id: 'actions' },
    { id: 'error' },
  ],
  states: [
    { id: 'expanded', selector: { kind: 'self', suffix: '[data-opc-state~="expanded"]' } },
    { id: 'failed', selector: { kind: 'self', suffix: '[data-opc-state~="failed"]' } },
    { id: 'loading', selector: { kind: 'self', suffix: '[data-opc-state~="loading"]' } },
  ],
};
