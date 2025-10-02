import { requireNativeModule } from "expo-modules-core";

// Interfaz para definir la estructura de un dispositivo USB
export interface UsbDevice {
  deviceName: string;
  vendorId: number;
  productId: number;
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
  hasPermission: boolean;
}

// Interfaz del módulo nativo actualizada con todas las funciones necesarias
export interface ExpoUsbModule {
  scanDevices(): Promise<UsbDevice[]>;
  requestPermission(deviceName: string): Promise<boolean>;
  setAutoRequestPermissions(enabled: boolean): Promise<void>;
  openDevice(deviceName: string): Promise<boolean>;
  closeDevice(deviceName: string): Promise<boolean>;
  claimInterface(deviceName: string, interfaceNumber: number): Promise<boolean>;
  releaseInterface(deviceName: string, interfaceNumber: number): Promise<boolean>;
  writeData(deviceName: string, data: number[]): Promise<number>;
  readData(deviceName: string, timeout?: number): Promise<number[]>;
  sendTextCommand(deviceName: string, command: string): Promise<string>;
}

// Exportar el módulo nativo tipado
export default requireNativeModule<ExpoUsbModule>("ExpoUsbConected");