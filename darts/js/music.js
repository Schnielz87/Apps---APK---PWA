// Menü-Musik: läuft leise, solange man Spiele auswählt (nicht während des Spiels).
// Quelle: eigener Song vom Gerät (bleibt nur lokal gespeichert) oder ein eingebauter, selbst erzeugter Elektro-Loop.
import { musicFileGet } from './caller.js';

let ctx = null, master = null, timer = null, step = 0, nextT = 0;
let audioEl = null, ownUrl = null;
let want = false, playing = false;
let cfg = { on: true, volume: 0.25, source: 'builtin' };

export function setMusicSettings(s) {
  const old = cfg;
  cfg = { ...cfg, ...s };
  if (master && playing) master.gain.setTargetAtTime(cfg.volume * 0.5, ctx.currentTime, 0.3);
  if (audioEl) audioEl.volume = cfg.volume;
  if (old.source !== cfg.source || old.on !== cfg.on) { if (playing) stopNow(); musicWanted(want); }
}

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ------------------------------------------------------------------ eingebauter Loop (eigene Komposition, 122 BPM, a-Moll)
const BPM = 122, SPB = 60 / BPM / 4; // Sechzehntel
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]]; // Am7 Fmaj7 Cmaj7 G(add)
const BASS = [45, 41, 36, 43];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
const f = (m) => 440 * Math.pow(2, (m - 69) / 12);

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
  while (nextT < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 16) % 4, s16 = step % 16, t = nextT;
    const ch = CHORDS[bar];
    if (s16 === 0) ch.forEach((n) => voice('sawtooth', f(n), t, SPB * 16, 0.035, 1400));
    if (s16 % 4 === 0) kick(t);
    if (s16 % 4 === 2) hat(t, s16 === 14);
    else if (s16 % 2 === 1) hat(t, false);
    if ([0, 3, 6, 10, 12].includes(s16)) voice('triangle', f(BASS[bar]), t, SPB * 2.5, 0.22, 600);
    if (s16 % 2 === 0 && step % 128 >= 64) voice('square', f(ch[ARP[(s16 / 2) % 8]] + 12), t, SPB * 1.6, 0.03, 2600);
    nextT += SPB;
    step++;
  }
}

async function start() {
  if (cfg.source === 'own') {
    const blob = await musicFileGet();
    if (blob) {
      if (ownUrl) URL.revokeObjectURL(ownUrl);
      ownUrl = URL.createObjectURL(blob);
      audioEl = new Audio(ownUrl);
      audioEl.loop = true; audioEl.volume = 0;
      try { await audioEl.play(); } catch (e) { audioEl = null; return; }
      playing = true;
      fadeEl(cfg.volume);
      return;
    }
  }
  if (!ac()) return;
  step = 0; nextT = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 60);
  schedule();
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(cfg.volume * 0.5, ctx.currentTime, 0.6);
  playing = true;
}

let fadeTimer = null;
function fadeEl(to, then) {
  clearInterval(fadeTimer);
  fadeTimer = setInterval(() => {
    if (!audioEl) { clearInterval(fadeTimer); return; }
    const v = audioEl.volume + (to > audioEl.volume ? 0.02 : -0.04);
    if ((to > audioEl.volume && v >= to) || (to <= audioEl.volume && v <= to)) { audioEl.volume = Math.max(0, Math.min(1, to)); clearInterval(fadeTimer); if (then) then(); }
    else audioEl.volume = Math.max(0, Math.min(1, v));
  }, 50);
}

function stopNow() {
  playing = false;
  clearInterval(timer); timer = null;
  if (master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.value = 0; }
  if (audioEl) { audioEl.pause(); audioEl = null; }
}

function fadeOut() {
  if (!playing) return;
  playing = false;
  if (audioEl) { const el = audioEl; fadeEl(0, () => { el.pause(); if (audioEl === el) audioEl = null; }); return; }
  if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  const t = timer; setTimeout(() => { if (!playing) clearInterval(t); }, 1200);
  timer = null;
}

/** Menü offen (true) oder Spiel/Hintergrund (false). */
export function musicWanted(on) {
  want = on;
  if (on && cfg.on && !playing && document.visibilityState !== 'hidden') start();
  else if ((!on || !cfg.on) && playing) fadeOut();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (playing) stopNow(); }
    else musicWanted(want);
  });
}
