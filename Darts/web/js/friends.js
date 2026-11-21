// Freundesliste: eigener Freundes-Code, Online-Status der Freunde und Spielanfragen – direkt von Gerät zu Gerät.
// Solange die App offen ist, ist das Gerät beim PeerJS-Vermittler unter „…-u-<Code>“ erreichbar („anwesend“).
// Online-Prüfung = kurzer Verbindungsversuch zu diesem Namen; Anfragen gehen über dieselbe Verbindung.
import { log, logWarn } from './log.js';

const PREFIX = 'dartsarena-v1-u-';
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LS_ID = 'da.friendId', LS_LIST = 'da.friends';

export function myCode() {
  let c = null;
  try { c = localStorage.getItem(LS_ID); } catch (e) { /* egal */ }
  if (!c || !/^[A-Z2-9]{8}$/.test(c)) {
    c = Array.from({ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
    try { localStorage.setItem(LS_ID, c); } catch (e) { /* egal */ }
  }
  return c;
}
export const cleanFriendCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').slice(0, 8);
export const prettyCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

export function friends() { try { return JSON.parse(localStorage.getItem(LS_LIST) || '[]'); } catch (e) { return []; } }
function saveFriends(l) { try { localStorage.setItem(LS_LIST, JSON.stringify(l)); } catch (e) { /* egal */ } }
export function addFriend(code, name) {
  code = cleanFriendCode(code);
  if (code.length !== 8 || code === myCode()) return false;
  const l = friends();
  const f = l.find((x) => x.code === code);
  if (f) { if (name && f.name !== name) { f.name = name; saveFriends(l); } return 'known'; }
  l.push({ code, name: String(name || 'Freund').slice(0, 20), added: Date.now() });
  saveFriends(l);
  return true;
}
export function removeFriend(code) { saveFriends(friends().filter((f) => f.code !== code)); }

/**
 * Anwesenheit + Nachrichten. Ereignisse: invite(msg, reply), friendAdd(from), status(code, state)
 * state: 'online' | 'playing' | 'offline' | 'checking'
 */
export class Presence {
  constructor(getMe) {
    this.getMe = getMe; // () => {name, playing}
    this.peer = null;
    this.handlers = {};
    this.state = {};
    this.pending = new Map();
    this.started = false;
  }
  on(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); return this; }
  emit(t, ...a) { (this.handlers[t] || []).forEach((f) => { try { f(...a); } catch (e) { logWarn('Freunde', e); } }); }

  async start() {
    if (this.started) return;
    this.started = true;
    if (!window.Peer) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/vendor/peerjs.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const open = () => {
      const p = new window.Peer(PREFIX + myCode(), { debug: 0 });
      this.peer = p;
      p.on('open', () => { this.ready = true; log('Freunde', `Anwesend als ${prettyCode(myCode())}`); this.emit('ready'); });
      p.on('connection', (c) => this.incoming(c));
      p.on('disconnected', () => { this.ready = false; if (!this.stopped) setTimeout(() => { try { p.reconnect(); } catch (e) { /* egal */ } }, 3000); });
      p.on('error', (e) => {
        if (e.type === 'peer-unavailable') {
          const m = /dartsarena-v1-u-([A-Z0-9]{8})/.exec(e.message || '');
          if (m && this.pending.has(m[1])) { this.pending.get(m[1])('offline'); }
          return;
        }
        if (e.type === 'unavailable-id') {
          // gleicher Code noch angemeldet (z. B. App gerade neu gestartet) – gleich erneut versuchen
          this.ready = false; try { p.destroy(); } catch (x) { /* egal */ }
          if (!this.stopped) setTimeout(open, 8000);
          return;
        }
        logWarn('Freunde', `Vermittler: ${e.type || e}`);
      });
    };
    open();
  }
  stop() { this.stopped = true; try { this.peer && this.peer.destroy(); } catch (e) { /* egal */ } }

  /** Eingehende Verbindung eines Freundes: Statusabfrage, Anfrage oder „hat dich hinzugefügt“. */
  incoming(c) {
    c.on('data', (m) => {
      if (!m || typeof m !== 'object') return;
      const me = this.getMe();
      if (m.t === 'ping') c.send({ t: 'pong', name: me.name, playing: !!me.playing });
      else if (m.t === 'friend-add' && m.from) { this.emit('friendAdd', m.from); c.send({ t: 'ok', name: me.name }); }
      else if (m.t === 'invite' && m.from) {
        if (me.playing) { c.send({ t: 'answer', ok: false, why: 'playing' }); return; }
        this.emit('invite', m, (ok) => { try { c.send({ t: 'answer', ok }); } catch (e) { /* egal */ } });
      }
    });
  }

  /** Einmal zu einem Freund verbinden, Nachricht senden, Antwort abwarten. */
  talk(code, msg, timeout = 6000) {
    return new Promise((resolve) => {
      if (!this.peer || !this.ready) return resolve({ state: 'offline', why: 'selbst offline' });
      let done = false;
      const fin = (r) => { if (done) return; done = true; this.pending.delete(code); clearTimeout(to); try { c.close(); } catch (e) { /* egal */ } resolve(r); };
      const to = setTimeout(() => fin({ state: 'offline' }), timeout);
      this.pending.set(code, () => fin({ state: 'offline' }));
      const c = this.peer.connect(PREFIX + code, { reliable: true });
      c.on('open', () => c.send(msg));
      c.on('data', (m) => fin({ state: m && m.playing ? 'playing' : 'online', reply: m }));
      c.on('error', () => fin({ state: 'offline' }));
    });
  }

  async check(code) {
    this.state[code] = this.state[code] === 'online' || this.state[code] === 'playing' ? this.state[code] : 'checking';
    this.emit('status', code, this.state[code]);
    const r = await this.talk(code, { t: 'ping' }, 5000);
    this.state[code] = r.state;
    if (r.reply && r.reply.name) addFriend(code, r.reply.name); // Namen aktuell halten
    this.emit('status', code, r.state);
    return r.state;
  }
  async checkAll() { for (const f of friends()) await this.check(f.code); }

  /** Spielanfrage: Ergebnis {ok, why} */
  async invite(code, payload) {
    const r = await this.talk(code, { t: 'invite', ...payload }, 45000);
    if (r.state === 'offline' && !r.reply) return { ok: false, why: 'offline' };
    return { ok: !!(r.reply && r.reply.ok), why: r.reply && r.reply.why };
  }
  async announceFriend(code, me) { return this.talk(code, { t: 'friend-add', from: { code: myCode(), name: me.name } }, 6000); }
}
