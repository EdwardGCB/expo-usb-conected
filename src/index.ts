// Reexport the native module. On web, it will be resolved to ExpoUsbConectedModule.web.ts
// and on native platforms to ExpoUsbConectedModule.ts
export { default } from './ExpoUsbConectedModule';
export { default as ExpoUsbConectedView } from './ExpoUsbConectedView';
export * from  './ExpoUsbConected.types';
