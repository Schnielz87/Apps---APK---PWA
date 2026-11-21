// Menü-Musik: läuft leise, solange man im Menü ist (nicht während des Spiels).
// Quelle: eigener Song vom Gerät (bleibt nur lokal gespeichert) oder ein eingebauter, selbst erzeugter Elektro-Loop.
// Robust: genau EIN Player, der pausiert und fortgesetzt wird (kein Neuanlegen), Wechsel werden serialisiert.
import { musicFileGet } from './caller.js';
import { log, logError, logWarn } from './log.js';

let cfg = { on: true, volume: 0.25, source: 'builtin' };
let want = false;          // soll gerade Musik laufen? (Menü sichtbar)
let active = null;         // 'own' | 'builtin' | null – was gerade spielt
let busy = Promise.resolve();

// ------------------------------------------------------------------ eigener Song (ein einziges Audio-Element)
let el = null, elUrl = null, elSize = -1, fadeTimer = null;

async function ownElement() {
  const blob = await musicFileGet();
  if (!blob) { logWarn('Musik', 'Kein eigener Song gespeichert – nehme Arena-Loop'); return null; }
  if (el && blob.size === elSize) return el; // derselbe Song: Position behalten
  if (el) { el.pause(); el.src = ''; }
  if (elUrl) URL.revokeObjectURL(elUrl);
  elUrl = URL.createObjectURL(blob);
  elSize = blob.size;
  el = new Audio();
  el.src = elUrl;
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0;
  el.setAttribute('playsinline', '');
  el.addEventListener('error', () => logError('Musik', `Song lässt sich nicht abspielen (Format?) – Code ${el && el.error ? el.error.code : '?'}`));
  el.addEventListener('stalled', () => logWarn('Musik', 'Wiedergabe stockt (stalled)'));
  // falls das System die Wiedergabe unterbricht (Anruf, andere App) und wir noch im Menü sind: wieder aufnehmen
  el.addEventListener('pause', () => { if (want && cfg.on && active === 'own' && !document.hidden && !el._ourPause) { log('Musik', 'Vom System pausiert – starte neu'); setTimeout(() => sync(), 800); } });
  log('Musik', `Eigener Song geladen (${Math.round(blob.size / 1024)} KB, ${blob.type || 'unbekannter Typ'})`);
  return el;
}

function fade(to, ms, then) {
  clearInterval(fadeTimer);
  if (!el) { if (then) then(); return; }
  const from = el.volume, steps = Math.max(1, Math.round(ms / 40));
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    if (!el) { clearInterval(fadeTimer); return; }
    el.volume = Math.max(0, Math.min(1, from + ((to - from) * i) / steps));
    if (i >= steps) { clearInterval(fadeTimer); if (then) then(); }
  }, 40);
}

async function playOwn() {
  const a = await ownElement();
  if (!a) return false;
  a._ourPause = false;
  try {
    await a.play();
  } catch (e) {
    // Browser blockiert Ton ohne Antippen (v. a. iPhone) → beim nächsten Antippen erneut versuchen
    logWarn('Musik', `Abspielen blockiert (${e.name || e}) – versuche es beim nächsten Antippen`);
    retryOnTap();
    return false;
  }
  fade(cfg.volume, 900);
  return true;
}

function pauseOwn() {
  if (!el) return;
  const a = el;
  fade(0, 450, () => { a._ourPause = true; a.pause(); });
}

let tapHooked = false;
function retryOnTap() {
  if (tapHooked) return;
  tapHooked = true;
  const go = () => { tapHooked = false; sync(); };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, go, { once: true, capture: true });
}

// ------------------------------------------------------------------ eingebauter Loop (eigene Komposition, 122 BPM, a-Moll)
let ctx = null, master = null, timer = null, step = 0, nextT = 0;
const BPM = 122, SPB = 60 / BPM / 4;
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]];
const BASS = [45, 41, 36, 43];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
const f = (m) => 440 * Math.pow(2, (m - 69) / 12);

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { logError('Musik', 'Kein Audio im Browser'); return null; }
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function voice(type, freq, t, dur, gain, filt = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.08, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filt) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = filt; o.connect(lp); node = lp; }
  node.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function kick(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.3);
}
let noiseBuf = null;
function hat(t, open) {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.setValueAtTime(open ? 0.09 : 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.22 : 0.05));
  s.connect(hp).connect(g).connect(master); s.start(t); s.stop(t + 0.3);
}
function schedule() {
  if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05; // nach Pause nicht „nachholen“
  while (nextT < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 16) % 4, s16 = step % 16, t = nextT, ch = CHORDS[bar];
    if (s16 === 0) ch.forEach((n) => voice('sawtooth', f(n), t, SPB * 16, 0.035, 1400));
    if (s16 % 4 === 0) kick(t);
    if (s16 % 4 === 2) hat(t, s16 === 14); else if (s16 % 2 === 1) hat(t, false);
    if ([0, 3, 6, 10, 12].includes(s16)) voice('triangle', f(BASS[bar]), t, SPB * 2.5, 0.22, 600);
    if (s16 % 2 === 0 && step % 128 >= 64) voice('square', f(ch[ARP[(s16 / 2) % 8]] + 12), t, SPB * 1.6, 0.03, 2600);
    nextT += SPB; step++;
  }
}
function playBuiltin() {
  if (!ac()) return false;
  // Startet der Ton ohne Berührung nicht (Browser-Regel), beim ersten Antippen erneut versuchen
  setTimeout(() => { if (ctx && ctx.state !== 'running' && active === 'builtin') { logWarn('Musik', 'Ton vom Browser bis zur ersten Berührung gesperrt'); active = null; retryOnTap(); } }, 600);
  if (!timer) { nextT = ctx.currentTime + 0.1; timer = setInterval(schedule, 60); schedule(); }
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(cfg.volume * 0.5, ctx.currentTime, 0.5);
  return true;
}
function pauseBuiltin() {
  if (!ctx || !timer) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  const t = timer; timer = null;
  setTimeout(() => clearInterval(t), 900);
}

// ------------------------------------------------------------------ Steuerung (immer nacheinander, nie parallel)
function sync() {
  busy = busy.then(async () => {
    const should = want && cfg.on && !document.hidden;
    const src = cfg.source === 'own' ? 'own' : 'builtin';
    if (!should) {
      if (active === 'own') pauseOwn();
      if (active === 'builtin') pauseBuiltin();
      active = null;
      return;
    }
    if (active === src && (src === 'builtin' || (el && !el.paused))) return; // läuft schon
    if (active && active !== src) { if (active === 'own') pauseOwn(); else pauseBuiltin(); active = null; }
    let ok = false;
    if (src === 'own') ok = await playOwn();
    if (!ok && src === 'own' && !el) { ok = playBuiltin(); active = ok ? 'builtin' : null; return; } // kein Song gespeichert
    if (src === 'builtin') ok = playBuiltin();
    active = ok ? src : null;
  }).catch((e) => logError('Musik', e));
  return busy;
}

export function setMusicSettings(s) {
  const old = cfg;
  cfg = { ...cfg, ...s };
  if (el && active === 'own') el.volume = cfg.volume;
  if (master && active === 'builtin' && ctx) master.gain.setTargetAtTime(cfg.volume * 0.5, ctx.currentTime, 0.3);
  if (old.source !== cfg.source || old.on !== cfg.on) sync();
}

/** Neuer eigener Song gewählt: Player neu laden. */
export function musicReload() { if (el) { el._ourPause = true; el.pause(); } el = null; elSize = -1; active = null; sync(); }

/** Menü offen (true) oder Spiel/Hintergrund (false). */
export function musicWanted(on) { want = on; sync(); }

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => sync());
