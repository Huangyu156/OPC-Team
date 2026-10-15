import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';
export const canvasTabAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'canvas-tab',
  componentAttribute: 'data-opc-product-component',
  parts: [
    { id: 'root', propertyProfile: 'control', visualRole: 'continuous-surface', continuityGroup: 'canvas-tabs' },
    { id: 'typeIcon', propertyProfile: 'paint', visualRole: 'decoration' },
    { id: 'title', propertyProfile: 'paint', visualRole: 'content' },
    { id: 'dirtyIndicator', propertyProfile: 'paint', visualRole: 'decoration' },
    { id: 'action', propertyProfile: 'control', visualRole: 'control' },
  ],
  facets: [{ id: 'group', attribute: 'data-opc-group', values: ['primary', 'secondary', 'tertiary'] }],
  states: [
    { id: 'active', selector: { kind: 'self', suffix: '[data-opc-state~="active"]' } },
    { id: 'dirty', selector: { kind: 'self', suffix: '[data-opc-state~="dirty"]' } },
    { id: 'dragging', selector: { kind: 'self', suffix: '[data-opc-state~="dragging"]' } },
    { id: 'deleted', selector: { kind: 'self', suffix: '[data-opc-state~="deleted"]' } },
    { id: 'pinned', selector: { kind: 'self', suffix: '[data-opc-state~="pinned"]' } },
    { id: 'preview', selector: { kind: 'self', suffix: '[data-opc-state~="preview"]' } },
  ],
};
