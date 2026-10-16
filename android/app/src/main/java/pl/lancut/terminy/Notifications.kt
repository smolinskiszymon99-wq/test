package pl.lancut.terminy

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat

object Notifications {
    const val CHANNEL_ALERTS = "terminy_alerts"
    const val CHANNEL_SERVICE = "terminy_service"
    const val ID_SERVICE = 1
    const val ID_ALERT = 2

    fun createChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)

        val alerts = NotificationChannel(
            CHANNEL_ALERTS, "Nowe terminy", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Powiadomienie, gdy pojawi się wolny termin"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 300, 500, 300, 500)
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            setBypassDnd(true)
        }
        val service = NotificationChannel(
            CHANNEL_SERVICE, "Obserwacja w tle", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Stałe powiadomienie, dopóki aplikacja sprawdza terminy"
            setShowBadge(false)
        }
        nm.createNotificationChannel(alerts)
        nm.createNotificationChannel(service)
    }

    private fun openAppIntent(context: Context): PendingIntent = PendingIntent.getActivity(
        context, 0,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    private fun openSiteIntent(context: Context): PendingIntent = PendingIntent.getActivity(
        context, 1,
        Intent(Intent.ACTION_VIEW, android.net.Uri.parse(LivewireClient.BASE_URL)),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    fun serviceNotification(context: Context, text: String): Notification {
        val stop = PendingIntent.getService(
            context, 2,
            Intent(context, WatchService::class.java).setAction(WatchService.ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(context, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_car)
            .setContentTitle("Szukam terminu…")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openAppIntent(context))
            .addAction(0, "Zatrzymaj", stop)
            .build()
    }

    fun showAlert(context: Context, title: String, text: String) {
        val n = NotificationCompat.Builder(context, CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_car)
            .setContentTitle(title)
            .setContentText(text.lineSequence().firstOrNull() ?: text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(openSiteIntent(context))
            .addAction(0, "Otwórz stronę rezerwacji", openSiteIntent(context))
            .build()
        runCatching { context.getSystemService(NotificationManager::class.java).notify(ID_ALERT, n) }
    }
}
