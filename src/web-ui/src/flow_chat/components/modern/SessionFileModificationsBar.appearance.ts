import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const sessionFileModificationsBarAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'session-file-modifications-bar',
  parts: [
    { id: 'root' }, { id: 'header' }, { id: 'summary' }, { id: 'toggle' },
    { id: 'list' }, { id: 'file' }, { id: 'fileIcon' }, { id: 'fileName' },
    { id: 'fileSource' }, { id: 'fileError' }, { id: 'fileStats' },
  ],
  facets: [
    { id: 'layout', attribute: 'data-opc-layout', values: ['default', 'compact'] },
    { id: 'operation', attribute: 'data-opc-operation', values: ['write', 'delete', 'edit'] },
  ],
  states: [
    { id: 'expanded', selector: { kind: 'self', suffix: '[data-opc-state~="expanded"]' } },
    { id: 'error', selector: { kind: 'self', suffix: '[data-opc-state~="error"]' } },
  ],
};
