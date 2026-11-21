// Fehlerprotokoll (wie DiagLog bei PowerIPTV): die letzten Ereignisse und Fehler, nur auf dem Gerät gespeichert.
// Anzeige, Kopieren und Teilen unter Mehr → System → Fehlerprotokoll.
const KEY = 'da.log';
const MAX = 300;
let buf = null;

function load() {
  if (buf) return buf;
  try { buf = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { buf = []; }
  return buf;
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(buf.slice(-MAX))); } catch (e) { /* voll */ } }, 300);
}

/** Eintrag schreiben. level: 'info' | 'warn' | 'error'. */
export function log(area, msg, level = 'info') {
  const b = load();
  const text = String(msg && msg.message ? msg.message : msg).slice(0, 500);
  // gleiche Meldung direkt hintereinander nur zählen
  const last = b[b.length - 1];
  if (last && last.a === area && last.m === text) { last.n = (last.n || 1) + 1; last.t = Date.now(); save(); return; }
  b.push({ t: Date.now(), a: area, m: text, l: level });
  if (b.length > MAX) b.splice(0, b.length - MAX);
  save();
}
export const logError = (area, e) => log(area, e, 'error');
export const logWarn = (area, e) => log(area, e, 'warn');
export function entries() { return load().slice(); }
export function clearLog() { buf = []; try { localStorage.removeItem(KEY); } catch (e) { /* egal */ } }

/** Protokoll als Text (zum Kopieren/Teilen). */
export function logText(header = '') {
  const lines = load().map((e) => {
    const d = new Date(e.t);
    const ts = d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE');
    return `${ts} [${e.l === 'error' ? 'FEHLER' : e.l === 'warn' ? 'WARNUNG' : 'info'}] ${e.a}: ${e.m}${e.n > 1 ? ` (×${e.n})` : ''}`;
  });
  return `${header}\n${'-'.repeat(40)}\n${lines.join('\n') || '(leer)'}\n`;
}

// Unerwartete Fehler automatisch mitschreiben
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => logError('App', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => logError('App', e.reason || 'Unbehandelter Fehler'));
}
