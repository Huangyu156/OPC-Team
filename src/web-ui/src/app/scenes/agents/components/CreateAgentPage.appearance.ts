import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const createAgentPageAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'create-agent-page',
  parts: [
    { id: 'root' }, { id: 'editorBar' }, { id: 'body' },
    { id: 'heading' }, { id: 'actions' }, { id: 'form' },
    { id: 'columns' }, { id: 'column' }, { id: 'sectionHeading' },
    { id: 'field' }, { id: 'levelGroup' }, { id: 'levelOption' },
    { id: 'error' }, { id: 'tools' }, { id: 'tool' }, { id: 'promptEditor' },
    { id: 'contextPreview' }, { id: 'prompt' },
    { id: 'knowledgeBases' }, { id: 'knowledgeBaseRow' },
  ],
  states: [
    { id: 'loading', selector: { kind: 'self', suffix: '[data-opc-state~="loading"]' } },
    { id: 'error', selector: { kind: 'self', suffix: '[data-opc-state~="error"]' } },
    { id: 'active', selector: { kind: 'self', suffix: '[data-opc-state~="active"]' } },
  ],
};
