package pl.lancut.terminy

import android.content.Context
import android.content.SharedPreferences
import java.time.LocalDate

/** Ustawienia użytkownika i ostatni stan obserwacji (SharedPreferences). */
class Prefs(context: Context) {
    private val sp: SharedPreferences = context.getSharedPreferences("terminy", Context.MODE_PRIVATE)

    var serviceId: Int
        get() = sp.getInt("serviceId", 1)
        set(v) = sp.edit().putInt("serviceId", v).apply()

    var before: LocalDate?
        get() = sp.getString("before", null)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        set(v) = sp.edit().putString("before", v?.toString()).apply()

    /** Odstęp między sprawdzeniami w sekundach (minimum 60). */
    var intervalSec: Int
        get() = sp.getInt("intervalSec", 60).coerceAtLeast(60)
        set(v) = sp.edit().putInt("intervalSec", v.coerceAtLeast(60)).apply()

    /** Czy usługa obserwacji powinna działać (do wznowienia po restarcie telefonu). */
    var watching: Boolean
        get() = sp.getBoolean("watching", false)
        set(v) = sp.edit().putBoolean("watching", v).apply()

    var lastStatus: String
        get() = sp.getString("lastStatus", "") ?: ""
        set(v) = sp.edit().putString("lastStatus", v).apply()

    var lastResult: String
        get() = sp.getString("lastResult", "") ?: ""
        set(v) = sp.edit().putString("lastResult", v).apply()

    var lastCheckMillis: Long
        get() = sp.getLong("lastCheck", 0L)
        set(v) = sp.edit().putLong("lastCheck", v).apply()

    fun registerListener(l: SharedPreferences.OnSharedPreferenceChangeListener) = sp.registerOnSharedPreferenceChangeListener(l)
    fun unregisterListener(l: SharedPreferences.OnSharedPreferenceChangeListener) = sp.unregisterOnSharedPreferenceChangeListener(l)
}
