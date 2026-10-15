import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const markdownEditorAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'markdown-editor',
  componentAttribute: 'data-opc-product-component',
  parts: [
    { id: 'root' }, { id: 'loading' }, { id: 'error' },
    { id: 'toolbar' }, { id: 'actions' }, { id: 'body' },
  ],
  facets: [{ id: 'view', attribute: 'data-opc-view', values: ['preview', 'markdown', 'source', 'ir'] }],
  states: [
    { id: 'loading', selector: { kind: 'self', suffix: '[data-opc-state~="loading"]' } },
    { id: 'error', selector: { kind: 'self', suffix: '[data-opc-state~="error"]' } },
  ],
};
