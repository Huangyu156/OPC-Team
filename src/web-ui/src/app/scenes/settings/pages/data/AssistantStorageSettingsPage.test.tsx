// @vitest-environment jsdom
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  resetConfig: vi.fn(),
  getAssistantWorkspaceLocations: vi.fn(),
  revealInExplorer: vi.fn(),
  pickWorkspaceDirectory: vi.fn(),
  t: (key: string) => key,
}));

vi.mock('@/infrastructure/config/services/ConfigManager', () => ({
  configManager: {
    getConfig: mocks.getConfig,
    setConfig: mocks.setConfig,
    resetConfig: mocks.resetConfig,
  },
}));

vi.mock('@/infrastructure/api', () => ({
  globalAPI: {
    getAssistantWorkspaceLocations: mocks.getAssistantWorkspaceLocations,
  },
  workspaceAPI: {
    revealInExplorer: mocks.revealInExplorer,
  },
}));

vi.mock('@/infrastructure/peer-device/pickWorkspaceDirectory', () => ({
  pickWorkspaceDirectory: mocks.pickWorkspaceDirectory,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));

import AssistantStorageSettingsPage from './AssistantStorageSettingsPage';

const LEGACY_ROOT = 'C:\\Users\\tester\\.opcteam\\personal_assistant';
const CUSTOM_ROOT = 'D:\\assistants\\personal_assistant';

function defaultLocations() {
  return { activeRoot: LEGACY_ROOT, legacyRoot: LEGACY_ROOT, customRootActive: false };
}

describe('AssistantStorageSettingsPage', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockResolvedValue(null);
    mocks.getAssistantWorkspaceLocations.mockResolvedValue(defaultLocations());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const renderPage = async () => {
    await act(async () => root.render(React.createElement(AssistantStorageSettingsPage)));
  };

  const inputByTitle = (title: string) =>
    Array.from(container.querySelectorAll('input')).find((el) => el.getAttribute('title') === title);

  it('shows the active root when no custom root is configured', async () => {
    await renderPage();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(inputByTitle(LEGACY_ROOT)).not.toBeUndefined();
    expect(mocks.getAssistantWorkspaceLocations).toHaveBeenCalledTimes(1);
  });

  it('persists a picked directory as the configured root and refreshes locations', async () => {
    mocks.pickWorkspaceDirectory.mockResolvedValue('D:\\assistants');
    mocks.setConfig.mockResolvedValue(undefined);
    mocks.getAssistantWorkspaceLocations
      .mockResolvedValueOnce(defaultLocations())
      .mockResolvedValueOnce({ activeRoot: CUSTOM_ROOT, legacyRoot: LEGACY_ROOT, customRootActive: true });

    await renderPage();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const pickButton = container.querySelector('[data-testid="assistant-storage-pick-button"]');
    expect(pickButton).not.toBeNull();

    await act(async () => {
      pickButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.pickWorkspaceDirectory).toHaveBeenCalledTimes(1);
    expect(mocks.setConfig).toHaveBeenCalledWith('app.assistant_workspace_root', 'D:\\assistants');
    expect(inputByTitle('D:\\assistants')).not.toBeUndefined();
    expect(inputByTitle(CUSTOM_ROOT)).not.toBeUndefined();
    expect(inputByTitle(LEGACY_ROOT)).not.toBeUndefined();
  });

  it('keeps the current configuration when the picker is cancelled', async () => {
    mocks.pickWorkspaceDirectory.mockResolvedValue(null);

    await renderPage();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const pickButton = container.querySelector('[data-testid="assistant-storage-pick-button"]');
    expect(pickButton).not.toBeNull();

    await act(async () => {
      pickButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.setConfig).not.toHaveBeenCalled();
  });

  it('restores the default root through resetConfig', async () => {
    mocks.getConfig.mockResolvedValue('D:\\assistants');
    mocks.resetConfig.mockResolvedValue(undefined);
    mocks.getAssistantWorkspaceLocations
      .mockResolvedValueOnce({ activeRoot: CUSTOM_ROOT, legacyRoot: LEGACY_ROOT, customRootActive: true })
      .mockResolvedValueOnce(defaultLocations());

    await renderPage();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const resetButton = Array.from(container.querySelectorAll('button'))
      .find((el) => el.textContent === 'storage.customRoot.reset');
    expect(resetButton).not.toBeUndefined();

    await act(async () => {
      resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.resetConfig).toHaveBeenCalledWith('app.assistant_workspace_root');
    expect(inputByTitle(LEGACY_ROOT)).not.toBeUndefined();
  });
});
