// Eigene Caller-Stimmen: geführte Aufnahme (App sagt, was gesprochen wird), automatisches Zuschneiden,
// Zahlen werden aus Bausteinen zusammengesetzt (z. B. 141 = „one hundred“ + „and“ + „forty“ + „one“).
// Gespeichert wird nur auf dem Gerät (IndexedDB, Schlüssel „v:<stimme>:<baustein>“).
import { packSave, packGetRaw, packDeletePrefix, packKeysAll } from './caller.js';

const LS = 'da.voices';
export function voices() { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; } }
function saveVoices(v) { localStorage.setItem(LS, JSON.stringify(v)); }
export function addVoice(name, lang) {
  const v = voices();
  const id = 'v' + Date.now().toString(36);
  v.push({ id, name: name || 'Meine Stimme', lang });
  saveVoices(v);
  return id;
}
export function renameVoice(id, name) { const v = voices(); const x = v.find((y) => y.id === id); if (x) { x.name = name; saveVoices(v); } }
export async function deleteVoice(id) { saveVoices(voices().filter((v) => v.id !== id)); await packDeletePrefix(`v:${id}:`); bufCache.clear(); }
export const voiceById = (id) => voices().find((v) => v.id === id);

// ------------------------------------------------------------------ Was gesprochen wird
const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = { 20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety' };
const DE_ONES = ['', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const DE_TENS = { 20: 'zwanzig', 30: 'dreißig', 40: 'vierzig', 50: 'fünfzig', 60: 'sechzig', 70: 'siebzig', 80: 'achtzig', 90: 'neunzig' };

/** Aufnahme-Liste je Sprache. level: basis (reicht für alles) / profi (ganze Zahlen klingen natürlicher). */
export function prompts(lang) {
  const en = lang.startsWith('en');
  const P = [];
  const add = (key, say, hint = '', level = 'basis') => P.push({ key, say, hint, level });
  if (en) {
    add('gameon', 'Game on!', 'Spielbeginn'); add('noscore', 'No score!', 'Null Punkte / überworfen');
    add('gameshot', 'Game shot!'); add('leg', 'Game shot, and the leg!'); add('set', 'Game shot, and the set!'); add('match', 'Game shot, and the match!');
    add('require', 'You require …', 'Danach hängt die App die Zahl an'); add('180', 'One hundred and eighty!', 'Mit voller Show!');
    for (let i = 1; i <= 19; i++) add(String(i), EN_ONES[i], 'Baustein');
    for (const t of [20, 30, 40, 50, 60, 70, 80, 90]) add(String(t), EN_TENS[t], 'Baustein');
    add('hundred', 'one hundred', 'Baustein für 100–179'); add('and', 'and', 'Baustein, z. B. „hundred AND forty“');
    add('shanghai', 'Shanghai!', '', 'profi');
  } else {
    add('gameon', 'Game on!', 'Spielbeginn'); add('noscore', 'Kein Score!', 'Null Punkte / überworfen');
    add('gameshot', 'Game Shot!'); add('leg', 'Game Shot, und das Leg!'); add('set', 'Game Shot, und der Satz!'); add('match', 'Game Shot, und das Match!');
    add('require', 'Sie benötigen …', 'Danach hängt die App die Zahl an'); add('180', 'Einhundertachtzig!', 'Mit voller Show!');
    for (let i = 1; i <= 19; i++) add(String(i), DE_ONES[i], 'Baustein');
    for (const t of [20, 30, 40, 50, 60, 70, 80, 90]) add(String(t), DE_TENS[t], 'Baustein');
    add('ein', 'ein', 'Baustein, z. B. „EIN-und-zwanzig“'); add('und', 'und', 'Baustein, z. B. „ein-UND-zwanzig“'); add('hundred', 'hundert', 'Baustein für 100–179');
    add('shanghai', 'Shanghai!', '', 'profi');
  }
  // Häufige Aufnahmen als Ganzes – klingen natürlicher als zusammengesetzt
  for (const n of [26, 41, 45, 60, 81, 85, 100, 121, 140, 160, 171, 174, 177]) add(String(n), en ? numEn(n) : numDe(n), 'Häufige Aufnahme (optional)', 'profi');
  return P;
}
function numEn(n) {
  if (n < 20) return EN_ONES[n];
  if (n < 100) return EN_TENS[n - (n % 10)] + (n % 10 ? '-' + EN_ONES[n % 10] : '');
  return 'one hundred' + (n % 100 ? ' and ' + numEn(n % 100) : '');
}
function numDe(n) {
  if (n < 20) return DE_ONES[n];
  if (n < 100) return (n % 10 ? (n % 10 === 1 ? 'ein' : DE_ONES[n % 10]) + 'und' : '') + DE_TENS[n - (n % 10)];
  return 'hundert' + (n % 100 ? numDe(n % 100) : '');
}

/** Zahl → Liste von Baustein-Schlüsseln (ganze Aufnahme hat Vorrang, siehe clipsFor). */
export function composeKeys(n, lang) {
  const en = lang.startsWith('en');
  const out = [];
  let r = n;
  if (r >= 100) { out.push('hundred'); r -= 100; if (r && en) out.push('and'); }
  if (r >= 20) {
    const t = r - (r % 10), o = r % 10;
    if (en) { out.push(String(t)); if (o) out.push(String(o)); }
    else { if (o) out.push(o === 1 ? 'ein' : String(o), 'und'); out.push(String(t)); }
  } else if (r > 0) out.push(String(r));
  return out;
}

/** Ansage → Schlüssel-Liste (oder null, wenn die Stimme dafür nichts hat). */
export async function clipsFor(voiceId, call) {
  const v = voiceById(voiceId);
  if (!v) return null;
  const has = new Set((await packKeysAll()).filter((k) => k.startsWith(`v:${voiceId}:`)).map((k) => k.slice(voiceId.length + 3)));
  const num = (n) => {
    if (has.has(String(n))) return [String(n)];
    const ks = composeKeys(n, v.lang);
    return ks.every((k) => has.has(k)) ? ks : null;
  };
  let keys = null;
  if (call.require != null) { const n = num(call.require); keys = has.has('require') && n ? ['require', ...n] : null; }
  else if (call.phrase) {
    const k = call.phrase === 'bust' ? 'noscore' : call.phrase === 'gameshot' && call.leg ? 'leg' : call.phrase;
    keys = has.has(k) ? [k] : k === 'leg' && has.has('gameshot') ? ['gameshot'] : null;
  } else if (call.score != null) keys = call.score === 0 ? (has.has('noscore') ? ['noscore'] : null) : num(call.score);
  return keys ? keys.map((k) => `v:${voiceId}:${k}`) : null;
}

// ------------------------------------------------------------------ Abspielen (lückenlos per WebAudio)
let actx = null;
const bufCache = new Map();
function ac() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; }
async function buffer(key) {
  if (bufCache.has(key)) return bufCache.get(key);
  const blob = await packGetRaw(key);
  if (!blob) return null;
  const b = await ac().decodeAudioData(await blob.arrayBuffer());
  bufCache.set(key, b);
  return b;
}
export function forgetClip(key) { bufCache.delete(key); }

/** Mehrere Bausteine nacheinander, mit winziger Pause – klingt wie eine Ansage. */
export async function playKeys(keys, volume = 0.9) {
  const a = ac();
  const bufs = [];
  for (const k of keys) { const b = await buffer(k); if (!b) return false; bufs.push(b); }
  const g = a.createGain(); g.gain.value = volume; g.connect(a.destination);
  let t = a.currentTime + 0.03;
  for (const b of bufs) {
    const s = a.createBufferSource(); s.buffer = b; s.connect(g); s.start(t);
    t += b.duration + 0.02;
  }
  await new Promise((r) => setTimeout(r, (t - a.currentTime) * 1000 + 50));
  return true;
}

// ------------------------------------------------------------------ Aufnehmen mit Automatik
/**
 * Nimmt eine Ansage auf: startet sofort, stoppt automatisch nach ~0,8 s Stille (oder max. 5 s),
 * schneidet Stille vorne/hinten ab und speichert als WAV. onLevel(0..1) für die Pegelanzeige.
 */
export async function recordClip({ onLevel = () => {}, maxMs = 5000, signal } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  const a = ac();
  const src = a.createMediaStreamSource(stream);
  const an = a.createAnalyser(); an.fftSize = 1024;
  src.connect(an);
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((r) => { rec.onstop = r; });
  rec.start();
  const data = new Float32Array(an.fftSize);
  const t0 = performance.now();
  let spoke = false, lastLoud = t0, noise = 0.01;
  await new Promise((resolve) => {
    const tick = () => {
      if (signal && signal.aborted) return resolve();
      an.getFloatTimeDomainData(data);
      let s = 0; for (const x of data) s += x * x;
      const rms = Math.sqrt(s / data.length);
      const now = performance.now();
      if (now - t0 < 300) noise = Math.max(noise, rms * 1.5); // Grundrauschen der ersten 0,3 s
      onLevel(Math.min(1, rms * 8));
      if (rms > Math.max(0.025, noise * 2)) { spoke = true; lastLoud = now; }
      if ((spoke && now - lastLoud > 800) || now - t0 > maxMs || (!spoke && now - t0 > 4000)) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  src.disconnect();
  onLevel(0);
  if (!spoke) return null;
  const raw = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  return trimToWav(raw);
}

async function trimToWav(blob) {
  const a = ac();
  const buf = await a.decodeAudioData(await blob.arrayBuffer());
  const ch = buf.getChannelData(0);
  const rate = buf.sampleRate;
  let peak = 0; for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  const thr = Math.max(0.02, peak * 0.08);
  const win = Math.floor(rate * 0.01);
  let start = 0, end = ch.length;
  for (let i = 0; i < ch.length; i += win) { if (Math.abs(ch[i]) > thr || maxAbs(ch, i, win) > thr) { start = Math.max(0, i - win * 4); break; } }
  for (let i = ch.length - win; i > 0; i -= win) { if (maxAbs(ch, i, win) > thr) { end = Math.min(ch.length, i + win * 8); break; } }
  // auf 22,05 kHz mono, normalisiert
  const outRate = 22050, ratio = rate / outRate;
  const n = Math.max(1, Math.floor((end - start) / ratio));
  const pcm = new Int16Array(n);
  const gain = Math.min(4, 0.9 / (peak || 1));
  for (let i = 0; i < n; i++) {
    const v = ch[start + Math.floor(i * ratio)] * gain;
    pcm[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  }
  // kurze Ein-/Ausblendung gegen Knackser
  const fade = Math.min(200, n >> 2);
  for (let i = 0; i < fade; i++) { pcm[i] = (pcm[i] * i) / fade; pcm[n - 1 - i] = (pcm[n - 1 - i] * i) / fade; }
  return wav(pcm, outRate);
}
function maxAbs(ch, i, w) { let m = 0; for (let k = i; k < i + w && k < ch.length; k++) m = Math.max(m, Math.abs(ch[k])); return m; }
function wav(pcm, rate) {
  const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(b, 44).set(pcm);
  return new Blob([b], { type: 'audio/wav' });
}

export async function saveClip(voiceId, key, blob) { await packSave(`v:${voiceId}:${key}`, blob); bufCache.delete(`v:${voiceId}:${key}`); }
export async function recordedKeys(voiceId) { return new Set((await packKeysAll()).filter((k) => k.startsWith(`v:${voiceId}:`)).map((k) => k.slice(voiceId.length + 3))); }
