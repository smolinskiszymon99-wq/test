package pl.tablet.wififloat

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.PixelFormat
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import kotlin.math.abs

class FloatingWifiService : Service() {
    private lateinit var windowManager: WindowManager
    private lateinit var prefs: Prefs
    private lateinit var wifi: WifiController
    private var overlay: View? = null
    private var button: ImageView? = null
    private var params: WindowManager.LayoutParams? = null
    private val handler = Handler(Looper.getMainLooper())

    private val wifiReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            refreshButton()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        prefs = Prefs(this)
        wifi = WifiController(this)
        createChannel()
        startForeground(NOTIF_ID, buildNotification())
        showOverlay()
        registerWifiReceiver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                prefs.enabled = false
                stopSelf()
                return START_NOT_STICKY
            }
        }
        prefs.enabled = true
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        try {
            unregisterReceiver(wifiReceiver)
        } catch (_: Exception) {
        }
        overlay?.let {
            try {
                windowManager.removeView(it)
            } catch (_: Exception) {
            }
        }
        overlay = null
        super.onDestroy()
    }

    private fun showOverlay() {
        if (overlay != null) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !SettingsCompat.canDrawOverlays(this)) {
            Toast.makeText(this, R.string.need_overlay, Toast.LENGTH_LONG).show()
            stopSelf()
            return
        }

        val view = LayoutInflater.from(this).inflate(R.layout.overlay_wifi_button, null)
        val btn = view.findViewById<ImageView>(R.id.btnWifi)
        button = btn

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.START

        val dm = resources.displayMetrics
        val savedX = prefs.buttonX
        lp.x = if (savedX >= 0) savedX else (dm.widthPixels - dp(72))
        lp.y = prefs.buttonY.coerceAtLeast(0)
        params = lp

        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var moved = false

        btn.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    startX = lp.x
                    startY = lp.y
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - downX).toInt()
                    val dy = (event.rawY - downY).toInt()
                    if (abs(dx) > 8 || abs(dy) > 8) moved = true
                    lp.x = (startX + dx).coerceAtLeast(0)
                    lp.y = (startY + dy).coerceAtLeast(0)
                    windowManager.updateViewLayout(view, lp)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    prefs.buttonX = lp.x
                    prefs.buttonY = lp.y
                    if (!moved) onButtonClick()
                    true
                }
                else -> false
            }
        }

        overlay = view
        windowManager.addView(view, lp)
        refreshButton()
    }

    private fun onButtonClick() {
        val result = wifi.toggle()
        refreshButton()
        // Po chwili odśwież stan (przełączenie bywa asynchroniczne)
        handler.postDelayed({ refreshButton() }, 800)
        handler.postDelayed({ refreshButton() }, 2000)

        if (!result.ok && result.message != null) {
            Toast.makeText(this, result.message, Toast.LENGTH_LONG).show()
        }
    }

    private fun refreshButton() {
        val on = wifi.isEnabled()
        button?.setImageResource(if (on) R.drawable.ic_wifi_on else R.drawable.ic_wifi_off)
        button?.contentDescription = getString(if (on) R.string.wifi_on else R.string.wifi_off)
        button?.alpha = if (on) 1f else 0.85f
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIF_ID, buildNotification())
    }

    private fun registerWifiReceiver() {
        val filter = IntentFilter().apply {
            addAction(WifiManager.WIFI_STATE_CHANGED_ACTION)
            addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(wifiReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(wifiReceiver, filter)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notif_channel),
            NotificationManager.IMPORTANCE_LOW
        )
        channel.setShowBadge(false)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, FloatingWifiService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val state = if (wifi.isEnabled()) getString(R.string.wifi_on) else getString(R.string.wifi_off)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_wifi_on)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(state)
            .setContentIntent(open)
            .addAction(0, getString(R.string.stop), stop)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    companion object {
        const val ACTION_STOP = "pl.tablet.wififloat.STOP"
        private const val CHANNEL_ID = "wifi_float"
        private const val NOTIF_ID = 42

        fun start(context: Context) {
            val i = Intent(context, FloatingWifiService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(i)
            } else {
                context.startService(i)
            }
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, FloatingWifiService::class.java).setAction(ACTION_STOP)
            )
        }
    }
}

/** Mały helper – unikamy zależności od SettingsCompat z AppCompat do canDrawOverlays. */
object SettingsCompat {
    fun canDrawOverlays(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.provider.Settings.canDrawOverlays(context)
        } else true
    }
}
