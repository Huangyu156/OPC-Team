import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const userMessageEditComposerAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'user-message-edit-composer',
  componentAttribute: 'data-opc-product-component',
  parts: [{ id: 'root' }, { id: 'input' }, { id: 'actions' }, { id: 'action' }],
  facets: [
    { id: 'mode', attribute: 'data-opc-mode', values: ['rich', 'plain'] },
    { id: 'action', attribute: 'data-opc-action', values: ['cancel', 'submit'] },
  ],
  states: [
    { id: 'submitting', selector: { kind: 'ancestorPart', part: 'root', suffix: '[data-opc-state~="submitting"]' } },
  ],
};
