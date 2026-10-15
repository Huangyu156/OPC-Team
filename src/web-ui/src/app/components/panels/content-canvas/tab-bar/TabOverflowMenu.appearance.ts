import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';
export const canvasTabOverflowAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'canvas-tab-overflow',
  componentAttribute: 'data-opc-product-component',
  parts: [
    { id: 'root' }, { id: 'trigger' }, { id: 'badge' }, { id: 'itemTitle' },
  ],
  states: [
    { id: 'open', selector: { kind: 'self', suffix: '[data-opc-state~="open"]' } },
    { id: 'active', selector: { kind: 'self', suffix: '[data-opc-state~="active"]' } },
    { id: 'dirty', selector: { kind: 'self', suffix: '[data-opc-state~="dirty"]' } },
    { id: 'deleted', selector: { kind: 'self', suffix: '[data-opc-state~="deleted"]' } },
  ],
};
