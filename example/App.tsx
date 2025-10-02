import React, { useEffect, useState } from "react";
import { 
  Button, 
  SafeAreaView, 
  ScrollView, 
  Text, 
  View, 
  StyleSheet, 
  Alert, 
  TouchableOpacity,
  Modal
} from "react-native";
import { scanDevices, requestPermission, openDevice, closeDevice, claimInterface, readData, writeData, sendTextCommand } from "expo-usb-conected";
import devicesConfig from "./reducers/devices";
import { detectDevices, getCachedDevices } from "./lib/core/device";
import { getDriverManifest } from "./lib/core/driverManifests";
import { createAbbottDriver } from "./lib/drivers/abbott/abbottFreeStyleNeoMobile";
import { createFreeStyleProtocol } from "./lib/drivers/abbott/freeStyleLibreProtocolMobile";

// Convertir dispositivos del reducer a formato compatible con la app
const COMPATIBLE_DEVICES = Object.entries(devicesConfig).map(([key, device]: [string, any]) => ({
  id: device.source.driverId,
  key: device.key,
  name: device.name,
  manufacturer: device.manufacturer || 'Unknown',
  icon: device.icon || '🩺',
  instructions: device.instructions,
  vendorId: device.vendorId,
  productId: device.productId,
  mode: device.mode || 'HID',
  driverId: device.source.driverId,
  supportsUSB: device.supportsUSB !== undefined ? device.supportsUSB : true,
  supportsBluetooth: device.supportsBluetooth !== undefined ? device.supportsBluetooth : false,
  supportsPhoto: device.supportsPhoto !== undefined ? device.supportsPhoto : true,
}));

interface UsbDevice {
  deviceName: string;
  vendorId: number;
  productId: number;
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
  hasPermission: boolean;
}

interface CompatibleDevice {
  id: string;
  key: string;
  name: string;
  manufacturer: string;
  icon: string;
  instructions: string;
  vendorId: number;
  productId: number;
  mode: string;
  driverId: string;
  supportsUSB: boolean;
  supportsBluetooth: boolean;
  supportsPhoto: boolean;
}

export default function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<CompatibleDevice | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedDevicePath, setConnectedDevicePath] = useState<string | null>(null);

  const addLog = (message: string, alsoToConsole: boolean = true) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    if (alsoToConsole) {
      console.log(logMessage);
    }
    setLogs(prev => [logMessage, ...prev.slice(0, 50)]);
  };

  // Función para imprimir datos estructurados en consola
  const logToConsole = (title: string, data: any) => {
    console.log("\n" + "=".repeat(60));
    console.log(`📊 ${title}`);
    console.log("=".repeat(60));
    if (typeof data === 'object') {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(data);
    }
    console.log("=".repeat(60) + "\n");
  };

  useEffect(() => {
    addLog("🚀 Aplicación iniciada - Selecciona un glucómetro");
  }, []);

  const handleDeviceSelect = (device: CompatibleDevice) => {
    addLog(`📱 Dispositivo seleccionado: ${device.name}`);
    setSelectedDevice(device);
    setShowConnectionModal(true);
  };

  const handlePhotoConnection = () => {
    setShowConnectionModal(false);
    addLog(`📷 Modo FOTO seleccionado para: ${selectedDevice?.name}`);
    Alert.alert(
      "Tomar Foto",
      "Esta funcionalidad permitirá tomar una foto del glucómetro para leer los valores.",
      [{ text: "OK" }]
    );
  };

  const handleBluetoothConnection = () => {
    setShowConnectionModal(false);
    if (!selectedDevice?.supportsBluetooth) {
      Alert.alert("No disponible", "Este dispositivo no soporta conexión Bluetooth");
      return;
    }
    addLog(`📡 Modo BLUETOOTH seleccionado para: ${selectedDevice?.name}`);
    Alert.alert(
      "Bluetooth",
      "Esta funcionalidad estará disponible próximamente.",
      [{ text: "OK" }]
    );
  };

  const handleUSBConnection = async () => {
    setShowConnectionModal(false);
    if (!selectedDevice) return;

    addLog(`🔌 === INICIANDO CONEXIÓN USB ===`);
    addLog(`🔌 Dispositivo: ${selectedDevice.name}`);
    addLog(`🔌 VendorID: 0x${selectedDevice.vendorId.toString(16).toUpperCase()}`);
    addLog(`🔌 ProductID: 0x${selectedDevice.productId.toString(16).toUpperCase()}`);
    
    setIsConnecting(true);

    try {
      // Paso 1: Detectar dispositivos compatibles usando el sistema Tidepool
      addLog("🔍 Paso 1/6: Detectando dispositivos compatibles...");
      const compatibleDevices = await detectDevices(scanDevices);
      addLog(`🔍 Dispositivos compatibles encontrados: ${compatibleDevices.length}`);
      
      // Mostrar dispositivos encontrados en consola
      logToConsole("DISPOSITIVOS COMPATIBLES DETECTADOS", {
        total: compatibleDevices.length,
        dispositivos: compatibleDevices.map((d: any) => ({
          nombre: d.deviceName,
          vendorId: `0x${d.vendorId.toString(16).toUpperCase()}`,
          productId: `0x${d.productId.toString(16).toUpperCase()}`,
          fabricante: d.manufacturerName,
          producto: d.productName,
          driver: d.driverId,
          protocolo: d.protocol,
          tienePermisos: d.hasPermission
        }))
      });

      // Buscar el dispositivo compatible
      const targetDevice = compatibleDevices.find(
        (d: any) => 
          d.vendorId === selectedDevice.vendorId && 
          d.productId === selectedDevice.productId
      );

      if (!targetDevice) {
        addLog(`❌ Dispositivo no encontrado. Asegúrate de que está conectado.`);
        Alert.alert(
          "Dispositivo no encontrado",
          `No se encontró ${selectedDevice.name}. Por favor conecta el dispositivo y vuelve a intentarlo.`
        );
        setIsConnecting(false);
        return;
      }

      addLog(`✅ Dispositivo encontrado: ${targetDevice.deviceName}`);
      
      // Mostrar dispositivo seleccionado en consola
      logToConsole("DISPOSITIVO SELECCIONADO", {
        dispositivo: selectedDevice.name,
        fabricante: selectedDevice.manufacturer,
        ruta: targetDevice.deviceName,
        vendorId: `0x${targetDevice.vendorId.toString(16).toUpperCase()}`,
        productId: `0x${targetDevice.productId.toString(16).toUpperCase()}`,
        driverId: selectedDevice.driverId
      });

      // Paso 2: Verificar/Solicitar permisos
      if (!targetDevice.hasPermission) {
        addLog("🔐 Paso 2/6: Solicitando permisos USB...");
        const permissionGranted = await requestPermission(targetDevice.deviceName);
        
        if (!permissionGranted) {
          addLog("❌ Permisos denegados por el usuario");
          Alert.alert(
            "Permisos denegados",
            "Necesitas conceder permisos USB para continuar."
          );
          setIsConnecting(false);
        return;
        }
        addLog("✅ Permisos concedidos");
      } else {
        addLog("✅ Paso 2/6: El dispositivo ya tiene permisos");
      }

      // Paso 3: Abrir dispositivo
      addLog("🔓 Paso 3/6: Abriendo conexión USB...");
      const opened = await openDevice(targetDevice.deviceName);
      
      if (!opened) {
        addLog("❌ No se pudo abrir el dispositivo");
        Alert.alert("Error", "No se pudo abrir la conexión con el dispositivo");
        setIsConnecting(false);
        return;
      }
      addLog("✅ Conexión USB abierta");
      setConnectedDevicePath(targetDevice.deviceName);

      // Paso 4: Reclamar interfaz
      addLog("📌 Paso 4/6: Reclamando interfaz USB...");
      const claimed = await claimInterface(targetDevice.deviceName, 0);
      
      if (!claimed) {
        addLog("❌ No se pudo reclamar la interfaz");
        await closeDevice(targetDevice.deviceName);
        Alert.alert("Error", "No se pudo reclamar la interfaz del dispositivo");
        setIsConnecting(false);
        setConnectedDevicePath(null);
            return;
          }
      addLog("✅ Interfaz reclamada");

      // Paso 5: Comunicación con el dispositivo (ejemplo)
      addLog("📡 Paso 5/6: Iniciando comunicación...");
      
      try {
      // Comunicación según el driver detectado
      if (targetDevice.driverId === 'AbbottFreeStyleOptiumNeo') {
        await communicateWithFreeStyleNeo(targetDevice);
      } else if (targetDevice.driverId === 'RocheAccuChekUSB') {
        await communicateWithAccuChek(targetDevice);
      } else {
          addLog("⚠️ Driver específico no implementado aún");
        addLog(`Driver ID detectado: ${targetDevice.driverId}`);
        }
      } catch (commError) {
        addLog(`⚠️ Error en comunicación: ${commError}`);
      }

      // Paso 6: Cerrar conexión
      addLog("🔒 Paso 6/6: Cerrando conexión...");
      await closeDevice(targetDevice.deviceName);
      setConnectedDevicePath(null);
      addLog("✅ Conexión cerrada exitosamente");
      
      addLog("🎉 === PROCESO COMPLETADO ===");
      Alert.alert(
        "Conexión exitosa",
        "Se completó la comunicación con el dispositivo. Revisa los logs para ver los datos.",
        [{ text: "OK" }]
      );

    } catch (error) {
      addLog(`❌ Error: ${error}`);
      console.error("Error en conexión USB:", error);
      Alert.alert("Error", `Ocurrió un error: ${error}`);
      
      // Limpiar conexión si existe
      if (connectedDevicePath) {
        try {
          await closeDevice(connectedDevicePath);
          setConnectedDevicePath(null);
        } catch (e) {
          addLog(`⚠️ Error al cerrar conexión: ${e}`);
        }
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Función para intentar inicialización suave
  const trySoftInitialization = async (devicePath: string): Promise<boolean> => {
    try {
      addLog("🔄 === INICIALIZACIÓN SUAVE ===");
      
      // Esperar un poco para que el dispositivo se estabilice
      addLog("⏳ Esperando estabilización del dispositivo...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Intentar leer datos primero para "despertar" el dispositivo
      addLog("📖 Intentando despertar el dispositivo...");
      const wakeRead = await readData(devicePath, 1000);
      addLog(`📖 Respuesta de despertar: ${wakeRead.length} bytes`);
      
      // Intentar comando más simple
      addLog("📤 Enviando comando simple...");
      const simpleWrite = await writeData(devicePath, [0x00]);
      addLog(`📤 Resultado comando simple: ${simpleWrite} bytes`);
      
      if (simpleWrite >= 0) {
        addLog("✅ Comando simple exitoso, intentando comando 0x04...");
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const response = await writeData(devicePath, [0x04, 0x00]);
        if (response >= 0) {
          addLog("✅ Inicialización suave exitosa");
          return true;
        }
      }
      
      addLog("⚠️ Inicialización suave falló");
      return false;
      
    } catch (error) {
      addLog(`❌ Error en inicialización suave: ${error}`);
      return false;
    }
  };

  // Función para diagnosticar la conexión USB
  const diagnoseUSBConnection = async (devicePath: string) => {
    try {
      addLog("🔍 === DIAGNÓSTICO USB ===");
      
      // Intentar leer datos para verificar que el dispositivo responde
      addLog("📖 Probando lectura de datos...");
      const testRead = await readData(devicePath, 1000);
      addLog(`📖 Lectura de prueba: ${testRead.length} bytes`);
      
      if (testRead.length > 0) {
        addLog(`📖 Datos leídos: ${testRead.map((b: number) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
      }
      
      // Intentar escribir un comando simple
      addLog("📤 Probando escritura simple...");
      const testWrite = await writeData(devicePath, [0x00]);
      addLog(`📤 Escritura de prueba: ${testWrite} bytes`);
      
      // Verificar si el dispositivo está en modo HID
      addLog("🔍 El dispositivo puede estar en modo de solo lectura o requerir activación manual");
      addLog("💡 Sugerencias:");
      addLog("   - Presiona cualquier botón en el glucómetro");
      addLog("   - Asegúrate de que el dispositivo esté encendido");
      addLog("   - Algunos glucómetros requieren activación manual antes de la comunicación");
      addLog("   - Verifica que el cable USB esté bien conectado");
      
    } catch (error) {
      addLog(`❌ Error en diagnóstico: ${error}`);
    }
  };

  // Función para inicializar el protocolo HID según el diagrama PlantUML
  const initializeHIDProtocol = async (devicePath: string): Promise<boolean> => {
    try {
      addLog("🔧 === INICIALIZACIÓN PROTOCOLO HID ===");
      
      // Verificar que el dispositivo esté abierto
      addLog("🔍 Verificando estado del dispositivo...");
      
      // Secuencia de inicialización según el diagrama PlantUML
      // Paso 1: Comando 0x04
      addLog("📤 Enviando comando de inicialización 0x04...");
      addLog("📤 Datos a enviar: 04 00");
      
      const response1 = await writeData(devicePath, [0x04, 0x00]);
      addLog(`📤 Resultado writeData: ${response1} bytes escritos`);
      
      if (response1 < 0) {
        addLog(`❌ Error enviando comando 0x04 - código: ${response1}`);
        addLog("🔍 Posibles causas:");
        addLog("   - Dispositivo no está abierto correctamente");
        addLog("   - Endpoint OUT no disponible o incorrecto");
        addLog("   - Dispositivo no soporta este comando");
        addLog("   - Permisos insuficientes");
        
        // Intentar diagnóstico adicional
        await diagnoseUSBConnection(devicePath);
        
        // Intentar método alternativo más suave
        addLog("🔄 Intentando inicialización suave...");
        const softInit = await trySoftInitialization(devicePath);
        if (softInit) {
          return true;
        }
        
        return false;
      }
      
      // Leer respuesta
      await new Promise(resolve => setTimeout(resolve, 100));
      const read1 = await readData(devicePath, 2000);
      addLog(`📥 Respuesta 0x04: ${read1.length} bytes`);
      if (read1.length > 0) {
        addLog(`📥 Datos: ${read1.map((b: number) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
      }
      
      // Paso 2: Enviar ACK
      addLog("📤 Enviando ACK...");
      const ack1 = await writeData(devicePath, [0x00, 0x02]);
      if (ack1 < 0) {
        addLog("❌ Error enviando ACK");
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const ackResponse1 = await readData(devicePath, 2000);
      addLog(`📥 ACK Response: ${ackResponse1.length} bytes`);
      
      // Paso 3: Comando 0x05
      addLog("📤 Enviando comando 0x05...");
      const response2 = await writeData(devicePath, [0x05, 0x00]);
      if (response2 < 0) {
        addLog("❌ Error enviando comando 0x05");
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const read2 = await readData(devicePath, 2000);
      addLog(`📥 Respuesta 0x05: ${read2.length} bytes`);
      if (read2.length > 0) {
        addLog(`📥 Datos: ${read2.map((b: number) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
      }
      
      // Paso 4: Comando 0x15
      addLog("📤 Enviando comando 0x15...");
      const response3 = await writeData(devicePath, [0x15, 0x00]);
      if (response3 < 0) {
        addLog("❌ Error enviando comando 0x15");
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const read3 = await readData(devicePath, 2000);
      addLog(`📥 Respuesta 0x15: ${read3.length} bytes`);
      if (read3.length > 0) {
        addLog(`📥 Datos: ${read3.map((b: number) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
      }
      
      // Paso 5: Comando 0x01
      addLog("📤 Enviando comando 0x01...");
      const response4 = await writeData(devicePath, [0x01, 0x00]);
      if (response4 < 0) {
        addLog("❌ Error enviando comando 0x01");
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const read4 = await readData(devicePath, 2000);
      addLog(`📥 Respuesta 0x01: ${read4.length} bytes`);
      if (read4.length > 0) {
        addLog(`📥 Datos: ${read4.map((b: number) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
      }
      
      addLog("✅ Inicialización del protocolo HID completada");
      return true;
      
    } catch (error) {
      addLog(`❌ Error en inicialización HID: ${error}`);
      return false;
    }
  };

  // Función alternativa para enviar comandos HID de texto
  const sendHIDTextCommand = async (devicePath: string, command: string): Promise<string> => {
    try {
      addLog(`📤 Enviando comando HID de texto: ${command}`);
      
      // Convertir comando a bytes con terminador
      const fullCommand = `${command}\r\n`;
      const commandBytes = Array.from(fullCommand).map(c => c.charCodeAt(0));
      
      // Crear frame HID: [0x21, length, ...data]
      const hidFrame = [0x21, commandBytes.length, ...commandBytes];
      
      // Rellenar hasta 64 bytes
      while (hidFrame.length < 64) {
        hidFrame.push(0x00);
      }
      
      addLog(`📤 Frame HID: ${hidFrame.slice(0, 10).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}...`);
      
      // Enviar comando
      const bytesWritten = await writeData(devicePath, hidFrame);
      if (bytesWritten < 0) {
        addLog("❌ Error enviando comando HID");
        return "";
      }
      
      // Leer respuesta
      await new Promise(resolve => setTimeout(resolve, 500));
      const response = await readData(devicePath, 5000);
      
      if (response.length > 0) {
        // Convertir bytes a string
        const responseText = response.map((b: number) => String.fromCharCode(b)).join('');
        addLog(`📥 Respuesta HID (${response.length} bytes): ${responseText.substring(0, 100)}...`);
        return responseText;
      }
      
      return "";
      
    } catch (error) {
      addLog(`❌ Error en sendHIDTextCommand: ${error}`);
      return "";
    }
  };

  // Función para intentar comunicación directa con comandos de texto
  const tryDirectTextCommunication = async (devicePath: string) => {
    try {
      addLog("🔄 === COMUNICACIÓN DIRECTA CON COMANDOS DE TEXTO ===");
      
      // Intentar enviar comandos de texto directamente
      addLog("📝 Intentando obtener número de serie directamente...");
      const serialResponse = await sendTextCommand(devicePath, "$serlnum?");
      addLog(`Respuesta cruda:\n${serialResponse}`);
      
      if (serialResponse && serialResponse.trim() !== '') {
      const serial = parseTextResponse(serialResponse);
      if (serial) {
          addLog(`✅ Número de serie obtenido: ${serial}`);
      
          // Continuar con otros comandos
          addLog("📅 Obteniendo fecha y hora...");
      const dateResponse = await sendTextCommand(devicePath, "$date?");
      const timeResponse = await sendTextCommand(devicePath, "$time?");
      
      const date = parseTextResponse(dateResponse);
      const time = parseTextResponse(timeResponse);
          addLog(`✅ Fecha: ${date || 'null'}, Hora: ${time || 'null'}`);
      
          // Obtener lecturas
      addLog("🩸 Obteniendo lecturas de glucosa...");
      const resultsResponse = await sendTextCommand(devicePath, "$result?");
      const readings = parseGlucoseReadings(resultsResponse);
      
          if (readings.length > 0) {
            logToConsole("DATOS OBTENIDOS - MÉTODO DIRECTO", {
              dispositivo: "Abbott FreeStyle Precision/Optium Neo",
        numeroSerie: serial,
        fechaDispositivo: `${date} ${time}`,
        totalLecturas: readings.length,
        lecturas: readings
      });
      
            addLog(`✅ Total de lecturas obtenidas: ${readings.length}`);
            return;
          }
        }
      }
      
      // Si no funcionó, intentar comunicación directa
      addLog("⚠️ Comandos de texto no funcionaron, intentando lectura directa...");
      await communicateDirectly(devicePath);
      
    } catch (error) {
      addLog(`❌ Error en comunicación directa de texto: ${error}`);
      await communicateDirectly(devicePath);
    }
  };

  // Función de comunicación directa (fallback)
  const communicateDirectly = async (devicePath: string) => {
    try {
      addLog("🔄 === COMUNICACIÓN DIRECTA (FALLBACK) ===");
      
      // Intentar leer datos directamente del dispositivo
      addLog("📖 Leyendo datos directamente del dispositivo...");
      
      const allData: number[] = [];
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        addLog(`📖 Intento ${attempts + 1}/${maxAttempts}: Leyendo datos...`);
        
        const response = await readData(devicePath, 3000);
        
        if (response && response.length > 0) {
          allData.push(...response);
          addLog(`📊 Datos recibidos: ${response.length} bytes (Total: ${allData.length})`);
          
          // Si recibimos menos de 64 bytes, probablemente terminó la transmisión
          if (response.length < 64) {
            break;
          }
        } else {
          addLog(`⚠️ Sin datos en intento ${attempts + 1}`);
          break;
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (allData.length > 0) {
        addLog(`✅ Total de datos leídos: ${allData.length} bytes`);
        
        // Mostrar datos en consola
        logToConsole("DATOS DIRECTOS DEL DISPOSITIVO", {
          totalBytes: allData.length,
          intentos: attempts,
          hexadecimal: allData.map((b: number) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
          primerByte: `0x${allData[0].toString(16).padStart(2, '0').toUpperCase()}`,
          ultimoByte: `0x${allData[allData.length - 1].toString(16).padStart(2, '0').toUpperCase()}`
        });
        
        // Intentar parsear como texto
        try {
          const textData = String.fromCharCode(...allData.filter((b: number) => b >= 32 && b <= 126));
          if (textData.length > 0) {
            addLog(`📝 Datos como texto: ${textData.substring(0, 200)}...`);
            
            // Buscar patrones de lecturas de glucosa
            const lines = textData.split('\n').filter(line => line.trim());
            const glucoseReadings: any[] = [];
            
            lines.forEach((line, index) => {
              // Buscar patrones como: fecha,hora,valor,unidad
              const parts = line.split(/[,\s]+/);
              if (parts.length >= 3) {
                const reading = {
                  indice: index + 1,
                  linea: line.trim(),
                  partes: parts,
                  posibleFecha: parts[0],
                  posibleHora: parts[1],
                  posibleValor: parts[2],
                  posibleUnidad: parts[3] || 'mg/dL'
                };
                glucoseReadings.push(reading);
              }
            });
            
            if (glucoseReadings.length > 0) {
              logToConsole("LECTURAS DETECTADAS - MODO DIRECTO", {
                totalLineas: lines.length,
                lecturasDetectadas: glucoseReadings.length,
                lecturas: glucoseReadings.slice(0, 10)
              });
              
              console.log("\n" + "📊".repeat(30));
              console.log("LECTURAS DE GLUCOSA DETECTADAS (MODO DIRECTO)");
              console.log("📊".repeat(30));
              glucoseReadings.forEach((r, i) => {
                if (i < 20) {
                  console.log(`${i + 1}. ${r.linea}`);
                }
              });
              console.log("📊".repeat(30) + "\n");
            }
          }
        } catch (e) {
          addLog("⚠️ No se pudo convertir datos a texto");
        }
        
      } else {
        addLog("⚠️ No se recibieron datos del dispositivo");
        addLog("💡 Sugerencias:");
        addLog("   - Verifica que el glucómetro esté conectado");
        addLog("   - Asegúrate de que el dispositivo esté encendido");
        addLog("   - Algunos glucómetros requieren activación manual");
        addLog("   - Prueba desconectar y reconectar el cable USB");
      }
      
    } catch (error) {
      addLog(`❌ Error en comunicación directa: ${error}`);
    }
  };

  // Función de comunicación específica para FreeStyle Neo
  const communicateWithFreeStyleNeo = async (deviceInfo: any) => {
    try {
      addLog("📊 === COMUNICACIÓN ABBOTT FREESTYLE NEO ===");
      
      // Crear instancia del driver de Abbott
      const abbottDriver = createAbbottDriver(
        { driverId: deviceInfo.driverId },
        { 
          openDevice, 
          closeDevice, 
          claimInterface, 
          writeData, 
          readData, 
          sendTextCommand 
        }
      );
      
      // Conectar usando el driver de Abbott
      addLog("🔌 Conectando usando driver de Abbott...");
      await abbottDriver.connect(deviceInfo, (progress: any) => {
        addLog(`📊 ${progress.message} (${progress.step}/${progress.total})`);
      });
      
      addLog("✅ Conexión establecida con driver de Abbott");
      
      // Obtener información del dispositivo usando el driver
      addLog("📋 Obteniendo información del dispositivo...");
      const deviceInfoResult = await abbottDriver.getDeviceInfo((progress: any) => {
        addLog(`📊 ${progress.message} (${progress.step}/${progress.total})`);
      });
      
      addLog(`✅ Número de serie: ${deviceInfoResult.serialNumber}`);
      addLog(`✅ ID del dispositivo: ${deviceInfoResult.deviceId}`);
      addLog(`✅ Fecha y hora: ${deviceInfoResult.deviceDateTime.formatted}`);
      
      // Mostrar información de sincronización
      if ('needsSync' in deviceInfoResult.timeSync && deviceInfoResult.timeSync.needsSync) {
        addLog(`⚠️ Dispositivo necesita sincronización de tiempo (diferencia: ${deviceInfoResult.timeSync.timeDifference?.toFixed(1)} min)`);
      } else {
        addLog("✅ Tiempo del dispositivo sincronizado");
      }
      
      // Mostrar datos estructurados en consola
      logToConsole("INFORMACIÓN COMPLETA DEL DISPOSITIVO", {
        dispositivo: "Abbott FreeStyle Precision/Optium Neo",
        numeroSerie: deviceInfoResult.serialNumber,
        deviceId: deviceInfoResult.deviceId,
        fechaDispositivo: deviceInfoResult.deviceDateTime.formatted,
        sincronizacionTiempo: {
          necesitaSync: 'needsSync' in deviceInfoResult.timeSync ? deviceInfoResult.timeSync.needsSync : false,
          diferenciaMinutos: 'timeDifference' in deviceInfoResult.timeSync ? deviceInfoResult.timeSync.timeDifference : 0,
          tiempoDispositivo: 'deviceTime' in deviceInfoResult.timeSync ? deviceInfoResult.timeSync.deviceTime : null,
          tiempoActual: 'currentTime' in deviceInfoResult.timeSync ? deviceInfoResult.timeSync.currentTime : null
        },
        metadata: deviceInfoResult
      });
      
      // Desconectar del dispositivo
      addLog("🔌 Desconectando del dispositivo...");
      await abbottDriver.disconnect();
      addLog("✅ Desconectado exitosamente");
      
    } catch (error) {
      addLog(`❌ Error: ${error}`);
      throw error;
    }
  };

  // Función para parsear respuesta de texto del protocolo FreeStyle
  function parseTextResponse(response: string): string | null {
    if (!response || response.trim() === '') {
      console.warn("Respuesta vacía o nula");
      return null;
    }
    
    // Formato: data\r\nCKSM:XXXXXXXX\r\nCMD OK\r\n
    const regex = /^([^\r]*)\r\nCKSM:([0-9A-F]{8})\r\nCMD (OK|Fail!)\r\n/;
    const match = response.match(regex);
    
    if (!match) {
      console.warn("Formato de respuesta inválido:", response);
      console.warn("Respuesta completa:", JSON.stringify(response));
      
      // Intentar extraer datos sin formato estricto
      const lines = response.split('\r\n');
      if (lines.length > 0 && lines[0].trim() !== '') {
        console.warn("Intentando extraer datos sin formato:", lines[0]);
        return lines[0];
      }
      
      return null;
    }
    
    const data = match[1];
    const checksum = parseInt(match[2], 16);
    const status = match[3];
    
    if (status !== "OK") {
      console.error("Comando falló:", status);
      return null;
    }
    
    // Validar checksum (suma de bytes ASCII)
    const calculatedChecksum = data.split('').reduce((sum, char) => 
      sum + (char.charCodeAt(0) & 0xFF), 0
    );
    
    if (calculatedChecksum !== checksum) {
      console.warn("Checksum inválido - calculado:", calculatedChecksum, "recibido:", checksum);
    }
    
    return data;
  }

  // Función para parsear lecturas de glucosa
  function parseGlucoseReadings(response: string): any[] {
    const data = parseTextResponse(response);
    if (!data) return [];
    
    const lines = data.split('\r\n').filter(line => line.trim());
    const readings: any[] = [];
    
    lines.forEach(line => {
      // Formato típico: tipo,index,mes,día,año,hora,min,valor,...
      const parts = line.split(',');
      if (parts.length >= 8) {
        const reading = {
          tipo: parseInt(parts[0]),
          index: parseInt(parts[1]),
          fecha: `${parts[2]}/${parts[3]}/20${parts[4]}`,
          hora: `${parts[5]}:${parts[6]}`,
          valor: parts[7] === 'HI' ? '>500' : parts[7] === 'LO' ? '<20' : parseInt(parts[7]),
          unidad: 'mg/dL'
        };
        
        // Solo agregar si es lectura de glucosa (tipo 7)
        if (reading.tipo === 7) {
          readings.push(reading);
        }
      }
    });
    
    return readings;
  }

  // Función de comunicación específica para Accu-Chek
  const communicateWithAccuChek = async (devicePath: string) => {
    try {
      addLog("📝 === COMUNICACIÓN ACCU-CHEK USB ===");
      addLog("ℹ️ NOTA: Los glucómetros son dispositivos de SOLO LECTURA");

      // Los dispositivos Accu-Chek usan protocolo HID
      // No necesitamos enviar comandos, solo leer los datos disponibles
      addLog("📖 Leyendo datos disponibles del dispositivo...");
      
      // Leer datos del dispositivo (múltiples intentos para capturar toda la información)
      const allData: number[] = [];
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        addLog(`📖 Intento ${attempts + 1}/${maxAttempts}: Leyendo datos...`);
        
        const response = await readData(devicePath, 2000);
        
        if (response && response.length > 0) {
          allData.push(...response);
          addLog(`📊 Datos recibidos: ${response.length} bytes (Total: ${allData.length})`);
          
          // Si recibimos menos de 64 bytes, probablemente terminó la transmisión
          if (response.length < 64) {
            break;
          }
        } else {
          addLog(`⚠️ Sin datos en intento ${attempts + 1}`);
          break;
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      if (allData.length > 0) {
        addLog(`✅ Total de datos leídos: ${allData.length} bytes`);
        
        // Log estructurado en consola
        logToConsole("📈 DATOS COMPLETOS - ACCU-CHEK", {
          totalBytes: allData.length,
          intentos: attempts,
          hexadecimal: allData.map((b: number) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
          primerByte: `0x${allData[0].toString(16).padStart(2, '0').toUpperCase()}`,
          ultimoByte: `0x${allData[allData.length - 1].toString(16).padStart(2, '0').toUpperCase()}`
        });
        
        // Intentar parsear como texto
        try {
          const textData = String.fromCharCode(...allData.filter((b: number) => b >= 32 && b <= 126));
          if (textData.length > 0) {
            addLog(`📝 Datos como texto: ${textData.substring(0, 200)}...`);
            
            // Buscar patrones de lecturas de glucosa
            const lines = textData.split('\n').filter(line => line.trim());
            const glucoseReadings: any[] = [];
            
            lines.forEach((line, index) => {
              // Buscar patrones como: fecha,hora,valor,unidad
              const parts = line.split(/[,\s]+/);
              if (parts.length >= 3) {
                const reading = {
                  indice: index + 1,
                  linea: line.trim(),
                  partes: parts,
                  posibleFecha: parts[0],
                  posibleHora: parts[1],
                  posibleValor: parts[2],
                  posibleUnidad: parts[3] || 'mg/dL'
                };
                glucoseReadings.push(reading);
              }
            });
            
            if (glucoseReadings.length > 0) {
              logToConsole("📊 LECTURAS DETECTADAS - ACCU-CHEK", {
                totalLineas: lines.length,
                lecturasDetectadas: glucoseReadings.length,
                lecturas: glucoseReadings.slice(0, 10)
              });
              
              console.log("\n" + "📊".repeat(30));
              console.log("LECTURAS DE GLUCOSA DETECTADAS");
              console.log("📊".repeat(30));
              glucoseReadings.forEach((r, i) => {
                if (i < 20) {
                  console.log(`${i + 1}. ${r.linea}`);
                }
              });
              console.log("📊".repeat(30) + "\n");
            }
          }
        } catch (e) {
          addLog("⚠️ No se pudo convertir datos a texto");
        }
        
        // Mostrar datos en formato hexadecimal para análisis
        console.log("\n" + "🔍".repeat(30));
        console.log("ANÁLISIS HEXADECIMAL DE DATOS");
        console.log("🔍".repeat(30));
        for (let i = 0; i < Math.min(allData.length, 100); i += 16) {
          const chunk = allData.slice(i, i + 16);
          const hex = chunk.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
          const ascii = chunk.map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join('');
          console.log(`${i.toString(16).padStart(4, '0')}: ${hex.padEnd(48)} | ${ascii}`);
        }
        console.log("🔍".repeat(30) + "\n");
        
      } else {
        addLog("⚠️ No se recibieron datos del dispositivo");
        addLog("💡 Sugerencias:");
        addLog("   - Verifica que el glucómetro esté conectado");
        addLog("   - Asegúrate de que el dispositivo esté encendido");
        addLog("   - Algunos glucómetros requieren activación manual");
      }
      
      addLog("✅ === COMUNICACIÓN ACCU-CHEK COMPLETADA ===");

    } catch (error) {
      addLog(`❌ Error en comunicación Accu-Chek: ${error}`);
      throw error;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.header}>🩺 Glucómetros Compatibles</Text>

        {/* Lista de dispositivos compatibles */}
        <View style={styles.devicesSection}>
          {COMPATIBLE_DEVICES.map((device) => (
            <TouchableOpacity
              key={device.id}
              style={styles.deviceCard}
              onPress={() => handleDeviceSelect(device)}
              disabled={isConnecting}
            >
              <View style={styles.deviceContent}>
                <Text style={styles.deviceIcon}>{device.icon}</Text>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceManufacturer}>{device.manufacturer}</Text>
                  <Text style={styles.deviceInstructions}>{device.instructions}</Text>
                  <View style={styles.badgesContainer}>
                    {device.supportsUSB && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>USB</Text>
                      </View>
                    )}
                    {device.supportsBluetooth && (
                      <View style={[styles.badge, styles.badgeBluetooth]}>
                        <Text style={styles.badgeText}>Bluetooth</Text>
                      </View>
                    )}
                    {device.supportsPhoto && (
                      <View style={[styles.badge, styles.badgePhoto]}>
                        <Text style={styles.badgeText}>Foto</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
        </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sección de logs */}
        <View style={styles.logsSection}>
          <Text style={styles.sectionTitle}>📝 Registro de Actividad</Text>
          <ScrollView 
            style={styles.logsContainer}
            nestedScrollEnabled={true}
          >
            {logs.length === 0 ? (
              <Text style={styles.noLogsText}>No hay actividad aún...</Text>
            ) : (
              logs.map((log, index) => (
                <Text key={index} style={styles.logText}>
                  {log}
                </Text>
              ))
            )}
          </ScrollView>
          <Button 
            title="🗑️ Limpiar logs" 
            onPress={() => {
              setLogs([]);
              addLog("Logs limpiados");
            }}
          />
        </View>
      </ScrollView>

      {/* Modal de opciones de conexión */}
      <Modal
        visible={showConnectionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConnectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {selectedDevice?.icon} {selectedDevice?.name}
            </Text>
            <Text style={styles.modalSubtitle}>
              Selecciona el método de conexión
            </Text>

            <TouchableOpacity
              style={[styles.modalButton, !selectedDevice?.supportsUSB && styles.modalButtonDisabled]}
              onPress={handleUSBConnection}
              disabled={!selectedDevice?.supportsUSB || isConnecting}
            >
              <Text style={styles.modalButtonIcon}>🔌</Text>
              <View style={styles.modalButtonContent}>
                <Text style={styles.modalButtonText}>Conexión USB</Text>
                <Text style={styles.modalButtonDescription}>
                  Conecta el dispositivo mediante cable USB
            </Text>
          </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, !selectedDevice?.supportsBluetooth && styles.modalButtonDisabled]}
              onPress={handleBluetoothConnection}
              disabled={!selectedDevice?.supportsBluetooth || isConnecting}
            >
              <Text style={styles.modalButtonIcon}>📡</Text>
              <View style={styles.modalButtonContent}>
                <Text style={styles.modalButtonText}>Conexión Bluetooth</Text>
                <Text style={styles.modalButtonDescription}>
                  Conecta de forma inalámbrica
                    </Text>
                  </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, !selectedDevice?.supportsPhoto && styles.modalButtonDisabled]}
              onPress={handlePhotoConnection}
              disabled={!selectedDevice?.supportsPhoto || isConnecting}
            >
              <Text style={styles.modalButtonIcon}>📷</Text>
              <View style={styles.modalButtonContent}>
                <Text style={styles.modalButtonText}>Tomar Foto</Text>
                <Text style={styles.modalButtonDescription}>
                  Captura los valores de la pantalla
                    </Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowConnectionModal(false)}
              disabled={isConnecting}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>

            {isConnecting && (
              <View style={styles.loadingOverlay}>
                <Text style={styles.loadingText}>Conectando...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    fontSize: 28,
    fontWeight: "bold",
    margin: 20,
    textAlign: "center",
    color: "#333",
  },
  devicesSection: {
    padding: 16,
  },
  deviceCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  deviceContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  deviceIcon: {
    fontSize: 48,
    marginRight: 16,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  deviceManufacturer: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  deviceInstructions: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    marginBottom: 8,
  },
  badgesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 4,
  },
  badgeBluetooth: {
    backgroundColor: "#5856D6",
  },
  badgePhoto: {
    backgroundColor: "#34C759",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  chevron: {
    fontSize: 32,
    color: "#ccc",
    marginLeft: 8,
  },
  logsSection: {
    backgroundColor: "#f8f9fa",
    margin: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  logsContainer: {
    backgroundColor: "#212529",
    borderRadius: 6,
    padding: 12,
    maxHeight: 300,
    marginBottom: 12,
  },
  logText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#f8f9fa",
    marginBottom: 2,
    lineHeight: 14,
  },
  noLogsText: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#6c757d",
    fontStyle: "italic",
    textAlign: "center",
    padding: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    textAlign: "center",
  },
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  modalButtonDisabled: {
    opacity: 0.4,
    borderColor: "#ccc",
  },
  modalButtonIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  modalButtonContent: {
    flex: 1,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  modalButtonDescription: {
    fontSize: 12,
    color: "#666",
  },
  modalCancelButton: {
    marginTop: 8,
    padding: 16,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#007AFF",
  },
});
