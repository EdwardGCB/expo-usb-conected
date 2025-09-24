import { NativeModule, requireNativeModule } from 'expo';

import { ExpoUsbConectedModuleEvents } from './ExpoUsbConected.types';

declare class ExpoUsbConectedModule extends NativeModule<ExpoUsbConectedModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoUsbConectedModule>('ExpoUsbConected');
