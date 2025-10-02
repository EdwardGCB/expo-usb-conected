import { requireNativeModule } from "expo-modules-core";

const ExpoUsb = requireNativeModule("ExpoUsbConected");

export async function scanDevices() {
  return await ExpoUsb.scanDevices();
}

export async function requestPermission(deviceName: string) {
  return await ExpoUsb.requestPermission(deviceName);
}

// Funciones USB de lectura/escritura
export async function openDevice(deviceName: string) {
  return await ExpoUsb.openDevice(deviceName);
}

export async function closeDevice(deviceName: string) {
  return await ExpoUsb.closeDevice(deviceName);
}

export async function writeData(deviceName: string, data: number[]) {
  return await ExpoUsb.writeData(deviceName, data);
}

export async function readData(deviceName: string, timeout: number = 5000) {
  return await ExpoUsb.readData(deviceName, timeout);
}

export async function claimInterface(deviceName: string, interfaceNumber: number) {
  return await ExpoUsb.claimInterface(deviceName, interfaceNumber);
}

export async function releaseInterface(deviceName: string, interfaceNumber: number) {
  return await ExpoUsb.releaseInterface(deviceName, interfaceNumber);
}

// Funciones adicionales (opcionales por ahora)
export async function setAutoRequestPermissions(enabled: boolean) {
  try {
    return await ExpoUsb.setAutoRequestPermissions(enabled);
  } catch (error) {
    console.warn('setAutoRequestPermissions no disponible:', error);
  }
}

export async function clearPermissionRequests() {
  try {
    return await ExpoUsb.clearPermissionRequests();
  } catch (error) {
    console.warn('clearPermissionRequests no disponible:', error);
  }
}

export async function sendTextCommand(deviceName: string, command: string): Promise<string> {
  try {
    return await ExpoUsb.sendTextCommand(deviceName, command);
  } catch (error) {
    console.error('[ExpoUsbConected] Error en sendTextCommand:', error);
    throw error;
  }
}