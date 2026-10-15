import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const realtimeVoiceCallAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'realtime-voice-call',
  componentAttribute: 'data-opc-product-component',
  parts: [
    { id: 'root' },
  ],
  facets: [
    {
      id: 'phase',
      attribute: 'data-opc-phase',
      values: ['connecting', 'live', 'ending', 'error'],
    },
  ],
  states: [
    { id: 'idle', selector: { kind: 'self', suffix: '[data-opc-state~="idle"]' } },
    { id: 'connecting', selector: { kind: 'self', suffix: '[data-opc-state~="connecting"]' } },
    { id: 'live', selector: { kind: 'self', suffix: '[data-opc-state~="live"]' } },
    { id: 'ending', selector: { kind: 'self', suffix: '[data-opc-state~="ending"]' } },
    { id: 'error', selector: { kind: 'self', suffix: '[data-opc-state~="error"]' } },
    { id: 'starting', selector: { kind: 'self', suffix: '[data-opc-state~="starting"]' } },
    { id: 'working', selector: { kind: 'self', suffix: '[data-opc-state~="working"]' } },
    { id: 'usingTools', selector: { kind: 'self', suffix: '[data-opc-state~="using-tools"]' } },
    { id: 'waitingApproval', selector: { kind: 'self', suffix: '[data-opc-state~="waiting-approval"]' } },
    { id: 'needsInput', selector: { kind: 'self', suffix: '[data-opc-state~="needs-input"]' } },
    { id: 'finishing', selector: { kind: 'self', suffix: '[data-opc-state~="finishing"]' } },
    { id: 'stopping', selector: { kind: 'self', suffix: '[data-opc-state~="stopping"]' } },
  ],
};
