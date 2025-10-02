import { findDriverByUsbIds, isDeviceCompatible } from './driverManifests.js';

class DeviceCache {
  constructor() {
    this.devices = new Map();
    this.lastScanTime = null;
  }

  addDevice(deviceInfo) {
    const key = `${deviceInfo.vendorId}:${deviceInfo.productId}`;
    this.devices.set(key, deviceInfo);
  }

  getDevice(vendorId, productId) {
    const key = `${vendorId}:${productId}`;
    return this.devices.get(key);
  }

  getAllDevices() {
    return Array.from(this.devices.values());
  }
}

const deviceCache = new DeviceCache();

export const detectDevices = async (scanDevices) => {
  console.log('🔍 Detectando dispositivos...');
  
  const usbDevices = await scanDevices();
  const compatibleDevices = [];
  
  for (const usbDevice of usbDevices) {
    if (isDeviceCompatible(usbDevice.vendorId, usbDevice.productId)) {
      const driverInfo = findDriverByUsbIds(usbDevice.vendorId, usbDevice.productId);
      
      if (driverInfo) {
        const deviceInfo = {
          ...usbDevice,
          driverId: driverInfo.driverId,
          manifest: driverInfo.manifest
        };
        
        deviceCache.addDevice(deviceInfo);
        compatibleDevices.push(deviceInfo);
      }
    }
  }
  
  return compatibleDevices;
};

export const getCachedDevices = () => deviceCache.getAllDevices();

export default { detectDevices, getCachedDevices };