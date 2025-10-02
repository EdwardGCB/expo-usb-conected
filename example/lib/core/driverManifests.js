/*
 * Driver Manifests - Configuración de dispositivos compatibles
 * Basado en el flujo de Tidepool Uploader adaptado para móvil
 */

// Configuración del dispositivo Abbott FreeStyle Optium Neo
const ABBOTT_FREESTYLE_OPTIUM_NEO = {
  name: 'Abbott FreeStyle Optium Neo',
  manufacturer: 'Abbott',
  model: 'FreeStyle Optium Neo',
  driverId: 'AbbottFreeStyleOptiumNeo',
  
  // Identificación USB
  vendorId: 6753, // 0x1A61
  productId: 14416, // 0x3850
  
  // Protocolo de comunicación
  protocol: 'HID',
  connectionType: 'USB',
  
  // Configuración del protocolo HID
  hidConfig: {
    frameSize: 64,
    initSequence: [0x04, 0x05, 0x15, 0x01],
    textCommands: {
      serialNumber: '$serlnum?',
      date: '$date?',
      time: '$time?',
      results: '$result?'
    }
  },
  
  // Configuración de endpoints USB
  usbConfig: {
    interfaceClass: 3, // USB_CLASS_HID
    endpoints: {
      in: 0x81,
      out: 0x01
    }
  },
  
  // Configuración de datos
  dataConfig: {
    recordTypes: {
      GLUCOSE: 7,
      KETONE: 9,
      INSULIN: 10,
      BASAL_TITRATION: 11,
      TIME_CHANGE: 6
    },
    units: {
      glucose: 'mg/dL',
      ketone: 'mmol/L'
    }
  },
  
  // Configuración de UI
  uiConfig: {
    icon: '🩸',
    color: '#E30613',
    description: 'Conecta el glucómetro con cable micro-USB',
    instructions: [
      '1. Conecta el cable micro-USB al glucómetro',
      '2. Conecta el otro extremo al dispositivo móvil',
      '3. Asegúrate de que el glucómetro esté encendido',
      '4. Presiona cualquier botón para activar la comunicación'
    ]
  }
};

// Registro de todos los drivers disponibles
const DRIVER_MANIFESTS = {
  'AbbottFreeStyleOptiumNeo': ABBOTT_FREESTYLE_OPTIUM_NEO,
};

// Función para obtener configuración de un driver
export const getDriverManifest = (driverId) => {
  return DRIVER_MANIFESTS[driverId] || null;
};

// Función para buscar driver por vendorId y productId
export const findDriverByUsbIds = (vendorId, productId) => {
  for (const [driverId, manifest] of Object.entries(DRIVER_MANIFESTS)) {
    if (manifest.vendorId === vendorId && manifest.productId === productId) {
      return { driverId, manifest };
    }
  }
  return null;
};

// Función para verificar si un dispositivo es compatible
export const isDeviceCompatible = (vendorId, productId) => {
  return findDriverByUsbIds(vendorId, productId) !== null;
};

export default {
  DRIVER_MANIFESTS,
  getDriverManifest,
  findDriverByUsbIds,
  isDeviceCompatible
};