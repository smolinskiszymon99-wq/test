package pl.lancut.terminy

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlin.random.Random

/**
 * Usługa pierwszoplanowa: w pętli sprawdza wolne terminy i powiadamia o nowych.
 * Odpowiednik trybu --watch ze skryptu.
 */
class WatchService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var prefs: Prefs

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        Notifications.createChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            prefs.watching = false
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = Notifications.serviceNotification(this, "Uruchamianie…")
        // Typ "specialUse" istnieje od Androida 14; starsze wersje nie wymagają typu.
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, Notifications.ID_SERVICE, notification, type)

        if (wakeLock == null) {
            wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "terminy:watch")
                .apply { acquire() }
        }

        prefs.watching = true
        if (job?.isActive != true) job = scope.launch { loop() }
        return START_STICKY
    }

    private suspend fun loop() {
        val known = mutableSetOf<Pair<LocalDate, String>>()
        var firstRun = true
        val serviceName = SlotFinder.SERVICES[prefs.serviceId] ?: "usługa #${prefs.serviceId}"

        while (scope.isActive) {
            val before = prefs.before
            val stamp = LocalTime.now().format(TIME)
            try {
                val slots = SlotFinder.filterBefore(
                    SlotFinder.findSlots(prefs.serviceId) { updateStatus(it) },
                    before
                )
                val current = slots.flatMap { (d, hs) -> hs.map { d to it } }.toSet()
                val fresh = current - known
                known.clear(); known.addAll(current)

                prefs.lastCheckMillis = System.currentTimeMillis()
                prefs.lastResult = SlotFinder.format(slots)

                if (fresh.isNotEmpty()) {
                    val freshSlots = fresh.groupBy({ it.first }, { it.second })
                        .toSortedMap().mapValues { it.value.sorted() }
                    val title = if (firstRun) "Wolny termin: $serviceName" else "NOWY termin: $serviceName"
                    Notifications.showAlert(this, title, SlotFinder.format(freshSlots, compact = true))
                    updateStatus("[$stamp] ${if (firstRun) "Znaleziono" else "Nowe"}: ${fresh.size} godz. Następne sprawdzenie za ~${prefs.intervalSec} s.")
                } else {
                    updateStatus(
                        "[$stamp] Bez zmian (${current.size} wolnych godzin${before?.let { " przed $it" } ?: ""}). " +
                            "Następne sprawdzenie za ~${prefs.intervalSec} s."
                    )
                }
                firstRun = false
            } catch (e: Exception) {
                updateStatus("[$stamp] Błąd: ${e.message ?: e.javaClass.simpleName}. Ponowię za ~${prefs.intervalSec} s.")
            }

            // Losowy rozrzut, żeby nie odpytywać serwera urzędu w stałym rytmie.
            val pause = prefs.intervalSec * 1000L + Random.nextLong(0, prefs.intervalSec * 200L)
            delay(pause)
        }
    }

    private fun updateStatus(text: String) {
        prefs.lastStatus = text
        val nm = getSystemService(android.app.NotificationManager::class.java)
        runCatching { nm.notify(Notifications.ID_SERVICE, Notifications.serviceNotification(this, text)) }
    }

    override fun onDestroy() {
        job?.cancel()
        scope.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        prefs.lastStatus = "Zatrzymano."
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "pl.lancut.terminy.STOP"
        private val TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")

        fun start(context: Context) {
            context.startForegroundService(Intent(context, WatchService::class.java))
        }

        fun stop(context: Context) {
            context.startService(Intent(context, WatchService::class.java).setAction(ACTION_STOP))
        }
    }
}
