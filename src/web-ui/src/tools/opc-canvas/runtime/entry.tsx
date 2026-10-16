import '@opc-team/design-tokens/tokens.css';
import './styles/canvas-runtime.scss';
import * as sdkAdapters from './sdk';
import { installOpcCanvasRuntimeApp } from './CanvasRuntimeApp';
import {
  CANVAS_RUNTIME_VERSION,
  CANVAS_SDK_RUNTIME_EXPORTS,
  CANVAS_SDK_VERSION,
} from './sdk/contract.generated';

declare global {
  interface Window {
    OpcCanvasSDKAdapters?: typeof sdkAdapters;
    OpcCanvasContract?: {
      runtimeVersion: string;
      sdkVersion: string;
    };
  }
}

const missingExports = CANVAS_SDK_RUNTIME_EXPORTS.filter(name => !(name in sdkAdapters));
if (missingExports.length > 0) {
  throw new Error(`Canvas SDK runtime contract is incomplete: ${missingExports.join(', ')}`);
}

window.OpcCanvasContract = {
  runtimeVersion: CANVAS_RUNTIME_VERSION,
  sdkVersion: CANVAS_SDK_VERSION,
};
window.OpcCanvasSDKAdapters = sdkAdapters;
installOpcCanvasRuntimeApp();
