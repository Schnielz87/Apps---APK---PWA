package de.dartsarena.app

import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.util.Locale

/** Wird in der Web-Oberfläche als window.DartsNative angeboten (siehe web/js/native.js). */
class NativeBridge(private val act: MainActivity) {
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private val waiting = ArrayList<() -> Unit>()

    init {
        tts = TextToSpeech(act.applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            synchronized(waiting) { if (ttsReady) waiting.forEach { it() }; waiting.clear() }
        }
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) = done(id)
            @Deprecated("Deprecated in Java")
            override fun onError(id: String?) = done(id)
            override fun onError(id: String?, errorCode: Int) = done(id)
        })
    }

    private fun done(id: String?) { if (id != null) act.js("window.__onTtsDone && window.__onTtsDone(${JSONObject.quote(id)})") }

    @JavascriptInterface
    fun info(): String = JSONObject()
        .put("version", act.updates.currentVersion)
        .put("build", act.updates.currentBuild)
        .put("flavor", if (BuildConfig.PLAY_STORE) "play" else "github")
        .put("autoUpdate", act.updates.autoCheck)
        .toString()

    /** Caller: Text in der gewünschten Sprache/Tonhöhe/Geschwindigkeit sprechen (in die Warteschlange). */
    @JavascriptInterface
    fun speak(text: String, lang: String, pitch: Double, rate: Double, volume: Double, id: String) {
        val run: () -> Unit = {
            val t = tts
            if (t != null) {
                val loc = Locale.forLanguageTag(lang)
                if (t.isLanguageAvailable(loc) >= TextToSpeech.LANG_AVAILABLE) t.language = loc
                t.setPitch(pitch.toFloat().coerceIn(0.1f, 2f))
                t.setSpeechRate(rate.toFloat().coerceIn(0.3f, 2f))
                val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume.toFloat().coerceIn(0f, 1f)) }
                t.speak(text, TextToSpeech.QUEUE_ADD, params, id)
            } else {
                done(id)
            }
            Unit
        }
        if (ttsReady) run() else synchronized(waiting) { waiting.add(run) }
    }

    /** Wie speak, aber mit Wunsch-Geschlecht ("m"/"f") und optional fester Stimme (Name aus voices()). */
    @JavascriptInterface
    fun speak2(text: String, lang: String, pitch: Double, rate: Double, volume: Double, id: String, gender: String, voiceName: String) {
        val run: () -> Unit = {
            val t = tts
            if (t != null) {
                val v = chooseVoice(t, lang, gender, voiceName)
                if (v != null) t.voice = v else {
                    val loc = Locale.forLanguageTag(lang)
                    if (t.isLanguageAvailable(loc) >= TextToSpeech.LANG_AVAILABLE) t.language = loc
                }
                t.setPitch(pitch.toFloat().coerceIn(0.1f, 2f))
                t.setSpeechRate(rate.toFloat().coerceIn(0.3f, 2.5f))
                val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume.toFloat().coerceIn(0f, 1f)) }
                t.speak(text, TextToSpeech.QUEUE_ADD, params, id)
            } else {
                done(id)
            }
            Unit
        }
        if (ttsReady) run() else synchronized(waiting) { waiting.add(run) }
    }

    /** Gibt es auf dem Gerät eine Stimme dieser Sprache(nfamilie) mit dem Geschlecht? */
    @JavascriptInterface
    fun hasGenderVoice(lang: String, gender: String): Boolean = tts?.let { chooseVoice(it, lang, gender, "", strict = true) != null } ?: false

    /** Installierte Stimmen einer Sprache (z. B. "en") als JSON – für die Auswahl in den Einstellungen. */
    @JavascriptInterface
    fun voices(lang2: String): String {
        val arr = org.json.JSONArray()
        runCatching {
            tts?.voices?.filter { it.locale.language == lang2 && usable(it) }?.sortedBy { it.name }?.forEach {
                arr.put(JSONObject().put("name", it.name).put("locale", it.locale.toLanguageTag()).put("male", isMale(it)).put("female", isFemale(it)))
            }
        }
        return arr.toString()
    }

    private fun usable(v: Voice) = !v.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
    // Google-TTS-Kürzel (z. B. en-gb-x-gbd-local = männlich) und Samsung (SMTm = male)
    private val maleCodes = Regex("(?i)(\\bmale|-gbb|-gbd|-rjs|-iol|-iom|-tpd|-deg|-ded|-aub|-aud|-ene|smtm)")
    private val femaleCodes = Regex("(?i)(female|-gba|-gbc|-gbg|-iob|-iog|-sfg|-tpc|-tpf|-dea|-deb|-auc|smtf)")
    private fun isMale(v: Voice) = maleCodes.containsMatchIn(v.name) && !v.name.contains("female", true)
    private fun isFemale(v: Voice) = femaleCodes.containsMatchIn(v.name)

    private fun chooseVoice(t: TextToSpeech, lang: String, gender: String, voiceName: String, strict: Boolean = false): Voice? = runCatching {
        val all = t.voices?.filter { usable(it) } ?: return@runCatching null
        if (voiceName.isNotBlank()) all.firstOrNull { it.name == voiceName }?.let { return@runCatching it }
        val loc = Locale.forLanguageTag(lang)
        val exact = all.filter { it.locale.language == loc.language && it.locale.country.equals(loc.country, true) }
        val family = all.filter { it.locale.language == loc.language }
        val test: ((Voice) -> Boolean)? = when (gender) { "m" -> ::isMale; "f" -> ::isFemale; else -> null }
        // Offline-Stimmen bevorzugen (kein Internet nötig), dann beste Qualität
        val best = { l: List<Voice> -> l.sortedWith(compareBy<Voice> { it.isNetworkConnectionRequired }.thenByDescending { it.quality }).firstOrNull() }
        if (test != null) {
            best(exact.filter(test))?.let { return@runCatching it }
            best(family.filter(test))?.let { return@runCatching it }
            if (strict) return@runCatching null
        }
        null
    }.getOrNull()

    @JavascriptInterface
    fun stopSpeak() { runCatching { tts?.stop() } }

    @JavascriptInterface
    fun keepAwake(on: Boolean) = act.keepAwake(on)

    @JavascriptInterface
    fun saveFile(name: String, text: String) = act.saveText(name, text)

    /** Nur die eigene Download-Seite im Browser öffnen. */
    @JavascriptInterface
    fun openUrl(url: String) {
        if (!url.startsWith("https://github.com/Schnielz87/Apps---APK---PWA")) return
        act.runOnUiThread { runCatching { act.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))) } }
    }

    // ---------------------------------------------------------------- Updates (nur GitHub-APK)
    @JavascriptInterface
    fun startAutoCheck() { if (!BuildConfig.PLAY_STORE) act.updates.startAutoCheck() }

    @JavascriptInterface
    fun checkUpdate() { if (!BuildConfig.PLAY_STORE) act.updates.check(silent = false) }

    @JavascriptInterface
    fun installUpdate() { if (!BuildConfig.PLAY_STORE) act.updates.downloadAndInstall() }

    @JavascriptInterface
    fun setAutoUpdate(on: Boolean) = act.updates.setAutoCheck(on)

    fun shutdown() { runCatching { tts?.shutdown() }; tts = null }
}
