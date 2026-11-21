// Online-Modus: Spiel direkt von Handy zu Handy (WebRTC über PeerJS, inkl. öffentlicher TURN-Server).
// Gegnersuche „gegen alle“ über feste Warteplätze beim selben Vermittler. Kein Konto, keine eigene Server-Infrastruktur.
// Ablauf: Host legt Raum an (Code) → Gast verbindet → Host schickt Spiel-Einstellungen → beide wenden dieselben
// Eingaben in derselben Reihenfolge an. Nach Verbindungsabbruch gleicht der Host per Eingabe-Protokoll wieder ab.
import { log, logError, logWarn } from './log.js';

const PREFIX = 'dartsarena-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PROTO = 1;

let libPromise = null;
/** PeerJS erst bei Bedarf laden (liegt offline in js/vendor). */
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!libPromise) {
    libPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/peerjs.min.js';
      s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('PeerJS fehlt')));
      s.onerror = () => rej(new Error('PeerJS konnte nicht geladen werden'));
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

export const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[O]/g, '0').slice(0, 5);

/**
 * Eine Online-Sitzung (2 Spieler). Ereignisse über on(type, fn):
 *  status(text, kind) · peer(info) · cfg(msg) · input(msg) · bye() · rematch() · sync(msg) · emote(e) · lost() · back()
 */
export class OnlineSession {
  constructor(me) {
    this.me = me; // {name, emoji, color, pid}
    this.handlers = {};
    this.conn = null;
    this.peer = null;
    this.role = null;
    this.code = null;
    this.opp = null;
    this.log = [];      // alle angewendeten Eingaben (für Abgleich)
    this.cfg = null;    // aktuelle Spiel-Einstellungen
    this.lastSeen = 0;
    this.closed = false;
  }
  on(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); return this; }
  emit(t, ...a) { (this.handlers[t] || []).forEach((f) => { try { f(...a); } catch (e) { logError('Online', e); } }); }
  status(text, kind = '') { this.statusText = text; this.emit('status', text, kind); }

  async makePeer(id) {
    const Peer = await loadPeer();
    return new Promise((res, rej) => {
      const p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
      const to = setTimeout(() => rej(new Error('Server für den Verbindungsaufbau nicht erreichbar')), 15000);
      p.on('open', () => { clearTimeout(to); res(p); });
      p.on('error', (e) => { clearTimeout(to); rej(e); });
    });
  }

  /** Raum anlegen (Freunde) – liefert den Code. */
  async host(code = newCode()) {
    this.role = 'host';
    for (let tries = 0; tries < 4; tries++) {
      try {
        this.peer = await this.makePeer(PREFIX + code);
        break;
      } catch (e) {
        if (e && e.type === 'unavailable-id') { code = newCode(); continue; }
        throw e;
      }
    }
    if (!this.peer) throw new Error('Kein freier Raum-Code gefunden');
    this.code = code;
    this.listen();
    this.status('Warte auf Gegner …');
    log('Online', `Raum ${code} erstellt`);
    return code;
  }

  listen() {
    this.peer.on('connection', (c) => {
      if (this.conn && this.conn.open && this.opp && c.metadata && c.metadata.pid !== this.opp.pid) {
        c.on('open', () => { c.send({ t: 'busy' }); setTimeout(() => c.close(), 500); });
        return;
      }
      this.attach(c);
    });
    this.peer.on('disconnected', () => { if (!this.closed) { logWarn('Online', 'Vermittlungs-Server getrennt – verbinde neu'); try { this.peer.reconnect(); } catch (e) { /* egal */ } } });
    this.peer.on('error', (e) => logWarn('Online', `Peer: ${e.type || e}`));
  }

  /** Raum beitreten (Code vom Freund). */
  async join(code) {
    this.role = 'guest';
    this.code = cleanCode(code);
    this.peer = this.peer || await this.makePeer();
    this.peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') { this.status('Raum nicht gefunden – Code prüfen oder Gegner muss die App geöffnet lassen.', 'warn'); this.emit('notfound'); }
      else logWarn('Online', `Peer: ${e.type || e}`);
    });
    this.connectTo(PREFIX + this.code);
    this.status('Verbinde …');
  }

  connectTo(id) {
    const c = this.peer.connect(id, { reliable: true, metadata: { pid: this.me.pid } });
    this.attach(c);
  }

  attach(c) {
    if (this.conn && this.conn !== c) try { this.conn.close(); } catch (e) { /* egal */ }
    this.conn = c;
    c.on('open', () => {
      this.lastSeen = Date.now();
      this.send({ t: 'hello', v: PROTO, name: this.me.name, emoji: this.me.emoji, color: this.me.color, pid: this.me.pid });
      this.startHeartbeat();
    });
    c.on('data', (m) => this.onData(m));
    c.on('close', () => { if (!this.closed) this.onLost('Verbindung geschlossen'); });
    c.on('error', (e) => logWarn('Online', `Verbindung: ${e.type || e}`));
  }

  onData(m) {
    if (!m || typeof m !== 'object') return;
    this.lastSeen = Date.now();
    if (this.wasLost) { this.wasLost = false; this.emit('back'); this.status('Wieder verbunden ✓', 'ok'); }
    switch (m.t) {
      case 'hello': {
        if (m.v !== PROTO) { this.status('Der Gegner hat eine andere App-Version – bitte beide aktualisieren.', 'warn'); }
        const first = !this.opp;
        this.opp = { name: String(m.name || 'Gegner').slice(0, 20), emoji: m.emoji || '🎯', color: m.color || '#1e88e5', pid: m.pid };
        log('Online', `${first ? 'Verbunden mit' : 'Wieder verbunden:'} ${this.opp.name}`);
        if (first) { this.status(`${this.opp.name} ist da!`, 'ok'); this.emit('peer', this.opp); }
        else if (this.role === 'host' && this.cfg) this.send({ t: 'sync', cfg: this.cfg, log: this.log });
        break;
      }
      case 'cfg': this.cfg = m.cfg; this.log = []; this.emit('cfg', m); break;
      case 'in': this.log.push(m.i); this.emit('input', m.i); break;
      case 'sync': this.cfg = m.cfg; this.log = m.log.slice(); this.emit('sync', m); break;
      case 'bye': this.emit('bye'); break;
      case 'busy': this.status('Der Raum ist schon voll.', 'warn'); this.emit('busy'); break;
      case 'rematch': this.emit('rematch'); break;
      case 'emote': this.emit('emote', String(m.e || '').slice(0, 4)); break;
      case 'ping': break;
      default: break;
    }
  }

  send(m) { try { if (this.conn && this.conn.open) { this.conn.send(m); return true; } } catch (e) { logWarn('Online', e); } return false; }

  /** Spiel starten/neu starten (nur Host). */
  start(cfg) { this.cfg = cfg; this.log = []; this.send({ t: 'cfg', cfg }); }
  /** Eigene Eingabe weitergeben (und fürs Protokoll merken). */
  input(i) { this.log.push(i); this.send({ t: 'in', i }); }

  startHeartbeat() {
    clearInterval(this.hb);
    this.hb = setInterval(() => {
      this.send({ t: 'ping' });
      if (Date.now() - this.lastSeen > 12000 && !this.wasLost) this.onLost('keine Antwort');
    }, 3000);
  }

  onLost(why) {
    if (this.closed || this.wasLost) return;
    this.wasLost = true;
    logWarn('Online', `Verbindung unterbrochen (${why})`);
    this.status('Verbindung unterbrochen – verbinde neu …', 'warn');
    this.emit('lost');
    // Gast baut die Verbindung selbst wieder auf; Host wartet auf neue Verbindung
    if (this.role === 'guest') {
      let n = 0;
      const retry = () => {
        if (this.closed || !this.wasLost || n++ > 20) return;
        try { if (this.peer.disconnected) this.peer.reconnect(); this.connectTo(PREFIX + this.code); } catch (e) { /* weiter */ }
        setTimeout(retry, 4000);
      };
      setTimeout(retry, 1500);
    }
  }

  close(sendBye = true) {
    if (sendBye) this.send({ t: 'bye' });
    this.closed = true;
    clearInterval(this.hb);
    setTimeout(() => { try { this.conn && this.conn.close(); } catch (e) { /* egal */ } try { this.peer && this.peer.destroy(); } catch (e) { /* egal */ } }, 300);
  }
}

// ------------------------------------------------------------------ Gegnersuche „gegen alle“
// Ohne zusätzlichen Dienst: feste „Warteplätze“ je Spielart beim PeerJS-Vermittler.
// Wer sucht, versucht Platz 0, 1, 2 … zu belegen. Ist ein Platz belegt, wartet dort schon jemand →
// direkt verbinden. Der Wartende teilt dann seine eigentliche Spiel-Kennung mit und gibt den Platz frei.
export const LOBBY_MODES = [
  { id: 'x01-501', name: '501 · Double-Out', game: 'x01', cfg: { start: 501, in: 'straight', out: 'double', legs: 1, sets: 1 } },
  { id: 'x01-301', name: '301 · Double-Out', game: 'x01', cfg: { start: 301, in: 'straight', out: 'double', legs: 1, sets: 1 } },
  { id: 'x01-501-ft3', name: '501 · First to 3 Legs', game: 'x01', cfg: { start: 501, in: 'straight', out: 'double', legs: 3, sets: 1 } },
  { id: 'cricket', name: 'Cricket', game: 'cricket', cfg: { variant: 'standard', rounds: 20 } },
];

const SLOTS = 8;
const slotId = (mode, n) => `${PREFIX}lobby-${mode.id}-${n}`;

/** Sucht einen Gegner für mode. Rückgabe: Promise<OnlineSession> (verbunden), mit cancel(). */
export function seekOpponent(me, mode, onInfo = () => {}) {
  let cancelled = false, beacon = null, session = null, done = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p = new Promise(async (resolve, reject) => {
    try {
      session = new OnlineSession(me);
      session.peer = await session.makePeer();
      session.listen();
      session.role = 'host';
      const finish = () => { if (done) return; done = true; if (beacon) { try { beacon.destroy(); } catch (e) { /* egal */ } beacon = null; } resolve(session); };
      session.on('peer', () => finish());
      const Peer = await loadPeer();

      /** Versucht, bei einem Wartenden auf Platz n anzuklopfen. true = verbunden. */
      const knock = (n) => new Promise((res) => {
        const c = session.peer.connect(slotId(mode, n), { reliable: true, metadata: { pid: me.pid, knock: true } });
        const to = setTimeout(() => { try { c.close(); } catch (e) { /* egal */ } res(false); }, 6000);
        c.on('data', (m) => {
          if (m && m.t === 'here' && m.id) {
            clearTimeout(to);
            try { c.close(); } catch (e) { /* egal */ }
            session.role = 'guest';
            log('Lobby', `Gegner auf Platz ${n} gefunden`);
            session.attach(session.peer.connect(m.id, { reliable: true, metadata: { pid: me.pid } }));
            res(true);
          } else if (m && m.t === 'busy') { clearTimeout(to); try { c.close(); } catch (e) { /* egal */ } res(false); }
        });
        c.on('error', () => { clearTimeout(to); res(false); });
      });

      /** Platz n belegen. Ergebnis: 'mine' | 'taken' | 'error'. */
      const claim = (n) => new Promise((res) => {
        const b = new Peer(slotId(mode, n), { debug: 0 });
        const to = setTimeout(() => { try { b.destroy(); } catch (e) { /* egal */ } res('error'); }, 10000);
        b.on('open', () => {
          clearTimeout(to);
          beacon = b;
          b.on('connection', (c) => c.on('open', () => {
            if (done || session.opp) { c.send({ t: 'busy' }); setTimeout(() => c.close(), 400); return; }
            c.send({ t: 'here', id: session.peer.id, name: me.name });
          }));
          res('mine');
        });
        b.on('error', (e) => { clearTimeout(to); try { b.destroy(); } catch (x) { /* egal */ } res(e && e.type === 'unavailable-id' ? 'taken' : 'error'); });
      });

      while (!cancelled && !done) {
        for (let n = 0; n < SLOTS && !cancelled && !done; n++) {
          onInfo({ slot: n, waiting: 0 });
          const r = await claim(n);
          if (r === 'mine') {
            onInfo({ waiting: 0, mine: true });
            log('Lobby', `Warte auf Platz ${n} (${mode.name})`);
            // warten, bis jemand anklopft (finish() über „peer“)
            while (!cancelled && !done) await sleep(500);
            break;
          }
          if (r === 'taken') {
            onInfo({ waiting: 1 });
            if (await knock(n)) { for (let t = 0; t < 30 && !done && !cancelled; t++) await sleep(500); if (done) break; }
          }
        }
        if (!done && !cancelled) await sleep(2500);
      }
    } catch (e) { reject(e); }
  });
  p.cancel = () => { cancelled = true; if (beacon) try { beacon.destroy(); } catch (e) { /* egal */ } if (session && !done) session.close(false); };
  return p;
}
