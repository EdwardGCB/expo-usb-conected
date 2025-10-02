package expo.modules.usbconected

import android.hardware.usb.UsbDevice
import android.util.Log

data class UsbDeviceInfo(
    val deviceName: String,
    val deviceId: Int,
    val vendorId: Int,
    val productId: Int,
    val manufacturerName: String?,
    val productName: String?,
    val serialNumber: String?,
    val deviceClass: Int,
    val deviceSubclass: Int,
    val deviceProtocol: Int,
    val version: String,
    val interfaceCount: Int,
    val hasPermission: Boolean = false
) {
    companion object {
        private const val TAG = "UsbDeviceInfo"

        /**
         * Convierte un UsbDevice a UsbDeviceInfo
         */
        fun fromUsbDevice(device: UsbDevice, hasPermission: Boolean = false): UsbDeviceInfo {
            return UsbDeviceInfo(
                deviceName = device.deviceName,
                deviceId = device.deviceId,
                vendorId = device.vendorId,
                productId = device.productId,
                manufacturerName = getManufacturerNameSafely(device),
                productName = getProductNameSafely(device),
                serialNumber = getSerialNumberSafely(device, hasPermission), // ← AQUÍ ESTÁ EL FIX
                deviceClass = device.deviceClass,
                deviceSubclass = device.deviceSubclass,
                deviceProtocol = device.deviceProtocol,
                version = device.version,
                interfaceCount = device.interfaceCount,
                hasPermission = hasPermission
            )
        }

        /**
         * Obtiene el número de serie de forma segura
         */
        private fun getSerialNumberSafely(device: UsbDevice, hasPermission: Boolean): String? {
            return if (hasPermission) {
                try {
                    device.serialNumber
                } catch (e: SecurityException) {
                    Log.w(TAG, "Sin permisos para obtener número de serie de ${device.deviceName}")
                    null
                } catch (e: Exception) {
                    Log.w(TAG, "Error al obtener número de serie de ${device.deviceName}: ${e.message}")
                    null
                }
            } else {
                null // No intentar obtener sin permisos
            }
        }

        /**
         * Obtiene el nombre del fabricante de forma segura
         */
        private fun getManufacturerNameSafely(device: UsbDevice): String? {
            return try {
                device.manufacturerName
            } catch (e: SecurityException) {
                Log.w(TAG, "Sin permisos para obtener fabricante de ${device.deviceName}")
                null
            } catch (e: Exception) {
                Log.w(TAG, "Error al obtener fabricante de ${device.deviceName}: ${e.message}")
                null
            }
        }

        /**
         * Obtiene el nombre del producto de forma segura
         */
        private fun getProductNameSafely(device: UsbDevice): String? {
            return try {
                device.productName
            } catch (e: SecurityException) {
                Log.w(TAG, "Sin permisos para obtener nombre del producto de ${device.deviceName}")
                null
            } catch (e: Exception) {
                Log.w(TAG, "Error al obtener nombre del producto de ${device.deviceName}: ${e.message}")
                null
            }
        }
    }

    /**
     * Obtiene una descripción legible del dispositivo
     */
    fun getDisplayName(): String {
        return when {
            !productName.isNullOrBlank() && !manufacturerName.isNullOrBlank() ->
                "$manufacturerName $productName"
            !productName.isNullOrBlank() -> productName
            !manufacturerName.isNullOrBlank() -> manufacturerName
            else -> "Dispositivo USB (ID: ${vendorId.toString(16)}:${productId.toString(16)})"
        }
    }

    /**
     * Obtiene información técnica del dispositivo
     */
    fun getTechnicalInfo(): String {
        return buildString {
            append("Vendor ID: 0x${vendorId.toString(16).uppercase()}\n")
            append("Product ID: 0x${productId.toString(16).uppercase()}\n")
            append("Clase: $deviceClass\n")
            append("Subclase: $deviceSubclass\n")
            append("Protocolo: $deviceProtocol\n")
            append("Versión: $version\n")
            append("Interfaces: $interfaceCount\n")
            if (!serialNumber.isNullOrBlank()) {
                append("Número de serie: $serialNumber\n")
            } else {
                append("Número de serie: ${if (hasPermission) "No disponible" else "Requiere permisos"}\n")
            }
            append("Permisos: ${if (hasPermission) "Concedidos" else "No concedidos"}")
        }
    }
}
