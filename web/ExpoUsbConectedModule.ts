import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoUsbConectedModule extends NativeModule<any> {
  scanDevices(): Promise<
    {
      deviceName: string;
      vendorId: number;
      productId: number;
      manufacturerName?: string;
      productName?: string;
      serialNumber?: string;
      hasPermission: boolean;
    }[]
  >;

  requestPermission(deviceName: string): Promise<boolean>;
}

export default requireNativeModule<ExpoUsbConectedModule>('ExpoUsbConected');
