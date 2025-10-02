/*
 * Abbott FreeStyle Neo Driver - Mobile Version
 * Basado en el flujo de Tidepool Uploader (lib/drivers/abbott/abbottFreeStyleNeo.js líneas 277-288)
 * Adaptado para móvil con Expo/React Native
 */

import { createFreeStyleProtocol } from './freeStyleLibreProtocolMobile.js';

// Configuración del driver
const RECORD_TYPE = {
  GLUCOSE: 7,
  KETONE: 9,
  INSULIN: 10,
  BASAL_TITRATION: 11,
  TIME_CHANGE: 6,
};

class AbbottFreeStyleNeoMobile {
  constructor(config, usbModule) {
    this.config = config;
    this.usbModule = usbModule; // Módulo USB nativo
    this.protocol = createFreeStyleProtocol(config, usbModule);
    this.deviceInfo = null;
    this.isConnected = false;
  }

  // Función principal de conexión (líneas 277-288 del original)
  async connect(deviceInfo, progressCallback) {
    try {
      console.log('🔌 === CONECTANDO ABBOTT FREESTYLE NEO ===');
      
      this.deviceInfo = deviceInfo;
      
      // Configurar funciones de progreso
      if (progressCallback) {
        progressCallback({ step: 1, total: 4, message: 'Conectando dispositivo...' });
      }
      
      // Conectar al dispositivo usando el módulo USB nativo
      const connected = await this.connectToDevice(deviceInfo);
      if (!connected) {
        throw new Error('No se pudo conectar al dispositivo');
      }
      
      if (progressCallback) {
        progressCallback({ step: 2, total: 4, message: 'Inicializando protocolo...' });
      }
      
      // Inicializar protocolo de comunicación
      await this.initCommunication(deviceInfo.deviceName);
      
      if (progressCallback) {
        progressCallback({ step: 3, total: 4, message: 'Verificando conexión...' });
      }
      
      // Verificar que la conexión es estable
      const isStable = await this.verifyConnection();
      if (!isStable) {
        throw new Error('Conexión inestable');
      }
      
      this.isConnected = true;
      
      if (progressCallback) {
        progressCallback({ step: 4, total: 4, message: 'Conexión establecida' });
      }
      
      console.log('✅ Conexión establecida exitosamente');
      return true;
      
    } catch (error) {
      console.error('❌ Error en connect:', error);
      this.isConnected = false;
      throw error;
    }
  }

  // Conectar al dispositivo usando el módulo USB nativo
  async connectToDevice(deviceInfo) {
    try {
      console.log('📱 Conectando al dispositivo USB...');
      
      // Abrir dispositivo
      const opened = await this.usbModule.openDevice(deviceInfo.deviceName);
      if (!opened) {
        throw new Error('No se pudo abrir el dispositivo');
      }
      
      // Reclamar interfaz
      const claimed = await this.usbModule.claimInterface(deviceInfo.deviceName, 0);
      if (!claimed) {
        throw new Error('No se pudo reclamar la interfaz');
      }
      
      console.log('✅ Dispositivo conectado');
      return true;
      
    } catch (error) {
      console.error('❌ Error conectando dispositivo:', error);
      throw error;
    }
  }

  // Inicializar protocolo de comunicación
  async initCommunication(deviceName) {
    try {
      console.log('🔧 === INICIALIZANDO PROTOCOLO DE COMUNICACIÓN ===');
      
      // Usar el protocolo FreeStyle para inicialización
      const initSuccess = await this.protocol.initCommunication(deviceName);
      
      if (!initSuccess) {
        throw new Error('Falló la inicialización del protocolo');
      }
      
      console.log('✅ Protocolo inicializado correctamente');
      return true;
      
    } catch (error) {
      console.error('❌ Error inicializando protocolo:', error);
      throw error;
    }
  }

  // Verificar que la conexión es estable
  async verifyConnection() {
    try {
      console.log('🔍 Verificando estabilidad de la conexión...');
      
      // Enviar comando de prueba
      const testCommand = [0x04, 0x00]; // Comando de prueba
      const response = await this.usbModule.writeData(this.deviceInfo.deviceName, testCommand);
      
      if (response < 0) {
        console.log('⚠️ Conexión inestable');
        return false;
      }
      
      console.log('✅ Conexión estable');
      return true;
      
    } catch (error) {
      console.error('❌ Error verificando conexión:', error);
      return false;
    }
  }

  // Obtener información del dispositivo (líneas 290-330 del original)
  async getDeviceInfo(progressCallback) {
    try {
      console.log('📋 === OBTENIENDO INFORMACIÓN DEL DISPOSITIVO ===');
      
      if (progressCallback) {
        progressCallback({ step: 1, total: 3, message: 'Obteniendo número de serie...' });
      }
      
      // Obtener número de serie
      const serialNumber = await this.getSerialNumber();
      if (!serialNumber) {
        throw new Error('No se pudo obtener el número de serie');
      }
      
      // Crear ID único del dispositivo
      const deviceId = `${this.config.driverId}-${serialNumber}`;
      
      if (progressCallback) {
        progressCallback({ step: 2, total: 3, message: 'Obteniendo fecha y hora...' });
      }
      
      // Obtener fecha y hora del dispositivo
      const deviceDateTime = await this.getDeviceDateTime();
      
      if (progressCallback) {
        progressCallback({ step: 3, total: 3, message: 'Verificando sincronización...' });
      }
      
      // Verificar/sincronizar hora
      const timeSyncResult = await this.verifyTimeSync(deviceDateTime);
      
      const deviceInfo = {
        serialNumber: serialNumber,
        deviceId: deviceId,
        deviceDateTime: deviceDateTime,
        timeSync: timeSyncResult,
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ Información del dispositivo obtenida:', deviceInfo);
      return deviceInfo;
      
    } catch (error) {
      console.error('❌ Error obteniendo información del dispositivo:', error);
      throw error;
    }
  }

  // Obtener datos del dispositivo (glucosa, cetonas, etc.)
  async fetchData(progressCallback) {
    try {
      console.log('📊 === OBTENIENDO DATOS DEL DISPOSITIVO ===');
      
      if (progressCallback) {
        progressCallback({ step: 1, total: 2, message: 'Obteniendo registros de datos...' });
      }
      
      // Obtener registros de datos usando el protocolo
      const records = await this.protocol.getResults();
      
      if (progressCallback) {
        progressCallback({ step: 2, total: 2, message: 'Procesando registros...' });
      }
      
      // Procesar registros
      const processedRecords = this.processRecords(records);
      
      console.log(`✅ Datos obtenidos: ${records.length} registros crudos, ${processedRecords.length} procesados`);
      
      return {
        rawRecords: records,
        processedRecords: processedRecords,
        recordCount: records.length
      };
      
    } catch (error) {
      console.error('❌ Error obteniendo datos del dispositivo:', error);
      throw error;
    }
  }

  // Procesar registros de datos
  processRecords(records) {
    try {
      console.log('🔄 Procesando registros de datos...');
      
      const processedRecords = [];
      
      for (const record of records) {
        try {
          const processedRecord = this.parseRecord(record);
          if (processedRecord) {
            processedRecords.push(processedRecord);
          }
        } catch (error) {
          console.warn(`⚠️ Error procesando registro: ${record}`, error);
        }
      }
      
      console.log(`✅ Registros procesados: ${processedRecords.length}`);
      return processedRecords;
      
    } catch (error) {
      console.error('❌ Error procesando registros:', error);
      throw error;
    }
  }

  // Parsear un registro individual
  parseRecord(record) {
    try {
      const fields = record.split(',');
      
      if (fields.length < 8) {
        console.warn(`⚠️ Registro incompleto: ${record}`);
        return null;
      }
      
      const recordType = parseInt(fields[0]);
      const index = parseInt(fields[1]);
      const month = parseInt(fields[2]);
      const day = parseInt(fields[3]);
      const year = parseInt(fields[4]) + 2000;
      const hours = parseInt(fields[5]);
      const minutes = parseInt(fields[6]);
      const seconds = parseInt(fields[7]) || 0;
      
      const timestamp = new Date(year, month - 1, day, hours, minutes, seconds);
      
      const processedRecord = {
        type: recordType,
        index: index,
        timestamp: timestamp,
        raw: record
      };
      
      // Procesar según el tipo de registro
      switch (recordType) {
        case 7: // Glucosa
          processedRecord = this.processGlucoseRecord(fields, processedRecord);
          break;
          
        case 9: // Cetonas
          processedRecord = this.processKetoneRecord(fields, processedRecord);
          break;
          
        case 6: // Cambio de tiempo
          processedRecord = this.processTimeChangeRecord(fields, processedRecord);
          break;
          
        default:
          console.log(`ℹ️ Tipo de registro no procesado: ${recordType}`);
      }
      
      return processedRecord;
      
    } catch (error) {
      console.error(`❌ Error parseando registro: ${record}`, error);
      return null;
    }
  }

  // Procesar registro de glucosa (líneas 160-212 del original)
  processGlucoseRecord(fields, baseRecord) {
    try {
      const value = fields[8];
      const isControlSolution = parseInt(fields[10]) === 0;
      
      // Excluir pruebas de control
      if (isControlSolution) {
        console.log(`⚠️ Excluyendo prueba de control: ${baseRecord.raw}`);
        return null;
      }
      
      let processedValue;
      let annotations = [];
      
      // Manejar valores especiales HI/LO
      if (value === 'HI') {
        processedValue = 501; // Valor representativo para HI
        annotations.push({
          code: 'bg/out-of-range',
          value: 'high',
          threshold: 500
        });
        console.log(`🔴 Valor HI detectado, asignando 501 mg/dL`);
      } else if (value === 'LO') {
        processedValue = 19; // Valor representativo para LO
        annotations.push({
          code: 'bg/out-of-range',
          value: 'low',
          threshold: 20
        });
        console.log(`🔵 Valor LO detectado, asignando 19 mg/dL`);
      } else {
        processedValue = parseInt(value);
        if (isNaN(processedValue)) {
          console.warn(`⚠️ Valor de glucosa inválido: ${value}`);
          return null;
        }
      }
      
      return {
        ...baseRecord,
        type: 'glucose',
        value: processedValue,
        unit: 'mg/dL',
        isControlSolution: false,
        annotations: annotations.length > 0 ? annotations : undefined,
        // Información adicional para Tidepool
        deviceTime: this.formatDeviceTime(baseRecord.timestamp),
        jsDate: baseRecord.timestamp,
        // Metadatos del dispositivo
        deviceId: this.deviceInfo.deviceId,
        serialNumber: this.deviceInfo.serialNumber
      };
      
    } catch (error) {
      console.error('❌ Error procesando registro de glucosa:', error);
      return null;
    }
  }

  // Procesar registro de cetonas
  processKetoneRecord(fields, baseRecord) {
    try {
      const value = fields[8];
      const isControlSolution = parseInt(fields[9]) === 0;
      
      // Excluir pruebas de control
      if (isControlSolution) {
        console.log(`⚠️ Excluyendo prueba de control de cetona: ${baseRecord.raw}`);
        return null;
      }
      
      let processedValue;
      let annotations = [];
      
      // Factor de conversión para cetonas (líneas 160-212 del original)
      const KETONE_VALUE_FACTOR = 18.0;
      const KETONE_HI = 8.0;
      
      // Manejar valores especiales HI
      if (value === 'HI') {
        processedValue = KETONE_HI + (1 / KETONE_VALUE_FACTOR);
        annotations.push({
          code: 'ketone/out-of-range',
          value: 'high',
          threshold: KETONE_HI
        });
        console.log(`🔴 Valor HI de cetona detectado, asignando ${processedValue} mmol/L`);
      } else {
        const rawValue = parseInt(value);
        if (isNaN(rawValue)) {
          console.warn(`⚠️ Valor de cetona inválido: ${value}`);
          return null;
        }
        processedValue = rawValue / KETONE_VALUE_FACTOR;
      }
      
      return {
        ...baseRecord,
        type: 'ketone',
        value: processedValue,
        unit: 'mmol/L',
        isControlSolution: false,
        annotations: annotations.length > 0 ? annotations : undefined,
        // Información adicional para Tidepool
        deviceTime: this.formatDeviceTime(baseRecord.timestamp),
        jsDate: baseRecord.timestamp,
        // Metadatos del dispositivo
        deviceId: this.deviceInfo.deviceId,
        serialNumber: this.deviceInfo.serialNumber
      };
      
    } catch (error) {
      console.error('❌ Error procesando registro de cetona:', error);
      return null;
    }
  }

  // Procesar registro de cambio de tiempo
  processTimeChangeRecord(fields, baseRecord) {
    try {
      const valid = parseInt(fields[7]) === 1;
      
      if (!valid) {
        console.log(`⚠️ Cambio de tiempo inválido: ${baseRecord.raw}`);
        return null;
      }
      
      const fromTime = {
        month: parseInt(fields[8]),
        day: parseInt(fields[9]),
        year: parseInt(fields[10]) + 2000,
        hours: parseInt(fields[11]),
        minutes: parseInt(fields[12])
      };
      
      const fromTimestamp = new Date(fromTime.year, fromTime.month - 1, fromTime.day, fromTime.hours, fromTime.minutes);
      
      return {
        ...baseRecord,
        type: 'timeChange',
        change: {
          from: this.formatDeviceTime(fromTimestamp),
          to: this.formatDeviceTime(baseRecord.timestamp),
          agent: 'manual'
        },
        valid: valid,
        // Información adicional para Tidepool
        deviceTime: this.formatDeviceTime(baseRecord.timestamp),
        jsDate: baseRecord.timestamp,
        // Metadatos del dispositivo
        deviceId: this.deviceInfo.deviceId,
        serialNumber: this.deviceInfo.serialNumber
      };
      
    } catch (error) {
      console.error('❌ Error procesando registro de cambio de tiempo:', error);
      return null;
    }
  }

  // Formatear tiempo del dispositivo
  formatDeviceTime(timestamp) {
    try {
      // Formato estándar de Tidepool: YYYY-MM-DDTHH:mm:ss
      return timestamp.toISOString().replace('Z', '');
    } catch (error) {
      console.error('❌ Error formateando tiempo del dispositivo:', error);
      return timestamp.toISOString();
    }
  }

  // Subir datos procesados (líneas 371-402 del original)
  async uploadData(processedRecords, progressCallback) {
    try {
      console.log('☁️ === SUBIENDO DATOS A TIDEPOOL ===');
      
      if (progressCallback) {
        progressCallback({ step: 1, total: 3, message: 'Preparando datos para subida...' });
      }
      
      // Preparar información de sesión
      const sessionInfo = {
        deviceTags: ['bgm'], // Blood Glucose Meter
        deviceManufacturers: ['Abbott'],
        deviceModel: 'Precision/Optium Neo',
        deviceSerialNumber: this.deviceInfo.serialNumber,
        deviceTime: this.deviceInfo.deviceTime,
        deviceId: this.deviceInfo.deviceId,
        start: new Date().toISOString(),
        timeProcessing: 'none', // Simplificado para móvil
        tzName: this.config.timezone || 'UTC',
        version: '1.0.0'
      };
      
      if (progressCallback) {
        progressCallback({ step: 2, total: 3, message: 'Estructurando datos...' });
      }
      
      // Estructurar datos para Tidepool
      const tidepoolData = {
        sessionInfo: sessionInfo,
        records: processedRecords,
        summary: {
          totalRecords: processedRecords.length,
          glucoseRecords: processedRecords.filter(r => r.type === 'glucose').length,
          ketoneRecords: processedRecords.filter(r => r.type === 'ketone').length,
          timeChangeRecords: processedRecords.filter(r => r.type === 'timeChange').length,
          hiValues: processedRecords.filter(r => r.annotations && r.annotations.some(a => a.value === 'high')).length,
          loValues: processedRecords.filter(r => r.annotations && r.annotations.some(a => a.value === 'low')).length
        }
      };
      
      if (progressCallback) {
        progressCallback({ step: 3, total: 3, message: 'Simulando subida...' });
      }
      
      // Simular subida (en lugar de subir realmente)
      const uploadResult = await this.simulateUpload(tidepoolData);
      
      console.log('✅ Datos preparados para subida exitosamente');
      console.log(`📊 Resumen: ${tidepoolData.summary.totalRecords} registros procesados`);
      console.log(`🩸 Glucosa: ${tidepoolData.summary.glucoseRecords} registros`);
      console.log(`🧪 Cetonas: ${tidepoolData.summary.ketoneRecords} registros`);
      console.log(`⏰ Cambios de tiempo: ${tidepoolData.summary.timeChangeRecords} registros`);
      console.log(`🔴 Valores HI: ${tidepoolData.summary.hiValues}`);
      console.log(`🔵 Valores LO: ${tidepoolData.summary.loValues}`);
      
      return {
        success: true,
        data: tidepoolData,
        uploadResult: uploadResult
      };
      
    } catch (error) {
      console.error('❌ Error subiendo datos:', error);
      throw error;
    }
  }

  // Simular subida de datos
  async simulateUpload(tidepoolData) {
    try {
      console.log('🎭 === SIMULANDO SUBIDA A TIDEPOOL ===');
      
      // Simular delay de red
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simular respuesta de la API
      const mockResponse = {
        status: 'success',
        uploadId: `upload_${Date.now()}`,
        recordsUploaded: tidepoolData.records.length,
        timestamp: new Date().toISOString(),
        message: 'Datos simulados correctamente'
      };
      
      console.log('✅ Simulación de subida completada');
      console.log(`📤 Upload ID: ${mockResponse.uploadId}`);
      console.log(`📊 Registros subidos: ${mockResponse.recordsUploaded}`);
      
      return mockResponse;
      
    } catch (error) {
      console.error('❌ Error en simulación de subida:', error);
      throw error;
    }
  }

  // Obtener número de serie
  async getSerialNumber() {
    try {
      console.log('🔢 Obteniendo número de serie...');
      
      const response = await this.usbModule.sendTextCommand(this.deviceInfo.deviceName, '$serlnum?');
      
      if (!response || response.trim() === '') {
        throw new Error('Respuesta vacía del dispositivo');
      }
      
      // Parsear respuesta del protocolo FreeStyle
      const serialNumber = this.parseTextResponse(response);
      
      if (!serialNumber) {
        throw new Error('No se pudo parsear el número de serie');
      }
      
      console.log(`✅ Número de serie: ${serialNumber}`);
      return serialNumber;
      
    } catch (error) {
      console.error('❌ Error obteniendo número de serie:', error);
      throw error;
    }
  }

  // Obtener fecha y hora del dispositivo
  async getDeviceDateTime() {
    try {
      console.log('📅 Obteniendo fecha y hora del dispositivo...');
      
      // Obtener fecha
      const dateResponse = await this.usbModule.sendTextCommand(this.deviceInfo.deviceName, '$date?');
      const date = this.parseTextResponse(dateResponse);
      
      // Obtener hora
      const timeResponse = await this.usbModule.sendTextCommand(this.deviceInfo.deviceName, '$time?');
      const time = this.parseTextResponse(timeResponse);
      
      if (!date || !time) {
        throw new Error('No se pudo obtener fecha/hora del dispositivo');
      }
      
      const deviceDateTime = {
        date: date,
        time: time,
        formatted: `${date} ${time}`,
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ Fecha y hora del dispositivo:', deviceDateTime);
      return deviceDateTime;
      
    } catch (error) {
      console.error('❌ Error obteniendo fecha/hora:', error);
      throw error;
    }
  }

  // Verificar/sincronizar hora
  async verifyTimeSync(deviceDateTime) {
    try {
      console.log('🕐 Verificando sincronización de tiempo...');
      
      // Comparar con hora actual
      const currentTime = new Date();
      const deviceTime = this.parseDeviceDateTime(deviceDateTime);
      
      // Calcular diferencia en minutos
      const timeDiff = Math.abs(currentTime - deviceTime) / (1000 * 60);
      
      const syncResult = {
        deviceTime: deviceTime,
        currentTime: currentTime,
        timeDifference: timeDiff,
        needsSync: timeDiff > 5, // Más de 5 minutos de diferencia
        timestamp: new Date().toISOString()
      };
      
      if (syncResult.needsSync) {
        console.log('⚠️ Dispositivo necesita sincronización de tiempo');
        // Aquí se podría implementar la sincronización automática
      } else {
        console.log('✅ Tiempo del dispositivo sincronizado');
      }
      
      return syncResult;
      
    } catch (error) {
      console.error('❌ Error verificando sincronización:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Parsear respuesta de texto del protocolo FreeStyle
  parseTextResponse(response) {
    if (!response || response.trim() === '') {
      return null;
    }
    
    // Formato: data\r\nCKSM:XXXXXXXX\r\nCMD OK\r\n
    const regex = /^([^\r]*)\r\nCKSM:([0-9A-F]{8})\r\nCMD (OK|Fail!)\r\n/;
    const match = response.match(regex);
    
    if (!match) {
      console.warn('Formato de respuesta inválido:', response);
      return null;
    }
    
    const data = match[1];
    const status = match[3];
    
    if (status !== "OK") {
      console.error('Comando falló:', status);
      return null;
    }
    
    return data;
  }

  // Parsear fecha/hora del dispositivo
  parseDeviceDateTime(deviceDateTime) {
    try {
      // Formato típico: MM,DD,YY HH,mm
      const [dateStr, timeStr] = deviceDateTime.formatted.split(' ');
      const [month, day, year] = dateStr.split(',');
      const [hour, minute] = timeStr.split(',');
      
      // Convertir a objeto Date
      const date = new Date(2000 + parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
      
      return date;
      
    } catch (error) {
      console.error('❌ Error parseando fecha/hora:', error);
      return new Date();
    }
  }

  // Desconectar del dispositivo
  async disconnect() {
    try {
      console.log('🔌 Desconectando del dispositivo...');
      
      if (this.deviceInfo) {
        await this.usbModule.closeDevice(this.deviceInfo.deviceName);
      }
      
      this.isConnected = false;
      this.deviceInfo = null;
      
      console.log('✅ Desconectado exitosamente');
      return true;
      
    } catch (error) {
      console.error('❌ Error desconectando:', error);
      throw error;
    }
  }
}

// Función para crear instancia del driver
export const createAbbottDriver = (config, usbModule) => {
  return new AbbottFreeStyleNeoMobile(config, usbModule);
};

export default AbbottFreeStyleNeoMobile;
