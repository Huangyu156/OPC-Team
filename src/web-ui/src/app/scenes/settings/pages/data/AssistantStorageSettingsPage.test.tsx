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

/**
 * The picker and the reveal buttons are host capabilities. The page must read
 * them from the runtime instead of assuming a desktop shell.
 */
function setDesktopRuntime(enabled: boolean) {
  if (enabled) {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: () => Promise.resolve(),
    };
    return;
  }
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

describe('AssistantStorageSettingsPage', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    setDesktopRuntime(true);
    mocks.getConfig.mockResolvedValue(null);
    mocks.getAssistantWorkspaceLocations.mockResolvedValue(defaultLocations());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setDesktopRuntime(false);
  });

  const flushPromises = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const renderPage = async () => {
    await act(async () => root.render(React.createElement(AssistantStorageSettingsPage)));
    await flushPromises();
  };

  const inputByTitle = (title: string) =>
    Array.from(container.querySelectorAll('input')).find((el) => el.getAttribute('title') === title);

  const rootInput = () =>
    container.querySelector<HTMLInputElement>('[data-testid="assistant-storage-root-input"]');

  const pickButton = () => container.querySelector('[data-testid="assistant-storage-pick-button"]');

  const applyButton = () =>
    container.querySelector<HTMLButtonElement>('[data-testid="assistant-storage-apply-button"]');

  const click = async (element: Element | null) => {
    expect(element).not.toBeNull();
    await act(async () => {
      element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const typeInto = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
  };

  it('shows the active root when no custom root is configured', async () => {
    await renderPage();

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

    await click(pickButton());

    expect(mocks.pickWorkspaceDirectory).toHaveBeenCalledTimes(1);
    expect(mocks.setConfig).toHaveBeenCalledWith('app.assistant_workspace_root', 'D:\\assistants');
    expect(inputByTitle('D:\\assistants')).not.toBeUndefined();
    expect(inputByTitle(CUSTOM_ROOT)).not.toBeUndefined();
    expect(inputByTitle(LEGACY_ROOT)).not.toBeUndefined();
  });

  it('keeps the current configuration when the picker is cancelled', async () => {
    mocks.pickWorkspaceDirectory.mockResolvedValue(null);

    await renderPage();

    await click(pickButton());

    expect(mocks.setConfig).not.toHaveBeenCalled();
  });

  it('persists an absolute path typed into the field', async () => {
    mocks.setConfig.mockResolvedValue(undefined);
    mocks.getAssistantWorkspaceLocations
      .mockResolvedValueOnce(defaultLocations())
      .mockResolvedValueOnce({ activeRoot: CUSTOM_ROOT, legacyRoot: LEGACY_ROOT, customRootActive: true });

    await renderPage();

    const input = rootInput();
    expect(input).not.toBeNull();
    await typeInto(input!, 'D:\\assistants');
    await click(applyButton());

    expect(mocks.pickWorkspaceDirectory).not.toHaveBeenCalled();
    expect(mocks.setConfig).toHaveBeenCalledWith('app.assistant_workspace_root', 'D:\\assistants');
    expect(inputByTitle(CUSTOM_ROOT)).not.toBeUndefined();
  });

  it('rejects a relative path without writing configuration', async () => {
    await renderPage();

    await typeInto(rootInput()!, 'assistants/local');
    await click(applyButton());

    expect(mocks.setConfig).not.toHaveBeenCalled();
    expect(container.textContent).toContain('messages.invalidPath');
  });

  it('degrades to typed input when the host has no native directory browser', async () => {
    setDesktopRuntime(false);

    await renderPage();

    expect(pickButton()).toBeNull();
    expect(container.querySelector('[data-testid="assistant-storage-manual-hint"]')).not.toBeNull();

    mocks.setConfig.mockResolvedValue(undefined);
    mocks.getAssistantWorkspaceLocations.mockResolvedValue({
      activeRoot: CUSTOM_ROOT,
      legacyRoot: LEGACY_ROOT,
      customRootActive: true,
    });

    await typeInto(rootInput()!, 'D:\\assistants');
    await click(applyButton());

    expect(mocks.pickWorkspaceDirectory).not.toHaveBeenCalled();
    expect(mocks.setConfig).toHaveBeenCalledWith('app.assistant_workspace_root', 'D:\\assistants');
    expect(container.textContent).toContain('messages.rootUpdated');
  });

  it('restores the default root through resetConfig', async () => {
    mocks.getConfig.mockResolvedValue('D:\\assistants');
    mocks.resetConfig.mockResolvedValue(undefined);
    mocks.getAssistantWorkspaceLocations
      .mockResolvedValueOnce({ activeRoot: CUSTOM_ROOT, legacyRoot: LEGACY_ROOT, customRootActive: true })
      .mockResolvedValueOnce(defaultLocations());

    await renderPage();

    const resetButton = container.querySelector('[data-testid="assistant-storage-reset-button"]');

    await click(resetButton);

    expect(mocks.resetConfig).toHaveBeenCalledWith('app.assistant_workspace_root');
    expect(inputByTitle(LEGACY_ROOT)).not.toBeUndefined();
  });
});
