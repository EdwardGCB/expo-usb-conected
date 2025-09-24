import { registerWebModule, NativeModule } from 'expo';

import { ExpoUsbConectedModuleEvents } from './ExpoUsbConected.types';

class ExpoUsbConectedModule extends NativeModule<ExpoUsbConectedModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ExpoUsbConectedModule, 'ExpoUsbConectedModule');
