package de.dartsarena.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** Eine veröffentlichte Version (GitHub-Release). */
data class ReleaseInfo(val tag: String, val build: Int, val notes: String, val apkUrl: String?)

/**
 * Updates direkt von GitHub – gleiches Schema wie PowerIPTV und KI-Transkribierung:
 * alle 24 h prüfen (abschaltbar), Hinweis in der App, APK laden, Android-Installer öffnen.
 * Im Repo liegen mehrere Apps → nur Releases mit dem Tag-Präfix [TAG_PREFIX] zählen (nie „releases/latest“).
 * Die neue APK ist mit demselben Schlüssel signiert – Statistik, Profile und Einstellungen bleiben erhalten.
 */
class UpdateManager(private val act: MainActivity) {
    private val prefs = act.getSharedPreferences("update", Context.MODE_PRIVATE)
    private val pool = Executors.newSingleThreadScheduledExecutor()
    private var loop: ScheduledFuture<*>? = null
    @Volatile private var available: ReleaseInfo? = null
    @Volatile private var busy = false

    val currentVersion: String = runCatching { act.packageManager.getPackageInfo(act.packageName, 0).versionName }.getOrNull() ?: "?"
    val currentBuild: Int = buildOf(currentVersion) ?: 0
    val autoCheck: Boolean get() = prefs.getBoolean("auto", true)
    private val lastCheck: Long get() = prefs.getLong("last", 0L)

    fun setAutoCheck(on: Boolean) = prefs.edit().putBoolean("auto", on).apply()

    /** Beim Start und danach stündlich nachsehen, ob die 24 h um sind. */
    fun startAutoCheck() {
        cleanup()
        if (loop != null) { available?.let { act.emit("update", it.toJson()) }; return }
        loop = pool.scheduleWithFixedDelay({
            if (autoCheck && System.currentTimeMillis() - lastCheck > INTERVAL) runCheck(silent = true)
        }, 3, 3600, TimeUnit.SECONDS)
    }

    fun stop() { loop?.cancel(true); pool.shutdownNow() }

    fun check(silent: Boolean) { pool.execute { runCheck(silent) } }

    private fun status(text: String, checking: Boolean = false) =
        act.emit("updateStatus", JSONObject().put("text", text).put("checking", checking))

    private fun runCheck(silent: Boolean) {
        if (!silent) status("Suche nach Updates …", true)
        try {
            val r = latest()
            prefs.edit().putLong("last", System.currentTimeMillis()).apply()
            if (r != null && r.build > currentBuild && r.apkUrl != null) {
                available = r
                act.emit("update", r.toJson())
                status("Neue Version ${r.tag.removePrefix(TAG_PREFIX)} verfügbar")
            } else {
                available = null
                act.emit("update", null)
                if (!silent) status("Du hast die neueste Version ($currentVersion)")
            }
        } catch (e: Exception) {
            if (!silent) status(e.message ?: "Update-Prüfung fehlgeschlagen")
        }
    }

    private fun latest(): ReleaseInfo? {
        val conn = open("https://api.github.com/repos/$REPO/releases?per_page=50")
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        try {
            when (val code = conn.responseCode) {
                403, 429 -> throw IOException("GitHub ist gerade ausgelastet – bitte später erneut versuchen")
                404 -> throw IOException("Noch keine Version veröffentlicht")
                !in 200..299 -> throw IOException("Update-Prüfung fehlgeschlagen (HTTP $code)")
            }
            val arr = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
            var best: ReleaseInfo? = null
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                if (o.optBoolean("draft") || o.optBoolean("prerelease")) continue
                val tag = o.optString("tag_name")
                if (!tag.startsWith(TAG_PREFIX)) continue
                val b = buildOf(tag) ?: continue
                if (best != null && b <= best.build) continue
                var apk: String? = null
                val assets = o.optJSONArray("assets") ?: JSONArray()
                for (k in 0 until assets.length()) {
                    val a = assets.getJSONObject(k)
                    if (a.optString("name") == APK_NAME) apk = a.optString("browser_download_url")
                }
                best = ReleaseInfo(tag, b, o.optString("body"), apk)
            }
            return best
        } finally { conn.disconnect() }
    }

    private fun updateDir() = File(act.getExternalFilesDir(null) ?: act.cacheDir, "update")
    private fun cleanup() { runCatching { updateDir().listFiles()?.forEach { it.delete() } } }

    private fun canInstall() = Build.VERSION.SDK_INT < 26 || act.packageManager.canRequestPackageInstalls()

    /** APK laden und den Android-Installer öffnen. */
    fun downloadAndInstall() {
        val r = available
        if (r == null) { check(silent = false); return }
        if (busy) return
        if (!canInstall()) {
            status("Bitte „Unbekannte Apps installieren“ für Darts Arena erlauben und erneut tippen")
            if (Build.VERSION.SDK_INT >= 26) act.runOnUiThread {
                act.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${act.packageName}")))
            }
            return
        }
        busy = true
        pool.execute {
            val dir = updateDir().apply { mkdirs() }
            val file = File(dir, "DartsArena-${r.tag}.apk")
            val tmp = File(dir, file.name + ".part")
            try {
                status("Lade ${r.tag.removePrefix(TAG_PREFIX)} …")
                val conn = open(r.apkUrl!!)
                try {
                    if (conn.responseCode !in 200..299) throw IOException("Download fehlgeschlagen (HTTP ${conn.responseCode})")
                    val total = conn.contentLengthLong
                    var done = 0L
                    var last = 0L
                    conn.inputStream.use { input ->
                        tmp.outputStream().buffered().use { out ->
                            val buf = ByteArray(64 * 1024)
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                done += n
                                if (total > 0 && done - last > 128 * 1024) { last = done; act.emit("updateProgress", JSONObject().put("p", done.toDouble() / total)) }
                            }
                        }
                    }
                } finally { conn.disconnect() }
                if (!tmp.renameTo(file)) throw IOException("Datei konnte nicht gespeichert werden")
                act.emit("updateProgress", JSONObject().put("p", JSONObject.NULL))
                status("Installation wird geöffnet …")
                val uri = FileProvider.getUriForFile(act, "${act.packageName}.updates", file)
                act.runOnUiThread {
                    act.startActivity(
                        Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }
            } catch (e: Exception) {
                tmp.delete()
                act.emit("updateProgress", JSONObject().put("p", JSONObject.NULL))
                status(e.message ?: "Download fehlgeschlagen")
            } finally { busy = false }
        }
    }

    private fun open(url: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000
        c.readTimeout = 30000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "DartsArena-Android/$currentVersion")
        return c
    }

    private fun ReleaseInfo.toJson() = JSONObject().put("tag", tag.removePrefix(TAG_PREFIX)).put("build", build).put("notes", notes)

    companion object {
        /** Öffentliches Repo mit den Releases (Code und Downloads). */
        const val REPO = "Schnielz87/Apps---APK---PWA"
        /** Tag je Version: darts-v1.0.<Laufnummer> – andere Apps im selben Repo stören nicht. */
        const val TAG_PREFIX = "darts-v"
        /** Fester Dateiname am Release – nie ändern, die App sucht danach. */
        const val APK_NAME = "Darts-Arena.apk"
        const val INTERVAL = 24 * 3600 * 1000L

        fun buildOf(v: String): Int? = Regex("""(\d+)\.(\d+)\.(\d+)""").find(v)?.groupValues?.get(3)?.toIntOrNull()
    }
}
