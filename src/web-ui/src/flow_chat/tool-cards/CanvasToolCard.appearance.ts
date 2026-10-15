import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const canvasToolCardAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'canvas-tool-card',
  parts: [
    { id: 'root' }, { id: 'title' }, { id: 'extra' }, { id: 'diagnostics' },
    { id: 'status' }, { id: 'body' }, { id: 'sourcePreview' }, { id: 'meta' },
    { id: 'diagnosticList' },
  ],
  states: [
    { id: 'clickable', selector: { kind: 'self', suffix: '[data-opc-state~="clickable"]' } },
    { id: 'failed', selector: { kind: 'self', suffix: '[data-opc-state~="failed"]' } },
    { id: 'loading', selector: { kind: 'self', suffix: '[data-opc-state~="loading"]' } },
  ],
};
