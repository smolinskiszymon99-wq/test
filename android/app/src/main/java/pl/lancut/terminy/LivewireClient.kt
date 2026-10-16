package pl.lancut.terminy

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

class SiteException(message: String, cause: Throwable? = null) : IOException(message, cause)

/**
 * Minimalny klient protokołu Livewire v3 dla komponentu "reservation-form"
 * na stronie komunikacja.powiatlancut.pl. Odpowiednik klasy LivewireClient
 * ze skryptu szukaj_terminu.py.
 */
class LivewireClient(private val baseUrl: String = BASE_URL) {

    private val cookies = CookieManager(null, CookiePolicy.ACCEPT_ALL)
    private var csrf = ""
    private var updateUrl = ""

    /** Surowy JSON snapshotu komponentu – przekazywany w każdym kolejnym żądaniu. */
    var snapshot: String = ""
        private set

    val data: JSONObject
        get() = JSONObject(snapshot).getJSONObject("data")

    fun openForm() {
        val page = fetch(URL("$baseUrl/"), null)

        csrf = Regex("name=\"csrf-token\"\\s+content=\"([^\"]+)\"").find(page)?.groupValues?.get(1)
            ?: throw SiteException("Nie znaleziono tokenu CSRF na stronie.")

        val endpoint = Regex("(livewire-[A-Za-z0-9]+)/update").find(page)?.groupValues?.get(1)
            ?: throw SiteException("Nie znaleziono adresu endpointu Livewire.")
        updateUrl = "$baseUrl/$endpoint/update"

        snapshot = ""
        for (m in Regex("wire:snapshot=\"([^\"]+)\"").findAll(page)) {
            val raw = Html.unescape(m.groupValues[1])
            val snap = runCatching { JSONObject(raw) }.getOrNull() ?: continue
            if (snap.optJSONObject("memo")?.optString("name") == "reservation-form") {
                snapshot = raw
                break
            }
        }
        if (snapshot.isEmpty()) throw SiteException("Nie znaleziono formularza rezerwacji na stronie.")
    }

    fun call(method: String, vararg params: Any): JSONObject {
        val body = JSONObject()
            .put("_token", csrf)
            .put(
                "components", JSONArray().put(
                    JSONObject()
                        .put("snapshot", snapshot)
                        .put("updates", JSONObject())
                        .put(
                            "calls", JSONArray().put(
                                JSONObject()
                                    .put("path", "")
                                    .put("method", method)
                                    .put("params", JSONArray(params.toList()))
                            )
                        )
                )
            )
        val text = fetch(URL(updateUrl), body.toString())
        val payload = runCatching { JSONObject(text) }.getOrElse {
            throw SiteException("$method: odpowiedź serwera nie jest JSON-em.")
        }
        val component = payload.optJSONArray("components")?.optJSONObject(0)
            ?: throw SiteException("$method: nieoczekiwana odpowiedź serwera.")
        snapshot = component.optString("snapshot").ifEmpty {
            throw SiteException("$method: brak snapshotu w odpowiedzi.")
        }
        return component.optJSONObject("effects") ?: JSONObject()
    }

    private fun fetch(url: URL, jsonBody: String?): String {
        val conn = url.openConnection() as HttpURLConnection
        conn.connectTimeout = TIMEOUT_MS
        conn.readTimeout = TIMEOUT_MS
        conn.setRequestProperty("User-Agent", USER_AGENT)
        conn.setRequestProperty("Accept-Language", "pl")
        conn.setRequestProperty("Accept-Encoding", "gzip")
        cookies.get(url.toURI(), emptyMap()).forEach { (k, v) -> conn.setRequestProperty(k, v.joinToString("; ")) }

        if (jsonBody != null) {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("X-Livewire", "")
            conn.setRequestProperty("X-CSRF-TOKEN", csrf)
            conn.setRequestProperty("Referer", "$baseUrl/")
            conn.setRequestProperty("Origin", baseUrl)
            conn.outputStream.use { it.write(jsonBody.toByteArray(Charsets.UTF_8)) }
        }

        try {
            val code = conn.responseCode
            cookies.put(url.toURI(), conn.headerFields.filterKeys { it != null })
            if (code != 200) throw SiteException("HTTP $code (${conn.responseMessage})")
            val stream = if (conn.contentEncoding.equals("gzip", ignoreCase = true)) {
                GZIPInputStream(conn.inputStream)
            } else {
                conn.inputStream
            }
            return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        const val BASE_URL = "https://komunikacja.powiatlancut.pl"
        private const val TIMEOUT_MS = 30_000
        private const val USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
    }
}

/** Odkodowanie encji HTML w atrybucie wire:snapshot (bez zależności od android.text.Html). */
object Html {
    private val named = mapOf("quot" to "\"", "amp" to "&", "lt" to "<", "gt" to ">", "apos" to "'", "#39" to "'")

    fun unescape(s: String): String =
        Regex("&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+|#39);").replace(s) { m ->
            val e = m.groupValues[1]
            when {
                e.startsWith("#x") -> e.substring(2).toInt(16).toChar().toString()
                e.startsWith("#") -> e.substring(1).toInt().toChar().toString()
                else -> named[e] ?: m.value
            }
        }
}
