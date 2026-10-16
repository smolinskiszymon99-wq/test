package pl.tablet.wififloat

import android.content.Context

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("wifi_float", Context.MODE_PRIVATE)

    var enabled: Boolean
        get() = sp.getBoolean(KEY_ENABLED, false)
        set(value) = sp.edit().putBoolean(KEY_ENABLED, value).apply()

    var buttonX: Int
        get() = sp.getInt(KEY_X, -1)
        set(value) = sp.edit().putInt(KEY_X, value).apply()

    var buttonY: Int
        get() = sp.getInt(KEY_Y, 200)
        set(value) = sp.edit().putInt(KEY_Y, value).apply()

    /** Watchdog: ping + auto restart Wi-Fi. */
    var watchdogEnabled: Boolean
        get() = sp.getBoolean(KEY_WATCHDOG, false)
        set(value) = sp.edit().putBoolean(KEY_WATCHDOG, value).apply()

    var pingHost: String
        get() = sp.getString(KEY_PING_HOST, DEFAULT_PING_HOST)?.trim().orEmpty()
            .ifEmpty { DEFAULT_PING_HOST }
        set(value) = sp.edit().putString(KEY_PING_HOST, value.trim().ifEmpty { DEFAULT_PING_HOST }).apply()

    companion object {
        private const val KEY_ENABLED = "enabled"
        private const val KEY_X = "button_x"
        private const val KEY_Y = "button_y"
        private const val KEY_WATCHDOG = "watchdog"
        private const val KEY_PING_HOST = "ping_host"

        const val DEFAULT_PING_HOST = "8.8.8.8"
        /** Brak odpowiedzi dłużej niż tyle → restart Wi-Fi. */
        const val FAIL_MS = 10_000L
        /** Czas wyłączenia Wi-Fi przed ponownym włączeniem. */
        const val OFF_MS = 5_000L
        /** Interwał kolejnych pingów. */
        const val PING_INTERVAL_MS = 2_000L
        /** Po restarcie nie sprawdzaj od razu (czas na reconnect). */
        const val COOLDOWN_MS = 45_000L
    }
}
