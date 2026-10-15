import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const userMessageItemAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'user-message-item',
  componentAttribute: 'data-opc-product-component',
  parts: [
    { id: 'root' }, { id: 'main' }, { id: 'content' },
    { id: 'steeringTag' }, { id: 'meta' }, { id: 'actions' }, { id: 'images' }, { id: 'image' },
    { id: 'timestamp' }, { id: 'lightbox' }, { id: 'loading' },
  ],
  states: [
    { id: 'expanded', selector: { kind: 'self', suffix: '[data-opc-state~="expanded"]' } },
    { id: 'failed', selector: { kind: 'self', suffix: '[data-opc-state~="failed"]' } },
    { id: 'loading', selector: { kind: 'self', suffix: '[data-opc-state~="loading"]' } },
  ],
};
