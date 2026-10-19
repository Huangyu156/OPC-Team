/**
 * @vitest-environment jsdom
 */

import { activateSurface } from '@/infrastructure/peer-device/deviceSurface';
import { act, cloneElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelSelector } from './ModelSelector';
import { configManager } from '@/infrastructure/config/services/ConfigManager';
import { agentAPI } from '@/infrastructure/api/service-api/AgentAPI';
import { notificationStore } from '@/shared/notification-system';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const aiApiMocks = vi.hoisted(() => ({
  getModelCatalog: vi.fn(),
  onModelCatalogUpdated: vi.fn(),
}));

const flowChatStoreMocks = vi.hoisted(() => {
  type TestSession = {
    config: { agentType?: string; modelName?: string; reasoningPreset?: string };
  };
  const sessions = new Map<string, TestSession>();
  const subscribers = new Set<() => void>();
  const store = {
    getState: () => ({ sessions }),
    subscribe: vi.fn((callback: () => void) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    }),
    updateSessionModelName: vi.fn(),
    updateSessionReasoningPreset: vi.fn(),
    updateSessionMaxContextTokens: vi.fn(),
    updateAcpContextUsage: vi.fn(),
  };
  return { sessions, subscribers, store };
});

vi.mock('@/infrastructure/api/service-api/AIApi', () => ({
  aiApi: aiApiMocks,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@opc-team/ui', async importOriginal => ({
  ...await importOriginal<typeof import('@opc-team/ui')>(),
  Tooltip: ({ children, content, disabled }: {
    children: React.ReactElement<{ 'data-tooltip'?: string }>;
    content?: React.ReactNode;
    disabled?: boolean;
  }) => cloneElement(children, {
    'data-tooltip': !disabled && typeof content === 'string' ? content : undefined,
  }),
  Switch: () => null,
}));

vi.mock('@/infrastructure/config/services/ConfigManager', () => ({
  configManager: {
    getConfigs: vi.fn(),
    onConfigChange: vi.fn(() => () => undefined),
    setConfig: vi.fn(async () => undefined),
  },
}));

vi.mock('@/infrastructure/api/service-api/AgentAPI', () => ({
  agentAPI: { updateSessionModel: vi.fn(async () => undefined) },
}));

vi.mock('@/infrastructure/api/service-api/ACPClientAPI', () => ({
  ACPClientAPI: {
    getSessionOptions: vi.fn(),
    onSessionOptionsChanged: vi.fn(() => () => undefined),
  },
}));

vi.mock('../services/flow-chat-manager/SessionModule', () => ({
  getModelMaxTokens: vi.fn(async () => 128_000),
}));

vi.mock('@/infrastructure/event-bus', () => ({
  globalEventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock('../store/FlowChatStore', () => ({
  FlowChatStore: { getInstance: () => flowChatStoreMocks.store },
}));

const CATALOG_MODELS = [{
  id: 'ladder-model',
  name: 'Ladder',
  model_name: 'ladder-model-native',
  provider: 'openai',
  base_url: 'https://ladder.test/v1',
  enabled: true,
  category: 'text',
  capabilities: ['text_chat'],
}];

const effortLevel = (id: string, order: number) => ({
  id,
  label: id,
  order,
  source: 'models_dev',
  actions: [{ type: 'effort', value: id }],
});

const strengthTrigger = () => document.body.querySelector<HTMLDivElement>(
  '[data-opc-part="reasoningTrigger"]',
);

const strengthTriggerButton = () => document.body.querySelector<HTMLButtonElement>(
  '[data-testid="chat-model-selector-strength-trigger"]',
);

const slider = () => document.body.querySelector<HTMLElement>(
  '[data-testid="chat-model-selector-reasoning-slider"]',
);

describe('ModelSelector reasoning ladder', () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderSelector = async (presets: unknown[], selectedPreset: string) => {
    vi.mocked(configManager.getConfigs).mockResolvedValue({
      'ai.models': CATALOG_MODELS,
      'ai.default_models': { primary: 'ladder-model' },
      'ai.agent_model_defaults': { mode: 'primary' },
    });
    flowChatStoreMocks.sessions.set('session-a', {
      config: { agentType: 'Standard', modelName: 'ladder-model', reasoningPreset: selectedPreset },
    });
    aiApiMocks.getModelCatalog.mockResolvedValue({
      version: 1,
      default_models: { primary: 'ladder-model' },
      models: [{
        id: 'ladder-model',
        reasoning: { status: 'known', default_preset: selectedPreset, presets },
      }],
    });

    await act(async () => {
      root.render(
        <ModelSelector
          currentMode='Standard'
          sessionId='session-a'
          reasoningTriggerPresentation="label"
        />,
      );
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    activateSurface('local');
    vi.mocked(configManager.getConfigs).mockReset();
    vi.mocked(configManager.setConfig).mockReset().mockResolvedValue(undefined);
    aiApiMocks.getModelCatalog.mockReset();
    aiApiMocks.onModelCatalogUpdated.mockImplementation(() => () => undefined);
    vi.mocked(agentAPI.updateSessionModel).mockReset().mockResolvedValue(undefined);
    notificationStore.clearActiveNotifications();
    notificationStore.clearHistory();
    flowChatStoreMocks.sessions.clear();
    flowChatStoreMocks.subscribers.clear();
    flowChatStoreMocks.store.updateSessionReasoningPreset.mockImplementation((sessionId: string, preset?: string) => {
      const session = flowChatStoreMocks.sessions.get(sessionId);
      if (session) session.config.reasoningPreset = preset;
      flowChatStoreMocks.subscribers.forEach(callback => callback());
    });
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    });
    class TestResizeObserver {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    notificationStore.clearActiveNotifications();
    notificationStore.clearHistory();
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('gives three comparable effort levels a standalone seat beside the model trigger', async () => {
    await renderSelector([effortLevel('low', 10), effortLevel('medium', 20), effortLevel('high', 30)], 'medium');

    expect(container.querySelector('[data-opc-part="root"]')?.getAttribute('data-opc-reasoning-ladder'))
      .toBe('ranked');
    const seat = strengthTrigger();
    expect(seat).not.toBeNull();
    expect(strengthTriggerButton()?.textContent).toContain('reasoningSelector.levels.medium');
    expect(strengthTriggerButton()?.getAttribute('aria-haspopup')).toBe('menu');
    expect(strengthTriggerButton()?.getAttribute('aria-expanded')).toBe('false');
    // The seat precedes the model trigger, and the model trigger stops repeating the level.
    const modelTrigger = container.querySelector('[data-testid="chat-model-selector-btn"]');
    expect(seat?.parentElement?.firstElementChild).toBe(seat);
    expect(modelTrigger?.querySelector('[data-testid="chat-model-selector-trigger-reasoning"]')).toBeNull();
    // Nothing is rendered until the seat is opened.
    expect(slider()).toBeNull();
  });

  it('keeps a budget catalog on the segmented control and hides the seat', async () => {
    await renderSelector([
      { id: 'fast', label: 'Fast', order: 10, source: 'models_dev', actions: [{ type: 'budget_tokens', value: 1024 }] },
      { id: 'deep', label: 'Deep', order: 20, source: 'models_dev', actions: [{ type: 'budget_tokens', value: 8192 }] },
      effortLevel('high', 30),
    ], 'high');

    expect(container.querySelector('[data-opc-part="root"]')?.getAttribute('data-opc-reasoning-ladder'))
      .toBe('segmented');
    expect(strengthTrigger()).toBeNull();
  });

  it('exposes the whole ladder on the track and commits the settled step once', async () => {
    await renderSelector([effortLevel('low', 10), effortLevel('medium', 20), effortLevel('high', 30)], 'low');

    await act(async () => strengthTriggerButton()?.click());
    const track = slider();
    expect(track).not.toBeNull();
    expect(track?.getAttribute('role')).toBe('slider');
    expect(track?.getAttribute('aria-valuemin')).toBe('0');
    expect(track?.getAttribute('aria-valuemax')).toBe('2');
    expect(track?.getAttribute('aria-valuenow')).toBe('0');
    expect(track?.getAttribute('aria-valuetext')).toBe('reasoningSelector.levels.low');
    expect(track?.querySelectorAll('[data-opc-part="reasoningSliderKnob"]')).toHaveLength(1);
    expect(track?.querySelectorAll('[data-opc-part="reasoningSliderTicks"] > *')).toHaveLength(3);

    vi.useFakeTimers();
    await act(async () => {
      track?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(track?.getAttribute('aria-valuenow')).toBe('1');
    // Keyboard commits are merged: nothing is submitted until the trailing window closes.
    expect(agentAPI.updateSessionModel).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(agentAPI.updateSessionModel).toHaveBeenCalledTimes(1);
    expect(vi.mocked(agentAPI.updateSessionModel).mock.calls[0][0]).toMatchObject({
      sessionId: 'session-a',
      reasoningPreset: 'medium',
    });
  });

  it('keeps the track mounted across a language-independent rerender of the same session', async () => {
    await renderSelector([effortLevel('low', 10), effortLevel('medium', 20), effortLevel('high', 30)], 'medium');
    await act(async () => strengthTriggerButton()?.click());
    const before = slider();
    expect(before).not.toBeNull();

    await act(async () => {
      root.render(
        <ModelSelector currentMode='Standard' sessionId='session-a' reasoningTriggerPresentation="label" />,
      );
      await Promise.resolve();
    });
    // The overlay node is retained rather than remounted, so pointer state and focus survive.
    expect(slider()).toBe(before);
  });
});
