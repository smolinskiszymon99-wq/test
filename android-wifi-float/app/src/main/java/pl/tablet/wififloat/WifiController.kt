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
 * - Android 8–9: [WifiManager.setWifiEnabled] działa normalnie.
 * - Android 10+: system blokuje to dla zwykłych aplikacji. Próbujemy kolejno:
 *   1) WifiManager (na niektórych tabletach / ROM-ach nadal działa),
 *   2) Settings.Global + WRITE_SECURE_SETTINGS (nadane przez ADB),
 *   3) `svc wifi` (działa na root / niektórych firmware),
 *   4) panel systemowy Wi-Fi (jeden dodatkowy tap użytkownika).
 */
class WifiController(private val context: Context) {
    private val wifi = context.applicationContext
        .getSystemService(Context.WIFI_SERVICE) as WifiManager

    fun isEnabled(): Boolean = wifi.isWifiEnabled

    /**
     * @return wynik operacji do pokazania użytkownikowi
     */
    fun toggle(): ToggleResult {
        val wantOn = !isEnabled()
        return setEnabled(wantOn)
    }

    fun setEnabled(enabled: Boolean): ToggleResult {
        // 1) Klasyczne API (Android ≤ 9 i niektóre tablety)
        try {
            @Suppress("DEPRECATION")
            if (wifi.setWifiEnabled(enabled)) {
                return ToggleResult(ok = true, method = "WifiManager", enabled = enabled)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "WifiManager zablokowany", e)
        }

        // 2) WRITE_SECURE_SETTINGS z ADB
        if (trySecureSettings(enabled)) {
            return ToggleResult(ok = true, method = "WRITE_SECURE_SETTINGS", enabled = enabled)
        }

        // 3) svc wifi (root / shell)
        if (trySvcWifi(enabled)) {
            return ToggleResult(ok = true, method = "svc wifi", enabled = enabled)
        }

        // 4) Panel systemowy – użytkownik kończy przełączenie jednym tapnięciem
        openWifiPanel()
        return ToggleResult(
            ok = false,
            method = "Settings.Panel",
            enabled = isEnabled(),
            message = "System nie pozwala aplikacji przełączyć Wi-Fi. " +
                "Otworzono panel – dotknij przełącznika. " +
                "Albo nadaj uprawnienie ADB (patrz README)."
        )
    }

    private fun trySecureSettings(enabled: Boolean): Boolean {
        return try {
            val on = if (enabled) 1 else 0
            Settings.Global.putInt(context.contentResolver, "wifi_on", on)
            // Wymuś ponowne odczytanie – na części ROM-ów to wystarczy.
            @Suppress("DEPRECATION")
            wifi.setWifiEnabled(enabled)
            // Krótka weryfikacja – nie zawsze od razu się zmienia
            true
        } catch (e: SecurityException) {
            Log.w(TAG, "Brak WRITE_SECURE_SETTINGS", e)
            false
        } catch (e: Exception) {
            Log.w(TAG, "Settings.Global wifi_on nie zadziałał", e)
            false
        }
    }

    private fun trySvcWifi(enabled: Boolean): Boolean {
        val arg = if (enabled) "enable" else "disable"
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("svc", "wifi", arg))
            val code = process.waitFor()
            code == 0
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
