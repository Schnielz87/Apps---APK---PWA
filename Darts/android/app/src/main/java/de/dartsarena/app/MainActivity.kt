package de.dartsarena.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * Die Android-App ist eine schlanke Hülle: Die Oberfläche ist exakt dieselbe wie die PWA (Darts/web, als Assets eingepackt).
 * Dazu kommen native Dinge: Android-Sprachausgabe für den Caller, Bildschirm-an, Datei-Auswahl/-Speichern und die Update-Funktion.
 */
class MainActivity : ComponentActivity() {
    lateinit var web: WebView
        private set
    lateinit var bridge: NativeBridge
        private set
    val updates by lazy { UpdateManager(this) }

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null
    private var pendingSave: String? = null

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
    }

    private val devicePermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        val req = pendingPermission ?: return@registerForActivityResult
        pendingPermission = null
        val granted = webResources(req).filter { r -> res[androidPermission(r)] != false && hasPermission(androidPermission(r)) }
        if (granted.isNotEmpty()) req.grant(granted.toTypedArray()) else req.deny()
    }

    private fun webResources(req: PermissionRequest) = req.resources.filter {
        it == PermissionRequest.RESOURCE_AUDIO_CAPTURE || it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
    }
    private fun androidPermission(res: String) =
        if (res == PermissionRequest.RESOURCE_VIDEO_CAPTURE) Manifest.permission.CAMERA else Manifest.permission.RECORD_AUDIO
    private fun hasPermission(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    private val createDoc = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val txt = pendingSave
        pendingSave = null
        if (uri != null && txt != null) {
            runCatching { contentResolver.openOutputStream(uri)?.use { it.write(txt.toByteArray()) } }
                .onSuccess { emit("toast", "Sicherung gespeichert") }
                .onFailure { emit("toast", "Speichern fehlgeschlagen") }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        web.setBackgroundColor(0xFF0B0D10.toInt())
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
        }
        bridge = NativeBridge(this)
        web.addJavascriptInterface(bridge, "DartsNative")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != APP_HOST
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                return runCatching { pickFiles.launch(params.createIntent()); true }.getOrElse { fileCallback = null; false }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                // Mikrofon (eigene Caller-Ansagen) und Kamera (Autoscore) – erst nach Android-Rückfrage freigeben
                runOnUiThread {
                    val wanted = webResources(request)
                    if (wanted.isEmpty()) { request.deny(); return@runOnUiThread }
                    val missing = wanted.map { androidPermission(it) }.filterNot { hasPermission(it) }
                    if (missing.isEmpty()) {
                        request.grant(wanted.toTypedArray())
                    } else {
                        pendingPermission = request
                        devicePermissions.launch(missing.toTypedArray())
                    }
                }
            }
        }
        setContentView(web)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.__dartsBack && window.__dartsBack()") { r ->
                    if (r != "true") finish()
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl("https://$APP_HOST/assets/index.html")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() { super.onPause(); bridge.stopSpeak() }

    override fun onDestroy() {
        bridge.shutdown()
        updates.stop()
        web.destroy()
        super.onDestroy()
    }

    fun keepAwake(on: Boolean) = runOnUiThread {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    fun saveText(name: String, text: String) = runOnUiThread { pendingSave = text; createDoc.launch(name) }

    /** Ereignis an die Web-Oberfläche (window.__dartsNative). */
    fun emit(type: String, payload: Any?) {
        val json = when (payload) {
            null -> "null"
            is JSONObject -> JSONObject.quote(payload.toString())
            else -> JSONObject.quote(payload.toString())
        }
        runOnUiThread { if (!isDestroyed) web.evaluateJavascript("window.__dartsNative && window.__dartsNative(${JSONObject.quote(type)}, $json)", null) }
    }

    fun js(code: String) = runOnUiThread { if (!isDestroyed) web.evaluateJavascript(code, null) }

    companion object { const val APP_HOST = "appassets.androidplatform.net" }
}
