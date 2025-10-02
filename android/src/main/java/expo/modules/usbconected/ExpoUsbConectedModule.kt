package expo.modules.usbconected

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoUsbConectedModule : Module() {

  companion object {
    private const val TAG = "ExpoUsbConectedModule"
    private const val ACTION_USB_PERMISSION = "expo.modules.usbconected.USB_PERMISSION"
  }

  private var usbViewModel: UsbDeviceViewModel? = null
  private var usbPermissionReceiver: BroadcastReceiver? = null
  
  // Almacenar conexiones USB activas: deviceName -> Connection
  private val activeConnections = mutableMapOf<String, UsbDeviceConnection>()
  // Almacenar interfaces reclamadas: deviceName -> List<UsbInterface>
  private val claimedInterfaces = mutableMapOf<String, MutableList<UsbInterface>>()

  override fun definition() = ModuleDefinition {
    Name("ExpoUsbConected")

    // Inicializar ViewModel cuando se carga el módulo
    OnCreate {
      val reactContext = appContext.reactContext
      if (reactContext != null) {
        usbViewModel = UsbDeviceViewModel(reactContext)
        Log.d(TAG, "UsbDeviceViewModel inicializado")
        
        // Registrar BroadcastReceiver para permisos USB
        registerUsbPermissionReceiver()
      } else {
        Log.e(TAG, "No se pudo obtener ReactContext")
      }
    }

    // Limpiar recursos cuando se destruye el módulo
    OnDestroy {
      // Cerrar todas las conexiones activas
      activeConnections.values.forEach { connection ->
        try {
          connection.close()
        } catch (e: Exception) {
          Log.e(TAG, "Error al cerrar conexión", e)
        }
      }
      activeConnections.clear()
      claimedInterfaces.clear()
      
      unregisterUsbPermissionReceiver()
      usbViewModel = null
      Log.d(TAG, "Recursos limpiados y referencias eliminadas")
    }

    // Listar dispositivos USB
    AsyncFunction("scanDevices") {
      try {
        val reactContext = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
        val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
        
        Log.d(TAG, "=== INICIANDO ESCANEO DE DISPOSITIVOS USB ===")
        Log.d(TAG, "Contexto disponible: ${reactContext != null}")
        Log.d(TAG, "UsbManager disponible: ${usbManager != null}")
        
        // Verificar soporte USB Host
        val hasUsbHost = reactContext.packageManager.hasSystemFeature("android.hardware.usb.host")
        Log.d(TAG, "Soporte USB Host: $hasUsbHost")
        
        val deviceList = usbManager.deviceList
        Log.d(TAG, "Total dispositivos USB encontrados: ${deviceList.size}")
        
        if (deviceList.isEmpty()) {
          Log.w(TAG, "No se encontraron dispositivos USB")
          return@AsyncFunction emptyList<Map<String, Any?>>()
        }

        val result = deviceList.values.map { device ->
          Log.d(TAG, "Procesando dispositivo: ${device.deviceName}")
          Log.d(TAG, "  - Vendor ID: ${device.vendorId}")
          Log.d(TAG, "  - Product ID: ${device.productId}")
          
          val hasPermission = try {
            val permission = usbManager.hasPermission(device)
            Log.d(TAG, "  - Permisos: $permission")
            permission
          } catch (e: SecurityException) {
            Log.w(TAG, "  - Error de permisos al verificar ${device.deviceName}: ${e.message}")
            false
          } catch (e: Exception) {
            Log.e(TAG, "  - Error inesperado al verificar permisos: ${e.message}")
            false
          }

          val deviceInfo = mapOf(
            "deviceName" to device.deviceName,
            "vendorId" to device.vendorId,
            "productId" to device.productId,
            "manufacturerName" to try { 
              if (hasPermission) device.manufacturerName else null 
            } catch (e: Exception) { 
              Log.w(TAG, "  - Error al obtener manufacturerName: ${e.message}")
              null 
            },
            "productName" to try { 
              if (hasPermission) device.productName else null 
            } catch (e: Exception) { 
              Log.w(TAG, "  - Error al obtener productName: ${e.message}")
              null 
            },
            "serialNumber" to try { 
              if (hasPermission) device.serialNumber else null 
            } catch (e: Exception) { 
              Log.w(TAG, "  - Error al obtener serialNumber: ${e.message}")
              null 
            },
            "hasPermission" to hasPermission
          )
          
          Log.d(TAG, "  - Dispositivo procesado exitosamente")
          deviceInfo
        }

        Log.d(TAG, "=== ESCANEO COMPLETADO ===")
        Log.d(TAG, "Dispositivos procesados: ${result.size}")
        return@AsyncFunction result

      } catch (e: SecurityException) {
        Log.e(TAG, "Error de seguridad al escanear dispositivos", e)
        Log.e(TAG, "Stack trace: ${e.stackTrace.joinToString("\n")}")
        return@AsyncFunction emptyList<Map<String, Any?>>()
      } catch (e: Exception) {
        Log.e(TAG, "Error al escanear dispositivos", e)
        Log.e(TAG, "Stack trace: ${e.stackTrace.joinToString("\n")}")
        throw e
      }
    }

    // Solicitar permisos
    AsyncFunction("requestPermission") { deviceName: String ->
      try {
        val reactContext = appContext.reactContext ?: return@AsyncFunction false
        val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
        
        Log.d(TAG, "=== INICIANDO SOLICITUD DE PERMISOS ===")
        Log.d(TAG, "Dispositivo solicitado: $deviceName")
        Log.d(TAG, "Contexto disponible: ${reactContext != null}")
        Log.d(TAG, "UsbManager disponible: ${usbManager != null}")
        
        // Listar todos los dispositivos disponibles
        val allDevices = usbManager.deviceList
        Log.d(TAG, "Total dispositivos USB encontrados: ${allDevices.size}")
        allDevices.forEach { (name, device) ->
          Log.d(TAG, "  - Dispositivo: $name (${device.vendorId}:${device.productId})")
        }
        
        // Buscar el dispositivo específico
        val device = allDevices.values.find { it.deviceName == deviceName }
        
        if (device != null) {
          Log.d(TAG, "Dispositivo encontrado: ${device.deviceName}")
          Log.d(TAG, "Vendor ID: ${device.vendorId}, Product ID: ${device.productId}")
          
          // Verificar si ya tiene permisos
          val hasPermission = try {
            usbManager.hasPermission(device)
          } catch (e: Exception) {
            Log.e(TAG, "Error al verificar permisos existentes", e)
            false
          }
          
          Log.d(TAG, "¿Ya tiene permisos?: $hasPermission")
          
          if (hasPermission) {
            Log.d(TAG, "Dispositivo $deviceName ya tiene permisos - retornando true")
            return@AsyncFunction true
          }
          
          // Crear PendingIntent para la solicitud de permisos
          Log.d(TAG, "Creando PendingIntent para solicitud de permisos...")
          val permissionIntent = PendingIntent.getBroadcast(
            reactContext, 
            0, 
            Intent(ACTION_USB_PERMISSION), 
            PendingIntent.FLAG_IMMUTABLE
          )
          
          Log.d(TAG, "PendingIntent creado: ${permissionIntent != null}")
          
          // Solicitar permiso
          Log.d(TAG, "Llamando a usbManager.requestPermission()...")
          usbManager.requestPermission(device, permissionIntent)
          Log.d(TAG, "Solicitud de permiso enviada exitosamente para: $deviceName")
          Log.d(TAG, "=== SOLICITUD DE PERMISOS COMPLETADA ===")
          return@AsyncFunction true
        } else {
          Log.w(TAG, "Dispositivo no encontrado en la lista: $deviceName")
          Log.w(TAG, "Dispositivos disponibles: ${allDevices.keys.joinToString(", ")}")
          return@AsyncFunction false
        }

      } catch (e: Exception) {
        Log.e(TAG, "Error al solicitar permisos para $deviceName", e)
        Log.e(TAG, "Stack trace: ${e.stackTrace.joinToString("\n")}")
        return@AsyncFunction false
      }
    }

    // Configurar solicitud automática de permisos
    AsyncFunction("setAutoRequestPermissions") { enabled: Boolean ->
      try {
        val viewModel = usbViewModel
        if (viewModel == null) {
          Log.e(TAG, "ViewModel no inicializado para setAutoRequestPermissions")
          return@AsyncFunction
        }

        Log.d(TAG, "Configurando solicitud automática: $enabled")
        viewModel.setAutoRequestPermissions(enabled)

      } catch (e: Exception) {
        Log.e(TAG, "Error al configurar solicitud automática", e)
      }
    }

    // Limpiar solicitudes de permisos pendientes
    AsyncFunction("clearPermissionRequests") {
      try {
        val viewModel = usbViewModel
        if (viewModel == null) {
          Log.e(TAG, "ViewModel no inicializado para clearPermissionRequests")
          return@AsyncFunction null
        }

        Log.d(TAG, "Limpiando solicitudes de permisos pendientes")
        viewModel.clearPermissionRequests()
        return@AsyncFunction null

      } catch (e: Exception) {
        Log.e(TAG, "Error al limpiar solicitudes", e)
      }
    }

    // ========== FUNCIONES USB DE LECTURA/ESCRITURA ==========

    // Abrir conexión con dispositivo USB
    AsyncFunction("openDevice") { deviceName: String ->
      try {
        val reactContext = appContext.reactContext ?: return@AsyncFunction false
        val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager

        Log.d(TAG, "=== ABRIENDO DISPOSITIVO USB ===")
        Log.d(TAG, "Dispositivo: $deviceName")

        // Buscar el dispositivo
        val device = usbManager.deviceList.values.find { it.deviceName == deviceName }
        if (device == null) {
          Log.e(TAG, "Dispositivo no encontrado: $deviceName")
          return@AsyncFunction false
        }

        // Verificar permisos
        if (!usbManager.hasPermission(device)) {
          Log.e(TAG, "Sin permisos para el dispositivo: $deviceName")
          return@AsyncFunction false
        }

        // Abrir conexión
        val connection = usbManager.openDevice(device)
        if (connection == null) {
          Log.e(TAG, "No se pudo abrir conexión con: $deviceName")
          return@AsyncFunction false
        }

        activeConnections[deviceName] = connection
        claimedInterfaces[deviceName] = mutableListOf()
        
        Log.d(TAG, "✅ Dispositivo abierto exitosamente: $deviceName")
        Log.d(TAG, "File descriptor: ${connection.fileDescriptor}")
        return@AsyncFunction true

      } catch (e: Exception) {
        Log.e(TAG, "Error al abrir dispositivo $deviceName", e)
        return@AsyncFunction false
      }
    }

    // Cerrar conexión con dispositivo USB
    AsyncFunction("closeDevice") { deviceName: String ->
      try {
        Log.d(TAG, "=== CERRANDO DISPOSITIVO USB ===")
        Log.d(TAG, "Dispositivo: $deviceName")

        val connection = activeConnections[deviceName]
        if (connection == null) {
          Log.w(TAG, "No hay conexión activa para: $deviceName")
          return@AsyncFunction false
        }

        // Liberar todas las interfaces reclamadas
        claimedInterfaces[deviceName]?.forEach { iface ->
          try {
            connection.releaseInterface(iface)
            Log.d(TAG, "Interfaz ${iface.id} liberada")
          } catch (e: Exception) {
            Log.e(TAG, "Error al liberar interfaz ${iface.id}", e)
          }
        }

        connection.close()
        activeConnections.remove(deviceName)
        claimedInterfaces.remove(deviceName)

        Log.d(TAG, "✅ Dispositivo cerrado exitosamente: $deviceName")
        return@AsyncFunction true

      } catch (e: Exception) {
        Log.e(TAG, "Error al cerrar dispositivo $deviceName", e)
        return@AsyncFunction false
      }
    }

    // Reclamar interfaz USB
    AsyncFunction("claimInterface") { deviceName: String, interfaceNumber: Int ->
      try {
        Log.d(TAG, "=== RECLAMANDO INTERFAZ USB ===")
        Log.d(TAG, "Dispositivo: $deviceName, Interfaz: $interfaceNumber")

        val connection = activeConnections[deviceName]
        if (connection == null) {
          Log.e(TAG, "No hay conexión activa para: $deviceName")
          return@AsyncFunction false
        }

        val reactContext = appContext.reactContext ?: return@AsyncFunction false
        val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = usbManager.deviceList.values.find { it.deviceName == deviceName }
        
        if (device == null) {
          Log.e(TAG, "Dispositivo no encontrado: $deviceName")
          return@AsyncFunction false
        }

        if (interfaceNumber >= device.interfaceCount) {
          Log.e(TAG, "Número de interfaz inválido: $interfaceNumber (máximo: ${device.interfaceCount - 1})")
          return@AsyncFunction false
        }

        val usbInterface = device.getInterface(interfaceNumber)
        val claimed = connection.claimInterface(usbInterface, true)

        if (claimed) {
          claimedInterfaces[deviceName]?.add(usbInterface)
          Log.d(TAG, "✅ Interfaz $interfaceNumber reclamada exitosamente")
          Log.d(TAG, "Endpoints disponibles: ${usbInterface.endpointCount}")
        } else {
          Log.e(TAG, "❌ No se pudo reclamar la interfaz $interfaceNumber")
        }

        return@AsyncFunction claimed

      } catch (e: Exception) {
        Log.e(TAG, "Error al reclamar interfaz $interfaceNumber para $deviceName", e)
        return@AsyncFunction false
      }
    }

    // Liberar interfaz USB
    AsyncFunction("releaseInterface") { deviceName: String, interfaceNumber: Int ->
      try {
        Log.d(TAG, "=== LIBERANDO INTERFAZ USB ===")
        Log.d(TAG, "Dispositivo: $deviceName, Interfaz: $interfaceNumber")

        val connection = activeConnections[deviceName]
        if (connection == null) {
          Log.e(TAG, "No hay conexión activa para: $deviceName")
          return@AsyncFunction false
        }

        val reactContext = appContext.reactContext ?: return@AsyncFunction false
        val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = usbManager.deviceList.values.find { it.deviceName == deviceName }
        
        if (device == null) {
          Log.e(TAG, "Dispositivo no encontrado: $deviceName")
          return@AsyncFunction false
        }

        val usbInterface = device.getInterface(interfaceNumber)
        val released = connection.releaseInterface(usbInterface)

        if (released) {
          claimedInterfaces[deviceName]?.remove(usbInterface)
          Log.d(TAG, "✅ Interfaz $interfaceNumber liberada exitosamente")
        } else {
          Log.e(TAG, "❌ No se pudo liberar la interfaz $interfaceNumber")
        }

        return@AsyncFunction released

      } catch (e: Exception) {
        Log.e(TAG, "Error al liberar interfaz $interfaceNumber para $deviceName", e)
        return@AsyncFunction false
      }
    }

    // Escribir datos al dispositivo USB (soporte HID y Bulk)
    AsyncFunction("writeData") { deviceName: String, data: List<Int> ->
      try {
        Log.d(TAG, "=== ESCRIBIENDO DATOS USB ===")
        Log.d(TAG, "Dispositivo: $deviceName")
        Log.d(TAG, "Bytes a enviar: ${data.size}")

        val connection = activeConnections[deviceName]
        if (connection == null) {
          Log.e(TAG, "No hay conexión activa para: $deviceName")
          return@AsyncFunction -1
        }

        val reactContext = appContext.reactContext ?: return@AsyncFunction -1
        val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = usbManager.deviceList.values.find { it.deviceName == deviceName }
        
        if (device == null) {
          Log.e(TAG, "Dispositivo no encontrado: $deviceName")
          return@AsyncFunction -1
        }

        // Convertir List<Int> a ByteArray
        val dataBytes = data.map { it.toByte() }.toByteArray()
        
        // Determinar si es un dispositivo HID
        val isHIDDevice = isHIDDevice(device)
        Log.d(TAG, "¿Es dispositivo HID?: $isHIDDevice")
        
        if (isHIDDevice) {
          // Usar HID Reports para dispositivos HID
          return@AsyncFunction writeHIDReport(connection, device, dataBytes)
        } else {
          // Usar bulk transfer para dispositivos regulares
          return@AsyncFunction writeBulkData(connection, device, dataBytes)
        }

      } catch (e: Exception) {
        Log.e(TAG, "Error al escribir datos a $deviceName", e)
        return@AsyncFunction -1
      }
    }

    // Leer datos del dispositivo USB (soporte HID y Bulk)
    AsyncFunction("readData") { deviceName: String, timeout: Int ->
      try {
        Log.d(TAG, "=== LEYENDO DATOS USB ===")
        Log.d(TAG, "Dispositivo: $deviceName")
        Log.d(TAG, "Timeout: $timeout ms")

        val connection = activeConnections[deviceName]
        if (connection == null) {
          Log.e(TAG, "No hay conexión activa para: $deviceName")
          return@AsyncFunction emptyList<Int>()
        }

        val reactContext = appContext.reactContext ?: return@AsyncFunction emptyList<Int>()
        val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = usbManager.deviceList.values.find { it.deviceName == deviceName }
        
        if (device == null) {
          Log.e(TAG, "Dispositivo no encontrado: $deviceName")
          return@AsyncFunction emptyList<Int>()
        }

        // Determinar si es un dispositivo HID
        val isHIDDevice = isHIDDevice(device)
        Log.d(TAG, "¿Es dispositivo HID?: $isHIDDevice")
        
        if (isHIDDevice) {
          // Usar HID Reports para dispositivos HID
          return@AsyncFunction readHIDReport(connection, device, timeout)
        } else {
          // Usar bulk transfer para dispositivos regulares
          return@AsyncFunction readBulkData(connection, device, timeout)
        }

      } catch (e: Exception) {
        Log.e(TAG, "Error al leer datos de $deviceName", e)
        return@AsyncFunction emptyList<Int>()
      }
    }
    
    // Enviar comando de texto (protocolo FreeStyle)
    AsyncFunction("sendTextCommand") { deviceName: String, command: String ->
      try {
        Log.d(TAG, "=== ENVIANDO COMANDO DE TEXTO ===")
        Log.d(TAG, "Dispositivo: $deviceName")
        Log.d(TAG, "Comando: $command")

        val connection = activeConnections[deviceName]
        if (connection == null) {
          Log.e(TAG, "No hay conexión activa para: $deviceName")
          return@AsyncFunction ""
        }

        val reactContext = appContext.reactContext ?: return@AsyncFunction ""
        val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = usbManager.deviceList.values.find { it.deviceName == deviceName }
        
        if (device == null) {
          Log.e(TAG, "Dispositivo no encontrado: $deviceName")
          return@AsyncFunction ""
        }

        // Agregar terminador si no existe
        val fullCommand = if (!command.endsWith("\r\n")) {
          "$command\r\n"
        } else {
          command
        }

        val commandBytes = fullCommand.toByteArray(Charsets.US_ASCII)
        Log.d(TAG, "Bytes del comando: ${commandBytes.size}")

        // Buscar endpoint OUT
        var outEndpoint: UsbEndpoint? = null
        for (i in 0 until device.interfaceCount) {
          val usbInterface = device.getInterface(i)
          for (j in 0 until usbInterface.endpointCount) {
            val endpoint = usbInterface.getEndpoint(j)
            if (endpoint.direction == UsbConstants.USB_DIR_OUT) {
              outEndpoint = endpoint
              break
            }
          }
          if (outEndpoint != null) break
        }

        if (outEndpoint == null) {
          Log.e(TAG, "No se encontró endpoint OUT")
          return@AsyncFunction ""
        }

        // Enviar comando
        val bytesWritten = connection.bulkTransfer(outEndpoint, commandBytes, commandBytes.size, 5000)
        
        if (bytesWritten < 0) {
          Log.e(TAG, "Error al enviar comando: $bytesWritten")
          return@AsyncFunction ""
        }

        Log.d(TAG, "Comando enviado: $bytesWritten bytes")

        // Buscar endpoint IN
        var inEndpoint: UsbEndpoint? = null
        for (i in 0 until device.interfaceCount) {
          val usbInterface = device.getInterface(i)
          for (j in 0 until usbInterface.endpointCount) {
            val endpoint = usbInterface.getEndpoint(j)
            if (endpoint.direction == UsbConstants.USB_DIR_IN) {
              inEndpoint = endpoint
              break
            }
          }
          if (inEndpoint != null) break
        }

        if (inEndpoint == null) {
          Log.e(TAG, "No se encontró endpoint IN")
          return@AsyncFunction ""
        }

        // Leer respuesta
        val response = StringBuilder()
        val buffer = ByteArray(64)
        
        var attempts = 0
        val maxAttempts = 50
        
        while (attempts < maxAttempts) {
          val bytesRead = connection.bulkTransfer(inEndpoint, buffer, buffer.size, 2000)
          
          if (bytesRead > 0) {
            val text = String(buffer, 0, bytesRead, Charsets.US_ASCII)
            response.append(text)
            Log.d(TAG, "Recibidos $bytesRead bytes: $text")
            
            // Verificar si terminó (protocolo FreeStyle termina con "CMD OK" o "CMD Fail!")
            if (response.contains("CMD OK") || response.contains("CMD Fail!")) {
              Log.d(TAG, "Respuesta completa recibida")
              break
            }
          } else if (bytesRead == 0) {
            Log.d(TAG, "Sin datos en intento $attempts")
          } else {
            Log.w(TAG, "Error en lectura: $bytesRead")
          }
          
          attempts++
        }
        
        val finalResponse = response.toString()
        Log.d(TAG, "Respuesta final (${finalResponse.length} chars):\n$finalResponse")
        
        return@AsyncFunction finalResponse

      } catch (e: Exception) {
        Log.e(TAG, "Error en sendTextCommand", e)
        return@AsyncFunction ""
      }
    }
  }

  // Registrar BroadcastReceiver para manejar respuestas de permisos USB
  private fun registerUsbPermissionReceiver() {
    val reactContext = appContext.reactContext ?: return
    
    usbPermissionReceiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "=== RECIBIENDO RESPUESTA DE PERMISOS USB ===")
        Log.d(TAG, "Intent action: ${intent.action}")
        Log.d(TAG, "Intent extras: ${intent.extras}")
        
        if (ACTION_USB_PERMISSION == intent.action) {
          val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
          val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
          
          if (device != null) {
            Log.d(TAG, "Dispositivo: ${device.deviceName}")
            Log.d(TAG, "Permiso concedido: $granted")
            Log.d(TAG, "Vendor ID: ${device.vendorId}, Product ID: ${device.productId}")
            
            if (granted) {
              Log.d(TAG, "✅ PERMISO CONCEDIDO para ${device.deviceName}")
            } else {
              Log.d(TAG, "❌ PERMISO DENEGADO para ${device.deviceName}")
            }
          } else {
            Log.w(TAG, "Dispositivo es null en la respuesta de permisos")
          }
        }
        
        Log.d(TAG, "=== FIN RESPUESTA DE PERMISOS USB ===")
      }
    }
    
    val filter = IntentFilter(ACTION_USB_PERMISSION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      reactContext.registerReceiver(usbPermissionReceiver, filter)
    }
    
    Log.d(TAG, "BroadcastReceiver registrado para permisos USB")
  }

  // Desregistrar BroadcastReceiver
  private fun unregisterUsbPermissionReceiver() {
    val reactContext = appContext.reactContext
    val receiver = usbPermissionReceiver
    
    if (reactContext != null && receiver != null) {
      try {
        reactContext.unregisterReceiver(receiver)
        Log.d(TAG, "BroadcastReceiver desregistrado")
      } catch (e: Exception) {
        Log.e(TAG, "Error al desregistrar BroadcastReceiver", e)
      }
    }
    
    usbPermissionReceiver = null
  }

  // Verificar si es un dispositivo HID
  private fun isHIDDevice(device: UsbDevice): Boolean {
    for (i in 0 until device.interfaceCount) {
      val usbInterface = device.getInterface(i)
      if (usbInterface.interfaceClass == UsbConstants.USB_CLASS_HID) {
        Log.d(TAG, "Dispositivo HID detectado en interfaz $i")
        return true
      }
    }
    Log.d(TAG, "Dispositivo no es HID")
    return false
  }

  // Escribir datos usando HID Reports
  private fun writeHIDReport(connection: UsbDeviceConnection, device: UsbDevice, data: ByteArray): Int {
    try {
      Log.d(TAG, "=== ESCRIBIENDO HID REPORT ===")
      
      // Buscar interfaz HID
      var hidInterface: UsbInterface? = null
      for (i in 0 until device.interfaceCount) {
        val usbInterface = device.getInterface(i)
        if (usbInterface.interfaceClass == UsbConstants.USB_CLASS_HID) {
          hidInterface = usbInterface
          break
        }
      }
      
      if (hidInterface == null) {
        Log.e(TAG, "No se encontró interfaz HID")
        return -1
      }
      
      // Verificar si la interfaz ya está reclamada
      val alreadyClaimed = claimedInterfaces[device.deviceName]?.contains(hidInterface) ?: false
      
      if (!alreadyClaimed) {
        // Reclamar interfaz si no está reclamada
        val claimed = connection.claimInterface(hidInterface, true)
        if (!claimed) {
          Log.e(TAG, "No se pudo reclamar interfaz HID")
          return -1
        }
        claimedInterfaces[device.deviceName]?.add(hidInterface)
        Log.d(TAG, "Interfaz HID reclamada en writeHIDReport")
      } else {
        Log.d(TAG, "Interfaz HID ya estaba reclamada")
      }
      
      // Buscar endpoint OUT en la interfaz HID
      var outEndpoint: UsbEndpoint? = null
      for (i in 0 until hidInterface.endpointCount) {
        val endpoint = hidInterface.getEndpoint(i)
        if (endpoint.direction == UsbConstants.USB_DIR_OUT) {
          outEndpoint = endpoint
          break
        }
      }
      
      if (outEndpoint == null) {
        Log.e(TAG, "No se encontró endpoint OUT en interfaz HID")
        return -1
      }
      
      // Crear frame HID de 64 bytes
      val hidFrame = ByteArray(64)
      
      if (data.size > 0) {
        // Frame HID: [COMMAND, LENGTH, ...DATA, PADDING]
        hidFrame[0] = data[0] // Comando
        
        if (data.size > 1) {
          // Si hay datos adicionales, establecer longitud y copiar datos
          val dataLength = data.size - 1 // Longitud de datos (sin comando)
          hidFrame[1] = dataLength.toByte()
          System.arraycopy(data, 1, hidFrame, 2, dataLength)
        } else {
          // Solo comando, sin datos adicionales
          hidFrame[1] = 0
        }
      } else {
        Log.w(TAG, "Datos vacíos para frame HID")
        hidFrame[0] = 0
        hidFrame[1] = 0
      }
      
      Log.d(TAG, "Frame HID (hex): ${hidFrame.joinToString(" ") { "%02X".format(it) }}")
      Log.d(TAG, "Endpoint HID OUT: ${outEndpoint.address}, Max packet: ${outEndpoint.maxPacketSize}")
      Log.d(TAG, "Conexión activa: ${connection != null}")
      Log.d(TAG, "Interfaz reclamada: $alreadyClaimed")
      
      // Verificar estado de la conexión antes del transfer
      val deviceConnected = try {
        connection.getFileDescriptor() >= 0
      } catch (e: Exception) {
        Log.e(TAG, "Error verificando file descriptor: ${e.message}")
        false
      }
      Log.d(TAG, "Device file descriptor válido: $deviceConnected")
      
      // Enviar usando bulk transfer (HID Reports se envían como bulk)
      val bytesWritten = connection.bulkTransfer(outEndpoint, hidFrame, hidFrame.size, 5000)
      
      if (bytesWritten < 0) {
        Log.e(TAG, "❌ Error al escribir HID report (código: $bytesWritten)")
        Log.e(TAG, "Posibles causas:")
        Log.e(TAG, "  -1: USB_TRANSFER_ERROR (error general)")
        Log.e(TAG, "  -2: USB_TRANSFER_TIMEOUT (timeout)")
        Log.e(TAG, "  -3: USB_TRANSFER_CANCELLED (cancelado)")
        Log.e(TAG, "  -4: USB_TRANSFER_STALL (stall condition)")
        Log.e(TAG, "  -5: USB_TRANSFER_NO_DEVICE (dispositivo no conectado)")
        Log.e(TAG, "  -6: USB_TRANSFER_OVERFLOW (overflow)")
      } else {
        Log.d(TAG, "✅ HID report enviado: $bytesWritten bytes")
      }
      
      return bytesWritten
      
    } catch (e: Exception) {
      Log.e(TAG, "Error al escribir HID report", e)
      return -1
    }
  }

  // Escribir datos usando bulk transfer
  private fun writeBulkData(connection: UsbDeviceConnection, device: UsbDevice, data: ByteArray): Int {
    try {
      Log.d(TAG, "=== ESCRIBIENDO BULK DATA ===")
      
      // Buscar endpoint de salida (OUT)
      var outEndpoint: UsbEndpoint? = null
      for (i in 0 until device.interfaceCount) {
        val usbInterface = device.getInterface(i)
        for (j in 0 until usbInterface.endpointCount) {
          val endpoint = usbInterface.getEndpoint(j)
          if (endpoint.direction == UsbConstants.USB_DIR_OUT) {
            outEndpoint = endpoint
            break
          }
        }
        if (outEndpoint != null) break
      }

      if (outEndpoint == null) {
        Log.e(TAG, "No se encontró endpoint de salida (OUT)")
        return -1
      }

      Log.d(TAG, "Datos (hex): ${data.joinToString(" ") { "%02X".format(it) }}")
      Log.d(TAG, "Endpoint OUT: ${outEndpoint.address}, Max packet: ${outEndpoint.maxPacketSize}")

      // Escribir datos
      val bytesWritten = connection.bulkTransfer(outEndpoint, data, data.size, 5000)
      
      if (bytesWritten < 0) {
        Log.e(TAG, "❌ Error al escribir datos bulk (código: $bytesWritten)")
      } else {
        Log.d(TAG, "✅ Escritos $bytesWritten bytes exitosamente")
      }

      return bytesWritten
      
    } catch (e: Exception) {
      Log.e(TAG, "Error al escribir datos bulk", e)
      return -1
    }
  }

  // Leer datos usando HID Reports
  private fun readHIDReport(connection: UsbDeviceConnection, device: UsbDevice, timeout: Int): List<Int> {
    try {
      Log.d(TAG, "=== LEYENDO HID REPORT ===")
      
      // Buscar interfaz HID
      var hidInterface: UsbInterface? = null
      for (i in 0 until device.interfaceCount) {
        val usbInterface = device.getInterface(i)
        if (usbInterface.interfaceClass == UsbConstants.USB_CLASS_HID) {
          hidInterface = usbInterface
          break
        }
      }
      
      if (hidInterface == null) {
        Log.e(TAG, "No se encontró interfaz HID")
        return emptyList()
      }
      
      // Buscar endpoint IN en la interfaz HID
      var inEndpoint: UsbEndpoint? = null
      for (i in 0 until hidInterface.endpointCount) {
        val endpoint = hidInterface.getEndpoint(i)
        if (endpoint.direction == UsbConstants.USB_DIR_IN) {
          inEndpoint = endpoint
          break
        }
      }
      
      if (inEndpoint == null) {
        Log.e(TAG, "No se encontró endpoint IN en interfaz HID")
        return emptyList()
      }
      
      // Buffer para recibir datos (tamaño estándar HID)
      val buffer = ByteArray(64)
      
      Log.d(TAG, "Endpoint HID IN: ${inEndpoint.address}, Max packet: ${inEndpoint.maxPacketSize}")
      Log.d(TAG, "Esperando datos HID...")

      // Leer datos
      val bytesRead = connection.bulkTransfer(inEndpoint, buffer, buffer.size, timeout)
      
      if (bytesRead < 0) {
        Log.e(TAG, "❌ Error al leer HID report (código: $bytesRead)")
        return emptyList()
      }

      if (bytesRead == 0) {
        Log.w(TAG, "⚠️ No se recibieron datos HID (timeout o sin datos disponibles)")
        return emptyList()
      }

      // Convertir ByteArray a List<Int>
      val dataList = buffer.take(bytesRead).map { it.toInt() and 0xFF }
      
      Log.d(TAG, "✅ Leídos $bytesRead bytes HID exitosamente")
      Log.d(TAG, "Datos HID (hex): ${buffer.take(bytesRead).joinToString(" ") { "%02X".format(it) }}")

      return dataList
      
    } catch (e: Exception) {
      Log.e(TAG, "Error al leer HID report", e)
      return emptyList()
    }
  }

  // Leer datos usando bulk transfer
  private fun readBulkData(connection: UsbDeviceConnection, device: UsbDevice, timeout: Int): List<Int> {
    try {
      Log.d(TAG, "=== LEYENDO BULK DATA ===")
      
      // Buscar endpoint de entrada (IN)
      var inEndpoint: UsbEndpoint? = null
      for (i in 0 until device.interfaceCount) {
        val usbInterface = device.getInterface(i)
        for (j in 0 until usbInterface.endpointCount) {
          val endpoint = usbInterface.getEndpoint(j)
          if (endpoint.direction == UsbConstants.USB_DIR_IN) {
            inEndpoint = endpoint
            break
          }
        }
        if (inEndpoint != null) break
      }

      if (inEndpoint == null) {
        Log.e(TAG, "No se encontró endpoint de entrada (IN)")
        return emptyList()
      }

      // Buffer para recibir datos
      val buffer = ByteArray(inEndpoint.maxPacketSize)
      
      Log.d(TAG, "Endpoint IN: ${inEndpoint.address}, Max packet: ${inEndpoint.maxPacketSize}")
      Log.d(TAG, "Esperando datos...")

      // Leer datos
      val bytesRead = connection.bulkTransfer(inEndpoint, buffer, buffer.size, timeout)
      
      if (bytesRead < 0) {
        Log.e(TAG, "❌ Error al leer datos bulk (código: $bytesRead)")
        return emptyList()
      }

      if (bytesRead == 0) {
        Log.w(TAG, "⚠️ No se recibieron datos bulk (timeout o sin datos disponibles)")
        return emptyList()
      }

      // Convertir ByteArray a List<Int>
      val dataList = buffer.take(bytesRead).map { it.toInt() and 0xFF }
      
      Log.d(TAG, "✅ Leídos $bytesRead bytes bulk exitosamente")
      Log.d(TAG, "Datos bulk (hex): ${buffer.take(bytesRead).joinToString(" ") { "%02X".format(it) }}")

      return dataList
      
    } catch (e: Exception) {
      Log.e(TAG, "Error al leer datos bulk", e)
      return emptyList()
    }
  }
}