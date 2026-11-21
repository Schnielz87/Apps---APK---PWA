// Darts Arena – Oberfläche (Single-Page-App ohne Framework).
import { boardSvg, markDart, clearMarks, pointIn, throwAt, CPU_LEVELS, label, value, dart, MISS } from './board.js';
import { GAMES, gameById, IMPOSSIBLE } from './games.js';
import { CALLERS, say, stopCalls, demo, setCallerSettings, callerById, packKeys, packSave, packDelete, packClearCalls, keyFromFilename, PACK_KEYS, musicFileSave, musicFileDelete } from './caller.js';
import { setMusicSettings, musicWanted } from './music.js';
import { sfx, setSfx, buzz, setVibrate, unlockAudio } from './audio.js';
import { store } from './store.js';
import { levelFor, rankFor, ACHIEVEMENTS, statsFor, dailyChallenge, recordGame, streakAlive } from './progress.js';
import { RULES, TIPS } from './rules.js';
import { initUpdates, onUpdate, checkNow, installNow, setAuto, APP_VERSION, updateState } from './update.js';
import { nativeBridge, isApk, onNative } from './native.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 1) => (n || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

let S = store.settings();
const ui = { view: 'home', game: null, gameId: null, setup: null, input: null, mult: 1, keypad: '', cpuTimer: null, busy: false, lastResult: null, statsPid: null, installEvt: null, startedAt: 0, daily: false };

function applySettings() {
  setCallerSettings({ caller: S.caller, volume: S.callerVolume, callNames: S.callNames, callRest: S.callRest });
  setSfx(S.sfx, S.sfxVolume);
  setVibrate(S.vibrate);
  setMusicSettings({ on: S.music, volume: S.musicVolume, source: S.musicSource });
  const nb = nativeBridge();
  if (nb && nb.keepAwake) try { nb.keepAwake(!!S.keepAwake); } catch (e) { /* egal */ }
}
function saveSettings() { store.saveSettings(S); applySettings(); }

// ================================================================== Grundgerüst
const NAV = [
  { id: 'home', icon: '🏠', label: 'Start' },
  { id: 'games', icon: '🎯', label: 'Spiele' },
  { id: 'stats', icon: '📊', label: 'Statistik' },
  { id: 'awards', icon: '🏆', label: 'Erfolge' },
  { id: 'more', icon: '⚙️', label: 'Mehr' },
];

function shell() {
  document.body.innerHTML = `
    <div id="app">
      <header id="top">
        <div class="brand" data-go="home"><img src="icons/icon.svg" alt=""><span>DARTS<b>ARENA</b></span></div>
        <div class="top-right"><button id="updBadge" class="pill gold hidden" data-act="update">⬆ Update</button><span id="lvlChip" class="chip"></span></div>
      </header>
      <main id="view"></main>
      <nav id="nav">${NAV.map((n) => `<button data-go="${n.id}"><span>${n.icon}</span><small>${n.label}</small></button>`).join('')}</nav>
      <div id="toasts"></div>
      <div id="modal" class="hidden"></div>
      <div id="fx"></div>
    </div>`;
  document.addEventListener('click', onClick);
  document.addEventListener('pointerdown', () => { unlockAudio(); ui.unlocked = true; musicWanted(ui.view !== 'play'); }, { once: true });
  document.addEventListener('pointerdown', ripple);
}

function go(view, opts = {}) {
  if (ui.view === 'play' && view !== 'play') stopCpu();
  ui.enter = ui.view !== view;
  ui.view = view;
  Object.assign(ui, opts);
  if (ui.unlocked) musicWanted(view !== 'play');
  document.body.dataset.view = view;
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.go === view || (view === 'setup' && b.dataset.go === 'games')));
  render();
  window.scrollTo(0, 0);
  if (view !== 'play') history.replaceState(null, '', '#' + view);
}

function render() {
  const v = $('#view');
  const map = { home: viewHome, games: viewGames, setup: viewSetup, play: viewPlay, result: viewResult, stats: viewStats, awards: viewAwards, more: viewMore, profiles: viewProfiles, caller: viewCaller, help: viewHelp };
  v.innerHTML = (map[ui.view] || viewHome)();
  v.classList.remove('enter');
  if (ui.enter) { void v.offsetWidth; v.classList.add('enter'); ui.enter = false; }
  // zuletzt angetippte Auswahl kurz aufleuchten lassen
  if (ui.justSel) { const j = v.querySelector(ui.justSel); if (j) j.classList.add('just'); ui.justSel = null; }
  if (ui.view === 'play') afterPlayRender();
  if (ui.view === 'stats') afterStatsRender();
  renderTop();
}

function renderTop() {
  const prog = store.progress();
  const L = levelFor(prog.xp);
  $('#lvlChip').innerHTML = `Lv ${L.level}`;
  const u = updateState();
  $('#updBadge').classList.toggle('hidden', !u.available);
}

function toast(html, cls = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + cls;
  t.innerHTML = html;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3800);
}

function modal(html, cls = '') {
  const m = $('#modal');
  m.className = cls;
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
}
function closeModal() { const m = $('#modal'); m.className = 'hidden'; m.innerHTML = ''; }

function confetti(n = 90) {
  const fx = $('#fx');
  const cols = ['#e53935', '#43a047', '#fdd835', '#ffffff', '#1e88e5'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = cols[i % cols.length];
    c.style.animationDelay = Math.random() * 0.4 + 's';
    c.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    fx.appendChild(c);
    setTimeout(() => c.remove(), 3600);
  }
}

function bigFlash(text, cls = '') {
  const f = document.createElement('div');
  f.className = 'flash ' + cls;
  f.textContent = text;
  $('#fx').appendChild(f);
  setTimeout(() => f.remove(), 1700);
}

// ================================================================== Animationen
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const await_ = (p) => { Promise.resolve(p).catch(() => {}); };

/** Wellen-Effekt an der Tipp-Stelle. */
function ripple(e) {
  const b = e.target.closest('.btn, .tile, .gcard, .seg button, .nums button, .keys button, .mults button, .quick-scores button, .cpurow, .callerrow, .resume, .chipbtn, #nav button');
  if (!b || b.disabled || reduced()) return;
  const r = b.getBoundingClientRect();
  const s = document.createElement('span');
  const d = Math.max(r.width, r.height) * 2;
  s.className = 'rip';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s);
  setTimeout(() => s.remove(), 600);
}

/** Karte „hebt ab“, dann weiter. */
function launch(el, then) {
  if (reduced() || !el) { then(); return; }
  el.classList.add('launch');
  setTimeout(then, 230);
}

/** „Game on!“-Intro: Scheibe dreht ein, Dart fliegt hinein. */
function gameOnIntro(then) {
  if (reduced()) { then(); return; }
  const o = document.createElement('div');
  o.className = 'intro';
  o.innerHTML = `<div class="intro-board">${boardSvg({ numbers: false })}</div><svg class="intro-dart" viewBox="-30 -30 60 190"><g transform="rotate(180 0 60)"><rect x="-5" y="-4" width="10" height="70" rx="3" fill="#cfd8dc"/><rect x="-9" y="60" width="18" height="46" rx="6" fill="#455a64"/><path d="M0 104 L-26 150 L0 140 L26 150Z" fill="#e53935" stroke="#0b0b0b" stroke-width="3"/><path d="M0 -4 L-2 -26 L2 -26Z" fill="#eceff1"/></g></svg><div class="intro-text">GAME ON!</div>`;
  document.body.appendChild(o);
  sfx.hit(1.4);
  setTimeout(() => { sfx.hit(2); buzz(30); }, 520);
  setTimeout(then, 900);
  setTimeout(() => o.classList.add('out'), 1000);
  setTimeout(() => o.remove(), 1500);
}

// ================================================================== Start
function activeProfile() {
  const ps = store.profiles();
  return ps.find((p) => p.id === store.activeProfileId()) || ps[0];
}
const avatar = (p, size = '') => `<span class="ava ${size}" style="--c:${p.color || '#e53935'}">${p.cpu ? '🤖' : esc(p.emoji || '🎯')}</span>`;

function viewHome() {
  const me = activeProfile();
  const prog = store.progress();
  const L = levelFor(prog.xp);
  const streak = streakAlive(prog);
  const ch = dailyChallenge(L.level);
  const done = !!(prog.daily || {})[ch.day];
  const st = statsFor(me.id);
  const running = store.running();
  const tip = TIPS[new Date().getDate() % TIPS.length];
  const lastCpu = +localStorage.getItem('da.lastCpu') || 3;
  return `
  <section class="hero">
    <div class="hero-top">${avatar(me, 'xl')}
      <div><div class="hello">Hallo ${esc(me.name)}!</div><div class="rank">${rankFor(L.level)} · Level ${L.level}</div></div>
      <div class="streak ${streak ? 'on' : ''}" title="Tage in Folge"><span>🔥</span><b>${streak}</b></div>
    </div>
    <div class="xpbar"><i style="width:${Math.round(L.pct * 100)}%"></i></div>
    <div class="xptext">${L.into} / ${L.need} XP bis Level ${L.level + 1}</div>
  </section>
  ${running ? `<button class="card resume" data-act="resume"><span class="big">▶</span><div><b>Spiel fortsetzen</b><small>${esc(gameById(running.gameId)?.meta.name || '')} · ${esc(running.players.map((p) => p.name).join(' vs. '))}</small></div></button>` : ''}
  <section class="card daily ${done ? 'done' : ''}">
    <div class="row between"><h3>☀️ Tages-Challenge</h3><span class="pill">${done ? '✓ geschafft' : '+' + ch.xp + ' XP'}</span></div>
    <p>${esc(ch.text)}</p>
    ${done ? '<small>Morgen wartet eine neue Aufgabe.</small>' : `<button class="btn primary" data-act="daily">Challenge starten</button>`}
  </section>
  <section class="quick">
    <button class="tile red" data-act="quick" data-g="x01" data-cpu="${lastCpu}"><span>🤖</span><b>501 gegen CPU</b><small>Stufe ${lastCpu} · ${CPU_LEVELS[lastCpu].name}</small></button>
    <button class="tile green" data-act="quick" data-g="x01" data-cpu="0"><span>🎯</span><b>501 Solo</b><small>Schnell trainieren</small></button>
    <button class="tile" data-act="quick" data-g="bobs27"><span>💯</span><b>Bob's 27</b><small>Doppel-Training</small></button>
    <button class="tile" data-act="quick" data-g="atc"><span>🕐</span><b>Around the Clock</b><small>Aufwärmen</small></button>
  </section>
  <section class="kpis">
    <div><b>${fmt(st.avg)}</b><small>Ø 3-Dart</small></div>
    <div><b>${fmt(st.coPct, 0)}%</b><small>Checkout</small></div>
    <div><b>${st.c180}</b><small>180er</small></div>
    <div><b>${st.games}</b><small>Spiele</small></div>
  </section>
  <section class="card tip"><b>💡 Tipp des Tages</b><p>${esc(tip)}</p></section>`;
}

// ================================================================== Spieleliste
function viewGames() {
  const card = (G) => `<button class="gcard" data-act="setup" data-g="${G.meta.id}"><span class="gi">${G.meta.icon}</span><div><b>${esc(G.meta.name)}</b><small>${esc(G.meta.desc)}</small></div></button>`;
  return `<h2 class="h">Matchspiele</h2><div class="glist">${GAMES.filter((g) => g.meta.cat === 'match').map(card).join('')}</div>
  <h2 class="h">Training</h2><div class="glist">${GAMES.filter((g) => g.meta.cat === 'training').map(card).join('')}</div>
  <button class="btn ghost wide" data-go="help">📖 Spielregeln</button>`;
}

// ================================================================== Spiel einrichten
function defaultSetup(id, cpu = null) {
  const G = gameById(id);
  const saved = JSON.parse(localStorage.getItem('da.setup.' + id) || 'null');
  const cfg = {};
  G.meta.options.forEach((o) => { cfg[o.key] = saved && saved.cfg && o.values.includes(saved.cfg[o.key]) ? saved.cfg[o.key] : o.def; });
  let players = saved && saved.players ? saved.players.filter((p) => p.cpu || store.profiles().some((x) => x.id === p.id)) : null;
  if (!players || !players.length) players = [pl(activeProfile())];
  if (cpu !== null) {
    players = [pl(activeProfile())];
    if (cpu > 0) players.push(cpuPlayer(cpu));
  }
  if (players.length < G.meta.min) players.push(cpuPlayer(+localStorage.getItem('da.lastCpu') || 3));
  return { id, cfg, players };
}
const pl = (p) => ({ id: p.id, name: p.name, color: p.color, emoji: p.emoji, cpu: 0 });
const cpuPlayer = (lvl) => ({ id: 'cpu' + lvl + '-' + Math.random().toString(36).slice(2, 5), name: `CPU ${CPU_LEVELS[lvl].name}`, cpu: lvl, color: '#78909c', emoji: '🤖' });

function viewSetup() {
  const su = ui.setup;
  const G = gameById(su.id);
  const opts = G.meta.options.map((o) => `
    <div class="opt"><label>${esc(o.label)}</label><div class="seg">${o.values.map((v, i) => `<button class="${su.cfg[o.key] === v ? 'on' : ''}" data-act="opt" data-k="${o.key}" data-i="${i}">${esc(o.names ? o.names[i] : v)}</button>`).join('')}</div></div>`).join('');
  const plist = su.players.map((p, i) => `
    <div class="prow">${avatar(p)}<div class="grow"><b>${esc(p.name)}</b>${p.cpu ? `<small>Ø ca. ${CPU_LEVELS[p.cpu].avg} · Stufe ${p.cpu}</small>` : '<small>Mensch</small>'}</div>
      ${p.cpu ? `<button class="icon" data-act="cpuLvl" data-i="${i}" data-d="-1">−</button><button class="icon" data-act="cpuLvl" data-i="${i}" data-d="1">+</button>` : ''}
      <button class="icon" data-act="pUp" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon" data-act="pDel" data-i="${i}" ${su.players.length <= 1 ? 'disabled' : ''}>✕</button></div>`).join('');
  return `
  <div class="setup-head"><button class="back" data-go="games">‹</button><span class="gi">${G.meta.icon}</span><div><h2>${esc(G.meta.name)}</h2><small>${esc(G.meta.desc)}</small></div><button class="icon" data-act="rules" data-g="${G.meta.id}">?</button></div>
  ${ui.daily ? '<div class="pill gold block">☀️ Tages-Challenge</div>' : ''}
  <section class="card"><div class="row between"><h3>Spieler</h3><small>${su.players.length}/${G.meta.max}</small></div>${plist}
    <div class="row gap"><button class="btn" data-act="addHuman" ${su.players.length >= G.meta.max ? 'disabled' : ''}>＋ Spieler</button><button class="btn" data-act="addCpu" ${su.players.length >= G.meta.max ? 'disabled' : ''}>＋ CPU</button></div>
  </section>
  ${opts ? `<section class="card">${opts}</section>` : ''}
  <button class="btn primary big wide" data-act="start">Game on! 🎯</button>`;
}

function pickHuman() {
  const used = new Set(ui.setup.players.map((p) => p.id));
  const free = store.profiles().filter((p) => !used.has(p.id));
  modal(`<h3>Spieler hinzufügen</h3>
    ${free.map((p) => `<button class="prow btnrow" data-act="addProfile" data-id="${p.id}">${avatar(p)}<b class="grow">${esc(p.name)}</b></button>`).join('') || '<p class="muted">Alle Profile sind schon dabei.</p>'}
    <div class="row gap"><input id="newName" placeholder="Neuer Name" maxlength="20"><button class="btn primary" data-act="addNew">Anlegen</button></div>`);
}

function pickCpu() {
  modal(`<h3>CPU-Gegner wählen</h3><div class="cpulist">${CPU_LEVELS.slice(1).map((l, i) => `
    <button class="cpurow" data-act="addCpuLvl" data-l="${i + 1}"><b>${i + 1}</b><div class="grow"><span>${l.name}</span><small>Ø ca. ${l.avg}</small></div><i style="width:${(i + 1) * 10}%"></i></button>`).join('')}</div>`);
}

// ================================================================== Spielen
function startGame(setup, resume = null) {
  const G = gameById(setup.id);
  const game = new G(setup.cfg, setup.players);
  if (resume) { game.s = resume.s; }
  ui.game = game;
  ui.gameId = setup.id;
  ui.setup = setup;
  ui.mult = 1;
  ui.keypad = '';
  ui.startedAt = resume ? resume.startedAt : Date.now();
  const humanMode = G.meta.visit ? S.input : (S.input === 'keypad' ? 'segments' : S.input);
  ui.input = humanMode;
  localStorage.setItem('da.setup.' + setup.id, JSON.stringify({ cfg: setup.cfg, players: setup.players }));
  const c = setup.players.find((p) => p.cpu);
  if (c) localStorage.setItem('da.lastCpu', c.cpu);
  go('play');
  if (!resume) {
    stopCalls();
    say({ phrase: 'gameon' }, { name: setup.players[0].name });
  }
  persist();
  scheduleCpu(900);
}

function persist() {
  const g = ui.game;
  if (!g || g.s.over) { store.clearRunning(); return; }
  store.saveRunning({ gameId: ui.gameId, cfg: ui.setup.cfg, players: ui.setup.players, s: g.s, startedAt: ui.startedAt, daily: ui.daily });
}

function curPlayer() { return ui.game.players[ui.game.cur]; }

function viewPlay() {
  const g = ui.game;
  const G = g.constructor;
  const many = g.players.length > 2;
  const panels = g.players.map((p, i) => {
    const pn = g.panel(i);
    const last = g.s.last[i];
    const cr = pn.cricket ? `<div class="cmarks">${[20, 19, 18, 17, 16, 15, 25].map((x) => `<span><em>${x === 25 ? 'B' : x}</em>${['', '／', '✕', 'Ⓧ'][Math.min(3, pn.cricket[x])]}</span>`).join('')}</div>` : '';
    return `<div class="pp ${i === g.cur && !g.s.over ? 'active' : ''} ${p.cpu ? 'cpu' : ''}" style="--c:${p.color}">
      <div class="pp-head">${avatar(p, 'sm')}<span class="pname">${esc(p.name)}</span>${pn.extra ? `<span class="pextra">${esc(pn.extra)}</span>` : ''}</div>
      <div class="pmain">${esc(pn.main)}</div>
      <div class="psub">${esc(pn.sub)}</div>${cr}
      ${pn.progress != null ? `<div class="pbar"><i style="width:${pn.progress * 100}%"></i></div>` : ''}
      <div class="plast">${last ? (last.bust ? '<span class="bust">BUST</span>' : `Letzte: <b>${last.total}</b>${last.darts ? ' · ' + last.darts.map(label).join(' ') : ''}`) : '&nbsp;'}</div>
    </div>`;
  }).join('');
  const turn = g.s.turn;
  const slots = [0, 1, 2].map((k) => `<span class="slot ${turn[k] ? 'f' : ''}">${turn[k] ? label(turn[k]) : ''}</span>`).join('');
  const turnSum = turn.reduce((a, d) => a + value(d), 0);
  const hint = S.showHints ? g.hint() : '';
  const isCpu = !!curPlayer().cpu && !g.s.over;
  const canKeypad = !!G.meta.visit;
  return `
  <div class="playbar"><button class="back" data-act="leave">‹</button><b>${G.meta.icon} ${esc(G.meta.name)}${g.cfg.start ? ' ' + g.cfg.start : ''}</b>
    <div class="row"><button class="icon" data-act="mute" title="Caller">${S.caller === 'off' ? '🔇' : '🔊'}</button><button class="icon" data-act="rules" data-g="${G.meta.id}">?</button></div></div>
  <div class="panels ${many ? 'many' : ''}">${panels}</div>
  <div class="hint">${esc(hint) || '&nbsp;'}</div>
  <div class="turnrow"><div class="slots">${slots}</div><div class="tsum">${turn.length ? turnSum : ''}</div>
    <button class="btn small" data-act="undo" ${g.canUndo() ? '' : 'disabled'}>↶ Zurück</button></div>
  ${isCpu ? `<div class="cpuzone"><div class="cpuboard">${boardSvg({ id: 'cpuBoard' })}</div><div class="cpulabel">🤖 ${esc(curPlayer().name)} wirft …</div></div>` : inputArea(canKeypad)}`;
}

function inputArea(canKeypad) {
  const modes = [canKeypad && ['keypad', '⌨️ Summe'], ['segments', '🔢 Felder'], ['board', '🎯 Scheibe']].filter(Boolean);
  let mode = ui.input;
  if (mode === 'keypad' && !canKeypad) mode = 'segments';
  if (ui.game.s.turn.length && mode === 'keypad') mode = 'segments';
  const tabs = `<div class="seg tabs">${modes.map(([m, l]) => `<button class="${m === mode ? 'on' : ''}" data-act="inmode" data-m="${m}">${l}</button>`).join('')}</div>`;
  if (mode === 'keypad') {
    const quick = [26, 41, 45, 60, 81, 85, 100, 140, 180];
    return `${tabs}<div class="keypad">
      <div class="kdisplay"><span id="kd">${ui.keypad || '0'}</span></div>
      <div class="quick-scores">${quick.map((q) => `<button data-act="qs" data-v="${q}">${q}</button>`).join('')}</div>
      <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-act="key" data-v="${n}">${n}</button>`).join('')}
      <button data-act="key" data-v="del" class="k2">⌫</button><button data-act="key" data-v="0">0</button><button data-act="key" data-v="ok" class="ok">OK</button></div>
      <button class="btn ghost wide small" data-act="qs" data-v="0">Kein Score (0)</button></div>`;
  }
  if (mode === 'board') {
    return `${tabs}<div class="tapboard" id="tapBoard">${boardSvg({ id: 'inBoard' })}</div>
      <div class="row gap center"><button class="btn" data-act="dart" data-s="0" data-m="0">Miss</button><button class="btn" data-act="dart" data-s="25" data-m="1">25</button><button class="btn" data-act="dart" data-s="25" data-m="2">Bull</button></div>`;
  }
  const nums = [];
  for (let n = 1; n <= 20; n++) nums.push(`<button data-act="dart" data-s="${n}">${n}</button>`);
  return `${tabs}<div class="segpad m${ui.mult}">
    <div class="mults"><button class="${ui.mult === 1 ? 'on' : ''}" data-act="mult" data-m="1">Single</button><button class="${ui.mult === 2 ? 'on' : ''} d" data-act="mult" data-m="2">Double</button><button class="${ui.mult === 3 ? 'on' : ''} t" data-act="mult" data-m="3">Triple</button></div>
    <div class="nums">${nums.join('')}<button data-act="dart" data-s="25" data-m="1" class="bull">25</button><button data-act="dart" data-s="25" data-m="2" class="bull">Bull</button><button data-act="dart" data-s="0" data-m="0" class="miss">Miss</button><button data-act="endturn" class="miss">⏭ Rest 0</button></div></div>`;
}

function afterPlayRender() {
  const b = $('#inBoard');
  if (b) {
    b.addEventListener('click', (e) => {
      const seg = e.target.closest('.bseg');
      const pt = b.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(b.getScreenCTM().inverse());
      if (!seg) { humanDart(MISS, { x: loc.x, y: loc.y }); return; }
      humanDart(dart(+seg.dataset.seg, +seg.dataset.mult), { x: loc.x, y: loc.y });
    });
    ui.game.s.turn.forEach((t) => { if (t.pos) markDart(b, t.pos.x, t.pos.y); });
  }
}

function humanDart(d, pos = null) {
  const g = ui.game;
  if (!g || g.s.over || curPlayer().cpu || ui.busy) return;
  buzz(12);
  d.seg === 0 ? sfx.miss() : sfx.hit(d.mult);
  const ev = g.throwDart(d, pos || pointIn(d));
  ui.mult = 1;
  handleEvent(ev);
}

function handleEvent(ev) {
  const g = ui.game;
  if (!ev) return;
  if (ev.type === 'invalid') { toast('Diese Punktzahl ist mit 3 Darts nicht möglich', 'warn'); return; }
  if (ev.type === 'turn') {
    const p = g.players[ev.player];
    if (ev.bust) { sfx.bust(); buzz(120); bigFlash('BUST', 'bust'); }
    if (ev.total === 180 && (g.meta.id === 'x01' || g.meta.id === 'scoring') && !ev.bust) { sfx.fanfare(); confetti(120); bigFlash('180!', 'max'); buzz(300); }
    else if (ev.total >= 140 && !ev.bust && (g.meta.id === 'x01' || g.meta.id === 'scoring')) { sfx.cheer(0.5); bigFlash(String(ev.total), 'ton'); }
    if (ev.won) { sfx.cheer(1); confetti(70); bigFlash(g.s.over ? 'GAME SHOT!' : `LEG ${p.name}`, 'win'); }
    if (ev.shanghai) { sfx.fanfare(); confetti(120); bigFlash('SHANGHAI!', 'max'); }
    if (ev.text && !ev.bust) toast(esc(ev.text));
    say(ev.call, { name: p.name });
    if (ev.require && S.callRest && !g.s.over) say({ require: ev.require.rest }, { name: g.players[ev.require.player].name });
  } else if (ev.text) toast(esc(ev.text));
  persist();
  if (g.s.over) { setTimeout(finishGame, ev.won || ev.shanghai ? 1600 : 900); render(); return; }
  render();
  scheduleCpu(ev.type === 'turn' ? 1300 : 0);
}

function stopCpu() { clearTimeout(ui.cpuTimer); ui.cpuTimer = null; }

function scheduleCpu(delay = 700) {
  stopCpu();
  const g = ui.game;
  if (!g || g.s.over || !curPlayer().cpu) return;
  const speed = [1.6, 1, 0.55][S.cpuSpeed] || 1;
  ui.cpuTimer = setTimeout(cpuStep, delay * speed + 500 * speed);
}

function cpuStep() {
  const g = ui.game;
  if (!g || g.s.over || ui.view !== 'play') return;
  const p = curPlayer();
  if (!p.cpu) return;
  const t = throwAt(g.cpuTarget(), CPU_LEVELS[p.cpu].sigma);
  const before = g.cur;
  const ev = g.throwDart(t.dart, { x: t.x, y: t.y });
  t.dart.seg === 0 ? sfx.miss() : sfx.hit(t.dart.mult);
  const b = $('#cpuBoard');
  if (b) {
    markDart(b, t.x, t.y, 'cpu fly');
    const lab = $('.cpulabel');
    if (lab) lab.innerHTML = `🤖 ${esc(p.name)}: <b>${g.s.turn.map(label).join(' · ') || label(t.dart)}</b>`;
  }
  if (ev && ev.type === 'turn') {
    // Aufnahme kurz stehen lassen, dann auswerten
    const lab = $('.cpulabel');
    if (lab) lab.innerHTML = `🤖 ${esc(p.name)}: <b>${ev.darts.map(label).join(' · ')}</b> = <b>${ev.bust ? 'BUST' : ev.total}</b>`;
    ui.busy = true;
    setTimeout(() => { ui.busy = false; handleEvent(ev); }, 650);
    return;
  }
  // Slots aktualisieren ohne komplettes Neuzeichnen (Board-Markierungen bleiben)
  const slots = $$('.slots .slot');
  g.s.turn.forEach((d, k) => { if (slots[k]) { slots[k].textContent = label(d); slots[k].classList.add('f'); } });
  const ts = $('.tsum'); if (ts) ts.textContent = g.s.turn.reduce((a, d) => a + value(d), 0);
  const h = $('.hint'); if (h && S.showHints) h.textContent = g.hint();
  if (before === g.cur) ui.cpuTimer = setTimeout(cpuStep, 750 * ([1.6, 1, 0.55][S.cpuSpeed] || 1));
}

function keypadOk(total) {
  const g = ui.game;
  if (total > 180 || IMPOSSIBLE.has(total)) { toast(`${total} ist mit 3 Darts nicht möglich`, 'warn'); ui.keypad = ''; render(); return; }
  if (g.meta.id === 'x01') {
    const p = g.cur;
    const rest = g.s.rest[p];
    if (total === rest && g.s.opened[p]) {
      const opts = g.finishDartsOptions(rest);
      if (opts.length > 1) {
        modal(`<h3>🎯 Gecheckt!</h3><p>Mit dem wievielten Dart?</p><div class="row gap center">${opts.map((n) => `<button class="btn primary big" data-act="finishDarts" data-n="${n}" data-t="${total}">${n}.</button>`).join('')}</div>`);
        return;
      }
      submitVisit(total, opts[0] || 3);
      return;
    }
  }
  submitVisit(total);
}
function submitVisit(total, darts) {
  ui.keypad = '';
  sfx.hit(1);
  buzz(15);
  handleEvent(ui.game.enterVisit(total, { darts }));
}

function undo() {
  const g = ui.game;
  stopCpu();
  ui.busy = false;
  if (!g.canUndo()) return;
  g.undo();
  // gegen die CPU: bis zur letzten eigenen Eingabe zurück
  while (g.canUndo() && curPlayer().cpu) g.undo();
  stopCalls();
  persist();
  render();
  scheduleCpu(900);
}

function finishGame() {
  const g = ui.game;
  if (!g) return;
  store.clearRunning();
  const res = g.result();
  const entry = { id: 'g' + Date.now().toString(36), game: g.meta.id, cfg: g.cfg, date: Date.now(), dur: Date.now() - ui.startedAt, players: res, winner: g.s.winner };
  const me = activeProfile();
  const cpuOk = ui.daily ? res.some((r) => r.cpu) : false;
  const shanghai = g.meta.id === 'shanghai' && g.s.winner != null && res[g.s.winner] && res[g.s.winner].id === me.id && g.s.round <= g.cfg.rounds;
  const out = recordGame(entry, me.id, { daily: ui.daily, cpuOk, shanghai });
  ui.lastResult = { entry, out, legs: g.s.legHistory || [] };
  ui.daily = false;
  go('result');
  if (out.levelUp) setTimeout(() => { sfx.levelUp(); toast(`⬆️ <b>Level ${out.levelUp}!</b> ${rankFor(out.levelUp)}`, 'gold'); }, 600);
  out.newAch.forEach((a, i) => setTimeout(() => { sfx.levelUp(); toast(`${a.icon} <b>Erfolg:</b> ${esc(a.name)}`, 'gold'); }, 1200 + i * 900));
  if (out.daily) setTimeout(() => { confetti(80); toast('☀️ <b>Tages-Challenge geschafft!</b>', 'gold'); }, 400);
}

function viewResult() {
  const { entry, out, legs } = ui.lastResult;
  const G = gameById(entry.game);
  const w = entry.players[entry.winner];
  const isX = entry.game === 'x01';
  const rows = isX
    ? [['Ø 3-Dart', (r) => fmt(r.avg)], ['First 9 Ø', (r) => fmt(r.f9)], ['Legs', (r) => r.legsWon], ['Darts', (r) => r.darts], ['Checkout', (r) => `${r.coHit}/${r.coAtt}`], ['Höchstes Finish', (r) => r.hiFinish || '–'], ['Bestes Leg', (r) => (r.bestLeg ? r.bestLeg + ' Darts' : '–')], ['180 / 140+ / 100+', (r) => `${r.c180} / ${r.c140} / ${r.c100}`], ['Höchste Aufnahme', (r) => r.hiVisit]]
    : [['Ergebnis', (r) => r.score], ['Darts', (r) => r.darts], ...(entry.game === 'cricket' ? [['MPR', (r) => fmt(r.mpr, 2)]] : [])];
  return `
  <section class="result-hero"><div class="trophy">🏆</div><h2>${w ? esc(w.name) : '–'}</h2><p>${entry.players.length > 1 ? 'gewinnt' : 'Training beendet'} · ${esc(G.meta.name)}</p></section>
  <section class="card"><table class="rtab"><tr><th></th>${entry.players.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr>
    ${rows.map(([n, f]) => `<tr><td>${n}</td>${entry.players.map((r) => `<td>${f(r)}</td>`).join('')}</tr>`).join('')}</table></section>
  ${legs.length > 1 ? `<section class="card"><h3>Legs</h3>${legs.map((l, i) => `<div class="row between"><span>Leg ${i + 1}: ${esc(entry.players[l.winner].name)}</span><small>${l.darts} Darts · Finish ${l.finish}</small></div>`).join('')}</section>` : ''}
  <section class="card xpcard"><b>+${out.xp} XP</b>${out.records.length ? `<div class="recs">${out.records.map((r) => `<span>🏅 Neuer Rekord: ${esc(r)}</span>`).join('')}</div>` : ''}
    ${out.newAch.length ? `<div class="achs">${out.newAch.map((a) => `<span>${a.icon} ${esc(a.name)}</span>`).join('')}</div>` : ''}</section>
  <div class="row gap"><button class="btn primary big grow" data-act="rematch">🔁 Revanche</button><button class="btn big grow" data-act="setup" data-g="${entry.game}">⚙️ Ändern</button></div>
  <button class="btn ghost wide" data-go="home">Zur Startseite</button>`;
}

// ================================================================== Statistik
function viewStats() {
  const ps = store.profiles();
  const pid = ui.statsPid || activeProfile().id;
  const t = statsFor(pid);
  const hist = store.history().filter((g) => g.players.some((p) => p.id === pid)).slice(0, 25);
  const kp = [
    ['Ø 3-Dart (X01)', fmt(t.avg)], ['First 9 Ø', fmt(t.f9)], ['Checkout-Quote', fmt(t.coPct, 0) + '%'], ['Höchstes Finish', t.hiFinish || '–'],
    ['Bestes 501-Leg', t.bestLeg ? t.bestLeg + ' Darts' : '–'], ['Bester Match-Ø', fmt(t.bestAvg)], ['180er', t.c180], ['140+', t.c140], ['100+', t.c100],
    ['Spiele', t.games], ['Siege', t.wins], ['Darts gesamt', t.darts.toLocaleString('de-DE')],
  ];
  const tr = [
    ['Around the Clock', t.atcBest ? t.atcBest + ' Darts' : '–'], ["Bob's 27", t.bobsBest ?? '–'], ['Scoring (Rekord)', t.scoringBest || '–'],
    ['121-Leiter', t.ladderBest || '–'], ['Doppelquote (Training)', t.dblAtt ? fmt((t.dblHit / t.dblAtt) * 100, 0) + '%' : '–'], ['Stärkste CPU besiegt', t.cpuBeat ? 'Stufe ' + t.cpuBeat : '–'],
  ];
  return `
  <div class="row scrollx">${ps.map((p) => `<button class="chipbtn ${p.id === pid ? 'on' : ''}" data-act="statsP" data-id="${p.id}">${avatar(p, 'sm')} ${esc(p.name)}</button>`).join('')}</div>
  <section class="kgrid">${kp.map(([n, v]) => `<div><b>${v}</b><small>${n}</small></div>`).join('')}</section>
  <section class="card"><h3>📈 Schnitt-Verlauf (X01)</h3>${trendSvg(t.trend)}</section>
  <section class="card"><h3>🎯 Trefferbild</h3><p class="muted small">Alle Darts, die Feld für Feld eingegeben wurden.</p><div class="heat" id="heat"></div></section>
  <section class="card"><h3>🏋️ Trainings-Bestwerte</h3>${tr.map(([n, v]) => `<div class="row between line"><span>${n}</span><b>${v}</b></div>`).join('')}</section>
  <section class="card"><h3>🕘 Letzte Spiele</h3>${hist.map((g) => {
    const r = g.players.find((p) => p.id === pid);
    const G = gameById(g.game);
    const vs = g.players.filter((p) => p.id !== pid).map((p) => p.name).join(', ');
    return `<div class="hrow"><span class="gi sm">${G ? G.meta.icon : '🎯'}</span><div class="grow"><b>${G ? esc(G.meta.name) : g.game}${g.cfg && g.cfg.start ? ' ' + g.cfg.start : ''}</b><small>${new Date(g.date).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}${vs ? ' · vs. ' + esc(vs) : ''}</small></div>
      <div class="hres ${r.won ? 'w' : ''}">${g.game === 'x01' ? 'Ø ' + fmt(r.avg) : esc(r.score)}<small>${g.players.length > 1 ? (r.won ? 'Sieg' : 'Niederlage') : ''}</small></div></div>`;
  }).join('') || '<p class="muted">Noch keine Spiele – leg los!</p>'}</section>`;
}

function trendSvg(tr) {
  if (tr.length < 2) return '<p class="muted">Nach zwei X01-Spielen siehst du hier deine Entwicklung.</p>';
  const W = 320, H = 120, pad = 22;
  const vals = tr.map((x) => x.v);
  const max = Math.ceil(Math.max(...vals) / 10) * 10 + 5, min = Math.max(0, Math.floor(Math.min(...vals) / 10) * 10 - 5);
  const x = (i) => pad + (i * (W - pad - 6)) / (tr.length - 1);
  const y = (v) => H - 16 - ((v - min) / (max - min || 1)) * (H - 26);
  const pts = tr.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return `<svg viewBox="0 0 ${W} ${H}" class="trend"><line x1="${pad}" x2="${W - 6}" y1="${y(mean)}" y2="${y(mean)}" class="mean"/>
    <text x="2" y="${y(max) + 4}" class="ax">${max}</text><text x="2" y="${y(min)}" class="ax">${min}</text>
    <polyline points="${pts}" class="line"/>${tr.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="2.6" class="dot"/>`).join('')}
    <text x="${W - 6}" y="${y(mean) - 4}" text-anchor="end" class="ax">Ø ${fmt(mean)}</text></svg>`;
}

function afterStatsRender() {
  const pid = ui.statsPid || activeProfile().id;
  const heat = statsFor(pid).heat;
  const max = Math.max(1, ...Object.values(heat));
  const norm = {};
  Object.entries(heat).forEach(([k, v]) => { norm[k] = Math.sqrt(v / max); });
  const el = $('#heat');
  if (el) el.innerHTML = Object.keys(heat).length ? boardSvg({ heat: norm }) : '<p class="muted">Noch keine Daten – nutze im Spiel die Eingabe „Felder“ oder „Scheibe“.</p>';
}

// ================================================================== Erfolge
function viewAwards() {
  const prog = store.progress();
  const L = levelFor(prog.xp);
  const got = ACHIEVEMENTS.filter((a) => prog.ach[a.id]).length;
  const rec = prog.records || {};
  return `
  <section class="hero small"><div class="row between"><div><div class="hello">Level ${L.level}</div><div class="rank">${rankFor(L.level)}</div></div><div class="big-num">${prog.xp.toLocaleString('de-DE')}<small>XP</small></div></div>
    <div class="xpbar"><i style="width:${Math.round(L.pct * 100)}%"></i></div>
    <div class="row between small"><span>🔥 Serie: ${streakAlive(prog)} Tage (Rekord ${prog.bestStreak || 0})</span><span>☀️ ${prog.dailyDone || 0} Challenges</span></div></section>
  <h2 class="h">Erfolge <small>${got}/${ACHIEVEMENTS.length}</small></h2>
  <div class="achgrid">${ACHIEVEMENTS.map((a) => `<div class="ach ${prog.ach[a.id] ? 'got' : ''}"><span>${a.icon}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join('')}</div>
  <h2 class="h">Persönliche Rekorde</h2>
  <section class="card">${[['Bester Match-Ø (X01)', rec.avg ? fmt(rec.avg) : '–'], ['Höchstes Finish', rec.finish || '–'], ['Schnellstes 501-Leg', rec.leg ? rec.leg + ' Darts' : '–'], ['Around the Clock', rec.atc ? rec.atc + ' Darts' : '–'], ["Bob's 27", rec.bobs ?? '–'], ['Scoring (30 Darts)', rec.scoring || '–']].map(([n, v]) => `<div class="row between line"><span>${n}</span><b>${v}</b></div>`).join('')}</section>`;
}

// ================================================================== Mehr / Einstellungen
function viewMore() {
  const u = updateState();
  const c = callerById(S.caller);
  const tog = (k, l, d = '') => `<label class="tog"><div><b>${l}</b>${d ? `<small>${d}</small>` : ''}</div><input type="checkbox" data-set="${k}" ${S[k] ? 'checked' : ''}><i></i></label>`;
  const kind = u.kind === 'apk' ? 'Android-App (APK)' : u.kind === 'play' ? 'Google Play' : 'Web-App (PWA)';
  return `
  <section class="card"><h3>👥 Profile</h3><button class="prow btnrow" data-go="profiles">${avatar(activeProfile())}<div class="grow"><b>${esc(activeProfile().name)}</b><small>${store.profiles().length} Profil(e) · verwalten</small></div><span>›</span></button></section>
  <section class="card"><h3>🎙️ Caller</h3><button class="prow btnrow" data-go="caller"><span class="ava">${c.flag || '🎙️'}</span><div class="grow"><b>${esc(c.name)}</b><small>${esc(c.desc || '')}</small></div><span>›</span></button></section>
  <section class="card"><h3>🎵 Menü-Musik</h3>
    ${tog('music', 'Musik in den Menüs', 'Läuft leise bei der Spielauswahl, pausiert während des Spiels')}
    <div class="opt"><label>Lautstärke Musik</label><input type="range" min="0.05" max="1" step="0.05" value="${S.musicVolume}" data-range="musicVolume"></div>
    <div class="opt"><label>Quelle</label><div class="seg"><button class="${S.musicSource !== 'own' ? 'on' : ''}" data-act="musicSrc" data-v="builtin">Arena-Loop</button><button class="${S.musicSource === 'own' ? 'on' : ''}" data-act="musicSrc" data-v="own" ${S.musicName ? '' : 'disabled'}>${S.musicName ? esc(S.musicName.replace(/\.[^.]+$/, '').slice(0, 24)) : 'Eigener Song'}</button></div></div>
    <div class="row gap"><button class="btn grow" data-act="musicPick">📂 Eigenen Song wählen</button>${S.musicName ? '<button class="btn" data-act="musicDel">🗑</button>' : ''}</div>
    <p class="muted small">Dein Lieblingssong (z. B. „Chase the Sun“) als MP3 vom Gerät – er bleibt nur auf diesem Gerät gespeichert.</p></section>
  <section class="card"><h3>🔈 Ton & Bedienung</h3>
    ${tog('sfx', 'Soundeffekte', 'Treffer, Bust, Fanfare bei 180')}
    <div class="opt"><label>Lautstärke Effekte</label><input type="range" min="0" max="1" step="0.05" value="${S.sfxVolume}" data-range="sfxVolume"></div>
    ${tog('vibrate', 'Vibration')}
    ${tog('showHints', 'Checkout-Wege & Ziele anzeigen')}
    ${tog('keepAwake', 'Bildschirm anlassen', 'Während der App-Nutzung nicht ausschalten')}
    <div class="opt"><label>Standard-Eingabe</label><div class="seg">${[['keypad', 'Summe'], ['segments', 'Felder'], ['board', 'Scheibe']].map(([v, l]) => `<button class="${S.input === v ? 'on' : ''}" data-act="setv" data-k="input" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="opt"><label>CPU-Tempo</label><div class="seg">${['Gemütlich', 'Normal', 'Schnell'].map((l, i) => `<button class="${S.cpuSpeed === i ? 'on' : ''}" data-act="setv" data-k="cpuSpeed" data-v="${i}" data-num="1">${l}</button>`).join('')}</div></div>
  </section>
  <section class="card"><h3>⬆️ Updates</h3>
    <div class="row between line"><span>Version</span><b>${esc(APP_VERSION.version)}${APP_VERSION.build ? '' : ''}</b></div>
    <div class="row between line"><span>Variante</span><b>${kind}</b></div>
    ${u.kind === 'play' ? '<p class="muted small">Updates kommen über Google Play.</p>' : `
    ${tog('autoUpdate', 'Automatisch nach Updates suchen', u.kind === 'apk' ? 'Alle 24 Stunden – wie bei unseren anderen Apps' : 'Bei jedem Start und alle 24 Stunden')}
    ${u.available ? `<button class="btn primary wide" data-act="update">⬆ ${u.kind === 'apk' ? 'Version ' + esc(u.available.tag) + ' installieren' : 'Neue Version laden'}</button>` : `<button class="btn wide" data-act="checkUpd" ${u.checking ? 'disabled' : ''}>${u.checking ? 'Suche …' : 'Nach Updates suchen'}</button>`}
    ${u.progress != null ? `<div class="xpbar"><i style="width:${Math.round(u.progress * 100)}%"></i></div>` : ''}
    ${u.status ? `<p class="muted small">${esc(u.status)}</p>` : ''}`}
    ${!isApk() && ui.installEvt ? '<button class="btn primary wide" data-act="install">📲 Als App installieren</button>' : ''}
  </section>
  <section class="card"><h3>💾 Daten</h3><p class="muted small">Alles bleibt nur auf diesem Gerät. Sichere es, um es auf ein anderes Gerät mitzunehmen.</p>
    <div class="row gap"><button class="btn grow" data-act="export">Sichern</button><button class="btn grow" data-act="import">Wiederherstellen</button></div>
    <button class="btn ghost wide danger" data-act="wipe">Spielverlauf löschen</button></section>
  <section class="card"><h3>📖 Hilfe</h3><button class="btn wide" data-go="help">Spielregeln & Bedienung</button></section>
  <p class="muted center small">Darts Arena ${esc(APP_VERSION.version)} · Offline nutzbar · Keine Werbung, kein Konto</p>`;
}

function viewProfiles() {
  const ps = store.profiles();
  const act = store.activeProfileId();
  return `<div class="setup-head"><button class="back" data-go="more">‹</button><div><h2>Profile</h2><small>Das aktive Profil sammelt XP und Erfolge.</small></div></div>
  ${ps.map((p) => `<section class="card prow">${avatar(p, 'lg')}<div class="grow"><b>${esc(p.name)}</b><small>${p.id === act ? '✓ aktiv' : ''}</small></div>
    ${p.id !== act ? `<button class="btn small" data-act="activate" data-id="${p.id}">Aktiv</button>` : ''}
    <button class="icon" data-act="editP" data-id="${p.id}">✎</button>${ps.length > 1 ? `<button class="icon" data-act="delP" data-id="${p.id}">🗑</button>` : ''}</section>`).join('')}
  <div class="row gap"><input id="newName" placeholder="Name für neues Profil" maxlength="20"><button class="btn primary" data-act="newProfile">Anlegen</button></div>`;
}

function editProfile(id) {
  const p = store.profiles().find((x) => x.id === id);
  modal(`<h3>Profil bearbeiten</h3><input id="pName" value="${esc(p.name)}" maxlength="20">
    <div class="pick">${store.EMOJI.map((e) => `<button class="${p.emoji === e ? 'on' : ''}" data-act="pEmoji" data-v="${e}">${e}</button>`).join('')}</div>
    <div class="pick">${store.COLORS.map((c) => `<button class="col ${p.color === c ? 'on' : ''}" style="background:${c}" data-act="pColor" data-v="${c}"></button>`).join('')}</div>
    <button class="btn primary wide" data-act="saveP" data-id="${id}">Speichern</button>`);
  ui.editP = { ...p };
}

async function viewCallerAsync() {
  const keys = await packKeys();
  const el = $('#packInfo');
  if (el) el.innerHTML = keys.length ? `<b>${keys.length}</b> Ansagen geladen: ${keys.sort((a, b) => (isNaN(a) || isNaN(b) ? String(a).localeCompare(b) : a - b)).map((k) => `<span class="pill">${esc(k)}</span>`).join(' ')}` : 'Noch keine eigenen Ansagen.';
}
function viewCaller() {
  setTimeout(viewCallerAsync, 0);
  return `<div class="setup-head"><button class="back" data-go="more">‹</button><div><h2>Caller</h2><small>Wer ruft deine Punkte aus?</small></div></div>
  ${CALLERS.map((c) => `<section class="card prow callerrow ${S.caller === c.id ? 'sel' : ''}" data-act="pickCaller" data-id="${c.id}"><span class="ava">${c.flag}</span><div class="grow"><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></div>
    ${c.id !== 'off' ? `<button class="btn small" data-act="demo" data-id="${c.id}">▶ Probe</button>` : ''}</section>`).join('')}
  <section class="card"><div class="opt"><label>Lautstärke Caller</label><input type="range" min="0.1" max="1" step="0.05" value="${S.callerVolume}" data-range="callerVolume"></div>
    <label class="tog"><div><b>„You require …“ ansagen</b><small>Rest im Checkout-Bereich ansagen</small></div><input type="checkbox" data-set="callRest" ${S.callRest ? 'checked' : ''}><i></i></label>
    <label class="tog"><div><b>Namen ansagen</b></div><input type="checkbox" data-set="callNames" ${S.callNames ? 'checked' : ''}><i></i></label></section>
  <section class="card"><h3>🎙️ Eigenes Sound-Paket</h3>
    <p class="muted small">Nimm eigene Ansagen auf oder lade lizenzierte Caller-Dateien. Dateinamen: <code>180.mp3</code>, <code>60.wav</code>, <code>noscore</code>, <code>gameshot</code>, <code>leg</code>, <code>match</code>, <code>require</code>, <code>gameon</code> … Fehlende Ansagen spricht automatisch The Showman.</p>
    <div id="packInfo" class="packinfo">…</div>
    <div class="row gap"><button class="btn grow" data-act="packImport">📂 Dateien laden</button><button class="btn grow" data-act="packRec">⏺ Aufnehmen</button></div>
    <button class="btn ghost wide danger" data-act="packClear">Sound-Paket löschen</button></section>`;
}

let recState = null;
function recorderModal() {
  modal(`<h3>⏺ Ansage aufnehmen</h3><p class="muted small">Wähle, was du aufnimmst – oder gib eine Zahl (0–180) ein.</p>
    <div class="pick wrap">${PACK_KEYS.map((k) => `<button data-act="recKey" data-k="${k}" class="${recState && recState.key === k ? 'on' : ''}">${k}</button>`).join('')}</div>
    <div class="row gap"><input id="recNum" type="number" min="0" max="180" placeholder="Zahl, z. B. 57"><button class="btn" data-act="recKeyNum">OK</button></div>
    <div class="recbox"><span id="recKeyLbl">${recState && recState.key ? 'Ansage: <b>' + esc(recState.key) + '</b>' : 'Noch nichts gewählt'}</span>
    <button class="btn primary big wide" data-act="recToggle" id="recBtn">${recState && recState.rec ? '⏹ Stopp & speichern' : '⏺ Aufnahme starten'}</button></div>`);
}
async function recToggle() {
  if (!recState || !recState.key) { toast('Bitte zuerst eine Ansage wählen', 'warn'); return; }
  if (recState.rec) { recState.rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      await packSave(recState.key, new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      toast(`Ansage „${esc(recState.key)}“ gespeichert`);
      recState.rec = null;
      recorderModal();
      viewCallerAsync();
    };
    rec.start();
    recState.rec = rec;
    $('#recBtn').textContent = '⏹ Stopp & speichern';
    setTimeout(() => { if (recState && recState.rec === rec) rec.stop(); }, 6000);
  } catch (e) { toast('Kein Zugriff aufs Mikrofon', 'warn'); }
}

function viewHelp() {
  return `<div class="setup-head"><button class="back" data-go="games">‹</button><div><h2>Spielregeln</h2><small>Alle Modi auf einen Blick</small></div></div>
  <section class="card"><h3>So bedienst du Darts Arena</h3><p class="pre">• <b>Summe</b>: Aufnahme als Zahl eintippen (schnellste Eingabe für X01 und Scoring).
• <b>Felder</b>: Single/Double/Triple wählen, dann die Zahl – Dart für Dart, inklusive Trefferbild in der Statistik.
• <b>Scheibe</b>: direkt auf die Dartscheibe tippen (ideal auf Tablets).
• <b>↶ Zurück</b> macht die letzte Eingabe rückgängig – gegen die CPU bis zu deiner letzten Aufnahme.
• Ein laufendes Spiel wird automatisch gespeichert und lässt sich auf der Startseite fortsetzen.</p></section>
  ${GAMES.map((G) => `<section class="card"><h3>${G.meta.icon} ${esc(G.meta.name)}</h3><p class="pre">${esc(RULES[G.meta.id] || G.meta.desc)}</p></section>`).join('')}`;
}

// ================================================================== Klicks
function onClick(e) {
  const goEl = e.target.closest('[data-go]');
  if (goEl) { go(goEl.dataset.go); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const a = el.dataset.act;
  const su = ui.setup;
  sfx.click();
  switch (a) {
    case 'quick': {
      ui.daily = false;
      const su0 = defaultSetup(el.dataset.g, el.dataset.cpu != null ? +el.dataset.cpu : null);
      if (su0.id === 'x01') Object.assign(su0.cfg, { start: 501, in: 'straight', out: 'double', legs: 1, sets: 1 });
      launch(el, () => gameOnIntro(() => startGame(su0)));
      break;
    }
    case 'daily': {
      const ch = dailyChallenge(levelFor(store.progress().xp).level);
      const G = gameById(ch.game);
      const cfg = {};
      G.meta.options.forEach((o) => { cfg[o.key] = ch.cfg[o.key] ?? o.def; });
      const players = [pl(activeProfile())];
      if (ch.cpu) players.push(cpuPlayer(ch.cpu));
      ui.daily = true;
      ui.setup = { id: ch.game, cfg, players };
      gameOnIntro(() => startGame(ui.setup));
      break;
    }
    case 'resume': {
      const r = store.running();
      if (!r) break;
      ui.daily = !!r.daily;
      startGame({ id: r.gameId, cfg: r.cfg, players: r.players }, r);
      break;
    }
    case 'setup': ui.daily = false; ui.setup = defaultSetup(el.dataset.g); launch(el, () => go('setup')); break;
    case 'opt': { const o = gameById(su.id).meta.options.find((x) => x.key === el.dataset.k); su.cfg[o.key] = o.values[+el.dataset.i]; ui.justSel = `[data-act="opt"][data-k="${o.key}"][data-i="${el.dataset.i}"]`; render(); break; }
    case 'addHuman': pickHuman(); break;
    case 'addCpu': pickCpu(); break;
    case 'addProfile': { const p = store.profiles().find((x) => x.id === el.dataset.id); su.players.push(pl(p)); closeModal(); render(); break; }
    case 'addNew': {
      const n = ($('#newName').value || '').trim();
      if (!n) break;
      const ps = store.profiles(); const p = store.newProfile(n, ps.length); ps.push(p); store.saveProfiles(ps);
      su.players.push(pl(p)); closeModal(); render(); break;
    }
    case 'addCpuLvl': su.players.push(cpuPlayer(+el.dataset.l)); ui.justSel = '.prow:last-of-type'; closeModal(); render(); break;
    case 'cpuLvl': { const p = su.players[+el.dataset.i]; const l = Math.max(1, Math.min(10, p.cpu + +el.dataset.d)); Object.assign(p, cpuPlayer(l), { id: p.id }); render(); break; }
    case 'pUp': { const i = +el.dataset.i; [su.players[i - 1], su.players[i]] = [su.players[i], su.players[i - 1]]; render(); break; }
    case 'pDel': su.players.splice(+el.dataset.i, 1); render(); break;
    case 'start': {
      const G = gameById(su.id);
      if (su.players.length < G.meta.min) { toast(`${G.meta.name} braucht mindestens ${G.meta.min} Spieler`, 'warn'); break; }
      gameOnIntro(() => startGame({ id: su.id, cfg: { ...su.cfg }, players: su.players.map((p) => ({ ...p })) }));
      break;
    }
    case 'rules': modal(`<h3>${esc(gameById(el.dataset.g).meta.name)}</h3><p class="pre">${esc(RULES[el.dataset.g] || '')}</p><button class="btn wide" data-act="close">Verstanden</button>`); break;
    case 'close': closeModal(); break;
    case 'leave':
      if (ui.game && !ui.game.s.over) {
        modal(`<h3>Spiel verlassen?</h3><p class="muted">Das Spiel bleibt gespeichert – du kannst es auf der Startseite fortsetzen.</p>
          <div class="row gap"><button class="btn grow" data-act="close">Weiterspielen</button><button class="btn primary grow" data-act="leaveOk">Verlassen</button></div>
          <button class="btn ghost wide danger" data-act="abandon">Spiel abbrechen (nicht speichern)</button>`);
      } else go('home');
      break;
    case 'leaveOk': closeModal(); stopCalls(); go('home'); break;
    case 'abandon': closeModal(); stopCalls(); store.clearRunning(); ui.game = null; go('home'); break;
    case 'mute': S.caller = S.caller === 'off' ? (localStorage.getItem('da.lastCaller') || 'showman') : (localStorage.setItem('da.lastCaller', S.caller), 'off'); saveSettings(); stopCalls(); render(); break;
    case 'inmode': ui.input = el.dataset.m; if (['keypad', 'segments', 'board'].includes(ui.input)) { S.input = ui.input; saveSettings(); } render(); break;
    case 'mult': ui.mult = ui.mult === +el.dataset.m ? 1 : +el.dataset.m; ui.justSel = `[data-act="mult"][data-m="${ui.mult}"]`; render(); break;
    case 'dart': {
      const s = +el.dataset.s;
      const m = el.dataset.m != null ? +el.dataset.m : ui.mult;
      if (s === 25 && m === 3) { toast('Triple-Bull gibt es nicht', 'warn'); break; }
      humanDart(s === 0 ? MISS : dart(s, m));
      break;
    }
    case 'endturn': { const g = ui.game; if (curPlayer().cpu) break; const n = 3 - g.s.turn.length; for (let i = 0; i < n && !g.s.over && !curPlayer().cpu; i++) { const ev = g.throwDart(MISS, pointIn(MISS)); if (ev && ev.type === 'turn') { handleEvent(ev); return; } } render(); break; }
    case 'key': {
      const v = el.dataset.v;
      if (v === 'del') ui.keypad = ui.keypad.slice(0, -1);
      else if (v === 'ok') { keypadOk(+ui.keypad || 0); break; }
      else if (ui.keypad.length < 3) ui.keypad = (ui.keypad + v).replace(/^0+(?=\d)/, '');
      const kd = $('#kd'); if (kd) kd.textContent = ui.keypad || '0';
      buzz(8);
      break;
    }
    case 'qs': keypadOk(+el.dataset.v); break;
    case 'finishDarts': closeModal(); submitVisit(+el.dataset.t, +el.dataset.n); break;
    case 'undo': undo(); break;
    case 'rematch': {
      const e = ui.lastResult.entry;
      const players = ui.setup.players.map((p) => ({ ...p }));
      // Bei Revanche beginnt der Verlierer
      if (players.length === 2 && e.winner === 0) players.reverse();
      gameOnIntro(() => startGame({ id: e.game, cfg: { ...e.cfg }, players }));
      break;
    }
    case 'statsP': ui.statsPid = el.dataset.id; render(); break;
    case 'setv': S[el.dataset.k] = el.dataset.num ? +el.dataset.v : el.dataset.v; saveSettings(); ui.justSel = `[data-act="setv"][data-k="${el.dataset.k}"][data-v="${el.dataset.v}"]`; render(); break;
    case 'pickCaller': if (e.target.closest('[data-act="demo"]')) break; S.caller = el.dataset.id; saveSettings(); ui.justSel = `[data-act="pickCaller"][data-id="${el.dataset.id}"]`; render(); break;
    case 'musicPick': {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'audio/*';
      inp.onchange = async () => {
        const f0 = inp.files[0]; if (!f0) return;
        await musicFileSave(f0);
        S.musicSource = 'own'; S.musicName = f0.name; S.music = true; saveSettings();
        musicWanted(true); toast(`🎵 „${esc(f0.name)}“ läuft jetzt im Menü`); render();
      };
      inp.click();
      break;
    }
    case 'musicDel': await_(musicFileDelete()); S.musicSource = 'builtin'; S.musicName = ''; saveSettings(); render(); break;
    case 'musicSrc': S.musicSource = el.dataset.v; saveSettings(); ui.justSel = `[data-act="musicSrc"][data-v="${el.dataset.v}"]`; render(); break;
    case 'demo': S.caller = el.dataset.id; saveSettings(); demo(el.dataset.id); render(); break;
    case 'packImport': {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = true; inp.accept = 'audio/*';
      inp.onchange = async () => {
        let ok = 0, skip = [];
        for (const f of inp.files) { const k = keyFromFilename(f.name); if (k) { await packSave(k, f); ok++; } else skip.push(f.name); }
        toast(`${ok} Ansagen übernommen${skip.length ? ` · ${skip.length} unbekannte Dateinamen` : ''}`);
        if (ok && S.caller !== 'custom') { S.caller = 'custom'; saveSettings(); render(); }
        viewCallerAsync();
      };
      inp.click();
      break;
    }
    case 'packRec': recState = { key: null, rec: null }; recorderModal(); break;
    case 'recKey': recState.key = el.dataset.k; recorderModal(); break;
    case 'recKeyNum': { const n = +$('#recNum').value; if (n >= 0 && n <= 180 && $('#recNum').value !== '') { recState.key = String(n); recorderModal(); } break; }
    case 'recToggle': recToggle(); break;
    case 'packClear': if (confirm('Alle eigenen Ansagen löschen?')) packClearCalls().then(viewCallerAsync); break;
    case 'activate': store.setActive(el.dataset.id); render(); break;
    case 'editP': editProfile(el.dataset.id); break;
    case 'pEmoji': ui.editP.emoji = el.dataset.v; $$('.pick button', $('#modal')).forEach((b) => b.classList.toggle('on', b.dataset.v === el.dataset.v && b.dataset.act === 'pEmoji' || (b.dataset.act === 'pColor' && b.dataset.v === ui.editP.color))); break;
    case 'pColor': ui.editP.color = el.dataset.v; $$('.pick button', $('#modal')).forEach((b) => b.classList.toggle('on', (b.dataset.act === 'pColor' && b.dataset.v === el.dataset.v) || (b.dataset.act === 'pEmoji' && b.dataset.v === ui.editP.emoji))); break;
    case 'saveP': {
      const ps = store.profiles(); const p = ps.find((x) => x.id === el.dataset.id);
      Object.assign(p, { name: ($('#pName').value || p.name).trim().slice(0, 20), emoji: ui.editP.emoji, color: ui.editP.color });
      store.saveProfiles(ps); closeModal(); render(); break;
    }
    case 'delP': if (confirm('Profil löschen? Der Spielverlauf bleibt erhalten.')) { const ps = store.profiles().filter((x) => x.id !== el.dataset.id); store.saveProfiles(ps); if (store.activeProfileId() === el.dataset.id) store.setActive(ps[0].id); render(); } break;
    case 'newProfile': { const n = ($('#newName').value || '').trim(); if (!n) break; const ps = store.profiles(); ps.push(store.newProfile(n, ps.length)); store.saveProfiles(ps); render(); break; }
    case 'update': {
      const u = updateState();
      if (u.available) { installNow(); toast(u.kind === 'apk' ? 'Update wird geladen …' : 'Neue Version wird geladen …'); } else go('more');
      break;
    }
    case 'checkUpd': checkNow(); break;
    case 'install': if (ui.installEvt) { ui.installEvt.prompt(); ui.installEvt.userChoice.finally(() => { ui.installEvt = null; render(); }); } break;
    case 'export': exportData(); break;
    case 'import': importData(); break;
    case 'wipe': if (confirm('Gesamten Spielverlauf und Statistik löschen? XP und Erfolge bleiben.')) { store.clearHistory(); toast('Spielverlauf gelöscht'); render(); } break;
    default: break;
  }
}

function exportData() {
  const txt = store.exportAll();
  const name = `darts-arena-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  const nb = nativeBridge();
  if (nb && nb.saveFile) { nb.saveFile(name, txt); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importData() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    try { store.importAll(await inp.files[0].text()); S = store.settings(); applySettings(); toast('Sicherung wiederhergestellt'); render(); }
    catch (e) { toast(esc(e.message || 'Datei nicht lesbar'), 'warn'); }
  };
  inp.click();
}

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.set) {
    S[t.dataset.set] = t.checked; saveSettings();
    if (t.dataset.set === 'autoUpdate') setAuto(t.checked);
    if (t.dataset.set === 'music') musicWanted(ui.view !== 'play');
  }
  if (t.dataset.range) { S[t.dataset.range] = +t.value; saveSettings(); if (t.dataset.range === 'sfxVolume') sfx.hit(1); }
});

// Hardware-Tastatur (PC/Tablet): Ziffern + Enter im Summen-Modus, Backspace = Zurück
document.addEventListener('keydown', (e) => {
  if (ui.view !== 'play' || !ui.game || $('#modal').className !== 'hidden' || e.target.tagName === 'INPUT') return;
  if (ui.input === 'keypad' && ui.game.meta.visit && !ui.game.s.turn.length) {
    if (/^\d$/.test(e.key) && ui.keypad.length < 3) { ui.keypad = (ui.keypad + e.key).replace(/^0+(?=\d)/, ''); const kd = $('#kd'); if (kd) kd.textContent = ui.keypad; }
    else if (e.key === 'Backspace') { if (ui.keypad) { ui.keypad = ui.keypad.slice(0, -1); const kd = $('#kd'); if (kd) kd.textContent = ui.keypad || '0'; } else undo(); }
    else if (e.key === 'Enter') keypadOk(+ui.keypad || 0);
  } else if (e.key === 'Backspace') undo();
});

// Android-Zurück-Taste (aus der APK) und Browser-Zurück
window.__dartsBack = () => {
  if ($('#modal').className !== 'hidden') { closeModal(); return true; }
  if (ui.view === 'play') { onClick({ target: Object.assign(document.createElement('button'), { dataset: { act: 'leave' } }) }); return true; }
  if (['setup', 'help'].includes(ui.view)) { go('games'); return true; }
  if (['profiles', 'caller'].includes(ui.view)) { go('more'); return true; }
  if (ui.view !== 'home') { go('home'); return true; }
  return false;
};

// ================================================================== Start
async function boot() {
  shell();
  applySettings();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ui.installEvt = e; if (ui.view === 'more') render(); });
  onUpdate((u) => {
    renderTop();
    if (ui.view === 'more') render();
    if (u.available && !ui.updToasted) { ui.updToasted = true; toast(`⬆️ Neue Version verfügbar – <u data-act="update">jetzt aktualisieren</u>`, 'gold'); }
  });
  onNative((type, d) => { if (type === 'toast') toast(esc(d)); });
  await initUpdates({ auto: S.autoUpdate }).catch(() => {});
  let start = (location.hash || '').slice(1);
  if (!['home', 'games', 'stats', 'awards', 'more'].includes(start)) start = 'home';
  go(start);
  // Bildschirm anlassen (PWA)
  if (S.keepAwake && navigator.wakeLock && !isApk()) {
    const lock = () => navigator.wakeLock.request('screen').catch(() => {});
    lock();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.keepAwake) lock(); });
  }
}
boot();
