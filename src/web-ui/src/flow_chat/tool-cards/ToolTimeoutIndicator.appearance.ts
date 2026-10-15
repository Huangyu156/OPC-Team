import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const toolTimeoutIndicatorAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'tool-timeout-indicator',
  parts: [
    { id: 'root' }, { id: 'duration' }, { id: 'elapsed' }, { id: 'timeout' },
    { id: 'controls' }, { id: 'toggle' }, { id: 'popover' }, { id: 'option' },
  ],
  facets: [{ id: 'mode', attribute: 'data-opc-mode', values: ['completed', 'live'] }],
  states: [
    { id: 'warning', selector: { kind: 'self', suffix: '[data-opc-state~="warning"]' } },
    { id: 'disabled', selector: { kind: 'self', suffix: '[data-opc-state~="disabled"]' } },
    { id: 'open', selector: { kind: 'self', suffix: '[data-opc-state~="open"]' } },
  ],
};
