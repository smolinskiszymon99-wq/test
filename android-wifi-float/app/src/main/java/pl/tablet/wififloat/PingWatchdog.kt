package pl.tablet.wififloat

import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Co [Prefs.PING_INTERVAL_MS] pinguje [Prefs.pingHost].
 * Gdy brak odpowiedzi dłużej niż [Prefs.FAIL_MS]: Wi-Fi OFF → czekaj [Prefs.OFF_MS] → Wi-Fi ON.
 */
class PingWatchdog(
    private val prefs: Prefs,
    private val wifi: WifiController,
    private val onStatus: (String) -> Unit = {},
    private val onWifiChanged: () -> Unit = {}
) {
    private val main = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)
    private var tickFuture: Future<*>? = null

    @Volatile private var failSinceMs: Long = 0L
    @Volatile private var cooldownUntilMs: Long = 0L
    @Volatile private var restarting = false
    @Volatile private var lastStatus: String = ""

    fun start() {
        if (!running.compareAndSet(false, true)) return
        failSinceMs = 0L
        scheduleNext(0L)
        publish("Watchdog: start (${prefs.pingHost})")
    }

    fun stop() {
        running.set(false)
        tickFuture?.cancel(true)
        tickFuture = null
        failSinceMs = 0L
        restarting = false
        publish("Watchdog: stop")
    }

    fun shutdown() {
        stop()
        executor.shutdownNow()
    }

    fun reload() {
        if (!running.get()) return
        failSinceMs = 0L
        publish("Watchdog: host=${prefs.pingHost}")
    }

    private fun scheduleNext(delayMs: Long) {
        if (!running.get()) return
        tickFuture = executor.submit {
            if (delayMs > 0) {
                try {
                    Thread.sleep(delayMs)
                } catch (_: InterruptedException) {
                    return@submit
                }
            }
            if (!running.get()) return@submit
            tick()
            if (running.get() && !restarting) {
                scheduleNext(Prefs.PING_INTERVAL_MS)
            }
        }
    }

    private fun tick() {
        if (!prefs.watchdogEnabled) {
            publish("Watchdog: wyłączony")
            return
        }
        if (!wifi.isEnabled()) {
            failSinceMs = 0L
            publish("Watchdog: Wi-Fi wyłączone – czekam")
            return
        }
        val now = System.currentTimeMillis()
        if (now < cooldownUntilMs) {
            val left = ((cooldownUntilMs - now) / 1000L).coerceAtLeast(0)
            publish("Watchdog: cooldown ${left}s")
            return
        }
        if (restarting) return

        val host = prefs.pingHost
        val ok = ping(host)
        if (ok) {
            failSinceMs = 0L
            publish("Watchdog: OK ($host)")
            return
        }

        if (failSinceMs == 0L) {
            failSinceMs = now
            publish("Watchdog: brak ping ($host)…")
            return
        }

        val failedFor = now - failSinceMs
        publish("Watchdog: brak ping ${failedFor / 1000}s / ${Prefs.FAIL_MS / 1000}s")
        if (failedFor >= Prefs.FAIL_MS) {
            doRestart(host)
        }
    }

    private fun doRestart(host: String) {
        restarting = true
        failSinceMs = 0L
        publish("Watchdog: restart Wi-Fi (ping $host > ${Prefs.FAIL_MS / 1000}s)")
        Log.i(TAG, "Restart Wi-Fi after ping fail to $host")

        wifi.setEnabled(false)
        main.post { onWifiChanged() }

        try {
            Thread.sleep(Prefs.OFF_MS)
        } catch (_: InterruptedException) {
            restarting = false
            return
        }

        if (!running.get()) {
            restarting = false
            return
        }

        wifi.setEnabled(true)
        main.post { onWifiChanged() }
        cooldownUntilMs = System.currentTimeMillis() + Prefs.COOLDOWN_MS
        restarting = false
        publish("Watchdog: Wi-Fi włączone, cooldown ${Prefs.COOLDOWN_MS / 1000}s")
        // kolejny tick planuje wywołujący scheduleNext po wyjściu z tick()
    }

    /**
     * ICMP ping przez binarkę systemową (jak w MacroDroid / skryptach ADB).
     * Fallback: TCP connect :443 (gdy ping zablokowany).
     */
    private fun ping(host: String): Boolean {
        if (icmpPing(host)) return true
        return tcpProbe(host, 443) || tcpProbe(host, 53)
    }

    private fun icmpPing(host: String): Boolean {
        return try {
            val process = ProcessBuilder("ping", "-c", "1", "-W", "2", host)
                .redirectErrorStream(true)
                .start()
            val finished = process.waitFor(3, TimeUnit.SECONDS)
            if (!finished) {
                process.destroyForcibly()
                false
            } else {
                process.exitValue() == 0
            }
        } catch (e: Exception) {
            Log.w(TAG, "icmp ping failed", e)
            false
        }
    }

    private fun tcpProbe(host: String, port: Int): Boolean {
        return try {
            java.net.Socket().use { socket ->
                socket.connect(java.net.InetSocketAddress(host, port), 2000)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun publish(msg: String) {
        lastStatus = msg
        main.post { onStatus(msg) }
    }

    fun status(): String = lastStatus

    companion object {
        private const val TAG = "PingWatchdog"
    }
}
