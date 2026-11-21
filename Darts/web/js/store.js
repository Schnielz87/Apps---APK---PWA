// Lokale Speicherung (bleibt bei Updates erhalten): Profile, Spielverlauf, Einstellungen, Fortschritt.
const P = 'da.';
function read(k, def) { try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function write(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* Speicher voll/gesperrt */ } }

const COLORS = ['#e53935', '#43a047', '#1e88e5', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#d81b60'];
const EMOJI = ['🎯', '🦅', '🐺', '🦁', '🔥', '⚡', '🐉', '👑', '🦈', '🚀', '🍀', '🎸'];

export const DEFAULT_SETTINGS = {
  caller: 'showman', callerVolume: 0.9, callNames: true, callRest: true,
  sfx: true, sfxVolume: 0.7, vibrate: true, input: 'keypad', cpuSpeed: 1, showHints: true,
  music: true, musicVolume: 0.25, musicSource: 'builtin', musicName: '',
  autoUpdate: true, keepAwake: true, confirmVisit: false, theme: 'dark',
};

export const store = {
  settings() { return { ...DEFAULT_SETTINGS, ...read('settings', {}) }; },
  saveSettings(s) { write('settings', s); },

  profiles() {
    let p = read('profiles', null);
    if (!p || !p.length) { p = [this.newProfile('Ich', 0)]; write('profiles', p); }
    return p;
  },
  saveProfiles(p) { write('profiles', p); },
  newProfile(name, i = Math.floor(Math.random() * 8)) {
    return { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, color: COLORS[i % COLORS.length], emoji: EMOJI[i % EMOJI.length], created: Date.now() };
  },
  activeProfileId() { return read('active', null) || this.profiles()[0].id; },
  setActive(id) { write('active', id); },
  COLORS, EMOJI,

  history() { return read('history', []); },
  addHistory(entry) {
    const h = this.history();
    h.unshift(entry);
    write('history', h.slice(0, 600));
  },
  clearHistory() { write('history', []); },

  progress() {
    return { xp: 0, ach: {}, streak: 0, lastDay: null, bestStreak: 0, daily: {}, dailyDone: 0, records: {}, ...read('progress', {}) };
  },
  saveProgress(p) { write('progress', p); },

  /** Laufendes Spiel (zum Fortsetzen nach App-Neustart). */
  running() { return read('running', null); },
  saveRunning(r) { write('running', r); },
  clearRunning() { try { localStorage.removeItem(P + 'running'); } catch (e) { /* egal */ } },

  exportAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(P)) out[k] = localStorage.getItem(k);
    }
    return JSON.stringify({ app: 'darts-arena', v: 1, date: new Date().toISOString(), data: out });
  },
  importAll(txt) {
    const o = JSON.parse(txt);
    if (!o || o.app !== 'darts-arena' || !o.data) throw new Error('Keine gültige Darts-Arena-Sicherung');
    Object.entries(o.data).forEach(([k, v]) => { if (k.startsWith(P)) localStorage.setItem(k, v); });
  },
};
