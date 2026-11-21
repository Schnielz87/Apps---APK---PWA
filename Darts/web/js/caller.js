// Caller: Sprachansagen per Text-to-Speech (Browser oder Android-TTS) oder eigenes Sound-Paket (Aufnahmen/Dateien).
import { nativeBridge } from './native.js';
import { logError } from './log.js';

export const CALLERS = [
  { id: 'showman', name: 'The Showman', flag: '🇬🇧', lang: 'en-GB', pitch: 0.9, rate: 1.08, gender: 'm', tv: true,
    desc: 'Kraftvolle Männerstimme im TV-Stil: „Ladies and gentlemen … Game on!“, „One hundred … and eighty!“ – mit Leidenschaft.' },
  { id: 'kommentator', name: 'Der Kommentator', flag: '🇩🇪', lang: 'de-DE', pitch: 0.92, rate: 1.05, gender: 'm',
    desc: 'Deutsch, kräftige Stimme – sachlich wie im Turnier.' },
  { id: 'schiri', name: 'Die Schiedsrichterin', flag: '🇩🇪', lang: 'de-DE', pitch: 1.2, rate: 1.0, gender: 'f',
    desc: 'Deutsch, klar und freundlich.' },
  { id: 'lady', name: 'Lady Oche', flag: '🇬🇧', lang: 'en-GB', pitch: 1.1, rate: 1.05, gender: 'f', tv: true,
    desc: 'Englisch, elegant – Ladies-Tour-Feeling.' },
  { id: 'kalle', name: 'Kneipen-Kalle', flag: '🍺', lang: 'de-DE', pitch: 1.0, rate: 1.1, gender: 'm', fun: true,
    desc: 'Deutsch & frech – kommentiert jede Aufnahme mit einem Spruch.' },
  { id: 'robo', name: 'Robo-Caller 3000', flag: '🤖', lang: 'de-DE', pitch: 0.2, rate: 1.2, gender: 'm',
    desc: 'Metallisch, schnell, gnadenlos.' },
  { id: 'custom', name: 'Eigenes Sound-Paket', flag: '🎙️', lang: 'en-GB', pitch: 0.9, rate: 1.08, gender: 'm',
    desc: 'Geladene Caller-Dateien (z. B. lizenzierte 180.mp3) – fehlende Ansagen spricht The Showman.' },
  { id: 'off', name: 'Kein Caller', flag: '🔇', desc: 'Nur Soundeffekte.' },
];

let settings = { caller: 'showman', volume: 0.9, callNames: true, callRest: true, voiceEn: '', voiceDe: '' };
export function setCallerSettings(s) { settings = { ...settings, ...s }; }
function customVoices() { try { return JSON.parse(localStorage.getItem('da.voices') || '[]'); } catch (e) { return []; } }
/** Feste Caller + selbst eingesprochene Stimmen. */
export function allCallers() {
  const own = customVoices().map((v) => ({ id: 'voice:' + v.id, voiceId: v.id, name: v.name, flag: '🎤', lang: v.lang, pitch: 0.8, rate: 0.9, own: true,
    desc: `Deine eigene Stimme (${v.lang.startsWith('en') ? 'Englisch' : 'Deutsch'}) – fehlende Ansagen spricht ${v.lang.startsWith('en') ? 'The Showman' : 'Der Kommentator'}.` }));
  const fixed = CALLERS.filter((c) => c.id !== 'off');
  return [...fixed, ...own, CALLERS.find((c) => c.id === 'off')];
}
export const callerById = (id) => allCallers().find((c) => c.id === id) || CALLERS[0];

// ------------------------------------------------------------------ Zahlwörter (Englisch, britisch mit „and“)
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function enWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + enWords(n % 100) : '');
  return String(n);
}

const KALLE = {
  0: ['Nix. Gar nix.', 'Da war wohl der Deckel offen.', 'Null. Wie mein Kontostand.'],
  low: ['Na ja, geht so.', 'Da geht noch was.', 'Ausbaufähig.'],
  mid: ['Ordentlich!', 'Kann man machen.', 'Sauber!'],
  ton: ['Ton! Lecker!', 'Hundert plus, Respekt!', 'Jetzt wird es warm!'],
  big: ['Uiuiui!', 'Was für ein Brett!', 'Hammer!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Ereignis → Text (für TTS). ev.call aus games.js. */
export function textFor(call, ctx = {}, callerId = settings.caller) {
  if (!call) return '';
  const c = callerById(callerId);
  const en = (c.lang || 'en').startsWith('en');
  const name = ctx.name || '';
  if (call.phrase) {
    const P = en ? {
      bust: 'No score', elim: 'Eliminated!', gameshot: 'Game shot!', leg: 'Game shot, and the leg!', set: 'Game shot, and the set!',
      match: `Game shot, and the match${name ? ', ' + name : ''}!`, shanghai: 'Shanghai!', halved: 'Halved!', missed: 'Unlucky',
      gameon: `${name ? name + ' to throw first. ' : ''}Game on!`,
    } : {
      bust: c.id === 'kalle' ? 'Überworfen. Klassiker.' : 'Überworfen', elim: c.id === 'kalle' ? 'Zack, zurück auf null!' : 'Eliminiert!', gameshot: 'Game Shot!', leg: 'Game Shot, und das Leg!', set: 'Game Shot, und der Satz!',
      match: `Game Shot, und das Match${name ? ' für ' + name : ''}!`, shanghai: 'Shanghai!', halved: 'Halbiert!', missed: 'Schade',
      gameon: `${name ? name + ' beginnt. ' : ''}Game on!`,
    };
    let t = P[call.phrase] || '';
    if (call.phrase === 'gameshot' && call.leg) t = P.leg;
    return t;
  }
  if (call.score != null) {
    const s = call.score;
    if (en) {
      if (s === 0) return 'No score';
      if (s === 180) return 'One hundred and eighty!';
      return enWords(s);
    }
    if (s === 0) return c.id === 'kalle' ? pick(KALLE[0]) : 'Kein Score';
    if (s === 180) return c.id === 'kalle' ? 'Hundertachtzig! Lokalrunde!' : 'Einhundertachtzig!';
    if (c.id === 'kalle') {
      const tag = s >= 140 ? pick(KALLE.big) : s >= 100 ? pick(KALLE.ton) : s >= 45 ? pick(KALLE.mid) : pick(KALLE.low);
      return `${s}. ${tag}`;
    }
    return String(s);
  }
  if (call.marks != null) {
    if (!call.marks) return en ? 'No score' : 'Nichts';
    return en ? `${enWords(call.marks)} mark${call.marks > 1 ? 's' : ''}` : `${call.marks} ${call.marks > 1 ? 'Marks' : 'Mark'}`;
  }
  return '';
}

export function requireText(name, rest, callerId = settings.caller) {
  const c = callerById(callerId);
  const en = (c.lang || 'en').startsWith('en');
  const who = settings.callNames && name ? name + ', ' : '';
  return en ? `${who}you require ${enWords(rest)}` : `${who}${c.id === 'kalle' ? 'du brauchst' : 'Sie benötigen'} ${rest}`;
}

// ------------------------------------------------------------------ Sprechen
const queue = [];
let busy = false;
let voices = [];
function loadVoices() { try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; } }
if (typeof window !== 'undefined' && window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

const MALE = /\bmale|daniel|markus|stefan|conrad|george|arthur|oliver|thomas|hans|yannick|ryan|guy|david|james|brian|reed|rocko|eddy|grandpa|jonas|killian|aaron|fred|ralph|alex\b|gordon|lee\b|rishi|nathan|evan|tom\b|william|gbb|gbd|rjs|iol|iom|tpd|deg|ded|smtm/i;
const FEMALE = /female|anna|helena|hedda|katja|petra|vicki|marlene|amala|libby|sonia|serena|kate|susan|hazel|martha|samantha|karen|moira|tessa|fiona|zira|sandy|shelley|flo/i;

const isMale = (n) => MALE.test(n) && !/female/i.test(n);
const isFemale = (n) => FEMALE.test(n) || /female/i.test(n);
/** Gewählte Gerätestimme (Einstellungen) für Männer-Caller dieser Sprache. */
const overrideFor = (c) => (c.gender === 'm' ? (c.lang.startsWith('en') ? settings.voiceEn : settings.voiceDe) : '') || '';

/** Browser-Stimme wählen: erst Sprache + Geschlecht, dann Geschlecht in verwandter Sprache (en-US statt en-GB), dann irgendeine. */
function pickVoice(c) {
  if (!voices.length) loadVoices();
  const ov = overrideFor(c);
  if (ov) { const v = voices.find((x) => x.name === ov); if (v) return { v, match: true }; }
  const lang = c.lang.toLowerCase();
  const exact = voices.filter((v) => v.lang && v.lang.toLowerCase().replace('_', '-') === lang);
  const family = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  const test = c.gender === 'm' ? isMale : c.gender === 'f' ? isFemale : null;
  const best = (pool) => pool.find((v) => /natural|neural|premium|enhanced|google/i.test(v.name)) || pool[0];
  if (test) {
    const g1 = exact.filter((v) => test(v.name));
    if (g1.length) return { v: best(g1), match: true };
    const g2 = family.filter((v) => test(v.name));
    if (g2.length) return { v: best(g2), match: true };
  }
  const any = exact.length ? exact : family;
  return any.length ? { v: best(any), match: !test } : null;
}

/** Stimmen für die Auswahl in den Einstellungen. */
export function deviceVoices(lang2) {
  const nb = nativeBridge();
  if (nb && nb.voices) { try { return JSON.parse(nb.voices(lang2)); } catch (e) { return []; } }
  if (!voices.length) loadVoices();
  return voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang2)).map((v) => ({ name: v.name, locale: v.lang, male: isMale(v.name), female: isFemale(v.name) }));
}

const hasCache = {};
function nativeHas(lang, gender) {
  const k = lang + gender;
  if (!(k in hasCache)) { try { hasCache[k] = !!nativeBridge().hasGenderVoice(lang, gender); } catch (e) { hasCache[k] = true; } }
  return hasCache[k];
}

function speakTts(text, c, opts = {}) {
  return new Promise((resolve) => {
    if (!text) return resolve();
    const rate = (opts.rate || 1) * c.rate;
    const nb = nativeBridge();
    if (nb && (nb.speak2 || nb.speak)) {
      try {
        const id = 'u' + Math.random().toString(36).slice(2);
        window.__ttsDone = window.__ttsDone || {};
        window.__ttsDone[id] = resolve;
        if (nb.speak2) {
          // Android wählt Männer-/Frauenstimme selbst; gibt es keine passende, Tonhöhe für einen tieferen Klang senken
          let pitch = c.pitch;
          if (c.gender === 'm' && !overrideFor(c) && !nativeHas(c.lang, 'm')) pitch *= 0.78;
          nb.speak2(text, c.lang, pitch, rate, settings.volume, id, c.gender || '', overrideFor(c));
        } else nb.speak(text, c.lang, c.pitch, rate, settings.volume, id);
        setTimeout(resolve, 6000);
        return;
      } catch (e) { /* weiter mit Browser-TTS */ }
    }
    if (!window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const pv = pickVoice(c);
    let pitch = c.pitch;
    if (pv) { u.voice = pv.v; if (!pv.match && c.gender === 'm') pitch *= 0.78; }
    u.lang = pv ? pv.v.lang : c.lang; u.pitch = pitch; u.rate = rate; u.volume = settings.volume;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
    setTimeout(resolve, 6000);
  });
}

// ------------------------------------------------------------------ Sound-Paket (IndexedDB)
const DB = 'darts-arena', STORE = 'callerpack';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
export const packSave = (key, blob) => tx('readwrite', (s) => s.put(blob, key));
export const packDelete = (key) => tx('readwrite', (s) => s.delete(key));
export const packClear = () => tx('readwrite', (s) => s.clear());
export async function packKeys() { try { return (await tx('readonly', (s) => s.getAllKeys())).filter((k) => !String(k).startsWith('__') && !String(k).startsWith('v:')); } catch (e) { return []; } }
async function packGet(key) { try { return await tx('readonly', (s) => s.get(key)); } catch (e) { return null; } }
export const packGetRaw = packGet;
export async function packKeysAll() { try { return (await tx('readonly', (s) => s.getAllKeys())).map(String); } catch (e) { return []; } }
export async function packDeletePrefix(prefix) { for (const k of await packKeysAll()) if (k.startsWith(prefix)) await packDelete(k); }
// Menü-Musik (eigene Datei) liegt im selben Speicher unter „__music“
export const musicFileGet = () => packGet('__music');
export const musicFileSave = (blob) => packSave('__music', blob);
export const musicFileDelete = () => packDelete('__music');
export async function packClearCalls() { for (const k of await packKeys()) await packDelete(k); }

/** Dateiname → Schlüssel: „180.mp3“ → „180“, „game_shot.wav“ → „gameshot“, „you-require.ogg“ → „require“. */
export function keyFromFilename(name) {
  const base = name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]/g, '');
  const num = /^(\d{1,3})$/.exec(base) || /(?:score|s|n)(\d{1,3})$/.exec(base);
  if (num && +num[1] <= 180) return String(+num[1]);
  const map = { noscore: 'noscore', bust: 'bust', gameshot: 'gameshot', gameshotandtheleg: 'leg', leg: 'leg', gameshotandtheset: 'set', set: 'set',
    gameshotandthematch: 'match', match: 'match', gameon: 'gameon', require: 'require', yourequire: 'require', shanghai: 'shanghai', halved: 'halved' };
  return map[base] || null;
}
export const PACK_KEYS = ['gameon', 'require', 'noscore', 'gameshot', 'leg', 'set', 'match', 'bust', 'shanghai', '180', '140', '100', '60', '26', '45', '41', '81', '85', '95', '121'];

let currentAudio = null;
function playBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    currentAudio = a;
    a.volume = settings.volume;
    a.onended = a.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    a.play().catch(() => resolve());
    setTimeout(resolve, 8000);
  });
}

/** Sound-Paket: passende Aufnahme(n) suchen, sonst null. */
async function packClips(call, ctx) {
  const keys = [];
  if (call.require != null) { keys.push('require', String(call.require)); }
  else if (call.phrase) {
    if (call.phrase === 'gameshot' && call.leg) keys.push('leg');
    else keys.push(call.phrase === 'bust' ? 'noscore' : call.phrase);
  } else if (call.score != null) keys.push(call.score === 0 ? 'noscore' : String(call.score));
  const blobs = [];
  for (const k of keys) {
    let b = await packGet(k);
    if (!b && k === 'noscore') b = await packGet('0');
    if (!b && k === 'leg') b = await packGet('gameshot');
    if (!b) return null;
    blobs.push(b);
  }
  return blobs.length ? blobs : null;
}

/** TV-Stil: Ansage in Abschnitte mit eigener Betonung und Pausen zerlegen (nur englische TV-Caller). */
function tvParts(call, ctx) {
  const name = settings.callNames && ctx.name ? ctx.name : '';
  const P = (t, rate = 1, pitch = 1, pause = 0) => ({ t, rate, pitch, pause });
  if (call.require != null) return [P(`${name ? name + ', ' : ''}you require ${enWords(call.require)}!`, 1.0, 1.04)];
  if (call.phrase === 'gameon') return [P('Ladies and gentlemen!', 1.0, 1.05, 120), P(name ? `${name} to throw first.` : 'Let\'s play darts!', 1.05, 1.0, 80), P('Game on!', 0.95, 1.18)];
  if (call.phrase === 'gameshot' && call.leg) return [P('Game shot, and the leg!', 0.98, 1.12)];
  if (call.phrase === 'gameshot') return [P('Game shot!', 0.98, 1.15)];
  if (call.phrase === 'set') return [P('Game shot, and the set!', 0.96, 1.12)];
  if (call.phrase === 'match') return [P('Game shot, and the match!', 0.94, 1.15, 60), name ? P(name + '!', 1.0, 1.1) : null].filter(Boolean);
  if (call.phrase === 'bust') return [P('No score!', 1.0, 1.0)];
  if (call.phrase === 'elim') return [P('Eliminated!', 0.95, 1.15)];
  if (call.score === 180) return [P('One hundred', 0.98, 1.05, 30), P('and eighty!', 0.78, 1.2)];
  if (call.score === 0) return [P('No score!', 1.0, 1.0)];
  if (call.score != null && call.score >= 100) return [P(enWords(call.score) + '!', 1.0, 1.1)];
  if (call.score != null) return [P(enWords(call.score) + (call.score >= 60 ? '!' : ''), 1.04, 1.04)];
  return null;
}

async function speakParts(parts, c) {
  for (const p of parts) {
    await speakTts(p.t, { ...c, pitch: c.pitch * p.pitch }, { rate: p.rate });
    if (p.pause) await new Promise((r) => setTimeout(r, p.pause));
  }
}

async function run(item) {
  const c = callerById(item.caller);
  if (c.id === 'off') return;
  if (c.own) {
    const V = await import('./voice.js');
    const keys = await V.clipsFor(c.voiceId, item.call);
    if (keys && await V.playKeys(keys, settings.volume)) return;
    // Fallback: passender TTS-Caller in derselben Sprache
    const fb = callerById(c.lang.startsWith('en') ? 'showman' : 'kommentator');
    const parts = fb.tv ? tvParts(item.call, item.ctx) : null;
    if (parts) { await speakParts(parts, fb); return; }
    await speakTts(item.call.require != null ? requireText(item.ctx.name, item.call.require, fb.id) : textFor(item.call, item.ctx, fb.id), fb);
    return;
  }
  if (c.tv) {
    const parts = tvParts(item.call, item.ctx);
    if (parts) { await speakParts(parts, c); return; }
  }
  if (c.id === 'custom') {
    const clips = await packClips(item.call, item.ctx);
    if (clips) { for (const b of clips) await playBlob(b); return; }
    const parts = tvParts(item.call, item.ctx);
    if (parts) { await speakParts(parts, callerById('showman')); return; }
  }
  const text = item.call.require != null ? requireText(item.ctx.name, item.call.require, c.id) : textFor(item.call, item.ctx, c.id);
  const slow = item.call.score === 180 ? 0.75 : 1;
  await speakTts(text, c, { rate: slow });
}

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const it = queue.shift();
    try { await run(it); } catch (e) { logError('Caller', e); }
  }
  busy = false;
}

/** Ansage einreihen. call: {score}|{phrase}|{marks}|{require}; ctx: {name}. */
export function say(call, ctx = {}, callerId = settings.caller) {
  if (!call || callerId === 'off' || call.quiet) return;
  queue.push({ call, ctx, caller: callerId });
  pump();
}
export function stopCalls() {
  queue.length = 0;
  try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) { /* egal */ }
  const nb = nativeBridge(); if (nb && nb.stopSpeak) try { nb.stopSpeak(); } catch (e) { /* egal */ }
  if (currentAudio) try { currentAudio.pause(); } catch (e) { /* egal */ }
}
/** Probe-Ansage in den Einstellungen. */
export function demo(id) {
  stopCalls();
  say({ phrase: 'gameon' }, { name: 'Spieler 1' }, id);
  say({ score: 180 }, {}, id);
  say({ require: 32 }, { name: 'Spieler 1' }, id);
}

// Native TTS meldet „fertig gesprochen“
if (typeof window !== 'undefined') window.__onTtsDone = (id) => { const f = window.__ttsDone && window.__ttsDone[id]; if (f) { delete window.__ttsDone[id]; f(); } };
