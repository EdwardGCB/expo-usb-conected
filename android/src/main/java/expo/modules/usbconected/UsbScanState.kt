package expo.modules.usbconected

sealed class UsbScanState {
    object Idle : UsbScanState()
    object Scanning : UsbScanState()
    data class Success(val devices: List<UsbDeviceInfo>) : UsbScanState()
    data class Error(val message: String) : UsbScanState()
    object NoDevicesFound : UsbScanState()
    object NoPermissions : UsbScanState()
}