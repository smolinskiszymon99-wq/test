package pl.lancut.terminy

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

data class Service(val id: Int, val name: String, val inactive: Boolean)

/** Mapa data -> posortowana lista godzin "HH:mm". */
typealias Slots = Map<LocalDate, List<String>>

object SlotFinder {

    val SERVICES = mapOf(1 to "Rejestracja pojazdów", 2 to "Prawa jazdy")
    private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy")

    /**
     * Livewire pakuje kolekcje/daty w pary [wartość, meta]. Zwraca samą wartość.
     */
    private fun unwrap(value: Any?): Any? = when (value) {
        is JSONArray -> {
            if (value.length() == 2 && value.opt(1) is JSONObject && (value.opt(1) as JSONObject).has("s")) {
                unwrap(value.opt(0))
            } else {
                List(value.length()) { unwrap(value.opt(it)) }
            }
        }
        is JSONObject -> value.keys().asSequence().associateWith { unwrap(value.opt(it)) }
        JSONObject.NULL -> null
        else -> value
    }

    @Suppress("UNCHECKED_CAST")
    private fun asMap(v: Any?) = v as? Map<String, Any?> ?: emptyMap()

    private fun asList(v: Any?) = v as? List<Any?> ?: emptyList()

    private fun parseDate(v: Any?): LocalDate = LocalDate.parse(v.toString().substring(0, 10))

    fun listServices(client: LivewireClient): List<Service> =
        asList(unwrap(client.data.opt("services"))).map {
            val m = asMap(it)
            Service((m["id"] as Number).toInt(), m["name"].toString(), m["inactive"] == true)
        }

    /** Pełne przejście: wybór usługi -> krok z kalendarzem -> każdy dostępny dzień. */
    fun findSlots(serviceId: Int, onProgress: ((String) -> Unit)? = null): Slots {
        val client = LivewireClient()
        onProgress?.invoke("Łączenie ze stroną…")
        client.openForm()

        val services = listServices(client)
        val service = services.firstOrNull { it.id == serviceId }
            ?: throw SiteException("Usługa #$serviceId nie istnieje. Dostępne: ${services.joinToString { "${it.id} = ${it.name}" }}")
        if (service.inactive) throw SiteException("Usługa „${service.name}” jest obecnie nieaktywna.")

        client.call("selectService", serviceId)
        client.call("nextStep")

        val data = client.data
        val step = (asMap(unwrap(data.opt("currentStep")))["index"] as? Number)?.toInt()
        if (step != 3 || data.isNull("calendar")) throw SiteException("Nie udało się przejść do wyboru terminu.")

        val today = LocalDate.now()
        val limit = parseDate(unwrap(data.opt("calendarLimit")))
        val result = sortedMapOf<LocalDate, List<String>>()

        var month = YearMonth.from(today)
        val lastMonth = YearMonth.from(limit)
        var first = true
        while (month <= lastMonth) {
            if (!first) client.call("setCalendar", month.monthValue, month.year)
            first = false

            val days = asList(unwrap(client.data.opt("calendar")))
                .map { asMap(it) }
                .filter { it["isAvailable"] == true }
                .map { parseDate(it["date"]) }
                .filter { it in today..limit }

            for (day in days) {
                onProgress?.invoke("Sprawdzam ${day.format(DAY_FORMAT)}…")
                client.call("updateTimeOptions", day.format(DAY_FORMAT))
                val hours = asList(unwrap(client.data.opt("timeOptions"))).map { it.toString() }.sorted()
                if (hours.isNotEmpty()) result[day] = hours
            }
            month = month.plusMonths(1)
        }
        return result
    }

    fun filterBefore(slots: Slots, before: LocalDate?): Slots =
        if (before == null) slots else slots.filterKeys { it.isBefore(before) }

    private val WEEKDAYS = listOf("pon", "wt", "śr", "czw", "pt", "sob", "nd")

    fun format(slots: Slots, compact: Boolean = false): String {
        if (slots.isEmpty()) return "Brak wolnych terminów."
        return slots.entries.joinToString("\n") { (day, hours) ->
            val label = "${day} (${WEEKDAYS[day.dayOfWeek.value - 1]})"
            if (compact && hours.size > 6) "$label: ${hours.size} godzin (${hours.first()}–${hours.last()})"
            else "$label: ${hours.joinToString(", ")}"
        }
    }
}
