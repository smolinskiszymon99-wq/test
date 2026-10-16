package pl.lancut.terminy

import android.Manifest
import android.app.DatePickerDialog
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.ArrayAdapter
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import pl.lancut.terminy.databinding.ActivityMainBinding
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : AppCompatActivity() {

    private lateinit var b: ActivityMainBinding
    private lateinit var prefs: Prefs
    private val serviceIds = SlotFinder.SERVICES.keys.toList()

    private val prefsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key == "lastStatus" || key == "lastResult" || key == "watching" || key == "lastCheck") runOnUiThread { renderState() }
    }

    private val notifPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { startWatching() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)
        prefs = Prefs(this)
        Notifications.createChannels(this)

        b.serviceSpinner.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item, serviceIds.map { SlotFinder.SERVICES[it] }
        )
        b.serviceSpinner.setSelection(serviceIds.indexOf(prefs.serviceId).coerceAtLeast(0))
        b.intervalInput.setText(prefs.intervalSec.toString())
        renderBefore()

        b.beforeButton.setOnClickListener { pickBeforeDate() }
        b.beforeClear.setOnClickListener { prefs.before = null; renderBefore() }
        b.startButton.setOnClickListener { onStartClicked() }
        b.stopButton.setOnClickListener { WatchService.stop(this); prefs.watching = false; renderState() }
        b.checkNowButton.setOnClickListener { checkOnce() }
        b.openSiteButton.setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(LivewireClient.BASE_URL)))
        }
        b.batteryButton.setOnClickListener { requestIgnoreBatteryOptimizations() }

        renderState()
    }

    override fun onResume() {
        super.onResume()
        prefs.registerListener(prefsListener)
        renderState()
    }

    override fun onPause() {
        prefs.unregisterListener(prefsListener)
        super.onPause()
    }

    private fun saveSettings() {
        prefs.serviceId = serviceIds[b.serviceSpinner.selectedItemPosition]
        prefs.intervalSec = b.intervalInput.text.toString().toIntOrNull() ?: 60
        b.intervalInput.setText(prefs.intervalSec.toString())
    }

    private fun onStartClicked() {
        saveSettings()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        startWatching()
    }

    private fun startWatching() {
        WatchService.start(this)
        prefs.watching = true
        prefs.lastStatus = "Uruchamianie…"
        renderState()
        if (!isIgnoringBatteryOptimizations()) requestIgnoreBatteryOptimizations()
    }

    private fun checkOnce() {
        saveSettings()
        b.checkNowButton.isEnabled = false
        b.statusText.text = "Sprawdzam…"
        val serviceId = prefs.serviceId
        val before = prefs.before
        lifecycleScope.launch {
            val text = withContext(Dispatchers.IO) {
                runCatching {
                    SlotFinder.format(SlotFinder.filterBefore(SlotFinder.findSlots(serviceId) { msg ->
                        runOnUiThread { b.statusText.text = msg }
                    }, before))
                }.getOrElse { "Błąd: ${it.message ?: it.javaClass.simpleName}" }
            }
            prefs.lastCheckMillis = System.currentTimeMillis()
            prefs.lastResult = text
            if (!prefs.watching) prefs.lastStatus = "Sprawdzono ręcznie."
            b.checkNowButton.isEnabled = true
            renderState()
        }
    }

    private fun pickBeforeDate() {
        val initial = prefs.before ?: LocalDate.now().plusWeeks(1)
        DatePickerDialog(
            this,
            { _, y, m, d -> prefs.before = LocalDate.of(y, m + 1, d); renderBefore() },
            initial.year, initial.monthValue - 1, initial.dayOfMonth
        ).apply { datePicker.minDate = System.currentTimeMillis() }.show()
    }

    private fun renderBefore() {
        val before = prefs.before
        b.beforeButton.text = before?.let { "Tylko terminy przed: ${it.format(DATE)}" } ?: "Dowolny termin (dotknij, by ustawić datę)"
        b.beforeClear.isEnabled = before != null
    }

    private fun renderState() {
        val watching = prefs.watching
        b.startButton.isEnabled = !watching
        b.stopButton.isEnabled = watching
        b.serviceSpinner.isEnabled = !watching
        b.intervalInput.isEnabled = !watching
        b.watchState.text = if (watching) "Obserwacja WŁĄCZONA" else "Obserwacja wyłączona"
        b.statusText.text = prefs.lastStatus.ifEmpty { "Jeszcze nie sprawdzano." }

        val last = prefs.lastCheckMillis
        b.resultHeader.text = if (last > 0) {
            "Wolne terminy (stan z ${Instant.ofEpochMilli(last).atZone(ZoneId.systemDefault()).format(DATETIME)}):"
        } else "Wolne terminy:"
        b.resultText.text = prefs.lastResult.ifEmpty { "–" }
        b.batteryButton.visibility = if (isIgnoringBatteryOptimizations()) android.view.View.GONE else android.view.View.VISIBLE
    }

    private fun isIgnoringBatteryOptimizations(): Boolean =
        getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)

    private fun requestIgnoreBatteryOptimizations() {
        runCatching {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
            )
        }.onFailure {
            runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        }
    }

    companion object {
        private val DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy")
        private val DATETIME: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM HH:mm:ss")
    }
}
