package pl.tablet.wififloat

import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * Przełącza Wi-Fi.
 *
 * Ten sam trick co MacroDroid Helper: aplikacja ma targetSdk 28, więc
 * [WifiManager.setWifiEnabled] nadal działa na Android 10+ (blokada dotyczy
 * tylko aplikacji z targetSdk ≥ 29).
 *
 * Fallbacki: svc wifi (root) oraz panel systemowy.
 */
class WifiController(private val context: Context) {
    private val wifi = context.applicationContext
        .getSystemService(Context.WIFI_SERVICE) as WifiManager

    fun isEnabled(): Boolean = wifi.isWifiEnabled

    fun toggle(): ToggleResult {
        val wantOn = !isEnabled()
        return setEnabled(wantOn)
    }

    fun setEnabled(enabled: Boolean): ToggleResult {
        try {
            @Suppress("DEPRECATION")
            if (wifi.setWifiEnabled(enabled)) {
                return ToggleResult(ok = true, method = "WifiManager", enabled = enabled)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "WifiManager zablokowany", e)
        }

        if (trySvcWifi(enabled)) {
            return ToggleResult(ok = true, method = "svc wifi", enabled = enabled)
        }

        openWifiPanel()
        return ToggleResult(
            ok = false,
            method = "Settings.Panel",
            enabled = isEnabled(),
            message = "Nie udało się przełączyć Wi-Fi bezpośrednio. " +
                "Otworzono panel – dotknij przełącznika."
        )
    }

    private fun trySvcWifi(enabled: Boolean): Boolean {
        val arg = if (enabled) "enable" else "disable"
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("svc", "wifi", arg))
            process.waitFor() == 0
        } catch (e: Exception) {
            Log.w(TAG, "svc wifi nie dostępne", e)
            false
        }
    }

    private fun openWifiPanel() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            Intent(Settings.Panel.ACTION_WIFI)
        } else {
            Intent(Settings.ACTION_WIFI_SETTINGS)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    data class ToggleResult(
        val ok: Boolean,
        val method: String,
        val enabled: Boolean,
        val message: String? = null
    )

    companion object {
        private const val TAG = "WifiController"
    }
}
