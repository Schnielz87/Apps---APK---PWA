// Updates – gleiches Prinzip wie in allen anderen Apps:
//  • APK: die Android-App fragt GitHub-Releases (Tag-Präfix „darts-v“) ab, lädt Darts-Arena.apk und öffnet den Installer.
//  • PWA: Service Worker; jede neue Version hat einen neuen Cache – Hinweis „Neue Version“ → Antippen → aktualisiert.
import { nativeBridge, onNative } from './native.js';

export const APP_VERSION = { version: 'dev', build: 0 };
const state = { available: null, status: '', progress: null, checking: false, kind: 'pwa', reg: null, waiting: null };
const subs = new Set();
const emit = () => subs.forEach((f) => { try { f({ ...state }); } catch (e) { /* egal */ } });
export const onUpdate = (f) => { subs.add(f); f({ ...state }); return () => subs.delete(f); };
export const updateState = () => ({ ...state });

export async function initUpdates({ auto = true } = {}) {
  const nb = nativeBridge();
  if (nb) {
    state.kind = 'apk';
    try { const i = JSON.parse(nb.info()); Object.assign(APP_VERSION, { version: i.version, build: i.build, flavor: i.flavor }); state.kind = i.flavor === 'play' ? 'play' : 'apk'; } catch (e) { /* egal */ }
    onNative((type, d) => {
      if (type === 'update') { state.available = d && d.tag ? d : null; state.checking = false; emit(); }
      if (type === 'updateStatus') { state.status = d && d.text ? d.text : String(d || ''); state.checking = !!(d && d.checking); emit(); }
      if (type === 'updateProgress') { state.progress = d && d.p != null ? d.p : null; emit(); }
    });
    if (state.kind === 'apk') try { nb.setAutoUpdate(!!auto); nb.startAutoCheck(); } catch (e) { /* egal */ }
    emit();
    return;
  }
  // PWA
  try {
    const r = await fetch('version.json', { cache: 'no-store' });
    if (r.ok) Object.assign(APP_VERSION, await r.json());
  } catch (e) { /* offline */ }
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') { emit(); return; }
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    state.reg = reg;
    const watch = (w) => {
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { state.waiting = w; state.available = { tag: 'neu' }; emit(); }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) { state.waiting = reg.waiting; state.available = { tag: 'neu' }; }
    reg.addEventListener('updatefound', () => watch(reg.installing));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    // Wie die anderen Apps: höchstens alle 24 h automatisch nachsehen (und bei jedem Start)
    if (auto) {
      const last = +localStorage.getItem('da.updLast') || 0;
      if (Date.now() - last > 6 * 3600 * 1000) { localStorage.setItem('da.updLast', Date.now()); reg.update().catch(() => {}); }
      setInterval(() => reg.update().catch(() => {}), 24 * 3600 * 1000);
    }
  } catch (e) { /* kein SW */ }
  emit();
}

export async function checkNow() {
  const nb = nativeBridge();
  if (nb) { if (state.kind === 'apk') { state.checking = true; state.status = 'Suche nach Updates …'; emit(); nb.checkUpdate(); } return; }
  if (!state.reg) { state.status = 'Updates laufen hier automatisch über den Browser.'; emit(); return; }
  state.checking = true; state.status = 'Suche nach Updates …'; emit();
  try {
    await state.reg.update();
    let latest = null;
    try { const r = await fetch('version.json', { cache: 'no-store' }); if (r.ok) latest = await r.json(); } catch (e) { /* egal */ }
    setTimeout(() => {
      state.checking = false;
      state.status = state.available ? 'Neue Version bereit' : `Du hast die neueste Version (${latest ? latest.version : APP_VERSION.version})`;
      emit();
    }, 1500);
  } catch (e) { state.checking = false; state.status = 'Keine Verbindung – später erneut versuchen'; emit(); }
}

export function installNow() {
  const nb = nativeBridge();
  if (nb) { nb.installUpdate(); return; }
  if (state.waiting) state.waiting.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
}

export function setAuto(on) { const nb = nativeBridge(); if (nb && nb.setAutoUpdate) try { nb.setAutoUpdate(!!on); } catch (e) { /* egal */ } }
