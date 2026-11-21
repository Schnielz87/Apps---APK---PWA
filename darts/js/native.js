// Brücke zur Android-App (WebView): window.DartsNative ist nur in der APK vorhanden.
export const nativeBridge = () => (typeof window !== 'undefined' && window.DartsNative) || null;
export const isApk = () => !!nativeBridge();

export function nativeInfo() {
  const nb = nativeBridge();
  if (!nb) return null;
  try { return JSON.parse(nb.info()); } catch (e) { return null; }
}

/** Rückrufe aus Kotlin (evaluateJavascript) landen hier. */
const listeners = new Set();
export function onNative(fn) { listeners.add(fn); return () => listeners.delete(fn); }
if (typeof window !== 'undefined') {
  window.__dartsNative = (type, payload) => {
    let data = payload;
    try { data = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) { /* Text */ }
    listeners.forEach((f) => { try { f(type, data); } catch (e) { /* egal */ } });
  };
}
