// Alle Spielmodi. Jedes Spiel hält seinen Zustand in this.s (reines JSON) – so ist „Rückgängig“ ein einfacher Schnappschuss.
import { dart, value, label, isDouble, MISS } from './board.js';
import { bestCheckout, checkoutText, aimFor, isFinishable, minDarts } from './checkout.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const rnd = (n) => Math.floor(Math.random() * n);
export const IMPOSSIBLE = new Set([179, 178, 176, 175, 173, 172, 169, 166, 163]);

function newStats() {
  return { darts: 0, points: 0, visits: 0, f9p: 0, f9d: 0, c180: 0, c140: 0, c100: 0, c60: 0, coHit: 0, coAtt: 0, hiFinish: 0, bestLeg: 0, hiVisit: 0, legsWon: 0, hits: {} };
}

class Base {
  constructor(cfg, players) {
    this.cfg = cfg;
    this.players = players;
    this.undoStack = [];
    this.s = {
      cur: 0, turn: [], round: 1, over: false, winner: null, message: '',
      st: players.map(() => newStats()), last: players.map(() => null),
    };
    this.init();
  }
  get meta() { return this.constructor.meta; }
  get cur() { return this.s.cur; }
  get dartsInTurn() { return this.s.turn.length; }
  /** Darts pro Aufnahme (Standard 3). */
  get perTurn() { return 3; }
  snapshot() { this.undoStack.push(clone(this.s)); if (this.undoStack.length > 300) this.undoStack.shift(); }
  canUndo() { return this.undoStack.length > 0; }
  undo() { if (this.undoStack.length) this.s = this.undoStack.pop(); }

  /** Ein Dart wurde geworfen. Ergebnis: Ereignis für Anzeige + Caller. */
  throwDart(d, pos = null) {
    if (this.s.over) return null;
    this.snapshot();
    const p = this.s.cur;
    const st = this.s.st[p];
    st.darts++;
    const key = label(d);
    st.hits[key] = (st.hits[key] || 0) + 1;
    this.s.turn.push({ ...d, pos });
    const r = this.onDart(p, d) || {};
    if (r.end || this.s.turn.length >= this.perTurn || this.s.over) return this.endTurn(r);
    return { type: 'dart', dart: d, ...r };
  }

  endTurn(r = {}) {
    const p = this.s.cur;
    const darts = this.s.turn.map((t) => ({ seg: t.seg, mult: t.mult }));
    const total = darts.reduce((a, d) => a + value(d), 0);
    this.s.last[p] = { darts, total, bust: !!r.bust, text: r.text || null };
    this.s.st[p].visits++;
    const ev = { type: 'turn', player: p, darts, total, ...r };
    this.onTurnEnd(p, ev);
    this.s.turn = [];
    if (!this.s.over && !ev.keepPlayer) this.advance();
    return ev;
  }

  advance() {
    const n = this.players.length;
    let next = (this.s.cur + 1) % n;
    let guard = 0;
    while (this.skip(next) && guard++ < n) next = (next + 1) % n;
    if (next <= this.s.cur || n === 1) this.s.round++;
    this.s.cur = next;
    if (this.maxRounds && this.s.round > this.maxRounds && !this.s.over) this.finishByScore();
  }

  skip() { return false; }
  onTurnEnd() {}
  init() {}
  finishByScore() {
    let best = 0;
    this.players.forEach((_, i) => { if (this.score(i) > this.score(best)) best = i; });
    this.s.over = true;
    this.s.winner = best;
  }
  score() { return 0; }
  /** Ziel der CPU für den nächsten Dart. */
  cpuTarget() { return dart(20, 3); }
  /** Anzeige je Spieler. */
  panel() { return { main: '', sub: '' }; }
  /** Hinweis-Zeile (Checkout-Weg, Ziel …). */
  hint() { return ''; }
  /** Ergebnis je Spieler für Statistik und Erfolge. */
  result() {
    return this.players.map((pl, i) => {
      const st = this.s.st[i];
      return {
        id: pl.id, name: pl.name, cpu: pl.cpu || 0, won: this.s.winner === i, darts: st.darts, score: this.score(i),
        hits: st.hits,
      };
    });
  }
}

// ================================================================== X01
export class X01 extends Base {
  static meta = {
    id: 'x01', name: 'X01', icon: '🎯', cat: 'match', min: 1, max: 8, visit: true,
    desc: '501, 301 & Co. – der Klassiker mit Double-Out, Legs und Sets.',
    options: [
      { key: 'start', label: 'Startpunkte', values: [101, 170, 201, 301, 401, 501, 601, 701, 801, 901, 1001], def: 501 },
      { key: 'in', label: 'Check-In', values: ['straight', 'double', 'master'], names: ['Straight', 'Double-In', 'Master-In'], def: 'straight' },
      { key: 'out', label: 'Check-Out', values: ['double', 'single', 'master'], names: ['Double-Out', 'Single-Out', 'Master-Out'], def: 'double' },
      { key: 'legs', label: 'Legs (First to)', values: [1, 2, 3, 4, 5, 6, 7], def: 1 },
      { key: 'sets', label: 'Sets (First to)', values: [1, 2, 3, 4, 5], def: 1 },
    ],
  };
  init() {
    const n = this.players.length;
    Object.assign(this.s, {
      rest: Array(n).fill(this.cfg.start), opened: Array(n).fill(this.cfg.in === 'straight'),
      legs: Array(n).fill(0), sets: Array(n).fill(0), legStarter: 0, turnStart: this.cfg.start,
      legVisits: Array(n).fill(0), legDarts: Array(n).fill(0), legNo: 1, legHistory: [],
    });
    this.s.turnStart = this.s.rest[0];
  }
  get mode() { return this.cfg.out; }
  finishOk(d) { return this.mode === 'single' ? true : this.mode === 'master' ? d.mult >= 2 : d.mult === 2; }
  openOk(d) { return this.cfg.in === 'master' ? d.mult >= 2 : d.mult === 2; }
  minRest() { return this.mode === 'single' ? 0 : 1; }

  throwDart(d, pos) {
    if (this.s.turn.length === 0) this.beginTurn();
    return super.throwDart(d, pos);
  }
  beginTurn() {
    const p = this.s.cur;
    this.s.turnStart = this.s.rest[p];
    this.s.turnOpened = this.s.opened[p];
  }

  onDart(p, d) {
    const st = this.s.st[p];
    this.s.legDarts[p]++;
    if (!this.s.opened[p]) {
      if (!this.openOk(d)) { this.countF9(p, 0, 1); return {}; }
      this.s.opened[p] = true;
    }
    const v = value(d);
    const r = this.s.rest[p] - v;
    if (r < 0 || (r === 1 && this.mode !== 'single') || (r === 0 && !this.finishOk(d))) {
      // Bust: Aufnahme zählt 0, Rest zurück
      const before = this.s.turnStart;
      st.points -= before - this.s.rest[p];
      this.countF9(p, -(before - this.s.rest[p]), 1);
      this.s.rest[p] = before;
      this.s.opened[p] = this.s.turnOpened;
      return { end: true, bust: true, call: { phrase: 'bust' } };
    }
    this.s.rest[p] = r;
    st.points += v;
    this.countF9(p, v, 1);
    if (r === 0) return this.legWon(p, this.s.turnStart);
    return {};
  }

  countF9(p, pts, darts) {
    if (this.s.legVisits[p] < 3) { this.s.st[p].f9p += pts; this.s.st[p].f9d += darts; }
  }

  onTurnEnd(p, ev) {
    const st = this.s.st[p];
    this.s.legVisits[p]++;
    const start = this.s.turnStart;
    if (start <= 170 && isFinishable(start, this.mode) && this.s.turnOpened !== false) st.coAtt++;
    const scored = ev.bust ? 0 : start - (ev.won ? 0 : this.s.rest[p]);
    this.countVisit(st, ev.bust ? 0 : scored);
    if (!ev.call) ev.call = ev.won ? ev.call : { score: ev.bust ? 0 : scored };
    if (!ev.won) {
      const nx = this.nextPlayerPreview();
      const rest = this.s.rest[nx];
      if (rest <= 170 && isFinishable(rest, this.mode) && this.s.opened[nx]) ev.require = { player: nx, rest };
    }
    if (ev.nextLeg) this.startLeg();
  }

  nextPlayerPreview() { return (this.s.cur + 1) % this.players.length; }

  countVisit(st, sc) {
    if (sc === 180) st.c180++;
    else if (sc >= 140) st.c140++;
    else if (sc >= 100) st.c100++;
    else if (sc >= 60) st.c60++;
    if (sc > st.hiVisit) st.hiVisit = sc;
  }

  legWon(p, finish) {
    const st = this.s.st[p];
    st.coHit++;
    if (finish > st.hiFinish) st.hiFinish = finish;
    st.legsWon++;
    const ld = this.s.legDarts[p];
    if (!st.bestLeg || ld < st.bestLeg) st.bestLeg = ld;
    this.s.legHistory.push({ winner: p, darts: ld, finish });
    this.s.legs[p]++;
    let call = { phrase: 'gameshot', leg: true, finish };
    if (this.s.legs[p] >= this.cfg.legs) {
      if (this.cfg.sets > 1) {
        this.s.sets[p]++;
        this.s.legs = this.s.legs.map(() => 0);
        if (this.s.sets[p] >= this.cfg.sets) { this.s.over = true; this.s.winner = p; call = { phrase: 'match', finish }; }
        else call = { phrase: 'set', finish };
      } else { this.s.over = true; this.s.winner = p; call = { phrase: 'match', finish }; }
    }
    return { end: true, won: true, finish, call, nextLeg: !this.s.over, legDarts: ld };
  }

  startLeg() {
    const n = this.players.length;
    this.s.legNo++;
    this.s.legStarter = (this.s.legStarter + 1) % n;
    this.s.rest = Array(n).fill(this.cfg.start);
    this.s.opened = Array(n).fill(this.cfg.in === 'straight');
    this.s.legVisits = Array(n).fill(0);
    this.s.legDarts = Array(n).fill(0);
    // advance() geht anschließend eins weiter → auf Spieler vor dem Anwerfer setzen
    this.s.cur = (this.s.legStarter - 1 + n) % n;
    this.s.newLeg = true;
  }

  advance() {
    if (this.s.newLeg) { this.s.newLeg = false; this.s.cur = this.s.legStarter; this.s.round = 1; return; }
    super.advance();
  }

  /** Aufnahme als Summe (Tastenfeld). info.darts = Darts zum Finish. */
  enterVisit(total, info = {}) {
    if (this.s.over) return null;
    if (total < 0 || total > 180 || IMPOSSIBLE.has(total)) return { type: 'invalid' };
    this.snapshot();
    this.beginTurn();
    const p = this.s.cur;
    const st = this.s.st[p];
    const rest = this.s.rest[p];
    const r = rest - total;
    let ev;
    if (r < 0 || (r === 1 && this.mode !== 'single') || (r === 0 && !isFinishable(rest, this.mode) && this.mode !== 'single')) {
      st.darts += 3; this.s.legDarts[p] += 3; this.countF9(p, 0, 3);
      ev = { bust: true, call: { phrase: 'bust' } };
    } else if (r === 0) {
      const d = info.darts || 3;
      st.darts += d; st.points += total; this.s.legDarts[p] += d; this.countF9(p, total, d);
      ev = this.legWon(p, rest);
    } else {
      st.darts += 3; st.points += total; this.s.legDarts[p] += 3; this.countF9(p, total, 3);
      this.s.rest[p] = r;
      ev = {};
    }
    this.s.turn = [];
    this.s.last[p] = { darts: null, total, bust: !!ev.bust };
    st.visits++;
    const out = { type: 'turn', player: p, darts: null, total, ...ev };
    this.onTurnEnd(p, out);
    if (!this.s.over) this.advance();
    return out;
  }

  /** Mögliche Darts zum Finish bei Rest `rest` (für die Abfrage beim Tastenfeld). */
  finishDartsOptions(rest) {
    const m = minDarts(rest, this.mode) || 3;
    return [1, 2, 3].filter((n) => n >= m);
  }

  cpuTarget() {
    const p = this.s.cur;
    if (!this.s.opened[p]) return this.cfg.in === 'master' ? dart(20, 3) : dart(20, 2);
    return aimFor(this.s.rest[p], 3 - this.s.turn.length, this.mode);
  }

  panel(i) {
    const st = this.s.st[i];
    const avg = st.darts ? ((st.points / st.darts) * 3).toFixed(1) : '0.0';
    const legs = this.cfg.sets > 1 ? `Sets ${this.s.sets[i]} · Legs ${this.s.legs[i]}` : this.cfg.legs > 1 ? `Legs ${this.s.legs[i]}` : '';
    return { main: this.s.rest[i], sub: `Ø ${avg} · ${st.darts} Darts`, extra: legs, opened: this.s.opened[i] };
  }

  hint() {
    const p = this.s.cur;
    if (!this.s.opened[p]) return this.cfg.in === 'master' ? 'Öffnen mit Double oder Triple' : 'Öffnen mit einem Doppel';
    const left = 3 - this.s.turn.length;
    const rest = this.s.rest[p];
    const route = bestCheckout(rest, left, this.mode);
    if (route) return `Checkout: ${checkoutText(route)}`;
    if (rest <= 170 && !isFinishable(rest, this.mode)) return `${rest} ist nicht checkbar – stellen!`;
    return '';
  }

  score(i) { return this.s.legs[i] + this.s.sets[i] * 100 - this.s.rest[i] / 10000; }

  result() {
    return super.result().map((r, i) => {
      const st = this.s.st[i];
      return {
        ...r, points: st.points, avg: st.darts ? (st.points / st.darts) * 3 : 0, f9: st.f9d ? (st.f9p / st.f9d) * 3 : 0,
        c180: st.c180, c140: st.c140, c100: st.c100, c60: st.c60, coHit: st.coHit, coAtt: st.coAtt,
        hiFinish: st.hiFinish, bestLeg: st.bestLeg, hiVisit: st.hiVisit, legsWon: st.legsWon,
      };
    });
  }
}

// ================================================================== Cricket
const CRICKET = [20, 19, 18, 17, 16, 15, 25];
// Spielertypen der CPU bei Cricket: close = Schließen, defense = Verteidigen, attack = Punkten, bull = Lust aufs Bull, chaos = Zufall
const CRICKET_STYLES = [
  { id: 'klassik', label: '🎯 Klassiker', close: 1.0, defense: 1.0, attack: 1.0, bull: 0.8, chaos: 0.5 },
  { id: 'punkte', label: '💰 Punktejäger', close: 0.85, defense: 0.6, attack: 1.8, bull: 0.9, chaos: 0.6 },
  { id: 'abwehr', label: '🛡️ Verteidiger', close: 1.0, defense: 1.9, attack: 0.7, bull: 0.8, chaos: 0.5 },
  { id: 'bull', label: '🐂 Bull-Fan', close: 1.0, defense: 1.0, attack: 1.0, bull: 1.9, chaos: 0.7 },
  { id: 'bauch', label: '🎲 Bauchgefühl', close: 1.0, defense: 1.0, attack: 1.1, bull: 1.1, chaos: 1.7 },
];

export class Cricket extends Base {
  static meta = {
    id: 'cricket', name: 'Cricket', icon: '🦗', cat: 'match', min: 1, max: 6,
    desc: '15 bis 20 und Bull schließen, Punkte sammeln – Taktik pur.',
    options: [
      { key: 'variant', label: 'Variante', values: ['standard', 'cutthroat', 'noscore'], names: ['Standard', 'Cut-Throat', 'Ohne Punkte'], def: 'standard' },
      { key: 'rounds', label: 'Runden-Limit', values: [15, 20, 25, 99], names: ['15', '20', '25', 'Ohne'], def: 20 },
    ],
  };
  init() {
    const n = this.players.length;
    this.s.marks = Array.from({ length: n }, () => Object.fromEntries(CRICKET.map((x) => [x, 0])));
    this.s.pts = Array(n).fill(0);
    this.s.mpr = Array(n).fill(0);
  }
  get maxRounds() { return this.cfg.rounds === 99 ? 0 : this.cfg.rounds; }
  closedByAll(seg) { return this.s.marks.every((m) => m[seg] >= 3); }
  onDart(p, d) {
    if (this.s.turn.length === 1) this.s.tm = 0; // Marks dieser Aufnahme (nur wirksame)
    if (!CRICKET.includes(d.seg)) return {};
    const m = this.s.marks[p];
    let hits = d.mult;
    const need = Math.max(0, 3 - m[d.seg]);
    const used = Math.min(need, hits);
    m[d.seg] += used;
    const extra = hits - used;
    // Zählt nur, was wirklich wirkt: Schließen + Treffer, die (noch) Punkte bringen.
    // Ist die Zahl bei allen zu, zählen weitere Treffer weder für die Ansage noch für den MPR.
    let scored = 0;
    if (extra > 0 && this.cfg.variant !== 'noscore') {
      const pts = extra * (d.seg === 25 ? 25 : d.seg);
      if (this.cfg.variant === 'cutthroat') {
        this.s.marks.forEach((om, i) => { if (i !== p && om[d.seg] < 3) { this.s.pts[i] += pts; scored = extra; } });
      } else if (!this.s.marks.every((om, i) => i === p || om[d.seg] >= 3)) {
        this.s.pts[p] += pts;
        scored = extra;
      }
    }
    const eff = used + scored;
    this.s.mpr[p] += eff;
    this.s.tm = (this.s.tm || 0) + eff;
    if (this.checkWin(p)) { this.s.over = true; this.s.winner = p; return { end: true, call: { phrase: 'match' } }; }
    return {};
  }
  checkWin(p) {
    const allClosed = CRICKET.every((x) => this.s.marks[p][x] >= 3);
    if (!allClosed) return false;
    if (this.cfg.variant === 'noscore') return true;
    const mine = this.s.pts[p];
    return this.cfg.variant === 'cutthroat' ? this.s.pts.every((x, i) => i === p || mine <= x) : this.s.pts.every((x, i) => i === p || mine >= x);
  }
  onTurnEnd(p, ev) {
    ev.call = { marks: this.s.tm || 0 };
    this.s.tm = 0;
  }
  finishByScore() {
    const n = this.players.length;
    let best = 0;
    for (let i = 1; i < n; i++) {
      const better = this.cfg.variant === 'cutthroat' ? this.s.pts[i] < this.s.pts[best] : this.s.pts[i] > this.s.pts[best];
      const tie = this.s.pts[i] === this.s.pts[best] && this.totalMarks(i) > this.totalMarks(best);
      if (better || tie) best = i;
    }
    this.s.over = true; this.s.winner = best;
  }
  totalMarks(i) { return CRICKET.reduce((a, x) => a + this.s.marks[i][x], 0); }
  score(i) { return this.s.pts[i]; }
  /** Spielertyp der CPU (zufällig je Spiel, bleibt im Spielstand). */
  cpuStyle(p) {
    this.s.style = this.s.style || {};
    if (!this.s.style[p]) this.s.style[p] = CRICKET_STYLES[Math.floor(Math.random() * CRICKET_STYLES.length)].id;
    return CRICKET_STYLES.find((x) => x.id === this.s.style[p]);
  }

  /**
   * Taktische Zielwahl: jede Zahl bekommt einen Nutzen – Schließen (mit Bonus für angefangene Zahlen),
   * Verteidigen (Gegner punktet dort), Punkten (eigene Zahl zu, Gegner offen) – gewichtet nach Spielertyp,
   * Spielstand und etwas Zufall. Wer an einer Zahl dran ist, bleibt meist dabei.
   */
  cpuTarget() {
    const p = this.s.cur;
    const me = this.s.marks[p];
    const st = this.cpuStyle(p);
    const opp = this.players.map((_, i) => i).filter((i) => i !== p);
    const cut = this.cfg.variant === 'cutthroat', noscore = this.cfg.variant === 'noscore';
    const oppPts = opp.map((i) => this.s.pts[i]);
    // Vorsprung (positiv = ich führe); bei Cut-Throat sind wenig Punkte gut
    const lead = !opp.length ? 0 : cut ? Math.min(...oppPts) - this.s.pts[p] : this.s.pts[p] - Math.max(...oppPts);
    this.s.lastAim = this.s.lastAim || {};
    let best = null, bestU = 0;
    for (const x of CRICKET) {
      const v = x === 25 ? 25 : x;
      const oppOpen = opp.some((i) => this.s.marks[i][x] < 3);
      const oppClosed = opp.some((i) => this.s.marks[i][x] >= 3);
      let u = 0;
      if (me[x] < 3) {
        u = v * (1 + me[x] * 0.7) * st.close;                       // schließen, angefangene Zahlen bevorzugt
        if (oppClosed && !noscore) u += v * st.defense * (lead < 0 ? 1.6 : 1); // Gegner punktet hier → zumachen
        if (!oppOpen && !oppClosed) u *= 1;
      } else if (oppOpen && !noscore) {
        u = v * st.attack * (lead < 0 ? 1.5 : lead > 50 ? 0.45 : 1);  // punkten
      }
      if (x === 25) u *= 0.5 * st.bull;                                // Bull ist schwer – meist erst spät
      if (this.s.lastAim[p] === x && u > 0) u *= 1.4;                   // dranbleiben
      u *= 1 + (Math.random() - 0.5) * st.chaos;                         // Bauchgefühl
      if (u > bestU) { bestU = u; best = x; }
    }
    if (best == null) best = CRICKET.find((x) => me[x] < 3) ?? 20;
    this.s.lastAim[p] = best;
    if (best === 25) return dart(25, (this.players[p].cpu || 5) >= 7 ? 2 : 1);
    return dart(best, 3);
  }
  panel(i) {
    const mpr = this.s.st[i].darts ? ((this.s.mpr[i] / this.s.st[i].darts) * 3).toFixed(2) : '0.00';
    const style = this.players[i].cpu ? ` · ${this.cpuStyle(i).label}` : '';
    return { main: this.cfg.variant === 'noscore' ? this.totalMarks(i) : this.s.pts[i], sub: `MPR ${mpr}${style}`, cricket: this.s.marks[i] };
  }
  hint() {
    const r = this.maxRounds ? ` · Runde ${Math.min(this.s.round, this.maxRounds)}/${this.maxRounds}` : ` · Runde ${this.s.round}`;
    return (this.cfg.variant === 'cutthroat' ? 'Cut-Throat: Punkte gehen an die Gegner' : 'Felder schließen & punkten') + r;
  }
  result() {
    return super.result().map((r, i) => ({ ...r, mpr: this.s.st[i].darts ? (this.s.mpr[i] / this.s.st[i].darts) * 3 : 0 }));
  }
}

// ================================================================== Around the Clock
export class AroundClock extends Base {
  static meta = {
    id: 'atc', name: 'Around the Clock', icon: '🕐', cat: 'training', min: 1, max: 8,
    desc: 'Von 1 bis 20 und Bull – so schnell wie möglich. Zählt die Darts.',
    options: [
      { key: 'ring', label: 'Treffer zählt bei', values: ['any', 'single', 'double', 'triple'], names: ['Jedem Feld', 'Nur Single', 'Nur Double', 'Nur Triple'], def: 'any' },
      { key: 'jump', label: 'Double/Triple springt weiter', values: [false, true], names: ['Nein', 'Ja'], def: false },
      { key: 'bull', label: 'Bull am Ende', values: [true, false], names: ['Ja', 'Nein'], def: true },
    ],
  };
  init() { this.s.pos = this.players.map(() => 0); this.s.done = this.players.map(() => 0); }
  get targets() { const t = []; for (let i = 1; i <= 20; i++) t.push(i); if (this.cfg.bull) t.push(25); return t; }
  ok(d, target) {
    if (d.seg !== target) return false;
    if (target === 25) return this.cfg.ring !== 'triple' ? (this.cfg.ring === 'double' ? d.mult === 2 : true) : d.mult === 2;
    return this.cfg.ring === 'any' || (this.cfg.ring === 'single' && d.mult === 1) || (this.cfg.ring === 'double' && d.mult === 2) || (this.cfg.ring === 'triple' && d.mult === 3);
  }
  onDart(p, d) {
    const t = this.targets;
    const target = t[this.s.pos[p]];
    if (this.ok(d, target)) {
      this.s.pos[p] += this.cfg.jump && this.cfg.ring === 'any' && target !== 25 ? d.mult : 1;
      if (this.s.pos[p] >= t.length) {
        this.s.pos[p] = t.length;
        this.s.done[p] = this.s.st[p].darts;
        if (!this.players.some((_, i) => i !== p && !this.s.done[i])) { this.s.over = true; this.pickWinner(); return { end: true, call: { phrase: 'match' } }; }
        if (this.players.length === 1) { this.s.over = true; this.s.winner = p; return { end: true, call: { phrase: 'match' } }; }
        return { end: true, call: { phrase: 'gameshot' } };
      }
      return { hit: true };
    }
    return {};
  }
  skip(i) { return this.s.done[i] > 0; }
  pickWinner() {
    let w = 0;
    this.players.forEach((_, i) => { if (this.s.done[i] && (!this.s.done[w] || this.s.done[i] < this.s.done[w])) w = i; });
    this.s.winner = w;
  }
  advance() {
    if (this.players.every((_, i) => this.s.done[i])) { this.s.over = true; this.pickWinner(); return; }
    super.advance();
  }
  onTurnEnd(p, ev) {
    if (!ev.call) ev.call = { hits: ev.darts.filter((d, k) => d.seg !== 0).length ? null : 0, quiet: true };
  }
  target(p) { return this.targets[Math.min(this.s.pos[p], this.targets.length - 1)]; }
  cpuTarget() {
    const t = this.target(this.s.cur);
    const mult = this.cfg.ring === 'double' ? 2 : this.cfg.ring === 'triple' ? 3 : 1;
    return t === 25 ? dart(25, this.cfg.ring === 'any' || this.cfg.ring === 'single' ? 1 : 2) : dart(t, mult);
  }
  panel(i) {
    const t = this.targets;
    const done = this.s.done[i];
    return { main: done ? '✓' : (this.target(i) === 25 ? 'Bull' : this.target(i)), sub: done ? `fertig in ${done} Darts` : `${this.s.pos[i]}/${t.length} · ${this.s.st[i].darts} Darts`, progress: this.s.pos[i] / t.length };
  }
  hint() {
    const t = this.target(this.s.cur);
    const ring = { any: '', single: 'Single ', double: 'Double ', triple: 'Triple ' }[this.cfg.ring];
    return `Ziel: ${ring}${t === 25 ? 'Bull' : t}`;
  }
  score(i) { return this.s.done[i] ? 1000 - this.s.done[i] : this.s.pos[i]; }
  result() { return super.result().map((r, i) => ({ ...r, finishedIn: this.s.done[i] || 0, score: this.s.done[i] || 0 })); }
}

// ================================================================== Bob's 27
export class Bobs27 extends Base {
  static meta = {
    id: 'bobs27', name: "Bob's 27", icon: '💯', cat: 'training', min: 1, max: 4,
    desc: 'Das Doppel-Training der Profis: D1 bis Bull, jeder Fehlversuch kostet.',
    options: [
      { key: 'negative', label: 'Unter 0 weiterspielen', values: [false, true], names: ['Nein (Profi-Regel)', 'Ja'], def: false },
    ],
  };
  init() { this.s.sc = this.players.map(() => 27); this.s.out = this.players.map(() => false); this.s.dblHit = this.players.map(() => 0); }
  get targets() { return [...Array(20).keys()].map((i) => i + 1).concat(25); }
  target() { return this.targets[Math.min(this.s.round - 1, 20)]; }
  onDart(p, d) {
    const t = this.target();
    if (d.seg === t && d.mult === 2) { this.s.sc[p] += t === 25 ? 50 : t * 2; this.s.dblHit[p]++; return { hit: true }; }
    return {};
  }
  onTurnEnd(p, ev) {
    const t = this.target();
    const hits = ev.darts.filter((d) => d.seg === t && d.mult === 2).length;
    if (!hits) {
      this.s.sc[p] -= t === 25 ? 50 : t * 2;
      if (this.s.sc[p] <= 0 && !this.cfg.negative) this.s.out[p] = true;
    }
    ev.call = { score: hits ? hits * (t === 25 ? 50 : t * 2) : 0, quiet: true };
    if (this.players.every((_, i) => this.s.out[i])) { this.s.over = true; this.finishByScore(); }
  }
  skip(i) { return this.s.out[i]; }
  get maxRounds() { return 21; }
  advance() {
    if (this.players.every((_, i) => this.s.out[i])) { this.s.over = true; this.finishByScore(); return; }
    super.advance();
  }
  score(i) { return this.s.sc[i]; }
  cpuTarget() { const t = this.target(); return dart(t, 2); }
  panel(i) { return { main: this.s.sc[i], sub: this.s.out[i] ? 'ausgeschieden' : `${this.s.dblHit[i]} Doppel getroffen` }; }
  hint() { const t = this.target(); return `Runde ${Math.min(this.s.round, 21)}/21 · Ziel: ${t === 25 ? 'Bull (50)' : 'D' + t}`; }
  result() { return super.result().map((r, i) => ({ ...r, dblHit: this.s.dblHit[i] })); }
}

// ================================================================== Shanghai
export class Shanghai extends Base {
  static meta = {
    id: 'shanghai', name: 'Shanghai', icon: '🏮', cat: 'match', min: 1, max: 8,
    desc: 'Jede Runde eine Zahl. Single, Double und Triple in einer Aufnahme = Sofortsieg!',
    options: [{ key: 'rounds', label: 'Runden', values: [7, 10, 20], def: 7 }],
  };
  init() { this.s.sc = this.players.map(() => 0); }
  get maxRounds() { return this.cfg.rounds; }
  target() { return Math.min(this.s.round, this.cfg.rounds); }
  onDart(p, d) {
    if (d.seg === this.target()) this.s.sc[p] += value(d);
    return {};
  }
  onTurnEnd(p, ev) {
    const t = this.target();
    const ms = new Set(ev.darts.filter((d) => d.seg === t).map((d) => d.mult));
    if (ms.has(1) && ms.has(2) && ms.has(3)) { this.s.over = true; this.s.winner = p; ev.call = { phrase: 'shanghai' }; ev.shanghai = true; return; }
    ev.call = { score: ev.darts.filter((d) => d.seg === t).reduce((a, d) => a + value(d), 0) };
  }
  score(i) { return this.s.sc[i]; }
  cpuTarget() {
    const t = this.target();
    const ms = new Set(this.s.turn.filter((d) => d.seg === t).map((d) => d.mult));
    return dart(t, !ms.has(3) ? 3 : !ms.has(2) ? 2 : 1);
  }
  panel(i) { return { main: this.s.sc[i], sub: `${this.s.st[i].darts} Darts` }; }
  hint() { return `Runde ${this.target()}/${this.cfg.rounds} · Ziel: ${this.target()}`; }
}

// ================================================================== Killer
export class Killer extends Base {
  static meta = {
    id: 'killer', name: 'Killer', icon: '🗡️', cat: 'match', min: 2, max: 8,
    desc: 'Jeder bekommt eine Zahl. Eigenes Doppel treffen = Killer – dann Leben jagen.',
    options: [{ key: 'lives', label: 'Leben', values: [3, 5], def: 3 }],
  };
  init() {
    const nums = [...Array(20).keys()].map((i) => i + 1).sort(() => Math.random() - 0.5);
    this.s.num = this.players.map((_, i) => nums[i]);
    this.s.lives = this.players.map(() => this.cfg.lives);
    this.s.killer = this.players.map(() => false);
  }
  onDart(p, d) {
    if (d.mult !== 2) return {};
    const owner = this.s.num.indexOf(d.seg);
    if (owner < 0 || this.s.lives[owner] <= 0) return {};
    if (owner === p) {
      if (!this.s.killer[p]) { this.s.killer[p] = true; return { text: 'Killer!' }; }
      this.s.lives[p]--; // eigenes Leben verloren
    } else if (this.s.killer[p]) {
      this.s.lives[owner]--;
    } else return {};
    const alive = this.players.map((_, i) => i).filter((i) => this.s.lives[i] > 0);
    if (alive.length === 1) { this.s.over = true; this.s.winner = alive[0]; return { end: true, call: { phrase: 'match' } }; }
    if (this.s.lives[p] <= 0) return { end: true };
    return {};
  }
  onTurnEnd(p, ev) { ev.call = { quiet: true }; }
  skip(i) { return this.s.lives[i] <= 0; }
  score(i) { return this.s.lives[i]; }
  cpuTarget() {
    const p = this.s.cur;
    if (!this.s.killer[p]) return dart(this.s.num[p], 2);
    let best = -1;
    this.players.forEach((_, i) => { if (i !== p && this.s.lives[i] > 0 && (best < 0 || this.s.lives[i] < this.s.lives[best])) best = i; });
    return dart(this.s.num[best], 2);
  }
  panel(i) {
    return { main: `D${this.s.num[i]}`, sub: `${'❤️'.repeat(Math.max(0, this.s.lives[i]))}${this.s.lives[i] <= 0 ? '☠️ raus' : ''}`, extra: this.s.killer[i] ? '🗡️ Killer' : '' };
  }
  hint() {
    const p = this.s.cur;
    return this.s.killer[p] ? 'Du bist Killer – triff die Doppel der Gegner!' : `Werde Killer: triff D${this.s.num[p]}`;
  }
}

// ================================================================== Checkout-Training
export class CheckoutTraining extends Base {
  static meta = {
    id: 'checkout', name: 'Checkout-Training', icon: '✅', cat: 'training', min: 1, max: 4,
    desc: 'Zufällige Finishes mit Double-Out üben – mit Wegvorschlag.',
    options: [
      { key: 'range', label: 'Bereich', values: ['2-40', '41-80', '81-120', '61-170', '2-170'], names: ['2–40 (Doppel)', '41–80', '81–120', '61–170', 'Alles'], def: '41-80' },
      { key: 'darts', label: 'Darts pro Finish', values: [3, 6, 9], def: 3 },
      { key: 'count', label: 'Anzahl Finishes', values: [10, 20, 30], def: 10 },
    ],
  };
  init() {
    this.s.task = this.players.map(() => this.newTask());
    this.s.rest = [...this.s.task];
    this.s.used = this.players.map(() => 0);
    this.s.done = this.players.map(() => 0);
    this.s.hit = this.players.map(() => 0);
    this.s.tries = this.players.map(() => 1);
    this.s.turnStart = this.s.rest[0];
  }
  newTask() {
    const [a, b] = this.cfg.range.split('-').map(Number);
    for (;;) { const x = a + rnd(b - a + 1); if (isFinishable(x)) return x; }
  }
  throwDart(d, pos) { if (!this.s.turn.length) this.s.turnStart = this.s.rest[this.s.cur]; return super.throwDart(d, pos); }
  onDart(p, d) {
    this.s.used[p]++;
    const r = this.s.rest[p] - value(d);
    if (r === 0 && d.mult === 2) { this.s.hit[p]++; this.s.st[p].coHit++; if (this.s.task[p] > this.s.st[p].hiFinish) this.s.st[p].hiFinish = this.s.task[p]; return this.next(p, true); }
    if (r < 2) { this.s.rest[p] = this.s.turnStart; if (this.s.used[p] >= this.cfg.darts) return this.next(p, false); return { end: true, bust: true, call: { phrase: 'bust' } }; }
    this.s.rest[p] = r;
    if (this.s.used[p] >= this.cfg.darts) return this.next(p, false);
    return {};
  }
  next(p, ok) {
    this.s.done[p]++;
    this.s.st[p].coAtt++;
    const finished = this.s.done[p] >= this.cfg.count;
    if (!finished) { this.s.task[p] = this.newTask(); this.s.rest[p] = this.s.task[p]; this.s.used[p] = 0; this.s.tries[p]++; }
    if (this.players.every((_, i) => this.s.done[i] >= this.cfg.count)) { this.s.over = true; this.finishByScore(); }
    return { end: true, call: ok ? { phrase: 'gameshot' } : { phrase: 'missed' }, text: ok ? 'Gecheckt!' : 'Nicht geschafft' };
  }
  skip(i) { return this.s.done[i] >= this.cfg.count; }
  advance() { if (this.s.over) return; super.advance(); }
  onTurnEnd(p, ev) { if (!ev.call) ev.call = { score: ev.total, quiet: true }; }
  score(i) { return this.s.hit[i]; }
  cpuTarget() { const p = this.s.cur; return aimFor(this.s.rest[p], Math.min(3 - this.s.turn.length, this.cfg.darts - this.s.used[p])); }
  panel(i) {
    return { main: this.s.done[i] >= this.cfg.count ? '✓' : this.s.rest[i], sub: `${this.s.hit[i]}/${this.s.done[i]} gecheckt · Aufgabe ${Math.min(this.s.tries[i], this.cfg.count)}/${this.cfg.count}`, extra: `Darts: ${this.s.used[i]}/${this.cfg.darts}` };
  }
  hint() {
    const p = this.s.cur;
    const left = Math.min(3 - this.s.turn.length, this.cfg.darts - this.s.used[p]);
    const r = bestCheckout(this.s.rest[p], left);
    return r ? `Weg: ${checkoutText(r)}` : `${this.s.rest[p]} – stellen!`;
  }
  result() { return super.result().map((r, i) => ({ ...r, coHit: this.s.hit[i], coAtt: this.s.done[i] })); }
}

// ================================================================== Score-Training
export class ScoreTraining extends Base {
  static meta = {
    id: 'scoring', name: 'Scoring 99', icon: '🔥', cat: 'training', min: 1, max: 4,
    desc: 'So viele Punkte wie möglich in fester Dart-Anzahl. Perfekt fürs Treble-Training.',
    visit: true,
    options: [
      { key: 'visits', label: 'Aufnahmen', values: [10, 20, 33], names: ['10 (30 Darts)', '20 (60 Darts)', '33 (99 Darts)'], def: 10 },
      { key: 'target', label: 'Ziel', values: [20, 19, 18, 25], names: ['T20', 'T19', 'T18', 'Bull'], def: 20 },
    ],
  };
  init() { this.s.sc = this.players.map(() => 0); }
  get maxRounds() { return this.cfg.visits; }
  onDart(p, d) { this.s.sc[p] += value(d); this.s.st[p].points += value(d); return {}; }
  onTurnEnd(p, ev) {
    const st = this.s.st[p];
    X01.prototype.countVisit(st, ev.total);
    ev.call = { score: ev.total };
  }
  enterVisit(total) {
    if (this.s.over) return null;
    if (total < 0 || total > 180 || IMPOSSIBLE.has(total)) return { type: 'invalid' };
    this.snapshot();
    const p = this.s.cur;
    const st = this.s.st[p];
    st.darts += 3; st.points += total; st.visits++;
    this.s.sc[p] += total;
    this.s.last[p] = { darts: null, total };
    const ev = { type: 'turn', player: p, darts: null, total };
    this.onTurnEnd(p, ev);
    this.advance();
    return ev;
  }
  score(i) { return this.s.sc[i]; }
  cpuTarget() { return this.cfg.target === 25 ? dart(25, 2) : dart(this.cfg.target, 3); }
  panel(i) {
    const st = this.s.st[i];
    return { main: this.s.sc[i], sub: `Ø ${st.darts ? ((st.points / st.darts) * 3).toFixed(1) : '0.0'} · ${st.visits}/${this.cfg.visits}` };
  }
  hint() { return `Aufnahme ${Math.min(this.s.round, this.cfg.visits)}/${this.cfg.visits} · Ziel ${this.cfg.target === 25 ? 'Bull' : 'T' + this.cfg.target}`; }
  result() {
    return super.result().map((r, i) => {
      const st = this.s.st[i];
      return { ...r, points: st.points, avg: st.darts ? (st.points / st.darts) * 3 : 0, c180: st.c180, c140: st.c140, c100: st.c100, hiVisit: st.hiVisit };
    });
  }
}

// ================================================================== Halve-It
const HALVE = [
  { t: 15, n: '15' }, { t: 16, n: '16' }, { t: 'D', n: 'Doppel' }, { t: 17, n: '17' }, { t: 18, n: '18' },
  { t: 'T', n: 'Triple' }, { t: 19, n: '19' }, { t: 20, n: '20' }, { t: 25, n: 'Bull' },
];
export class HalveIt extends Base {
  static meta = {
    id: 'halveit', name: 'Halve-It', icon: '✂️', cat: 'match', min: 1, max: 8,
    desc: 'Neun Ziele – wer ein Ziel komplett verfehlt, verliert die Hälfte seiner Punkte.',
    options: [],
  };
  init() { this.s.sc = this.players.map(() => 40); }
  get maxRounds() { return HALVE.length; }
  tgt() { return HALVE[Math.min(this.s.round, HALVE.length) - 1]; }
  match(d) {
    const t = this.tgt().t;
    if (t === 'D') return d.mult === 2;
    if (t === 'T') return d.mult === 3;
    return d.seg === t;
  }
  onDart(p, d) { if (this.match(d)) this.s.sc[p] += value(d); return {}; }
  onTurnEnd(p, ev) {
    const hit = ev.darts.some((d) => this.match(d));
    if (!hit) { this.s.sc[p] = Math.floor(this.s.sc[p] / 2); ev.text = 'Halbiert!'; ev.call = { phrase: 'halved' }; }
    else ev.call = { score: ev.darts.filter((d) => this.match(d)).reduce((a, d) => a + value(d), 0) };
  }
  score(i) { return this.s.sc[i]; }
  cpuTarget() {
    const t = this.tgt().t;
    if (t === 'D') return dart(20, 2);
    if (t === 'T') return dart(20, 3);
    if (t === 25) return dart(25, 1);
    return dart(t, 3);
  }
  panel(i) { return { main: this.s.sc[i], sub: `${this.s.st[i].darts} Darts` }; }
  hint() { return `Runde ${Math.min(this.s.round, 9)}/9 · Ziel: ${this.tgt().n}`; }
}

// ================================================================== Doppel-Training
export class DoublesTraining extends Base {
  static meta = {
    id: 'doubles', name: 'Doppel-Training', icon: '🎯', cat: 'training', min: 1, max: 4,
    desc: 'Jedes Doppel drei Darts lang – sauber, zufällig oder nur die Lieblingsdoppel.',
    options: [
      { key: 'order', label: 'Reihenfolge', values: ['seq', 'random', 'fav'], names: ['D1 → Bull', 'Zufällig', 'Top-Doppel (D20/16/8/10/18/12)'], def: 'seq' },
    ],
  };
  init() {
    let t = this.cfg.order === 'fav' ? [20, 16, 8, 10, 18, 12, 20, 16, 8, 10] : [...Array(20).keys()].map((i) => i + 1).concat(25);
    if (this.cfg.order === 'random') t = t.sort(() => Math.random() - 0.5);
    this.s.targets = t;
    this.s.hits = this.players.map(() => 0);
  }
  get maxRounds() { return this.s.targets.length; }
  tgt() { return this.s.targets[Math.min(this.s.round, this.s.targets.length) - 1]; }
  onDart(p, d) { if (d.seg === this.tgt() && d.mult === 2) { this.s.hits[p]++; return { hit: true }; } return {}; }
  onTurnEnd(p, ev) { ev.call = { quiet: true }; }
  score(i) { return this.s.hits[i]; }
  cpuTarget() { return dart(this.tgt(), 2); }
  panel(i) {
    const att = this.s.st[i].darts;
    return { main: this.s.hits[i], sub: `${att ? Math.round((this.s.hits[i] / att) * 100) : 0}% Trefferquote` };
  }
  hint() { const t = this.tgt(); return `Ziel ${Math.min(this.s.round, this.s.targets.length)}/${this.s.targets.length}: ${t === 25 ? 'Bull' : 'D' + t}`; }
  result() { return super.result().map((r, i) => ({ ...r, dblHit: this.s.hits[i], dblAtt: this.s.st[i].darts })); }
}

// ================================================================== 121
export class Ladder121 extends Base {
  static meta = {
    id: '121', name: '121 Checkout-Leiter', icon: '🪜', cat: 'training', min: 1, max: 4,
    desc: '121 in 9 Darts checken. Geschafft: +1. Verpasst: zurück. Wie hoch kommst du?',
    options: [{ key: 'rounds', label: 'Versuche', values: [10, 15, 20], def: 10 }],
  };
  init() {
    this.s.target = this.players.map(() => 121);
    this.s.rest = this.players.map(() => 121);
    this.s.used = this.players.map(() => 0);
    this.s.best = this.players.map(() => 121);
    this.s.att = this.players.map(() => 0);
    this.s.okc = this.players.map(() => 0);
    this.s.turnStart = 121;
  }
  throwDart(d, pos) { if (!this.s.turn.length) this.s.turnStart = this.s.rest[this.s.cur]; return super.throwDart(d, pos); }
  onDart(p, d) {
    this.s.used[p]++;
    const r = this.s.rest[p] - value(d);
    if (r === 0 && d.mult === 2) return this.done(p, true);
    if (r < 2) { this.s.rest[p] = this.s.turnStart; if (this.s.used[p] >= 9) return this.done(p, false); return { end: true, bust: true, call: { phrase: 'bust' } }; }
    this.s.rest[p] = r;
    if (this.s.used[p] >= 9) return this.done(p, false);
    return {};
  }
  done(p, ok) {
    this.s.att[p]++;
    if (ok) { this.s.okc[p]++; this.s.target[p]++; this.s.best[p] = Math.max(this.s.best[p], this.s.target[p]); }
    else this.s.target[p] = Math.max(121, this.s.target[p] - 1);
    this.s.rest[p] = this.s.target[p];
    this.s.used[p] = 0;
    if (this.players.every((_, i) => this.s.att[i] >= this.cfg.rounds)) { this.s.over = true; this.finishByScore(); }
    return { end: true, call: ok ? { phrase: 'gameshot' } : { phrase: 'missed' }, text: ok ? `Geschafft! Weiter mit ${this.s.target[p]}` : `Verpasst – weiter mit ${this.s.target[p]}` };
  }
  skip(i) { return this.s.att[i] >= this.cfg.rounds; }
  onTurnEnd(p, ev) { if (!ev.call) ev.call = { score: ev.total, quiet: true }; }
  score(i) { return this.s.best[i] * 100 + this.s.okc[i]; }
  cpuTarget() { const p = this.s.cur; return aimFor(this.s.rest[p], 3 - this.s.turn.length); }
  panel(i) { return { main: this.s.rest[i], sub: `Ziel ${this.s.target[i]} · Bestwert ${this.s.best[i]}`, extra: `Versuch ${Math.min(this.s.att[i] + 1, this.cfg.rounds)}/${this.cfg.rounds} · Darts ${this.s.used[i]}/9` }; }
  hint() { const p = this.s.cur; const r = bestCheckout(this.s.rest[p], 3 - this.s.turn.length); return r ? `Weg: ${checkoutText(r)}` : 'Stellen!'; }
  result() { return super.result().map((r, i) => ({ ...r, score: this.s.best[i], coHit: this.s.okc[i], coAtt: this.s.att[i] })); }
}

// ================================================================== Baseball
export class Baseball extends Base {
  static meta = {
    id: 'baseball', name: 'Baseball', icon: '⚾', cat: 'match', min: 1, max: 8,
    desc: '9 Innings, Inning = Zahl. Single 1 Run, Double 2, Triple 3. Bull im 7. zählt doppelt.',
    options: [],
  };
  init() { this.s.sc = this.players.map(() => 0); this.s.inn = this.players.map(() => []); }
  get maxRounds() { return 9; }
  onDart(p, d) {
    const t = Math.min(this.s.round, 9);
    if (d.seg === t) this.s.sc[p] += d.mult;
    else if (t === 7 && d.seg === 25) this.s.sc[p] += d.mult * 2;
    return {};
  }
  onTurnEnd(p, ev) {
    const t = Math.min(this.s.round, 9);
    const runs = ev.darts.reduce((a, d) => a + (d.seg === t ? d.mult : t === 7 && d.seg === 25 ? d.mult * 2 : 0), 0);
    this.s.inn[p].push(runs);
    ev.call = { quiet: true };
    ev.text = runs ? `${runs} Run${runs > 1 ? 's' : ''}` : 'Kein Run';
  }
  score(i) { return this.s.sc[i]; }
  cpuTarget() { return dart(Math.min(this.s.round, 9), 3); }
  panel(i) { return { main: this.s.sc[i], sub: this.s.inn[i].join(' ') || '–' }; }
  hint() { const t = Math.min(this.s.round, 9); return `Inning ${t}/9 · Ziel: ${t}${t === 7 ? ' (Bull = doppelt)' : ''}`; }
}

// ================================================================== Elimination
export class Elimination extends Base {
  static meta = {
    id: 'elimination', name: 'Elimination', icon: '💥', cat: 'match', min: 2, max: 8,
    desc: 'Von 0 hoch auf genau 301. Triffst du den Punktestand eines Gegners, muss er zurück auf 0!',
    options: [
      { key: 'target', label: 'Ziel', values: [301, 501], def: 301 },
      { key: 'out', label: 'Check-Out', values: ['single', 'double'], names: ['Beliebig (genau)', 'Double-Out'], def: 'single' },
    ],
  };
  init() { this.s.sc = this.players.map(() => 0); this.s.turnStart = 0; this.s.kills = this.players.map(() => 0); }
  throwDart(d, pos) { if (!this.s.turn.length) this.s.turnStart = this.s.sc[this.s.cur]; return super.throwDart(d, pos); }
  onDart(p, d) {
    const v = value(d);
    const n = this.s.sc[p] + v;
    const t = this.cfg.target;
    const dbl = this.cfg.out === 'double';
    if (n > t || (dbl && n === t - 1) || (n === t && dbl && d.mult !== 2)) {
      this.s.sc[p] = this.s.turnStart;
      return { end: true, bust: true, call: { phrase: 'bust' } };
    }
    this.s.sc[p] = n;
    this.s.st[p].points += v;
    if (n === t) { this.s.over = true; this.s.winner = p; return { end: true, won: true, call: { phrase: 'match' } }; }
    // Jeder einzelne Pfeil zählt: Zwischenstand = Stand eines Gegners → der muss sofort zurück auf 0.
    // (Wird die Aufnahme danach überworfen, bleibt die Eliminierung bestehen.)
    const hit = [];
    this.players.forEach((pl, i) => { if (i !== p && this.s.sc[i] === n) { this.s.sc[i] = 0; hit.push(pl.name); } });
    if (hit.length) { this.s.kills[p] += hit.length; return { elim: true, text: `💥 ${hit.join(', ')} zurück auf 0!`, call: { phrase: 'elim' } }; }
    return {};
  }
  onTurnEnd(p, ev) {
    if (ev.bust || ev.won || ev.elim) return;
    ev.call = { score: ev.total };
  }
  score(i) { return this.s.sc[i]; }
  cpuTarget() {
    const p = this.s.cur;
    const rest = this.cfg.target - this.s.sc[p];
    const left = 3 - this.s.turn.length;
    // Taktik: Gegnerstand mit genau einem Dart erreichbar? → gezielt eliminieren
    const mine = this.s.sc[p];
    const oneDart = (diff) => (diff >= 1 && diff <= 20 ? dart(diff, 1) : diff === 25 ? dart(25, 1) : diff === 50 ? dart(25, 2) : diff <= 60 && diff % 3 === 0 ? dart(diff / 3, 3) : diff <= 40 && diff % 2 === 0 ? dart(diff / 2, 2) : null);
    let bestHit = null;
    this.players.forEach((_, i) => {
      if (i === p) return;
      const diff = this.s.sc[i] - mine;
      const d = oneDart(diff);
      if (d && this.s.sc[i] < this.cfg.target && (!bestHit || this.s.sc[i] > bestHit.sc)) bestHit = { d, sc: this.s.sc[i] };
    });
    if (bestHit) return bestHit.d;
    if (this.cfg.out === 'double') return aimFor(rest, left, 'double');
    // genau treffen: passt der Rest in einen Dart, direkt darauf zielen
    if (rest <= 20) return dart(rest, 1);
    if (rest <= 60 && rest % 3 === 0) return dart(rest / 3, 3);
    if (rest <= 40 && rest % 2 === 0) return dart(rest / 2, 2);
    if (rest === 25 || rest === 50) return dart(25, rest === 50 ? 2 : 1);
    return rest > 60 ? dart(20, 3) : dart(Math.min(20, rest - 20 > 0 ? 20 : rest), 1);
  }
  panel(i) { return { main: this.s.sc[i], sub: `noch ${this.cfg.target - this.s.sc[i]}`, extra: this.s.kills[i] ? `💥 ${this.s.kills[i]}` : '', progress: this.s.sc[i] / this.cfg.target }; }
  hint() {
    const p = this.s.cur;
    const rest = this.cfg.target - this.s.sc[p];
    const others = this.players.map((_, i) => i).filter((i) => i !== p && this.s.sc[i] > this.s.sc[p]).map((i) => this.s.sc[i] - this.s.sc[p]).filter((d) => d <= 180);
    const r = this.cfg.out === 'double' ? bestCheckout(rest, 3 - this.s.turn.length) : null;
    return (r ? `Checkout: ${checkoutText(r)}` : `Rest ${rest}`) + (others.length ? ` · Eliminieren mit ${others.join(' / ')}` : '');
  }
}

export const GAMES = [X01, Cricket, Elimination, AroundClock, Bobs27, CheckoutTraining, ScoreTraining, DoublesTraining, Ladder121, Shanghai, HalveIt, Killer, Baseball];
export const gameById = (id) => GAMES.find((g) => g.meta.id === id);
export { MISS, isDouble };
