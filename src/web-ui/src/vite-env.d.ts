/// <reference types="vite/client" />

declare module 'virtual:opc-canvas-runtime-bundle' {
  const bundle: {
    js: string;
    css: string;
  };
  export const opcCanvasRuntimeBundle: typeof bundle;
  export default bundle;
}
