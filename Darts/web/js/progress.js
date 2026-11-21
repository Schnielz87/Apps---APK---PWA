// Motivation: Erfahrungspunkte, Level, Erfolge, Tages-Challenge, Serien (Streak) und Statistik je Profil.
import { store } from './store.js';

export const levelFor = (xp) => {
  let lvl = 1, need = 200, acc = 0;
  while (xp >= acc + need) { acc += need; lvl++; need = Math.round(200 * Math.pow(lvl, 1.35)); }
  return { level: lvl, into: xp - acc, need, pct: (xp - acc) / need };
};

export const RANKS = ['Rookie', 'Kneipenheld', 'Oche-Kämpfer', 'Treble-Jäger', 'Doppel-Doktor', 'Ton-Maschine', 'Checkout-König', 'Arena-Star', 'Weltmeister-Anwärter', 'Darts-Legende'];
export const rankFor = (level) => RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 3))];

const today = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ Erfolge
export const ACHIEVEMENTS = [
  { id: 'first', icon: '🎬', name: 'Game On', desc: 'Erstes Spiel beendet', test: (c) => c.tot.games >= 1 },
  { id: 'win1', icon: '🏆', name: 'Erster Sieg', desc: 'Ein Spiel gewonnen', test: (c) => c.tot.wins >= 1 },
  { id: 'win25', icon: '🥇', name: 'Serienspieler', desc: '25 Spiele gewonnen', test: (c) => c.tot.wins >= 25 },
  { id: 'd1000', icon: '🎯', name: '1.000 Darts', desc: '1.000 Darts geworfen', test: (c) => c.tot.darts >= 1000 },
  { id: 'd10000', icon: '💪', name: 'Trainingsweltmeister', desc: '10.000 Darts geworfen', test: (c) => c.tot.darts >= 10000 },
  { id: 'ton', icon: '💯', name: 'Ton!', desc: 'Eine Aufnahme mit 100+', test: (c) => c.tot.c100 + c.tot.c140 + c.tot.c180 >= 1 },
  { id: 'ton40', icon: '🔥', name: 'Ton-Forty', desc: 'Eine Aufnahme mit 140+', test: (c) => c.tot.c140 + c.tot.c180 >= 1 },
  { id: 'max', icon: '🚀', name: 'ONE HUNDRED AND EIGHTY', desc: 'Die erste 180', test: (c) => c.tot.c180 >= 1 },
  { id: 'max10', icon: '☄️', name: 'Maximum-Sammler', desc: '10 × 180', test: (c) => c.tot.c180 >= 10 },
  { id: 'co100', icon: '💎', name: 'Ton-Plus-Finish', desc: 'Checkout ab 100', test: (c) => c.tot.hiFinish >= 100 },
  { id: 'bigfish', icon: '🐟', name: 'The Big Fish', desc: '170 gecheckt', test: (c) => c.tot.hiFinish >= 170 },
  { id: 'avg50', icon: '📈', name: 'Halbes Hundert', desc: '501-Match mit Ø 50+', test: (c) => c.tot.bestAvg >= 50 },
  { id: 'avg70', icon: '📊', name: 'Ligareif', desc: '501-Match mit Ø 70+', test: (c) => c.tot.bestAvg >= 70 },
  { id: 'avg90', icon: '🌟', name: 'Tour-Niveau', desc: '501-Match mit Ø 90+', test: (c) => c.tot.bestAvg >= 90 },
  { id: 'leg15', icon: '⏱️', name: 'Schnelles Leg', desc: '501-Leg in max. 15 Darts', test: (c) => c.tot.bestLeg && c.tot.bestLeg <= 15 },
  { id: 'nine', icon: '👑', name: 'Neun-Darter', desc: 'Das perfekte Leg', test: (c) => c.tot.bestLeg === 9 },
  { id: 'cpu5', icon: '🤖', name: 'Maschinenstürmer', desc: 'CPU Stufe 5 besiegt', test: (c) => c.tot.cpuBeat >= 5 },
  { id: 'cpu8', icon: '🦾', name: 'Bezwinger', desc: 'CPU Stufe 8 besiegt', test: (c) => c.tot.cpuBeat >= 8 },
  { id: 'cpu10', icon: '🏅', name: 'Mensch schlägt Maschine', desc: 'CPU Weltklasse besiegt', test: (c) => c.tot.cpuBeat >= 10 },
  { id: 'atc40', icon: '🕐', name: 'Uhrwerk', desc: 'Around the Clock in max. 40 Darts', test: (c) => c.tot.atcBest && c.tot.atcBest <= 40 },
  { id: 'bobs', icon: '🧠', name: "Bob wäre stolz", desc: "Bob's 27 positiv beendet", test: (c) => c.tot.bobsBest > 0 },
  { id: 'shanghai', icon: '🏮', name: 'Shanghai!', desc: 'Shanghai geworfen', test: (c) => c.ev.shanghai },
  { id: 'cricket', icon: '🦗', name: 'Grillen-Meister', desc: 'Cricket gewonnen', test: (c) => c.tot.cricketWins >= 1 },
  { id: 'streak3', icon: '📅', name: 'Dranbleiber', desc: '3 Tage in Folge gespielt', test: (c) => c.prog.streak >= 3 },
  { id: 'streak7', icon: '🗓️', name: 'Wochen-Warrior', desc: '7 Tage in Folge gespielt', test: (c) => c.prog.streak >= 7 },
  { id: 'streak30', icon: '🏟️', name: 'Arena-Stammgast', desc: '30 Tage in Folge gespielt', test: (c) => c.prog.streak >= 30 },
  { id: 'daily1', icon: '☀️', name: 'Tagesaufgabe', desc: 'Erste Tages-Challenge geschafft', test: (c) => c.prog.dailyDone >= 1 },
  { id: 'daily10', icon: '🌞', name: 'Challenge-Jäger', desc: '10 Tages-Challenges geschafft', test: (c) => c.prog.dailyDone >= 10 },
  { id: 'variety', icon: '🎲', name: 'Allrounder', desc: '6 verschiedene Spielmodi gespielt', test: (c) => c.tot.modes >= 6 },
];

// ------------------------------------------------------------------ Statistik je Profil
export function statsFor(pid, history = store.history()) {
  const t = {
    games: 0, wins: 0, darts: 0, x01Darts: 0, x01Points: 0, f9p: 0, f9n: 0, c180: 0, c140: 0, c100: 0, c60: 0,
    coHit: 0, coAtt: 0, hiFinish: 0, bestLeg: 0, bestAvg: 0, hiVisit: 0, cpuBeat: 0, atcBest: 0, bobsBest: null,
    scoringBest: 0, ladderBest: 0, dblHit: 0, dblAtt: 0, cricketWins: 0, modes: 0, trend: [], heat: {}, byGame: {},
  };
  const modes = new Set();
  for (const g of history) {
    const r = g.players.find((p) => p.id === pid);
    if (!r) continue;
    t.games++;
    modes.add(g.game);
    t.byGame[g.game] = (t.byGame[g.game] || 0) + 1;
    if (r.won && g.players.length > 1) t.wins++;
    else if (r.won && g.players.length === 1) t.wins++;
    t.darts += r.darts || 0;
    if (r.hits) for (const [k, v] of Object.entries(r.hits)) t.heat[k] = (t.heat[k] || 0) + v;
    if (g.game === 'x01') {
      t.x01Darts += r.darts || 0; t.x01Points += r.points || 0;
      if (r.f9) { t.f9p += r.f9; t.f9n++; }
      t.c180 += r.c180 || 0; t.c140 += r.c140 || 0; t.c100 += r.c100 || 0; t.c60 += r.c60 || 0;
      t.coHit += r.coHit || 0; t.coAtt += r.coAtt || 0;
      t.hiFinish = Math.max(t.hiFinish, r.hiFinish || 0);
      if (r.bestLeg && g.cfg && g.cfg.start === 501 && (!t.bestLeg || r.bestLeg < t.bestLeg)) t.bestLeg = r.bestLeg;
      if (g.cfg && g.cfg.start >= 301 && r.darts >= 9) t.bestAvg = Math.max(t.bestAvg, r.avg || 0);
      t.hiVisit = Math.max(t.hiVisit, r.hiVisit || 0);
      if (r.darts >= 9) t.trend.push({ d: g.date, v: r.avg });
    }
    if (g.game === 'scoring') {
      t.c180 += r.c180 || 0; t.c140 += r.c140 || 0; t.c100 += r.c100 || 0;
      t.scoringBest = Math.max(t.scoringBest, r.score || 0);
      t.hiVisit = Math.max(t.hiVisit, r.hiVisit || 0);
    }
    if (r.won && g.players.length > 1) {
      const cpuMax = Math.max(0, ...g.players.filter((p) => p.cpu).map((p) => p.cpu));
      t.cpuBeat = Math.max(t.cpuBeat, cpuMax);
      if (g.game === 'cricket') t.cricketWins++;
    }
    if (g.game === 'atc' && r.finishedIn && (!t.atcBest || r.finishedIn < t.atcBest)) t.atcBest = r.finishedIn;
    if (g.game === 'bobs27') t.bobsBest = t.bobsBest == null ? r.score : Math.max(t.bobsBest, r.score);
    if (g.game === '121') t.ladderBest = Math.max(t.ladderBest, r.score || 0);
    if (g.game === 'doubles') { t.dblHit += r.dblHit || 0; t.dblAtt += r.dblAtt || 0; }
  }
  t.modes = modes.size;
  t.avg = t.x01Darts ? (t.x01Points / t.x01Darts) * 3 : 0;
  t.f9 = t.f9n ? t.f9p / t.f9n : 0;
  t.coPct = t.coAtt ? (t.coHit / t.coAtt) * 100 : 0;
  t.trend = t.trend.slice(0, 30).reverse();
  return t;
}

// ------------------------------------------------------------------ Tages-Challenge
function seedRand(seed) {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

export function dailyChallenge(level = 1, day = today()) {
  const r = seedRand('darts-' + day);
  const cpu = Math.max(1, Math.min(10, Math.round(1 + level / 3 + r() * 2)));
  const list = [
    { game: 'x01', cfg: { start: 501, in: 'straight', out: 'double', legs: 1, sets: 1 }, cpu, text: `Besiege die CPU (Stufe ${cpu}) in 501`, goal: { won: true } },
    { game: 'x01', cfg: { start: 301, in: 'straight', out: 'double', legs: 2, sets: 1 }, cpu: Math.max(1, cpu - 1), text: `301, First to 2 gegen CPU Stufe ${Math.max(1, cpu - 1)} gewinnen`, goal: { won: true } },
    { game: 'cricket', cfg: { variant: 'standard', rounds: 20 }, cpu: Math.max(1, cpu - 1), text: `Cricket gegen CPU Stufe ${Math.max(1, cpu - 1)} gewinnen`, goal: { won: true } },
    { game: 'atc', cfg: { ring: 'any', jump: false, bull: true }, text: `Around the Clock in höchstens ${Math.max(30, 75 - level * 2)} Darts`, goal: { finishedInMax: Math.max(30, 75 - level * 2) } },
    { game: 'bobs27', cfg: { negative: false }, text: `Bob's 27: beende mit mindestens ${Math.min(400, 10 + level * 15)} Punkten`, goal: { scoreMin: Math.min(400, 10 + level * 15) } },
    { game: 'checkout', cfg: { range: '41-80', darts: 3, count: 10 }, text: `Checkout-Training: ${Math.min(8, 2 + Math.floor(level / 3))} von 10 Finishes`, goal: { coHitMin: Math.min(8, 2 + Math.floor(level / 3)) } },
    { game: 'scoring', cfg: { visits: 10, target: 20 }, text: `Scoring: ${Math.min(900, 350 + level * 30)} Punkte in 10 Aufnahmen`, goal: { scoreMin: Math.min(900, 350 + level * 30) } },
    { game: 'doubles', cfg: { order: 'fav' }, text: `Doppel-Training (Top-Doppel): ${Math.min(15, 3 + Math.floor(level / 2))} Treffer`, goal: { scoreMin: Math.min(15, 3 + Math.floor(level / 2)) } },
    { game: '121', cfg: { rounds: 10 }, text: `121-Leiter: erreiche ${121 + Math.min(8, 1 + Math.floor(level / 4))}`, goal: { scoreMin: 121 + Math.min(8, 1 + Math.floor(level / 4)) } },
  ];
  const c = list[Math.floor(r() * list.length)];
  return { ...c, day, xp: 150 };
}

export function dailyMet(ch, res, gameId) {
  if (!ch || ch.game !== gameId || !res) return false;
  const g = ch.goal;
  if (g.won && !res.won) return false;
  if (g.won && ch.cpu && !res._cpuOk) return false;
  if (g.finishedInMax && !(res.finishedIn && res.finishedIn <= g.finishedInMax)) return false;
  if (g.scoreMin != null && !((res.score ?? 0) >= g.scoreMin)) return false;
  if (g.coHitMin != null && !((res.coHit ?? 0) >= g.coHitMin)) return false;
  return true;
}

// ------------------------------------------------------------------ Spielende auswerten
/**
 * Spiel speichern, XP vergeben, Erfolge prüfen. Liefert {xp, levelUp, newAch[], daily}.
 */
export function recordGame(entry, pid, extra = {}) {
  store.addHistory(entry);
  const prog = store.progress();
  const me = entry.players.find((p) => p.id === pid);
  const out = { xp: 0, levelUp: false, newAch: [], daily: false, records: [] };
  if (!me) return out;
  const before = levelFor(prog.xp).level;

  // Serie (Tage in Folge)
  const d = today();
  if (prog.lastDay !== d) {
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    prog.streak = prog.lastDay === y ? prog.streak + 1 : 1;
    prog.bestStreak = Math.max(prog.bestStreak || 0, prog.streak);
    prog.lastDay = d;
  }

  let xp = Math.round((me.darts || 0) * 1 + 20);
  if (me.won && entry.players.length > 1) xp += 40 + Math.max(0, ...entry.players.filter((p) => p.cpu).map((p) => p.cpu * 8));
  xp += (me.c180 || 0) * 30 + (me.c140 || 0) * 10;
  if ((me.hiFinish || 0) >= 100) xp += 50;

  // Tages-Challenge
  const ch = dailyChallenge(before);
  if (!prog.daily[d] && extra.daily && dailyMet(ch, { ...me, _cpuOk: extra.cpuOk }, entry.game)) {
    prog.daily[d] = true; prog.dailyDone = (prog.dailyDone || 0) + 1; xp += ch.xp; out.daily = true;
    // nur die letzten 60 Tage merken
    const keys = Object.keys(prog.daily).sort();
    while (keys.length > 60) delete prog.daily[keys.shift()];
  }

  // Persönliche Rekorde
  const rec = prog.records || {};
  const bump = (k, v, better = (a, b) => a > b, txt) => {
    if (v == null || v === 0) return;
    if (rec[k] == null || better(v, rec[k])) { if (rec[k] != null) out.records.push(txt(v)); rec[k] = v; }
  };
  if (entry.game === 'x01') {
    if (me.darts >= 9) bump('avg', Math.round(me.avg * 10) / 10, undefined, (v) => `Bester Schnitt: ${v.toFixed(1)}`);
    bump('finish', me.hiFinish, undefined, (v) => `Höchstes Finish: ${v}`);
    if (entry.cfg.start === 501) bump('leg', me.bestLeg, (a, b) => a < b, (v) => `Schnellstes 501-Leg: ${v} Darts`);
  }
  if (entry.game === 'atc') bump('atc', me.finishedIn, (a, b) => a < b, (v) => `Around the Clock: ${v} Darts`);
  if (entry.game === 'bobs27') bump('bobs', me.score, undefined, (v) => `Bob's 27: ${v} Punkte`);
  if (entry.game === 'scoring' && entry.cfg.visits === 10) bump('scoring', me.score, undefined, (v) => `Scoring 30 Darts: ${v}`);
  prog.records = rec;

  out.xp = xp;
  prog.xp += xp;
  const after = levelFor(prog.xp).level;
  out.levelUp = after > before ? after : false;

  const tot = statsFor(pid);
  const ctx = { tot, prog, ev: extra };
  for (const a of ACHIEVEMENTS) {
    if (!prog.ach[a.id] && a.test(ctx)) { prog.ach[a.id] = Date.now(); out.newAch.push(a); }
  }
  store.saveProgress(prog);
  return out;
}

export function streakAlive(prog) {
  const d = today();
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return prog.lastDay === d || prog.lastDay === y ? prog.streak : 0;
}
