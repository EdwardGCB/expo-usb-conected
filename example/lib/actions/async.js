/*
 * Async Actions - Proceso de subida de datos
 * Basado en el flujo de Tidepool Uploader (app/actions/async.js líneas 343-369)
 * Adaptado para móvil con Expo/React Native
 */

import { detectDevices, getCachedDevices } from '../core/device';
import { getDriverManifest } from '../core/driverManifests';

// Configuración del proceso de subida
export const uploadConfig = {
  // Configuración por defecto
  defaultConfig: {
    timezone: 'America/Mexico_City', // Zona horaria por defecto
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss',
    maxRetries: 3,
    retryDelay: 2000,
    timeout: 30000
  },
  
  // Configuración de progreso
  progressSteps: {
    DETECTING_DEVICE: { step: 1, total: 6, message: 'Detectando dispositivo...' },
    REQUESTING_PERMISSIONS: { step: 2, total: 6, message: 'Solicitando permisos...' },
    CONNECTING_DEVICE: { step: 3, total: 6, message: 'Conectando dispositivo...' },
    CLAIMING_INTERFACE: { step: 4, total: 6, message: 'Reclamando interfaz...' },
    COMMUNICATING: { step: 5, total: 6, message: 'Comunicando con dispositivo...' },
    CLOSING_CONNECTION: { step: 6, total: 6, message: 'Cerrando conexión...' }
  }
};

// Función principal para iniciar el proceso de subida
export const handleUpload = async (options = {}) => {
  try {
    console.log('🚀 === INICIANDO PROCESO DE SUBIDA ===');
    
    // Configurar opciones con valores por defecto
    const config = {
      ...uploadConfig.defaultConfig,
      ...options
    };
    
    console.log('📋 Configuración de subida:', config);
    
    // Crear callbacks de progreso
    const progressCallbacks = createProgressCallbacks(config.onProgress);
    
    // Iniciar proceso de subida
    const result = await doDeviceUpload(config, progressCallbacks);
    
    console.log('✅ Proceso de subida completado:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error en proceso de subida:', error);
    throw error;
  }
};

// Función para ejecutar la subida del dispositivo
export const doDeviceUpload = async (config, progressCallbacks) => {
  try {
    console.log('📱 === PROCESO DE SUBIDA DE DISPOSITIVO ===');
    
    // Paso 1: Detectar dispositivo
    progressCallbacks.onProgress(uploadConfig.progressSteps.DETECTING_DEVICE);
    const compatibleDevices = await detectDevices(config.scanDevices);
    
    if (compatibleDevices.length === 0) {
      throw new Error('No se encontraron dispositivos compatibles');
    }
    
    // Seleccionar el primer dispositivo compatible
    const deviceInfo = compatibleDevices[0];
    console.log('📱 Dispositivo seleccionado:', deviceInfo.driverId);
    
    // Obtener configuración del driver
    const driverManifest = getDriverManifest(deviceInfo.driverId);
    if (!driverManifest) {
      throw new Error(`Driver no encontrado: ${deviceInfo.driverId}`);
    }
    
    // Configurar información del usuario
    const userInfo = {
      userId: config.userId || 'default_user',
      timezone: config.timezone,
      dateFormat: config.dateFormat,
      timeFormat: config.timeFormat,
      deviceInfo: deviceInfo,
      driverManifest: driverManifest
    };
    
    console.log('👤 Información del usuario:', {
      userId: userInfo.userId,
      timezone: userInfo.timezone,
      device: driverManifest.name
    });
    
    // Ejecutar el proceso de comunicación con el dispositivo
    const uploadResult = await executeDeviceCommunication(userInfo, progressCallbacks);
    
    return {
      success: true,
      deviceInfo: deviceInfo,
      driverInfo: driverManifest,
      data: uploadResult.data,
      metadata: uploadResult.metadata,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error en doDeviceUpload:', error);
    throw error;
  }
};

// Función para ejecutar la comunicación con el dispositivo
export const executeDeviceCommunication = async (userInfo, progressCallbacks) => {
  try {
    console.log('📡 === EJECUTANDO COMUNICACIÓN CON DISPOSITIVO ===');
    
    const { deviceInfo, driverManifest } = userInfo;
    
    // Paso 2: Solicitar permisos
    progressCallbacks.onProgress(uploadConfig.progressSteps.REQUESTING_PERMISSIONS);
    const permissionGranted = await userInfo.requestPermission(deviceInfo.deviceName);
    
    if (!permissionGranted) {
      throw new Error('Permisos denegados por el usuario');
    }
    
    // Paso 3: Conectar dispositivo
    progressCallbacks.onProgress(uploadConfig.progressSteps.CONNECTING_DEVICE);
    const connected = await userInfo.openDevice(deviceInfo.deviceName);
    
    if (!connected) {
      throw new Error('No se pudo conectar al dispositivo');
    }
    
    // Paso 4: Reclamar interfaz
    progressCallbacks.onProgress(uploadConfig.progressSteps.CLAIMING_INTERFACE);
    const interfaceClaimed = await userInfo.claimInterface(deviceInfo.deviceName, 0);
    
    if (!interfaceClaimed) {
      throw new Error('No se pudo reclamar la interfaz del dispositivo');
    }
    
    // Paso 5: Comunicar con el dispositivo
    progressCallbacks.onProgress(uploadConfig.progressSteps.COMMUNICATING);
    const communicationResult = await communicateWithDevice(userInfo);
    
    // Paso 6: Cerrar conexión
    progressCallbacks.onProgress(uploadConfig.progressSteps.CLOSING_CONNECTION);
    await userInfo.closeDevice(deviceInfo.deviceName);
    
    return communicationResult;
    
  } catch (error) {
    console.error('❌ Error en comunicación con dispositivo:', error);
    
    // Intentar cerrar conexión en caso de error
    try {
      await userInfo.closeDevice(userInfo.deviceInfo.deviceName);
    } catch (closeError) {
      console.error('⚠️ Error al cerrar conexión:', closeError);
    }
    
    throw error;
  }
};

// Función para comunicar con el dispositivo específico
export const communicateWithDevice = async (userInfo) => {
  try {
    const { deviceInfo, driverManifest } = userInfo;
    
    console.log(`📡 Comunicando con ${driverManifest.name}...`);
    
    // Determinar el tipo de comunicación según el driver
    if (deviceInfo.driverId === 'AbbottFreeStyleOptiumNeo') {
      return await communicateWithAbbottDevice(userInfo);
    } else if (deviceInfo.driverId === 'RocheAccuChekUSB') {
      return await communicateWithRocheDevice(userInfo);
    } else {
      throw new Error(`Driver no soportado: ${deviceInfo.driverId}`);
    }
    
  } catch (error) {
    console.error('❌ Error en communicateWithDevice:', error);
    throw error;
  }
};

// Función para comunicar con dispositivos Abbott
export const communicateWithAbbottDevice = async (userInfo) => {
  try {
    console.log('🔬 === COMUNICACIÓN CON DISPOSITIVO ABBOTT ===');
    
    const { deviceInfo, driverManifest } = userInfo;
    
    // Importar el driver de Abbott
    const { createAbbottDriver } = await import('../drivers/abbott/abbottFreeStyleNeoMobile.js');
    
    // Configurar el driver
    const driverConfig = {
      driverId: driverManifest.driverId,
      vendorId: driverManifest.vendorId,
      productId: driverManifest.productId,
      timezone: userInfo.timezone || 'UTC',
      version: '1.0.0'
    };
    
    // Crear instancia del driver
    const driver = createAbbottDriver(driverConfig, {
      openDevice: userInfo.openDevice,
      closeDevice: userInfo.closeDevice,
      claimInterface: userInfo.claimInterface,
      readData: userInfo.readData,
      writeData: userInfo.writeData,
      sendTextCommand: userInfo.sendTextCommand
    });
    
    // Ejecutar flujo completo del driver
    const progressCallback = (stepInfo) => {
      console.log(`📊 ${stepInfo.message} (${stepInfo.step}/${stepInfo.total})`);
    };
    
    // 1. Conectar dispositivo
    await driver.connect(deviceInfo, progressCallback);
    
    // 2. Obtener información del dispositivo
    const deviceInfoResult = await driver.getDeviceInfo(progressCallback);
    
    // 3. Obtener datos
    const dataResult = await driver.fetchData(progressCallback);
    
    // 4. Procesar datos
    const processedRecords = driver.processRecords(dataResult.rawRecords);
    
    // 5. Subir datos (simulación)
    const uploadResult = await driver.uploadData(processedRecords, progressCallback);
    
    // 6. Desconectar
    await driver.disconnect();
    
    return {
      data: uploadResult.data,
      metadata: {
        deviceType: 'Abbott',
        protocol: 'HID',
        deviceInfo: deviceInfoResult,
        recordsCount: processedRecords.length,
        uploadResult: uploadResult.uploadResult,
        timestamp: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('❌ Error en communicateWithAbbottDevice:', error);
    throw error;
  }
};

// Función para comunicar con dispositivos Roche
export const communicateWithRocheDevice = async (userInfo) => {
  try {
    console.log('💉 === COMUNICACIÓN CON DISPOSITIVO ROCHE ===');
    
    const { deviceInfo, driverManifest } = userInfo;
    
    // Obtener información del dispositivo
    const deviceData = await getRocheDeviceData(userInfo);
    
    // Procesar datos
    const processedData = processRocheData(deviceData, userInfo);
    
    return {
      data: processedData,
      metadata: {
        deviceType: 'Roche',
        protocol: 'HID',
        recordsCount: processedData.length,
        timestamp: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('❌ Error en communicateWithRocheDevice:', error);
    throw error;
  }
};

// Función para obtener datos de dispositivos Abbott
export const getAbbottDeviceData = async (userInfo) => {
  // Implementar obtención de datos específicos de Abbott
  // Esta función se conectará con el protocolo HID específico
  console.log('🔬 Obteniendo datos de dispositivo Abbott...');
  
  // Por ahora retornar datos de ejemplo
  return {
    serialNumber: 'ABC123456',
    date: '12/25/2024',
    time: '14:30',
    readings: []
  };
};

// Función para obtener datos de dispositivos Roche
export const getRocheDeviceData = async (userInfo) => {
  // Implementar obtención de datos específicos de Roche
  console.log('💉 Obteniendo datos de dispositivo Roche...');
  
  // Por ahora retornar datos de ejemplo
  return {
    status: 'Ready',
    readings: []
  };
};

// Función para procesar datos de Abbott
export const processAbbottData = (deviceData, userInfo) => {
  console.log('🔬 Procesando datos de Abbott...');
  
  // Implementar procesamiento específico de datos Abbott
  return [];
};

// Función para procesar datos de Roche
export const processRocheData = (deviceData, userInfo) => {
  console.log('💉 Procesando datos de Roche...');
  
  // Implementar procesamiento específico de datos Roche
  return [];
};

// Función para crear callbacks de progreso
export const createProgressCallbacks = (onProgress) => {
  return {
    onProgress: (stepInfo) => {
      const progress = (stepInfo.step / stepInfo.total) * 100;
      console.log(`📊 Progreso: ${progress.toFixed(1)}% - ${stepInfo.message}`);
      
      if (onProgress) {
        onProgress({
          step: stepInfo.step,
          total: stepInfo.total,
          progress: progress,
          message: stepInfo.message
        });
      }
    }
  };
};

// Exportar funciones principales
export default {
  handleUpload,
  doDeviceUpload,
  executeDeviceCommunication,
  communicateWithDevice,
  uploadConfig
};
