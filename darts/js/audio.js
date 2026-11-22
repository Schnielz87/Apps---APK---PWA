// Soundeffekte per WebAudio (keine Audiodateien nötig) + Vibration.
let ctx = null;
let enabled = true;
let volume = 0.8;

export function setSfx(on, vol) { enabled = on; if (vol != null) volume = vol; }
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
/** Beim ersten Antippen aufrufen (Browser erlauben Ton erst nach einer Berührung). */
export function unlockAudio() { ac(); }

function noise(a, dur) {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(a, f, t0, dur, type = 'sine', g = 0.25) {
  const o = a.createOscillator();
  const gn = a.createGain();
  o.type = type; o.frequency.value = f;
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(g * volume, t0 + 0.02);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export const sfx = {
  /** Dart schlägt ein (dumpfes „Tock“). */
  hit(strength = 1) {
    if (!enabled) return; const a = ac(); if (!a) return;
    const n = noise(a, 0.12);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + 600 * strength;
    const g = a.createGain(); g.gain.value = 0.9 * volume;
    n.connect(f).connect(g).connect(a.destination); n.start();
    tone(a, 140, a.currentTime, 0.09, 'triangle', 0.35);
  },
  miss() { if (!enabled) return; const a = ac(); if (!a) return; tone(a, 220, a.currentTime, 0.15, 'sine', 0.12); },
  /** Anflug-Geräusch (gefiltertes Rauschen, Tonhöhe fällt). */
  whoosh() {
    if (!enabled) return; const a = ac(); if (!a) return;
    const n = noise(a, 0.5);
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(2600, a.currentTime); f.frequency.exponentialRampToValueAtTime(500, a.currentTime + 0.45);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.5 * volume, a.currentTime + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.5);
    n.connect(f).connect(g).connect(a.destination); n.start();
  },
  beep() { const a = ac(); if (!a) return; tone(a, 880, a.currentTime, 0.12, 'sine', 0.3); },
  click() { if (!enabled) return; const a = ac(); if (!a) return; tone(a, 1200, a.currentTime, 0.03, 'square', 0.04); },
  bust() {
    if (!enabled) return; const a = ac(); if (!a) return;
    tone(a, 160, a.currentTime, 0.35, 'sawtooth', 0.12); tone(a, 120, a.currentTime + 0.15, 0.4, 'sawtooth', 0.12);
  },
  fanfare() {
    if (!enabled) return; const a = ac(); if (!a) return;
    const t = a.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.11, 0.35, 'triangle', 0.18));
    tone(a, 1047, t + 0.5, 0.8, 'triangle', 0.2); tone(a, 1319, t + 0.5, 0.8, 'sine', 0.12);
    this.cheer(0.6);
  },
  cheer(level = 1) {
    if (!enabled) return; const a = ac(); if (!a) return;
    const n = noise(a, 1.8);
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 0.6;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.5 * level * volume, a.currentTime + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 1.8);
    n.connect(f).connect(g).connect(a.destination); n.start();
  },
  levelUp() {
    if (!enabled) return; const a = ac(); if (!a) return;
    const t = a.currentTime;
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.08, 0.25, 'square', 0.06));
  },
};

let vibrate = true;
export function setVibrate(v) { vibrate = v; }
export function buzz(ms = 15) { if (vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* egal */ } }
