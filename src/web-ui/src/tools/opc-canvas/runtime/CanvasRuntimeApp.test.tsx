import { afterEach, describe, expect, it, vi } from 'vitest';

import { installOpcCanvasRuntimeApp } from './CanvasRuntimeApp';

type TestWindow = Window & {
  OpcCanvasSDK?: Record<string, unknown>;
  OpcCanvasSDKAdapters?: Record<string, unknown>;
  OpcCanvasRuntime?: Record<string, any>;
  OpcCanvasContract?: { runtimeVersion: string; sdkVersion: string };
  ReactDOM?: {
    createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
  };
};

const originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;
const originalDocument = (globalThis as typeof globalThis & { document?: Document }).document;

afterEach(() => {
  (globalThis as typeof globalThis & { window?: Window }).window = originalWindow;
  (globalThis as typeof globalThis & { document?: Document }).document = originalDocument;
});

function installTestDom() {
  const render = vi.fn();
  const postMessage = vi.fn();
  const rootElement = {
    innerHTML: '',
    querySelector: vi.fn(),
  } as unknown as HTMLElement;
  const testWindow = {
    parent: { postMessage },
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
    OpcCanvasSDK: { Fallback: true },
    OpcCanvasSDKAdapters: { Adapter: true },
    OpcCanvasRuntime: { fallback: true },
    OpcCanvasContract: { runtimeVersion: 'runtime_test', sdkVersion: 'sdk_test' },
    ReactDOM: {
      createRoot: vi.fn(() => ({ render })),
    },
  } as unknown as TestWindow;
  const testDocument = {
    getElementById: vi.fn(() => rootElement),
    querySelector: vi.fn(() => ({ getAttribute: () => 'rev_test' })),
  } as unknown as Document;

  (globalThis as typeof globalThis & { window?: TestWindow }).window = testWindow;
  (globalThis as typeof globalThis & { document?: Document }).document = testDocument;

  return { render, postMessage, rootElement, testWindow };
}

describe('CanvasRuntimeApp', () => {
  it('installs runtime hooks without removing fallback runtime fields', () => {
    const { testWindow } = installTestDom();

    installOpcCanvasRuntimeApp();

    expect(testWindow.OpcCanvasRuntime?.fallback).toBe(true);
    expect(testWindow.OpcCanvasRuntime?.h).toBeTypeOf('function');
    expect(testWindow.OpcCanvasRuntime?.Fragment).toBeTruthy();
  });

  it('merges SDK adapters on module start and posts startup event', () => {
    const { postMessage, testWindow } = installTestDom();

    installOpcCanvasRuntimeApp();
    testWindow.OpcCanvasRuntime?.moduleStarted();

    expect(testWindow.OpcCanvasSDK).toMatchObject({ Fallback: true, Adapter: true });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'opc-canvas-module-started',
        sourceRevisionSeen: 'rev_test',
      }),
      '*',
    );
  });

  it('mounts user components through the bundled React runtime app', () => {
    const { render, postMessage, testWindow } = installTestDom();
    function Canvas() {
      return null;
    }

    installOpcCanvasRuntimeApp();
    testWindow.OpcCanvasRuntime?.mount(Canvas);

    expect(testWindow.ReactDOM?.createRoot).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'opc-canvas-ready' }),
      '*',
    );
    const runtimeRoot = render.mock.calls[0][0] as React.ReactElement<{ onReady: () => void }>;
    runtimeRoot.props.onReady();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'opc-canvas-ready',
        sourceRevisionSeen: 'rev_test',
        runtimeVersion: 'runtime_test',
        sdkVersion: 'sdk_test',
      }),
      '*',
    );
  });
});
