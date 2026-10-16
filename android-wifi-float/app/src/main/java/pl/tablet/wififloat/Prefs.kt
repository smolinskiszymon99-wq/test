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

    companion object {
        private const val KEY_ENABLED = "enabled"
        private const val KEY_X = "button_x"
        private const val KEY_Y = "button_y"
    }
}
