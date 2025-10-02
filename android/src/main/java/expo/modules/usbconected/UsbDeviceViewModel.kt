package expo.modules.usbconected

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class UsbDeviceViewModel(private val context: Context) : ViewModel() {

    companion object {
        private const val TAG = "UsbDeviceViewModel"
        private const val ACTION_USB_PERMISSION = "com.example.usbdevicescanner.USB_PERMISSION"
    }
    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager

    // Mutable State para el estado del escaneo
    private val _scanState = MutableStateFlow<UsbScanState>(UsbScanState.Idle)
    val scanState: StateFlow<UsbScanState> = _scanState

    // LiveData para los dispositivos encontrados
    private val _devices = MutableStateFlow<List<UsbDeviceInfo>>(emptyList())
    val devices: StateFlow<List<UsbDeviceInfo>> = _devices

    // LiveData para dispositivo seleccionado
    private val _selectedDevice = MutableStateFlow<UsbDeviceInfo?>(null)
    val selectedDevice: StateFlow<UsbDeviceInfo?> = _selectedDevice

    // Control de solicitud automática de permisos
    private val _autoRequestPermissions = MutableStateFlow(true)
    val autoRequestPermissions: StateFlow<Boolean> = _autoRequestPermissions

    // Lista de dispositivos para los que ya se solicitaron permisos (evitar spam)
    private val permissionRequestedDevices = mutableSetOf<String>()

    // BroadcastReceiver para permisos USB
    private val usbPermissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            if (ACTION_USB_PERMISSION == action) {
                synchronized(this) {
                    val device: UsbDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    }

                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        device?.let {
                            Log.d(TAG, "Permiso concedido para: ${it.deviceName}")
                            permissionRequestedDevices.remove(it.deviceName)
                            // Actualizar la lista de dispositivos con el permiso concedido
                            scanDevices()
                        }
                    } else {
                        device?.let {
                            Log.d(TAG, "Permiso denegado para: ${it.deviceName}")
                            permissionRequestedDevices.remove(it.deviceName)
                        }
                    }
                }
            }
        }
    }

    init {
        // Registrar el BroadcastReceiver para permisos USB
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            ContextCompat.registerReceiver(
                context,
                usbPermissionReceiver,
                filter,
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
        }

        if (!checkUsbHostSupport()) {
            _scanState.value = UsbScanState.Error("Este dispositivo no soporta USB Host. No se pueden detectar dispositivos USB.")
        } else {
            // Escaneo inicial
            scanDevices()
        }
    }

    private fun checkUsbHostSupport(): Boolean {
        return try {
            context.packageManager.hasSystemFeature("android.hardware.usb.host")
        } catch (e: Exception) {
            Log.e(TAG, "Error al verificar soporte USB Host", e)
            false
        }
    }

    /**
     * Escanea los dispositivos USB conectados
     */
    fun scanDevices() {
        viewModelScope.launch {
            _scanState.value = UsbScanState.Scanning

            try {
                val deviceList = withContext(Dispatchers.IO) {
                    val usbDevices = usbManager.deviceList
                    Log.d(TAG, "Dispositivos encontrados: ${usbDevices.size}")

                    val deviceInfoList = mutableListOf<UsbDeviceInfo>()
                    val devicesNeedingPermission = mutableListOf<UsbDevice>()

                    usbDevices.values.forEach { device ->
                        val hasPermission = try {
                            usbManager.hasPermission(device)
                        } catch (e: SecurityException) {
                            Log.w(TAG, "Error de seguridad al verificar permisos para ${device.deviceName}")
                            false
                        }
                        
                        val deviceInfo = UsbDeviceInfo.fromUsbDevice(device, hasPermission)
                        deviceInfoList.add(deviceInfo)
                        
                        // Si no tiene permisos y la solicitud automática está habilitada
                        if (!hasPermission && _autoRequestPermissions.value && 
                            !permissionRequestedDevices.contains(device.deviceName)) {
                            devicesNeedingPermission.add(device)
                        }
                    }

                    // Solicitar permisos automáticamente para dispositivos sin permisos
                    if (devicesNeedingPermission.isNotEmpty()) {
                        Log.d(TAG, "Solicitando permisos automáticamente para ${devicesNeedingPermission.size} dispositivos")
                        devicesNeedingPermission.forEach { device ->
                            requestPermissionInternal(device)
                        }
                    }

                    deviceInfoList
                }

                _devices.value = deviceList

                when {
                    deviceList.isEmpty() -> {
                        _scanState.value = UsbScanState.NoDevicesFound
                    }
                    deviceList.any { !it.hasPermission } -> {
                        _scanState.value = UsbScanState.NoPermissions
                    }
                    else -> {
                        _scanState.value = UsbScanState.Success(deviceList)
                    }
                }

            } catch (e: Exception) {
                Log.e(TAG, "Error al escanear dispositivos", e)
                _scanState.value = UsbScanState.Error("Error al escanear dispositivos: ${e.message}")
            }
        }
    }

    /**
     * Solicita permisos para un dispositivo USB específico (API pública)
     */
    fun requestPermission(deviceInfo: UsbDeviceInfo) {
        viewModelScope.launch {
            try {
                val device = usbManager.deviceList[deviceInfo.deviceName]
                if (device != null) {
                    requestPermissionInternal(device)
                } else {
                    Log.w(TAG, "Dispositivo no encontrado: ${deviceInfo.deviceName}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error al solicitar permisos", e)
                _scanState.value = UsbScanState.Error("Error al solicitar permisos: ${e.message}")
            }
        }
    }

    /**
     * Solicita permisos para un dispositivo USB (método interno)
     */
    private fun requestPermissionInternal(device: UsbDevice) {
        try {
            if (usbManager.hasPermission(device)) {
                Log.d(TAG, "Ya tiene permisos para: ${device.deviceName}")
                return
            }

            // Evitar solicitudes duplicadas
            if (permissionRequestedDevices.contains(device.deviceName)) {
                Log.d(TAG, "Permisos ya solicitados para: ${device.deviceName}")
                return
            }

            Log.d(TAG, "Solicitando permisos para: ${device.deviceName}")
            permissionRequestedDevices.add(device.deviceName)
            
            val permissionIntent = PendingIntent.getBroadcast(
                context,
                device.deviceName.hashCode(), // Usar hashCode como ID único
                Intent(ACTION_USB_PERMISSION),
                PendingIntent.FLAG_UPDATE_CURRENT or
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
            )
            
            usbManager.requestPermission(device, permissionIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Error en requestPermissionInternal", e)
            permissionRequestedDevices.remove(device.deviceName)
        }
    }

    /**
     * Habilitar/deshabilitar solicitud automática de permisos
     */
    fun setAutoRequestPermissions(enabled: Boolean) {
        _autoRequestPermissions.value = enabled
        if (enabled) {
            // Si se habilita, limpiar la lista de dispositivos con permisos solicitados
            permissionRequestedDevices.clear()
            // Y volver a escanear para solicitar permisos a dispositivos sin ellos
            scanDevices()
        }
    }

    /**
     * Limpiar lista de dispositivos con permisos ya solicitados
     */
    fun clearPermissionRequests() {
        permissionRequestedDevices.clear()
        Log.d(TAG, "Lista de permisos solicitados limpiada")
    }

    /**
     * Selecciona un dispositivo para mostrar detalles
     */
    fun selectDevice(device: UsbDeviceInfo?) {
        _selectedDevice.value = device
    }

    /**
     * Obtiene información detallada de un dispositivo
     */
    fun getDeviceDetails(deviceInfo: UsbDeviceInfo): String {
        return try {
            val device = usbManager.deviceList[deviceInfo.deviceName]
            if (device != null && usbManager.hasPermission(device)) {
                buildString {
                    append("=== INFORMACIÓN DEL DISPOSITIVO ===\n\n")
                    append("Nombre: ${deviceInfo.getDisplayName()}\n")
                    append("Ruta del dispositivo: ${device.deviceName}\n\n")
                    append("=== IDENTIFICACIÓN ===\n")
                    append("Vendor ID: 0x${deviceInfo.vendorId.toString(16).uppercase()}\n")
                    append("Product ID: 0x${deviceInfo.productId.toString(16).uppercase()}\n")
                    append("Device ID: ${deviceInfo.deviceId}\n")
                    append("Número de serie: ${deviceInfo.serialNumber ?: "No disponible"}\n\n")
                    append("=== ESPECIFICACIONES ===\n")
                    append("Clase: ${deviceInfo.deviceClass}\n")
                    append("Subclase: ${deviceInfo.deviceSubclass}\n")
                    append("Protocolo: ${deviceInfo.deviceProtocol}\n")
                    append("Versión USB: ${deviceInfo.version}\n")
                    append("Número de interfaces: ${deviceInfo.interfaceCount}\n\n")
                    append("=== INTERFACES ===\n")
                    for (i in 0 until device.interfaceCount) {
                        val usbInterface = device.getInterface(i)
                        append("Interface $i:\n")
                        append("  - Clase: ${usbInterface.interfaceClass}\n")
                        append("  - Subclase: ${usbInterface.interfaceSubclass}\n")
                        append("  - Protocolo: ${usbInterface.interfaceProtocol}\n")
                        append("  - Endpoints: ${usbInterface.endpointCount}\n")
                    }
                }
            } else if (device != null) {
                // Si el dispositivo existe pero no tiene permisos, intentar solicitarlos
                if (!permissionRequestedDevices.contains(device.deviceName)) {
                    Log.d(TAG, "Solicitando permisos automáticamente para obtener detalles de: ${device.deviceName}")
                    requestPermissionInternal(device)
                }
                "Se requieren permisos para acceder a la información detallada del dispositivo. Solicitando permisos..."
            } else {
                "Dispositivo no encontrado."
            }
        } catch (e: Exception) {
            "Error al obtener detalles del dispositivo: ${e.message}"
        }
    }

    override fun onCleared() {
        super.onCleared()
        try {
            context.unregisterReceiver(usbPermissionReceiver)
        } catch (e: Exception) {
            Log.w(TAG, "Error al desregistrar receiver", e)
        }
    }
}