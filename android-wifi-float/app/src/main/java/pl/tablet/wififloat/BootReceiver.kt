package pl.tablet.wififloat

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Po restarcie tabletu wznawia pływający przycisk, jeśli był włączony. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        val prefs = Prefs(context)
        if (!prefs.enabled) return

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                FloatingWifiService.start(context)
            }
        }
    }
}
