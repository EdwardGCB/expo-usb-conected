/*
 * FreeStyle Libre Protocol - Mobile Version
 * Basado en el flujo de Tidepool Uploader (lib/drivers/abbott/freeStyleLibreProtocol.js líneas 724-735)
 * Adaptado para móvil con Expo/React Native
 */

// Configuración del protocolo HID
const HID_CONFIG = {
  FRAME_SIZE: 64,
  TIMEOUT: 5000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000
};

// Comandos de inicialización secuenciales (líneas 724-735 del original)
const INIT_SEQUENCE = [
  { command: 0x04, description: 'Comando de inicialización 1' },
  { command: 0x05, description: 'Comando de inicialización 2' },
  { command: 0x15, description: 'Comando de inicialización 3' },
  { command: 0x01, description: 'Comando de inicialización 4' },
  { command: 0x00, description: 'Comando de inicialización 5 (ACK)' }
];

// Comandos de texto soportados
const TEXT_COMMANDS = {
  SERIAL_NUMBER: '$serlnum?',
  DATE: '$date?',
  TIME: '$time?',
  RESULTS: '$result?'
};

class FreeStyleProtocolMobile {
  constructor(config, usbModule) {
    this.config = config;
    this.usbModule = usbModule;
    this.deviceName = null;
    this.isInitialized = false;
  }

  // Función principal de inicialización (líneas 724-735 del original)
  async initCommunication(deviceName) {
    try {
      console.log('🔧 === INICIALIZACIÓN DEL PROTOCOLO FREESTYLE ===');
      
      this.deviceName = deviceName;
      
      // Ejecutar secuencia de inicialización de 5 comandos
      const initSuccess = await this.executeInitSequence();
      
      if (!initSuccess) {
        throw new Error('Falló la secuencia de inicialización');
      }
      
      this.isInitialized = true;
      console.log('✅ Protocolo FreeStyle inicializado correctamente');
      return true;
      
    } catch (error) {
      console.error('❌ Error inicializando protocolo:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  // Ejecutar secuencia de inicialización de 5 comandos
  async executeInitSequence() {
    try {
      console.log('📡 Ejecutando secuencia de inicialización...');
      
      // Comando de wake-up antes de la inicialización
      console.log('🔔 Enviando comando de wake-up...');
      await this.sendWakeUpCommand();
      await this.delay(60000); // Esperar 1 segundo después del wake-up
      
      for (let i = 0; i < INIT_SEQUENCE.length; i++) {
        const initCommand = INIT_SEQUENCE[i];
        console.log(`📤 Comando ${i + 1}/5: ${initCommand.description} (0x${initCommand.command.toString(16).toUpperCase()})`);
        
        // Enviar comando
        const success = await this.sendInitCommand(initCommand.command);
        
        if (!success) {
          throw new Error(`Falló comando de inicialización ${i + 1}: 0x${initCommand.command.toString(16).toUpperCase()}`);
        }
        
        // Esperar entre comandos
        await this.delay(HID_CONFIG.RETRY_DELAY);
      }
      
      console.log('✅ Secuencia de inicialización completada');
      return true;
      
    } catch (error) {
      console.error('❌ Error en secuencia de inicialización:', error);
      throw error;
    }
  }

  // Enviar comando de wake-up para despertar el dispositivo
  async sendWakeUpCommand() {
    try {
      console.log('🔔 Enviando comando de wake-up...');
      
      // Comando de wake-up: algunos dispositivos necesitan un comando especial
      // Intentamos con un comando de reset o wake-up
      const wakeUpFrame = this.createHIDFrame(0x00); // Comando de reset/wake-up
      
      const bytesWritten = await this.usbModule.writeData(this.deviceName, wakeUpFrame);
      
      if (bytesWritten < 0) {
        console.warn('⚠️ Comando de wake-up falló, continuando con inicialización...');
      } else {
        console.log('✅ Comando de wake-up enviado exitosamente');
      }
      
      // Intentar leer cualquier respuesta del wake-up
      await this.delay(500);
      try {
        const response = await this.usbModule.readData(this.deviceName, 1000);
        if (response && response.length > 0) {
          console.log('📥 Respuesta de wake-up recibida');
        }
      } catch (e) {
        // No es crítico si no hay respuesta
        console.log('ℹ️ No se recibió respuesta de wake-up (normal)');
      }
      
      return true;
      
    } catch (error) {
      console.warn('⚠️ Error en comando de wake-up:', error);
      return false; // No es crítico, continuamos
    }
  }

  // Enviar comando de inicialización
  async sendInitCommand(command) {
    try {
      console.log(`📤 Enviando comando de inicialización: 0x${command.toString(16).toUpperCase()}`);
      
      // Crear frame HID
      const hidFrame = this.createHIDFrame(command);
      console.log(`📤 Frame HID creado: ${hidFrame.slice(0, 10).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}...`);
      
      // Enviar comando con reintentos
      let bytesWritten = -1;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts && bytesWritten < 0) {
        attempts++;
        console.log(`📤 Intento ${attempts}/${maxAttempts} enviando comando 0x${command.toString(16).toUpperCase()}`);
        
        bytesWritten = await this.usbModule.writeData(this.deviceName, hidFrame);
        
        if (bytesWritten < 0) {
          console.warn(`⚠️ Intento ${attempts} falló: ${bytesWritten} bytes escritos`);
          
          if (attempts < maxAttempts) {
            console.log(`⏳ Esperando ${HID_CONFIG.RETRY_DELAY}ms antes del siguiente intento...`);
            await this.delay(HID_CONFIG.RETRY_DELAY);
          }
        }
      }
      
      if (bytesWritten < 0) {
        console.error(`❌ Error enviando comando 0x${command.toString(16).toUpperCase()} después de ${maxAttempts} intentos: ${bytesWritten}`);
        return false;
      }
      
      console.log(`✅ Comando 0x${command.toString(16).toUpperCase()} enviado exitosamente: ${bytesWritten} bytes`);
      
      // Leer respuesta si es necesario
      if (command !== 0x00) { // No leer respuesta para ACK
        const response = await this.readInitResponse();
        if (response && response.length > 0) {
          console.log(`📥 Respuesta recibida para comando 0x${command.toString(16).toUpperCase()}`);
        }
      }
      
      return true;
      
    } catch (error) {
      console.error(`❌ Error enviando comando 0x${command.toString(16).toUpperCase()}:`, error);
      return false;
    }
  }

  // Leer respuesta de inicialización
  async readInitResponse() {
    try {
      const response = await this.usbModule.readData(this.deviceName, HID_CONFIG.TIMEOUT);
      
      if (response && response.length > 0) {
        console.log(`📥 Respuesta recibida: ${response.length} bytes`);
        console.log(`📥 Datos (hex): ${response.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
        return response;
      }
      
      console.log('⚠️ Sin respuesta del dispositivo');
      return null;
      
    } catch (error) {
      console.error('❌ Error leyendo respuesta:', error);
      return null;
    }
  }

  // Crear frame HID de 64 bytes
  createHIDFrame(command, data = null) {
    const frame = new Array(HID_CONFIG.FRAME_SIZE).fill(0x00);
    
    // Establecer comando
    frame[0] = command;
    
    // Agregar datos si se proporcionan
    if (data && data.length > 0) {
      frame[1] = data.length; // Longitud de datos
      
      for (let i = 0; i < Math.min(data.length, HID_CONFIG.FRAME_SIZE - 2); i++) {
        frame[2 + i] = data[i];
      }
    }
    
    return frame;
  }

  // Solicitar respuesta de texto
  async requestTextResponse(command) {
    try {
      if (!this.isInitialized) {
        throw new Error('Protocolo no inicializado');
      }
      
      console.log(`📤 Solicitando respuesta de texto: ${command}`);
      
      // Enviar comando de texto usando HID frame
      const hidFrame = this.createTextCommandFrame(command);
      const bytesWritten = await this.usbModule.writeData(this.deviceName, hidFrame);
      
      if (bytesWritten < 0) {
        throw new Error(`Error enviando comando de texto: ${bytesWritten}`);
      }
      
      // Leer respuesta
      const response = await this.usbModule.readData(this.deviceName, HID_CONFIG.TIMEOUT);
      
      if (!response || response.length === 0) {
        throw new Error('Sin respuesta del dispositivo');
      }
      
      // Convertir bytes a texto
      const textResponse = String.fromCharCode(...response.filter(b => b >= 32 && b <= 126));
      
      console.log(`📥 Respuesta de texto: ${textResponse}`);
      return textResponse;
      
    } catch (error) {
      console.error(`❌ Error en requestTextResponse:`, error);
      throw error;
    }
  }

  // Crear frame de comando de texto
  createTextCommandFrame(command) {
    // Convertir comando a bytes
    const commandBytes = Array.from(command).map(c => c.charCodeAt(0));
    
    // Crear frame HID con comando de texto (0x21)
    const frame = new Array(HID_CONFIG.FRAME_SIZE).fill(0x00);
    frame[0] = 0x21; // Comando de texto
    frame[1] = commandBytes.length; // Longitud del comando
    
    // Copiar bytes del comando
    for (let i = 0; i < commandBytes.length && i < HID_CONFIG.FRAME_SIZE - 2; i++) {
      frame[2 + i] = commandBytes[i];
    }
    
    return frame;
  }

  // Obtener número de serie del dispositivo
  async getSerialNumber() {
    try {
      console.log('📋 Obteniendo número de serie...');
      const response = await this.requestTextResponse('$serlnum?');
      
      if (response && response.trim()) {
        console.log(`✅ Número de serie obtenido: ${response.trim()}`);
        return response.trim();
      } else {
        throw new Error('No se recibió número de serie');
      }
    } catch (error) {
      console.error('❌ Error obteniendo número de serie:', error);
      throw error;
    }
  }

  // Obtener fecha del dispositivo
  async getDate() {
    try {
      console.log('📅 Obteniendo fecha del dispositivo...');
      const response = await this.requestTextResponse('$date?');
      
      if (response && response.trim()) {
        console.log(`✅ Fecha obtenida: ${response.trim()}`);
        return response.trim();
      } else {
        throw new Error('No se recibió fecha');
      }
    } catch (error) {
      console.error('❌ Error obteniendo fecha:', error);
      throw error;
    }
  }

  // Obtener hora del dispositivo
  async getTime() {
    try {
      console.log('🕐 Obteniendo hora del dispositivo...');
      const response = await this.requestTextResponse('$time?');
      
      if (response && response.trim()) {
        console.log(`✅ Hora obtenida: ${response.trim()}`);
        return response.trim();
      } else {
        throw new Error('No se recibió hora');
      }
    } catch (error) {
      console.error('❌ Error obteniendo hora:', error);
      throw error;
    }
  }

  // Obtener registros de datos (glucosa, cetonas, etc.)
  async getResults() {
    try {
      console.log('📊 Obteniendo registros de datos...');
      const response = await this.requestTextResponse('$result?');
      
      if (response && response.trim()) {
        const records = response.trim().split('\r\n').filter(line => line.trim());
        console.log(`✅ Registros obtenidos: ${records.length} registros`);
        return records;
      } else {
        console.log('ℹ️ No hay registros disponibles');
        return [];
      }
    } catch (error) {
      console.error('❌ Error obteniendo registros:', error);
      throw error;
    }
  }

  // Obtener registros de la base de datos
  async getDBRecords(command) {
    try {
      if (!this.isInitialized) {
        throw new Error('Protocolo no inicializado');
      }
      
      console.log(`📊 Obteniendo registros de BD: ${command}`);
      
      // Solicitar registros usando comando de texto
      const response = await this.requestTextResponse(command);
      
      if (!response) {
        throw new Error('Sin respuesta para comando de registros');
      }
      
      // Parsear respuesta
      const records = this.parseRecordsResponse(response);
      
      console.log(`✅ Registros obtenidos: ${records.length}`);
      return records;
      
    } catch (error) {
      console.error('❌ Error obteniendo registros:', error);
      throw error;
    }
  }

  // Parsear respuesta de registros
  parseRecordsResponse(response) {
    try {
      // Formato típico: cada línea es un registro separado por \r\n
      const lines = response.split('\r\n').filter(line => line.trim() !== '');
      
      const records = [];
      for (const line of lines) {
        if (line.trim() !== '') {
          records.push(line.trim());
        }
      }
      
      return records;
      
    } catch (error) {
      console.error('❌ Error parseando registros:', error);
      return [];
    }
  }

  // Función de utilidad para delay
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Verificar si el protocolo está inicializado
  isProtocolInitialized() {
    return this.isInitialized;
  }

  // Obtener configuración del protocolo
  getProtocolConfig() {
    return {
      frameSize: HID_CONFIG.FRAME_SIZE,
      timeout: HID_CONFIG.TIMEOUT,
      maxRetries: HID_CONFIG.MAX_RETRIES,
      initSequence: INIT_SEQUENCE,
      textCommands: TEXT_COMMANDS
    };
  }
}

// Función para crear instancia del protocolo
export const createFreeStyleProtocol = (config, usbModule) => {
  return new FreeStyleProtocolMobile(config, usbModule);
};

export default FreeStyleProtocolMobile;
