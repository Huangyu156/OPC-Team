import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const subagentAvatarAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'subagent-avatar',
  parts: [{ id: 'root' }],
  states: [
    { id: 'running', selector: { kind: 'self', suffix: '[data-opc-state~="running"]' } },
    { id: 'finishing', selector: { kind: 'self', suffix: '[data-opc-state~="finishing"]' } },
    { id: 'waiting', selector: { kind: 'self', suffix: '[data-opc-state~="waiting"]' } },
    { id: 'completed', selector: { kind: 'self', suffix: '[data-opc-state~="completed"]' } },
    { id: 'cancelled', selector: { kind: 'self', suffix: '[data-opc-state~="cancelled"]' } },
    { id: 'error', selector: { kind: 'self', suffix: '[data-opc-state~="error"]' } },
    { id: 'idle', selector: { kind: 'self', suffix: '[data-opc-state~="idle"]' } },
  ],
};
