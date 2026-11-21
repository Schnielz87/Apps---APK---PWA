package de.dartsarena.app

import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
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

    @JavascriptInterface
    fun stopSpeak() { runCatching { tts?.stop() } }

    @JavascriptInterface
    fun keepAwake(on: Boolean) = act.keepAwake(on)

    @JavascriptInterface
    fun saveFile(name: String, text: String) = act.saveText(name, text)

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
