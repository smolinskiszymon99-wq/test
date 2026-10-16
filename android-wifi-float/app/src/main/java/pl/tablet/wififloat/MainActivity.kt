package pl.tablet.wififloat

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs
    private lateinit var status: TextView
    private lateinit var btnToggle: Button
    private lateinit var btnOverlay: Button
    private lateinit var btnBattery: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)

        status = findViewById(R.id.status)
        btnToggle = findViewById(R.id.btnToggle)
        btnOverlay = findViewById(R.id.btnOverlay)
        btnBattery = findViewById(R.id.btnBattery)
        val btnAdb = findViewById<Button>(R.id.btnAdbHelp)

        btnToggle.setOnClickListener { toggleFloat() }
        btnOverlay.setOnClickListener { openOverlaySettings() }
        btnBattery.setOnClickListener { requestBatteryExemption() }
        btnAdb.setOnClickListener {
            Toast.makeText(this, R.string.adb_hint_toast, Toast.LENGTH_LONG).show()
        }

        maybeRequestNotifications()
        refreshUi()
    }

    override fun onResume() {
        super.onResume()
        refreshUi()
        // Jeśli użytkownik właśnie włączył overlay i przycisk był oczekiwany – wystartuj
        if (prefs.enabled && SettingsCompat.canDrawOverlays(this)) {
            FloatingWifiService.start(this)
        }
    }

    private fun toggleFloat() {
        if (prefs.enabled) {
            prefs.enabled = false
            FloatingWifiService.stop(this)
            refreshUi()
            return
        }

        if (!SettingsCompat.canDrawOverlays(this)) {
            Toast.makeText(this, R.string.need_overlay, Toast.LENGTH_LONG).show()
            openOverlaySettings()
            return
        }

        prefs.enabled = true
        FloatingWifiService.start(this)
        refreshUi()
    }

    private fun refreshUi() {
        val on = prefs.enabled
        btnToggle.text = getString(if (on) R.string.stop_float else R.string.start_float)
        val overlayOk = SettingsCompat.canDrawOverlays(this)
        status.text = buildString {
            append(if (on) getString(R.string.status_running) else getString(R.string.status_stopped))
            append("\n")
            append(
                if (overlayOk) getString(R.string.overlay_granted)
                else getString(R.string.overlay_missing)
            )
            append("\n\n")
            append(getString(R.string.adb_commands))
        }
    }

    private fun openOverlaySettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName")
        )
        startActivity(intent)
    }

    private fun requestBatteryExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val pm = getSystemService(PowerManager::class.java)
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            Toast.makeText(this, R.string.battery_ok, Toast.LENGTH_SHORT).show()
            return
        }
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$packageName")
        }
        startActivity(intent)
    }

    private fun maybeRequestNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) return
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            100
        )
    }
}
