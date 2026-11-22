// Darts Arena – Oberfläche (Single-Page-App ohne Framework).
import { boardSvg, markDart, clearMarks, pointIn, throwAt, CPU_LEVELS, label, value, dart, MISS } from './board.js';
import { GAMES, gameById, IMPOSSIBLE } from './games.js';
import { allCallers, deviceVoices, say, stopCalls, demo, setCallerSettings, callerById, packKeys, packSave, packClearCalls, keyFromFilename, musicFileSave, musicFileDelete } from './caller.js';
import { setMusicSettings, musicWanted, musicReload } from './music.js';
import { log, logError, logText, clearLog, entries } from './log.js';
import { sfx, setSfx, buzz, setVibrate, unlockAudio } from './audio.js';
import { store } from './store.js';
import { levelFor, rankFor, ACHIEVEMENTS, statsFor, dailyChallenge, recordGame, streakAlive } from './progress.js';
import { RULES, TIPS } from './rules.js';
import { initUpdates, onUpdate, checkNow, installNow, setAuto, APP_VERSION, updateState } from './update.js';
import { nativeBridge, isApk, onNative } from './native.js';
import { AutoScore, CAL_NAMES } from './cam.js';
import { OnlineSession, seekOpponent, LOBBY_MODES, cleanCode } from './online.js';
import { Presence, myCode, prettyCode, friends, addFriend, removeFriend, cleanFriendCode } from './friends.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 1) => (n || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

let S = store.settings();
const ui = { view: 'home', game: null, gameId: null, setup: null, input: null, mult: 1, keypad: '', cpuTimer: null, busy: false, lastResult: null, statsPid: null, installEvt: null, startedAt: 0, daily: false };

function applySettings() {
  setCallerSettings({ caller: S.caller, volume: S.callerVolume, callNames: S.callNames, callRest: S.callRest, voiceEn: S.voiceEn || '', voiceDe: S.voiceDe || '' });
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
  // Ton freischalten (Browser ohne Berührung): beim ersten Antippen, Wischen oder Tastendruck
  const unlock = () => { unlockAudio(); ui.unlocked = true; musicWanted(ui.view !== 'play'); };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlock, { once: true, capture: true });
  document.addEventListener('pointerdown', ripple);
}

function go(view, opts = {}) {
  if (view === 'profiles' || view === 'caller') { opts.moreTab = view === 'profiles' ? 'profil' : 'caller'; view = 'more'; }
  if (ui.view === 'play' && view !== 'play') { stopCpu(); if (ui.cam) { ui.cam.stop(); } }
  ui.enter = ui.view !== view;
  ui.view = view;
  Object.assign(ui, opts);
  musicWanted(view !== 'play');
  document.body.dataset.view = view;
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.go === view || (view === 'setup' && b.dataset.go === 'games')));
  render();
  window.scrollTo(0, 0);
  if (view !== 'play') history.replaceState(null, '', '#' + view);
  else if (!(history.state && history.state.darts)) history.pushState({ darts: 1 }, '');
}

function render() {
  const v = $('#view');
  const map = { home: viewHome, games: viewGames, setup: viewSetup, play: viewPlay, result: viewResult, stats: viewStats, awards: viewAwards, more: viewMore, help: viewHelp, online: viewOnline };
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
function closeModal() {
  if (ui.cam && ui.cam.calibrating) { ui.cam.endCalibration(); setTimeout(render, 0); }
  if (ui.wiz) { ui.wiz.running = false; if (ui.wiz.abort) ui.wiz.abort.abort(); ui.wiz = null; if (ui.view === 'more') setTimeout(render, 0); }
  const m = $('#modal'); m.className = 'hidden'; m.innerHTML = '';
}

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
  // Schriftgröße an die Textlänge anpassen, damit alles aufs Display passt (kurze Texte wie „180!“ bleiben riesig)
  const len = [...text].length;
  f.style.fontSize = `min(${Math.min(18, 135 / Math.max(1, len)).toFixed(1)}vw, ${len <= 6 ? 7 : 4.6}rem)`;
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
  ${running ? `<div class="card resume" data-act="resume" role="button"><span class="big">▶</span><div class="grow"><b>Spiel fortsetzen</b><small>${esc(gameById(running.gameId)?.meta.name || '')} · ${esc(running.players.map((p) => p.name).join(' vs. '))}</small></div><button class="resume-x" data-act="discardRun" title="Spiel beenden" aria-label="Spiel beenden">✕</button></div>` : ''}
  <button class="card online-cta" data-go="online"><span class="globe">🌐</span><div class="grow"><b>Online spielen</b><small>${friendsOnlineText() || 'Gegen Freunde per Code – oder gegen alle, die gerade spielen'}</small></div><span class="chev">›</span></button>
  <section class="card daily ${done ? 'done' : ''}">
    <div class="row between"><h3>☀️ Tages-Challenge</h3><span class="pill">${done ? '✓ geschafft' : '+' + ch.xp + ' XP'}</span></div>
    <p>${esc(ch.text)}</p>
    ${done ? '<small>Morgen wartet eine neue Aufgabe.</small>' : `<button class="btn primary" data-act="daily">Challenge starten</button>`}
  </section>
  <div class="row between quick-head"><h2 class="h">Schnellstart</h2><button class="btn small ghost" data-act="tilesEdit">✎ Anpassen</button></div>
  <section class="quick">${homeTiles().map((t) => tileHtml(t, lastCpu)).join('')}
    <button class="tile add" data-act="tilesEdit"><span>＋</span><b>Kachel hinzufügen</b><small>Jedes Spiel auf die Startseite</small></button>
  </section>
  <section class="kpis">
    <div><b>${fmt(st.avg)}</b><small>Ø 3-Dart</small></div>
    <div><b>${fmt(st.coPct, 0)}%</b><small>Checkout</small></div>
    <div><b>${st.c180}</b><small>180er</small></div>
    <div><b>${st.games}</b><small>Spiele</small></div>
  </section>
  <section class="card tip"><b>💡 Tipp des Tages</b><p>${esc(tip)}</p></section>`;
}

// ================================================================== Startseiten-Kacheln (frei wählbar)
/** Alle möglichen Kacheln: jedes Spiel, Matchspiele zusätzlich „gegen CPU“. */
function tileDefs() {
  const out = [];
  for (const G of GAMES) {
    const m = G.meta;
    if (m.cat === 'match' && m.id !== 'killer') out.push({ id: m.id + '-cpu', g: m.id, cpu: true, icon: '🤖', name: `${m.name} gegen CPU` });
    out.push({ id: m.id, g: m.id, cpu: false, icon: m.icon, name: m.name });
  }
  return out;
}
const DEFAULT_TILES = ['x01-cpu', 'x01', 'bobs27', 'atc'];
function homeTiles() {
  const defs = tileDefs();
  const ids = Array.isArray(S.homeTiles) ? S.homeTiles : DEFAULT_TILES;
  return ids.map((id) => defs.find((d) => d.id === id)).filter(Boolean);
}
function tileSub(t, lastCpu) {
  const saved = JSON.parse(localStorage.getItem('da.setup.' + t.g) || 'null');
  const cfg = saved && saved.cfg;
  let txt = '';
  if (t.g === 'x01') {
    const c = cfg || { start: 501, in: 'straight', out: 'double', legs: 1 };
    txt = `${c.start} · ${{ double: 'Double-Out', single: 'Single-Out', master: 'Master-Out' }[c.out]}${c.in !== 'straight' ? ' · ' + (c.in === 'double' ? 'Double-In' : 'Master-In') : ''}${c.legs > 1 ? ' · FT' + c.legs : ''}`;
  } else txt = gameById(t.g).meta.cat === 'training' ? 'Training' : 'Match';
  return t.cpu ? `${txt} · CPU ${lastCpu}` : t.g === 'x01' ? `${txt} · Solo & Freunde` : txt;
}
function tileHtml(t, lastCpu) {
  const cls = t.cpu ? 'red' : t.g === 'x01' ? 'green' : '';
  const G = gameById(t.g);
  const title = t.g === 'x01' ? (t.cpu ? 'X01 gegen CPU' : 'X01') : t.name;
  return `<button class="tile ${cls}" data-act="tile" data-id="${t.id}"><span>${t.cpu ? '🤖' : G.meta.icon}</span><b>${esc(title)}</b><small>${esc(tileSub(t, lastCpu))}</small></button>`;
}
function tilesEditor() {
  const sel = homeTiles().map((t) => t.id);
  const defs = tileDefs();
  modal(`<h3>✎ Startseite anpassen</h3><p class="muted small">⭐ = auf der Startseite. Mit ↑ sortieren. Ein Tipp auf eine Kachel öffnet immer erst die Spiel-Einstellungen.</p>
    <div class="tiled">${sel.map((id, i) => { const d = defs.find((x) => x.id === id); return `<div class="trow on"><button class="star on" data-act="tileStar" data-id="${id}">★</button><span class="gi sm">${d.icon}</span><b class="grow">${esc(d.name)}</b><button class="icon" data-act="tileUp" data-id="${id}" ${i === 0 ? 'disabled' : ''}>↑</button></div>`; }).join('')}</div>
    <h3 style="margin-top:14px">Weitere Spiele</h3>
    <div class="tiled">${defs.filter((d) => !sel.includes(d.id)).map((d) => `<div class="trow"><button class="star" data-act="tileStar" data-id="${d.id}">☆</button><span class="gi sm">${d.icon}</span><b class="grow">${esc(d.name)}</b></div>`).join('')}</div>
    <div class="row gap"><button class="btn ghost grow" data-act="tilesReset">Standard</button><button class="btn primary grow" data-act="close">Fertig</button></div>`);
}
function setTiles(ids) { S.homeTiles = ids.slice(0, 12); saveSettings(); }

// ================================================================== Freunde
let presence = null;
function startPresence() {
  if (presence || S.friendsVisible === false) return;
  presence = new Presence(() => ({ name: activeProfile().name, playing: ui.view === 'play' && !!ui.game && !ui.game.s.over }));
  presence.on('status', (code, st) => {
    const el = document.getElementById('fr-' + code);
    if (el) { el.className = 'frdot ' + st; const b = document.getElementById('fri-' + code); if (b) b.disabled = st !== 'online'; const t = document.getElementById('frs-' + code); if (t) t.textContent = FR_TEXT[st] || ''; }
    if (ui.view === 'home') { const h = document.querySelector('.online-cta small'); if (h && friendsOnlineText()) h.textContent = friendsOnlineText(); }
  });
  presence.on('ready', () => { if (ui.view === 'online' || ui.view === 'home') presence.checkAll(); });
  presence.on('friendAdd', (from) => {
    const r = addFriend(from.code, from.name);
    if (r === true) { toast(`⭐ <b>${esc(from.name)}</b> hat dich als Freund hinzugefügt`, 'gold'); sfx.levelUp(); }
    presence.state[from.code] = 'online';
    if (ui.view === 'online') render();
  });
  presence.on('invite', (m, reply) => {
    addFriend(m.from.code, m.from.name);
    sfx.fanfare(); buzz([100, 60, 100]);
    let answered = false;
    const answer = (ok) => { if (answered) return; answered = true; reply(ok); closeModal(); if (ok) onlineJoin(m.room); };
    ui.inviteAnswer = answer;
    modal(`<div class="invite"><div class="radar small"><i></i><i></i><span>🎯</span></div>
      <h3>${esc(m.from.name)} fordert dich heraus!</h3><p>${esc(m.game || 'Darts')} · online</p>
      <div class="row gap"><button class="btn grow" data-act="invNo">Ablehnen</button><button class="btn primary grow big" data-act="invYes">Annehmen 🎯</button></div></div>`);
    setTimeout(() => answer(false), 40000);
  });
  presence.start().catch((e) => logError('Freunde', e));
  setInterval(() => { if (presence && (ui.view === 'online' || ui.view === 'home') && !document.hidden) presence.checkAll(); }, 30000);
}
const FR_TEXT = { online: 'online', playing: 'spielt gerade', offline: 'offline', checking: 'prüfe …' };
function friendsOnlineText() {
  if (!presence) return '';
  const n = friends().filter((f) => presence.state[f.code] === 'online' || presence.state[f.code] === 'playing').length;
  return n ? `🟢 ${n} ${n === 1 ? 'Freund' : 'Freunde'} online` : '';
}

function friendsCard() {
  const list = friends();
  const st = (c) => (presence && presence.state[c]) || (presence ? 'checking' : 'offline');
  return `<section class="card friends"><div class="row between"><h3>⭐ Freunde</h3><button class="btn small ghost" data-act="frRefresh">↻</button></div>
    ${list.length ? list.map((f) => `<div class="prow frow"><span class="frdot ${st(f.code)}" id="fr-${f.code}"></span><div class="grow"><b>${esc(f.name)}</b><small id="frs-${f.code}">${FR_TEXT[st(f.code)] || ''}</small></div>
      <button class="btn small primary" id="fri-${f.code}" data-act="frInvite" data-code="${f.code}" ${st(f.code) === 'online' ? '' : 'disabled'}>🎯 Einladen</button>
      <button class="icon" data-act="frDel" data-code="${f.code}" title="Entfernen">✕</button></div>`).join('')
      : '<p class="muted small">Noch keine Freunde. Teile deinen Freundes-Link (z. B. mit Louis) oder gib seinen Code ein.</p>'}
    <div class="frme"><small>Dein Freundes-Code</small><b>${prettyCode(myCode())}</b><button class="btn small" data-act="frShare">📤 Freundes-Link teilen</button></div>
    <div class="row gap"><input id="frCode" class="codein sm" maxlength="9" placeholder="CODE" autocapitalize="characters" autocomplete="off"><button class="btn" data-act="frAdd">＋ Hinzufügen</button></div>
    ${S.friendsVisible === false ? '<p class="muted small">⚠️ Du bist für Freunde unsichtbar (Mehr → Spiel).</p>' : ''}</section>`;
}

function inviteFriend(code) {
  const f = friends().find((x) => x.code === code);
  if (!f) return;
  modal(`<h3>🎯 ${esc(f.name)} herausfordern</h3><p class="muted small">Welches Spiel?</p>
    <div class="glist">${FRIEND_MODES.map((m) => `<button class="gcard" data-act="frInviteGo" data-code="${code}" data-mode="${m.id}"><span class="gi">${gameById(m.game).meta.icon}</span><div><b>${esc(m.name)}</b></div></button>`).join('')}</div>
    <button class="btn ghost wide" data-act="close">Abbrechen</button>`);
}

async function inviteFriendGo(code, modeId) {
  const f = friends().find((x) => x.code === code);
  const mode = FRIEND_MODES.find((m) => m.id === modeId) || FRIEND_MODES[0];
  closeModal();
  ui.onl = { ...(ui.onl || {}), mode: mode.id };
  const room = await onlineHost();
  if (!room) return;
  onlStatus(`Anfrage an ${f.name} gesendet – warte auf Antwort …`);
  const r = await presence.invite(code, { from: { code: myCode(), name: activeProfile().name }, room, game: mode.name });
  if (!ui.online || ui.online.opp) return; // schon verbunden → läuft
  if (!r.ok) {
    toast(r.why === 'playing' ? `${esc(f.name)} spielt gerade` : r.why === 'offline' ? `${esc(f.name)} ist nicht erreichbar` : `${esc(f.name)} hat abgelehnt`, 'warn');
    onlineCancel();
  } else onlStatus(`${f.name} hat angenommen – verbinde …`);
}

function shareFriendLink() {
  const name = activeProfile().name;
  const url = `https://schnielz87.github.io/Apps---APK---PWA/darts/#friend=${myCode()}&n=${encodeURIComponent(name)}`;
  const text = `🎯 Füge mich in Darts Arena als Freund hinzu, dann können wir online gegeneinander spielen!\n${url}\n(Oder in der App: Online spielen → Freundes-Code ${prettyCode(myCode())} eingeben)`;
  const nb = nativeBridge();
  if (nb && nb.share) { nb.share(text); return; }
  if (navigator.share) { navigator.share({ title: 'Darts Arena', text }).catch(() => {}); return; }
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Freundes-Link kopiert'), () => toast('Dein Code: ' + prettyCode(myCode())));
}

async function addFriendByCode(code, name) {
  code = cleanFriendCode(code);
  if (code.length !== 8) { toast('Der Freundes-Code hat 8 Zeichen', 'warn'); return; }
  if (code === myCode()) { toast('Das ist dein eigener Code 😉', 'warn'); return; }
  const r = addFriend(code, name || 'Freund');
  if (r === 'known') toast('Ist schon in deiner Freundesliste');
  else { toast('⭐ Freund hinzugefügt'); sfx.levelUp(); }
  if (ui.view === 'online') render();
  if (presence) {
    const a = await presence.announceFriend(code, { name: activeProfile().name });
    if (a.reply && a.reply.name) { addFriend(code, a.reply.name); presence.state[code] = 'online'; }
    else presence.state[code] = 'offline';
    if (ui.view === 'online') render();
  }
}

// ================================================================== Online
const FRIEND_MODES = [...LOBBY_MODES, { id: 'elim', name: 'Elimination 301', game: 'elimination', cfg: { target: 301, out: 'single' } }];
const onlineMe = () => { const p = activeProfile(); return { name: p.name, emoji: p.emoji, color: p.color, pid: p.id }; };

function viewOnline() {
  ui.onl = ui.onl || { stage: 'menu', mode: 'x01-501' };
  if (presence && presence.ready && ui.onl.stage === 'menu' && Date.now() - (ui.lastFrCheck || 0) > 10000) { ui.lastFrCheck = Date.now(); setTimeout(() => presence.checkAll(), 50); }
  const o = ui.onl;
  const head = `<div class="setup-head"><button class="back" data-act="onlCancel">‹</button><span class="gi">🌐</span><div><h2>Online spielen</h2><small>Direkt von Handy zu Handy – mit Caller, Statistik & Revanche</small></div></div>`;
  const modeSeg = (list) => `<div class="seg">${list.map((m) => `<button class="${o.mode === m.id ? 'on' : ''}" data-act="onlMode" data-id="${m.id}">${esc(m.name)}</button>`).join('')}</div>`;
  if (o.stage === 'hosting' || o.stage === 'joining') {
    return `${head}<section class="card onl-wait">
      ${o.stage === 'hosting' ? `<small>Dein Raum-Code</small><div class="code">${esc(o.code || '…')}</div>
        <p class="muted small">Schick den Code (oder den Link) an deinen Gegner, z. B. Louis. Er öffnet Darts Arena → Online → Code eingeben.</p>
        <button class="btn primary big wide" data-act="onlInvite" ${o.code ? '' : 'disabled'}>📤 Einladung senden</button>`
        : `<small>Raum</small><div class="code">${esc(o.code || '')}</div>`}
      <div class="radar"><i></i><i></i><i></i><span>${esc(activeProfile().emoji || '🎯')}</span></div>
      <div class="onl-status" id="onlStatus">${esc(o.status || '')}</div>
      <button class="btn ghost wide" data-act="onlCancel">Abbrechen</button></section>`;
  }
  if (o.stage === 'seeking') {
    const m = LOBBY_MODES.find((x) => x.id === o.mode);
    return `${head}<section class="card onl-wait"><small>Suche Gegner für</small><div class="code small">${esc(m ? m.name : '')}</div>
      <div class="radar"><i></i><i></i><i></i><span>🌍</span></div>
      <div class="onl-status" id="onlStatus">${esc(o.status || 'Suche läuft …')}</div>
      <p class="muted small">Sobald jemand mit derselben Spielart sucht, geht es automatisch los. Lass die App dafür geöffnet.</p>
      <button class="btn ghost wide" data-act="onlCancel">Abbrechen</button></section>`;
  }
  return `${head}
  ${friendsCard()}
  <section class="card"><h3>👥 Gegen Freunde</h3><p class="muted small">Raum erstellen und den Code schicken – oder den Code deines Freundes eingeben.</p>
    <div class="opt"><label>Spiel</label>${modeSeg(FRIEND_MODES)}</div>
    <button class="btn primary big wide" data-act="onlHost">➕ Raum erstellen</button>
    <div class="row gap" style="margin-top:12px"><input id="onlCode" class="codein" maxlength="5" placeholder="CODE" autocapitalize="characters" autocomplete="off"><button class="btn big" data-act="onlJoin">Beitreten</button></div></section>
  <section class="card"><h3>🌍 Gegen alle</h3><p class="muted small">Zufälliger Gegner, der gerade dieselbe Spielart sucht.</p>
    <div class="opt">${modeSeg(LOBBY_MODES)}</div>
    <button class="btn big wide" data-act="onlSeek">🔎 Gegner suchen</button></section>
  <p class="muted small center">Online wird nur dein Profilname übertragen. Die Würfe gehen verschlüsselt direkt zwischen den Geräten; für Verbindungsaufbau und Gegnersuche wird der öffentliche Dienst PeerJS genutzt.</p>`;
}

function onlStatus(t) { if (!ui.onl) return; ui.onl.status = t; const el = $('#onlStatus'); if (el) el.textContent = t; }

function wireSession(sess) {
  ui.online = sess;
  ui.onlineLost = false;
  sess.on('status', (t) => onlStatus(t));
  sess.on('peer', (opp) => {
    sfx.levelUp(); buzz(60);
    toast(`🌐 <b>${esc(opp.name)}</b> ist verbunden!`, 'gold');
    if (sess.role === 'host') setTimeout(() => hostStart(), 900);
  });
  sess.on('cfg', (m) => startOnline(m.cfg));
  sess.on('input', (i) => applyRemote(i));
  sess.on('sync', (m) => resyncOnline(m));
  sess.on('lost', () => { ui.onlineLost = true; if (ui.view === 'play') render(); toast('⚠️ Verbindung zum Gegner unterbrochen – verbinde neu …', 'warn'); });
  sess.on('back', () => { ui.onlineLost = false; if (ui.view === 'play') render(); toast('✅ Wieder verbunden'); });
  sess.on('emote', (e) => { bigFlash(e, 'ton'); buzz(30); });
  sess.on('rematch', () => { ui.rematchTheirs = true; if (ui.rematchMine) maybeRematch(); else { toast(`🔁 ${esc(sess.opp ? sess.opp.name : 'Gegner')} will eine Revanche!`, 'gold'); if (ui.view === 'result') render(); } });
  sess.on('bye', () => {
    const n = sess.opp ? sess.opp.name : 'Dein Gegner';
    sess.close(false); ui.online = null;
    if (ui.view === 'play' || ui.view === 'result') modal(`<h3>👋 ${esc(n)} hat das Spiel verlassen</h3><button class="btn primary wide" data-act="onlLeave">OK</button>`);
  });
}

async function onlineHost() {
  const mode = FRIEND_MODES.find((m) => m.id === ui.onl.mode) || FRIEND_MODES[0];
  ui.onl = { ...ui.onl, stage: 'hosting', code: null, status: 'Raum wird erstellt …', modeObj: mode };
  render();
  const sess = new OnlineSession(onlineMe());
  wireSession(sess);
  try {
    const code = await sess.host();
    ui.onl.code = code; ui.onl.status = 'Warte auf Gegner …';
    if (ui.view === 'online') render(); else go('online');
    return code;
  } catch (e) {
    logError('Online', e);
    ui.onl.status = 'Raum konnte nicht erstellt werden – Internet prüfen.';
    if (ui.view === 'online') render();
    return null;
  }
}

async function onlineJoin(code) {
  if (!ui.onl) ui.onl = { stage: 'menu', mode: 'x01-501' };
  ui.onl = { ...ui.onl, stage: 'joining', code, status: 'Verbinde …' };
  if (ui.view !== 'online') go('online'); else render();
  const sess = new OnlineSession(onlineMe());
  wireSession(sess);
  sess.on('notfound', () => { setTimeout(() => { if (ui.online === sess && !sess.opp) { sess.close(false); ui.online = null; ui.onl.stage = 'menu'; toast('Raum nicht gefunden – Code prüfen', 'warn'); if (ui.view === 'online') render(); } }, 300); });
  try { await sess.join(code); } catch (e) { logError('Online', e); onlStatus('Verbindung fehlgeschlagen – Internet prüfen.'); }
}

async function onlineSeek() {
  const mode = LOBBY_MODES.find((m) => m.id === ui.onl.mode) || LOBBY_MODES[0];
  ui.onl = { ...ui.onl, stage: 'seeking', status: 'Suche läuft …', modeObj: mode };
  render();
  const p = seekOpponent(onlineMe(), mode, (info) => onlStatus(info.mine ? 'Du bist im Wartebereich – warte auf Gegner …' : info.waiting ? 'Gegner gefunden – verbinde …' : 'Suche läuft …'));
  ui.seekP = p;
  try {
    const sess = await p;
    if (ui.seekP !== p) return;
    wireSession(sess);
    // „peer“ ist schon passiert → direkt weiter
    toast(`🌐 <b>${esc(sess.opp ? sess.opp.name : 'Gegner')}</b> gefunden!`, 'gold'); sfx.levelUp();
    if (sess.role === 'host') setTimeout(() => hostStart(), 900);
  } catch (e) { logError('Lobby', e); onlStatus('Suche fehlgeschlagen – Internet prüfen.'); }
}

function onlineCancel() {
  if (ui.seekP) { ui.seekP.cancel(); ui.seekP = null; }
  if (ui.online && !ui.game) { ui.online.close(); ui.online = null; }
  if (ui.onl && ui.onl.stage !== 'menu') { ui.onl.stage = 'menu'; if (ui.online) { ui.online.close(); ui.online = null; } render(); }
  else go('home');
}

function onlineInvite() {
  const code = ui.onl && ui.onl.code;
  if (!code) return;
  const url = `https://schnielz87.github.io/Apps---APK---PWA/darts/#join=${code}`;
  const text = `🎯 Lust auf eine Runde Darts? Ich warte in Darts Arena auf dich!\nCode: ${code}\nDirekt beitreten: ${url}\n(Oder in der App: Online spielen → Code eingeben)`;
  const nb = nativeBridge();
  if (nb && nb.share) { nb.share(text); return; }
  if (navigator.share) { navigator.share({ title: 'Darts Arena', text }).catch(() => {}); return; }
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Einladung kopiert – jetzt z. B. in WhatsApp einfügen'), () => toast('Code: ' + code));
}

/** Host legt Spiel und Reihenfolge fest und startet bei beiden. */
function hostStart(order = null) {
  const sess = ui.online;
  if (!sess || !sess.opp) return;
  const mode = (ui.onl && ui.onl.modeObj) || FRIEND_MODES[0];
  const me = onlineMe();
  const pls = [{ pid: me.pid, name: me.name, emoji: me.emoji, color: me.color }, { ...sess.opp }];
  const ord = order || (Math.random() < 0.5 ? pls : pls.reverse());
  const cfg = { game: mode.game, cfg: { ...mode.cfg }, order: ord, round: (ui.onlRound || 0) + 1 };
  sess.start(cfg);
  startOnline(cfg);
}

function onlinePlayers(cfg) {
  const me = onlineMe();
  return cfg.order.map((p) => (p.pid === me.pid
    ? { id: activeProfile().id, name: me.name, emoji: me.emoji, color: me.color, cpu: 0 }
    : { id: 'online-' + p.pid, name: String(p.name).slice(0, 20), emoji: p.emoji || '🎯', color: p.color || '#1e88e5', cpu: 0, remote: true }));
}

function startOnline(cfg) {
  ui.onlRound = cfg.round || 1;
  ui.rematchMine = false; ui.rematchTheirs = false;
  closeModal();
  const setup = { id: cfg.game, cfg: { ...cfg.cfg }, players: onlinePlayers(cfg) };
  gameOnIntro(() => startGame(setup, null, { online: true }));
}

/** Nach Wiederverbindung: Spiel aus den Einstellungen + allen Eingaben neu aufbauen. */
function resyncOnline(m) {
  const setup = { id: m.cfg.game, cfg: { ...m.cfg.cfg }, players: onlinePlayers(m.cfg) };
  const G = gameById(setup.id);
  const g = new G(setup.cfg, setup.players);
  for (const i of m.log) applyToGame(g, i);
  ui.game = g; ui.gameId = setup.id; ui.setup = setup; ui.isOnline = true;
  if (ui.view === 'play') render();
  log('Online', `Abgeglichen (${m.log.length} Eingaben)`);
}

function applyToGame(g, i) {
  if (i.k === 'dart') return g.throwDart(i.d.seg === 0 ? MISS : dart(i.d.seg, i.d.mult), i.pos);
  if (i.k === 'visit') return g.enterVisit(i.total, { darts: i.darts });
  if (i.k === 'undo') { g.undo(); return null; }
  return null;
}

function applyRemote(i) {
  const g = ui.game;
  if (!g || g.s.over || !ui.isOnline) return;
  if (i.k === 'dart') { i.d.seg === 0 ? sfx.miss() : sfx.hit(i.d.mult); buzz(8); }
  const ev = applyToGame(g, i);
  if (i.k === 'undo') { render(); return; }
  if (ev) handleEvent(ev); else render();
}

function maybeRematch() {
  if (!ui.online || !ui.rematchMine || !ui.rematchTheirs) return;
  if (ui.online.role === 'host') {
    // Verlierer beginnt
    const e = ui.lastResult && ui.lastResult.entry;
    const me = onlineMe();
    const opp = ui.online.opp;
    const mine = { pid: me.pid, name: me.name, emoji: me.emoji, color: me.color };
    const iWon = e && e.players[e.winner] && e.players[e.winner].id === activeProfile().id;
    hostStart(iWon ? [opp, mine] : [mine, opp]);
  }
}

function leaveOnline() {
  if (ui.online) { ui.online.close(); ui.online = null; }
  if (ui.seekP) { ui.seekP.cancel(); ui.seekP = null; }
  ui.isOnline = false; ui.game = null;
  stopCalls();
  ui.onl = { stage: 'menu', mode: (ui.onl && ui.onl.mode) || 'x01-501' };
  go('online');
}

// ================================================================== Spieleliste
function viewGames() {
  const pinned = new Set(homeTiles().map((t) => t.id));
  const card = (G) => `<div class="gcard-wrap"><button class="gcard" data-act="setup" data-g="${G.meta.id}"><span class="gi">${G.meta.icon}</span><div><b>${esc(G.meta.name)}</b><small>${esc(G.meta.desc)}</small></div></button><button class="info-btn in-card" data-act="rules" data-g="${G.meta.id}" title="Spielregeln">i</button><button class="pin ${pinned.has(G.meta.id) ? 'on' : ''}" data-act="pin" data-id="${G.meta.id}" title="Auf die Startseite">${pinned.has(G.meta.id) ? '★' : '☆'}</button></div>`;
  return `<h2 class="h">Matchspiele</h2><div class="glist">${GAMES.filter((g) => g.meta.cat === 'match').map(card).join('')}</div>
  <h2 class="h">Training</h2><div class="glist">${GAMES.filter((g) => g.meta.cat === 'training').map(card).join('')}</div>
  `;
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
const cpuPlayer = (lvl) => ({ id: 'cpu' + lvl + '-' + Math.random().toString(36).slice(2, 5), name: CPU_LEVELS[lvl].name, cpu: lvl, color: '#78909c', emoji: '🤖' });

function viewSetup() {
  const su = ui.setup;
  const G = gameById(su.id);
  const opts = G.meta.options.map((o) => `
    <div class="opt"><label>${esc(o.label)}</label><div class="seg">${o.values.map((v, i) => `<button class="${su.cfg[o.key] === v ? 'on' : ''}" data-act="opt" data-k="${o.key}" data-i="${i}">${esc(o.names ? o.names[i] : v)}</button>`).join('')}</div></div>`).join('');
  const plist = su.players.map((p, i) => `
    <div class="prow ${p.cpu ? 'cpu' : ''}">${avatar(p)}<div class="grow"><b>${p.cpu ? '🤖 ' + esc(CPU_LEVELS[p.cpu].name) : esc(p.name)}</b>${p.cpu ? `<small>CPU · Stufe ${p.cpu} · Ø ca. ${CPU_LEVELS[p.cpu].avg}</small>` : '<small>Mensch</small>'}</div>
      <button class="icon" data-act="pUp" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon" data-act="pDel" data-i="${i}" ${su.players.length <= 1 ? 'disabled' : ''}>✕</button>
      ${p.cpu ? `<div class="cpulvl"><button class="icon" data-act="cpuLvl" data-i="${i}" data-d="-1">−</button><input type="range" min="1" max="10" step="1" value="${p.cpu}" data-cpulvl="${i}"><button class="icon" data-act="cpuLvl" data-i="${i}" data-d="1">+</button></div>` : ''}</div>`).join('');
  return `
  <div class="setup-head"><button class="back" data-go="${ui.setupMode ? 'home' : 'games'}">‹</button><span class="gi">${ui.setupMode === 'cpu' ? '🤖' : G.meta.icon}</span><div><h2>${esc(G.meta.name)}${ui.setupMode === 'cpu' ? ' gegen CPU' : ui.setupMode === 'human' ? ' – Solo & Freunde' : ''}</h2><small>${ui.setupMode === 'cpu' ? 'Wähle die Stärke deines Gegners und die Spielregeln.' : ui.setupMode === 'human' ? 'Allein trainieren oder mit Freunden am selben Gerät spielen.' : esc(G.meta.desc)}</small></div><button class="info-btn" data-act="rules" data-g="${G.meta.id}" title="Spielregeln">i</button></div>
  ${ui.daily ? '<div class="pill gold block">☀️ Tages-Challenge</div>' : ''}
  <section class="card"><div class="row between"><h3>${ui.setupMode === 'cpu' ? 'Du & dein Gegner' : 'Spieler'}</h3><small>${su.players.length}/${G.meta.max}</small></div>${plist}
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
function startGame(setup, resume = null, opts = {}) {
  const G = gameById(setup.id);
  ui.isOnline = !!opts.online;
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
  if (!ui.isOnline) localStorage.setItem('da.setup.' + setup.id, JSON.stringify({ cfg: setup.cfg, players: setup.players }));
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
  if (ui.isOnline) return; // Online-Spiele werden nicht lokal fortgesetzt
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
  const isCpu = !g.s.over && (!!curPlayer().cpu || !!curPlayer().remote);
  const canKeypad = !!G.meta.visit;
  return `
  <div class="playbar"><button class="back" data-act="leave">‹</button><b>${G.meta.icon} ${esc(G.meta.name)}${g.cfg.start ? ' ' + g.cfg.start : ''}${ui.isOnline ? ` <span class="onl ${ui.onlineLost ? 'bad' : 'ok'}" title="Online">🌐 ${ui.onlineLost ? 'getrennt' : 'online'}</span>` : ''}</b>
    <div class="row"><button class="icon" data-act="mute" title="Caller">${S.caller === 'off' ? '🔇' : '🔊'}</button><button class="info-btn" data-act="rules" data-g="${G.meta.id}" title="Spielregeln">i</button></div></div>
  <div class="panels ${many ? 'many' : ''}">${panels}</div>
  <div class="hint">${esc(hint) || '&nbsp;'}</div>
  <div class="turnrow"><div class="slots">${slots}</div><div class="tsum">${turn.length ? turnSum : ''}</div>
    <button class="btn small" data-act="undo" ${g.canUndo() ? '' : 'disabled'}>↶ Zurück</button></div>
  ${isCpu ? `<div class="cpuzone"><div class="cpuboard">${boardSvg({ id: 'cpuBoard' })}</div><div class="cpulabel">${curPlayer().remote ? '🌐' : '🤖'} ${esc(curPlayer().name)} wirft …${curPlayer().remote && g.s.turn.length ? ` <b>${g.s.turn.map(label).join(' · ')}</b>` : ''}</div></div>` : inputArea(canKeypad)}`;
}

function inputArea(canKeypad) {
  const modes = [['segments', '🔢 Felder'], canKeypad && ['keypad', '⌨️ Summe'], ['board', '🎯 Scheibe'], S.autoscore && ['camera', '📷 Kamera']].filter(Boolean);
  let mode = ui.input;
  if (mode === 'camera' && !S.autoscore) mode = 'segments';
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
  if (mode === 'camera') {
    return `${tabs}<div id="camSlot" class="camslot"></div>
      <div class="camstatus" id="camStatus">${esc(ui.camStatus || 'Kamera startet …')}</div>
      <div class="row gap"><button class="btn grow small" data-act="camCal">🎯 Kalibrieren</button><button class="btn grow small" data-act="camRelearn">↻ Neu einlernen</button><button class="btn small" data-act="dart" data-s="0" data-m="0">Miss</button></div>
      <p class="muted small center">Falsch erkannt? „↶ Zurück“ und per „Felder“ eingeben. Daneben-Würfe mit „Miss“ eintragen.</p>`;
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

function camera() {
  if (!ui.cam) {
    ui.cam = new AutoScore({
      onDart: (d, pos) => {
        if (ui.view !== 'play' || ui.input !== 'camera' || !ui.game || curPlayer().cpu || ui.game.s.over) return;
        toast(`📷 ${label(d)} erkannt`);
        humanDart(d, pos);
      },
      onStatus: (t) => { ui.camStatus = t; const el = $('#camStatus'); if (el) el.textContent = t; },
    });
  }
  return ui.cam;
}

function afterPlayRender() {
  // Darts des Online-Gegners auf seiner Scheibe zeigen
  const rb = $('#cpuBoard');
  if (rb && ui.game && curPlayer().remote) ui.game.s.turn.forEach((t) => { if (t.pos) markDart(rb, t.pos.x, t.pos.y, 'cpu'); });
  const slot = $('#camSlot');
  if (slot) {
    const c = camera();
    c.paused = false;
    c.attach(slot);
    c.start().then((ok) => { if (ok && !c.calibrated) calibrateCam(); });
  } else if (ui.cam) ui.cam.paused = true;
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

function calibrateCam() {
  const c = camera();
  modal(`<h3>🎯 Kamera kalibrieren</h3>
    <p class="muted small">Handy fest aufs Stativ (gern seitlich neben dem Board), ganze Scheibe im Bild, gutes Licht. Die App sucht die Scheibe automatisch und legt das Gitter darauf.</p>
    <div id="calSlot" class="calslot"></div>
    <div class="calstat" id="calStat">🔍 Suche Dartscheibe …</div>
    <div class="row gap center calrow"><button class="btn" data-act="camRot" data-d="-4" title="Gitter nach links drehen">↺</button><button class="btn grow" data-act="camDetect">🔍 Automatisch erkennen</button><button class="btn" data-act="camRot" data-d="4" title="Gitter nach rechts drehen">↻</button></div>
    <details class="calmanual"><summary>Von Hand anpassen</summary><p class="muted small">Ins Gitter tippen und ziehen = ganzes Gitter verschieben. Die 4 roten Punkte auf den <b>äußeren Rand des Doppelrings</b> ziehen: ${CAL_NAMES.map((n, i) => `${i + 1} = ${n}`).join(', ')}.</p>
      <button class="btn small" data-act="camCircle">⭕ Gitter zurücksetzen</button></details>
    <button class="btn primary big wide" data-act="camCalDone">✓ Kalibrieren & fertig</button>`, 'wide');
  c.attach($('#calSlot'));
  c.start().then(() => { c.startCalibration(); setTimeout(() => { c.drawOverlay(); runDetect(); }, 700); });
}

async function runDetect() {
  const c = ui.cam;
  const st = $('#calStat');
  if (!c || !st) return;
  st.className = 'calstat'; st.textContent = '🔍 Suche Dartscheibe …';
  const e = await c.autoDetect();
  const st2 = $('#calStat');
  if (!st2) return;
  if (e) { st2.className = 'calstat ok'; st2.innerHTML = '✅ Scheibe erkannt! Liegt das Gitter auf den Ringen und ist die <b>20 oben</b>? Sonst mit ↺ / ↻ drehen. Dann „Kalibrieren & fertig“.'; sfx.levelUp(); buzz(40); }
  else { st2.className = 'calstat warn'; st2.innerHTML = '⚠️ Keine Scheibe erkannt. Tipps: näher ran, mehr Licht, ganze Scheibe ins Bild – dann erneut „Automatisch erkennen“. Oder unten „Von Hand anpassen“.'; }
}

/** Eigener Dart: anwenden und (online) an den Gegner schicken. */
function localThrow(d, pos) {
  const ev = ui.game.throwDart(d, pos);
  if (ui.isOnline && ui.online) ui.online.input({ k: 'dart', d: { seg: d.seg, mult: d.mult }, pos: pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : null });
  return ev;
}

function humanDart(d, pos = null) {
  const g = ui.game;
  if (!g || g.s.over || curPlayer().cpu || curPlayer().remote || ui.busy) return;
  buzz(12);
  d.seg === 0 ? sfx.miss() : sfx.hit(d.mult);
  const ev = localThrow(d, pos || pointIn(d));
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
    if (ev.elim) { sfx.bust(); buzz(80); bigFlash('💥 ELIMINIERT!', 'bust'); }
    if (ev.text && !ev.bust) toast(esc(ev.text));
    say(ev.call, { name: p.name });
    if (ev.require && S.callRest && !g.s.over) say({ require: ev.require.rest }, { name: g.players[ev.require.player].name });
    if (ui.cam && ui.input === 'camera' && !p.cpu && ev.darts && ev.darts.length) ui.cam.expectPull();
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
  if (curPlayer().remote) return;
  const ev = ui.game.enterVisit(total, { darts });
  if (ui.isOnline && ui.online && ev && ev.type !== 'invalid') ui.online.input({ k: 'visit', total, darts });
  handleEvent(ev);
}

function undo() {
  const g = ui.game;
  stopCpu();
  ui.busy = false;
  if (!g.canUndo()) return;
  if (ui.isOnline) {
    // online nur innerhalb der eigenen, laufenden Aufnahme
    if (curPlayer().remote || !g.s.turn.length) { toast('Online kannst du nur Darts deiner laufenden Aufnahme zurücknehmen', 'warn'); return; }
    g.undo();
    if (ui.online) ui.online.input({ k: 'undo' });
    render();
    return;
  }
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
  ${ui.isOnline ? `<div class="row gap"><button class="btn primary big grow" data-act="onlRematch" ${ui.online ? '' : 'disabled'}>🔁 Revanche${ui.rematchTheirs ? ' (Gegner wartet!)' : ''}</button><button class="btn big grow" data-act="onlLeave">🌐 Online-Menü</button></div>`
    : `<div class="row gap"><button class="btn primary big grow" data-act="rematch">🔁 Revanche</button><button class="btn big grow" data-act="setup" data-g="${entry.game}">⚙️ Ändern</button></div>`}
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

// ================================================================== Mehr / Einstellungen (Registerkarten)
const MORE_TABS = [
  { id: 'profil', icon: '👤', label: 'Profil' },
  { id: 'caller', icon: '🎙️', label: 'Caller' },
  { id: 'sound', icon: '🎵', label: 'Sound' },
  { id: 'spiel', icon: '🎮', label: 'Spiel' },
  { id: 'system', icon: '⚙️', label: 'System' },
];
const tog = (k, l, d = '') => `<label class="tog"><div><b>${l}</b>${d ? `<small>${d}</small>` : ''}</div><input type="checkbox" data-set="${k}" ${S[k] ? 'checked' : ''}><i></i></label>`;

function viewMore() {
  const tab = ui.moreTab || 'profil';
  const body = { profil: tabProfil, caller: tabCaller, sound: tabSound, spiel: tabSpiel, system: tabSystem }[tab]();
  return `<div class="mtabs" style="--n:${MORE_TABS.length};--i:${MORE_TABS.findIndex((t) => t.id === tab)}">${MORE_TABS.map((t) => `<button class="${t.id === tab ? 'on' : ''}" data-act="mtab" data-t="${t.id}"><span>${t.icon}</span><small>${t.label}</small></button>`).join('')}<i class="mtab-ink"></i></div>
  <div class="mbody ${ui.tabAnim || ''}">${body}</div>`;
}

function tabProfil() {
  const ps = store.profiles();
  const act = store.activeProfileId();
  return `<section class="card"><h3>👥 Spieler-Profile</h3><p class="muted small">Das aktive Profil sammelt XP, Erfolge und die Tages-Serie.</p>
  ${ps.map((p) => `<div class="prow line">${avatar(p, 'lg')}<div class="grow"><b>${esc(p.name)}</b><small>${p.id === act ? '✓ aktiv' : ''}</small></div>
    ${p.id !== act ? `<button class="btn small" data-act="activate" data-id="${p.id}">Aktiv</button>` : ''}
    <button class="icon" data-act="editP" data-id="${p.id}">✎</button>${ps.length > 1 ? `<button class="icon" data-act="delP" data-id="${p.id}">🗑</button>` : ''}</div>`).join('')}
  <div class="row gap" style="margin-top:10px"><input id="newName" placeholder="Name für neues Profil" maxlength="20"><button class="btn primary" data-act="newProfile">Anlegen</button></div></section>`;
}

function tabCaller() {
  setTimeout(viewCallerAsync, 0);
  const list = allCallers();
  return `<section class="card"><h3>Wer ruft deine Punkte aus?</h3>
  ${list.map((c) => `<div class="prow callerrow ${S.caller === c.id ? 'sel' : ''}" data-act="pickCaller" data-id="${c.id}"><span class="ava">${c.flag}</span><div class="grow"><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></div>
    ${c.id !== 'off' ? `<button class="btn small" data-act="demo" data-id="${c.id}">▶</button>` : ''}
    ${c.own ? `<button class="icon" data-act="voiceEdit" data-id="${c.voiceId}" title="Weiter einsprechen">🎙️</button><button class="icon" data-act="voiceDel" data-id="${c.voiceId}">🗑</button>` : ''}</div>`).join('')}</section>
  <section class="card voicecta"><h3>🎤 Eigene Stimme einsprechen</h3>
    <p class="muted small">Die App sagt dir jede Ansage vor, nimmt automatisch auf, schneidet zu und geht zur nächsten. Zahlen setzt sie aus Bausteinen zusammen – rund 40 kurze Aufnahmen (ca. 5 Minuten) reichen für alle Werte von 1 bis 180.</p>
    <button class="btn primary wide" data-act="voiceNew">＋ Neue Stimme aufnehmen</button></section>
  <section class="card"><h3>🗣️ Stimme des Geräts</h3>
    <p class="muted small">Welche Männerstimme deines Handys The Showman, Der Kommentator usw. benutzen. „Automatisch“ sucht eine Männerstimme. Mit ▶ probehören.</p>
    ${voicePicker('en', 'voiceEn', '🇬🇧 Englische Caller')}
    ${voicePicker('de', 'voiceDe', '🇩🇪 Deutsche Caller')}</section>
  <section class="card"><div class="opt"><label>Lautstärke Caller</label><input type="range" min="0.1" max="1" step="0.05" value="${S.callerVolume}" data-range="callerVolume"></div>
    ${tog('callRest', '„You require …“ ansagen', 'Rest im Checkout-Bereich ansagen')}
    ${tog('callNames', 'Namen ansagen')}</section>
  <section class="card"><h3>📂 Sound-Paket aus Dateien</h3>
    <p class="muted small">Lizenzierte Caller-Dateien laden. Dateinamen: <code>180.mp3</code>, <code>60.wav</code>, <code>noscore</code>, <code>gameshot</code>, <code>leg</code>, <code>match</code>, <code>require</code>, <code>gameon</code> … Danach Caller „Eigenes Sound-Paket“ wählen.</p>
    <div id="packInfo" class="packinfo">…</div>
    <div class="row gap"><button class="btn grow" data-act="packImport">📂 Dateien laden</button><button class="btn ghost danger" data-act="packClear">Löschen</button></div></section>`;
}

function voicePicker(lang2, key, label) {
  const list = deviceVoices(lang2).filter((v) => !v.female);
  list.sort((a, b) => (b.male - a.male) || a.name.localeCompare(b.name));
  return `<div class="opt"><label>${label}</label><div class="row gap"><select class="grow sel" data-select="${key}">
    <option value="">Automatisch (Männerstimme)</option>
    ${list.map((v) => `<option value="${esc(v.name)}" ${S[key] === v.name ? 'selected' : ''}>${v.male ? '♂ ' : ''}${esc(v.name)} (${esc(v.locale)})</option>`).join('')}
  </select><button class="btn small" data-act="demo" data-id="${lang2 === 'en' ? 'showman' : 'kommentator'}">▶</button></div>
  ${list.length ? '' : '<small class="muted">Keine Stimmen gefunden – ggf. in den Android-Einstellungen unter „Sprachausgabe“ Sprachdaten laden.</small>'}</div>`;
}

function tabSound() {
  return `<section class="card"><h3>🎵 Menü-Musik</h3>
    ${tog('music', 'Musik in den Menüs', 'Läuft leise bei der Spielauswahl, pausiert während des Spiels')}
    <div class="opt"><label>Lautstärke Musik</label><input type="range" min="0.05" max="1" step="0.05" value="${S.musicVolume}" data-range="musicVolume"></div>
    <div class="opt"><label>Quelle</label><div class="seg"><button class="${S.musicSource !== 'own' ? 'on' : ''}" data-act="musicSrc" data-v="builtin">Arena-Loop</button><button class="${S.musicSource === 'own' ? 'on' : ''}" data-act="musicSrc" data-v="own" ${S.musicName ? '' : 'disabled'}>${S.musicName ? esc(S.musicName.replace(/\.[^.]+$/, '').slice(0, 24)) : 'Eigener Song'}</button></div></div>
    <div class="row gap"><button class="btn grow" data-act="musicPick">📂 Eigenen Song wählen</button>${S.musicName ? '<button class="btn" data-act="musicDel">🗑</button>' : ''}</div>
    <p class="muted small">Dein Lieblingssong als MP3 vom Gerät – er bleibt nur auf diesem Gerät gespeichert.</p></section>
  <section class="card"><h3>🔈 Effekte</h3>
    ${tog('sfx', 'Soundeffekte', 'Treffer, Bust, Fanfare bei 180')}
    <div class="opt"><label>Lautstärke Effekte</label><input type="range" min="0" max="1" step="0.05" value="${S.sfxVolume}" data-range="sfxVolume"></div>
    ${tog('vibrate', 'Vibration')}</section>`;
}

function tabSpiel() {
  return `<section class="card"><h3>🎯 Eingabe</h3>
    <div class="opt"><label>Standard-Eingabe</label><div class="seg">${[['segments', 'Felder'], ['keypad', 'Summe'], ['board', 'Scheibe']].concat(S.autoscore ? [['camera', 'Kamera']] : []).map(([v, l]) => `<button class="${S.input === v ? 'on' : ''}" data-act="setv" data-k="input" data-v="${v}">${l}</button>`).join('')}</div></div>
    ${tog('showHints', 'Checkout-Wege & Ziele anzeigen')}
    ${tog('keepAwake', 'Bildschirm anlassen', 'Während der App-Nutzung nicht ausschalten')}</section>
  <section class="card"><h3>⭐ Freunde</h3>
    ${tog('friendsVisible', 'Für Freunde online sichtbar', 'Freunde sehen, wenn du die App offen hast, und können dich zu einem Spiel einladen.')}</section>
  <section class="card"><h3>🤖 CPU</h3>
    <div class="opt"><label>CPU-Tempo</label><div class="seg">${['Gemütlich', 'Normal', 'Schnell'].map((l, i) => `<button class="${S.cpuSpeed === i ? 'on' : ''}" data-act="setv" data-k="cpuSpeed" data-v="${i}" data-num="1">${l}</button>`).join('')}</div></div></section>
  <section class="card"><h3>📷 Kamera-Autoscore <span class="pill gold">Beta</span></h3>
    ${tog('autoscore', 'Darts automatisch erkennen', 'Handy auf Stativ vor der Scheibe. Im Spiel Eingabe „📷 Kamera“ wählen und einmal kalibrieren.')}</section>
  <section class="card"><h3>📖 Hilfe</h3><button class="btn wide" data-go="help">Bedienung & alle Spielregeln</button></section>`;
}

function tabSystem() {
  const u = updateState();
  const kind = u.kind === 'apk' ? 'Android-App (APK)' : u.kind === 'play' ? 'Google Play' : 'Web-App (PWA)';
  return `<section class="card"><h3>⬆️ Updates</h3>
    <div class="row between line"><span>Version</span><b>${esc(APP_VERSION.version)}</b></div>
    <div class="row between line"><span>Variante</span><b>${kind}</b></div>
    ${u.kind === 'play' ? '<p class="muted small">Updates kommen über Google Play.</p>' : `
    ${tog('autoUpdate', 'Automatisch nach Updates suchen', u.kind === 'apk' ? 'Alle 24 Stunden' : 'Bei jedem Start und alle 24 Stunden')}
    ${u.available ? `<button class="btn primary wide" data-act="update">⬆ ${u.kind === 'apk' ? 'Version ' + esc(u.available.tag) + ' installieren' : 'Neue Version laden'}</button>` : `<button class="btn wide" data-act="checkUpd" ${u.checking ? 'disabled' : ''}>${u.checking ? 'Suche …' : 'Nach Updates suchen'}</button>`}
    ${u.progress != null ? `<div class="xpbar"><i style="width:${Math.round(u.progress * 100)}%"></i></div>` : ''}
    ${u.status ? `<p class="muted small">${esc(u.status)}</p>` : ''}`}
    ${!isApk() && ui.installEvt ? '<button class="btn primary wide" data-act="install">📲 Als App installieren</button>' : ''}</section>
  <section class="card"><h3>💾 Daten</h3><p class="muted small">Alles bleibt nur auf diesem Gerät. Sichere es, um es auf ein anderes Gerät mitzunehmen.</p>
    <div class="row gap"><button class="btn grow" data-act="export">Sichern</button><button class="btn grow" data-act="import">Wiederherstellen</button></div>
    <button class="btn ghost wide danger" data-act="wipe">Spielverlauf löschen</button></section>
  <section class="card"><h3>🧾 Fehlerprotokoll</h3><p class="muted small">Zeichnet Fehler und wichtige Ereignisse auf (Musik, Caller, Kamera, Updates) – nur auf diesem Gerät. Bei Problemen „Teilen“ und an den Entwickler schicken.</p>
    <div class="row gap"><button class="btn grow" data-act="logShow">Anzeigen (${entries().length})</button><button class="btn grow" data-act="logShare">Teilen / Speichern</button></div></section>
  <p class="muted center small">Darts Arena ${esc(APP_VERSION.version)} · Offline nutzbar · Keine Werbung, kein Konto</p>`;
}

function fullLog() {
  const head = `Darts Arena ${APP_VERSION.version} (${updateState().kind}) · ${new Date().toLocaleString('de-DE')}\n${navigator.userAgent}\nCaller: ${S.caller} · Musik: ${S.music ? S.musicSource : 'aus'}${S.musicName ? ' (' + S.musicName + ')' : ''} · Eingabe: ${S.input}`;
  return logText(head);
}
function showLog() {
  const es = entries().slice(-150).reverse();
  modal(`<h3>🧾 Fehlerprotokoll</h3>
    <div class="logbox">${es.map((e) => `<div class="${e.l === 'error' ? 'e' : e.l === 'warn' ? 'w' : 'i'}">${new Date(e.t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${esc(e.a)}: ${esc(e.m)}${e.n > 1 ? ` (×${e.n})` : ''}</div>`).join('') || '<div class="i">Noch keine Einträge – alles läuft rund.</div>'}</div>
    <div class="row gap" style="margin-top:10px"><button class="btn grow" data-act="logCopy">Kopieren</button><button class="btn grow" data-act="logShare">Teilen</button><button class="btn ghost danger" data-act="logClear">Leeren</button></div>
    <button class="btn ghost wide" data-act="close">Schließen</button>`);
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
  if (el) el.innerHTML = keys.length ? `<b>${keys.length}</b> Dateien: ${keys.sort((a, b) => (isNaN(a) || isNaN(b) ? String(a).localeCompare(b) : a - b)).map((k) => `<span class="pill">${esc(k)}</span>`).join(' ')}` : 'Noch keine Dateien geladen.';
}

// ------------------------------------------------------------------ Stimme einsprechen (Assistent)
function newVoiceModal() {
  modal(`<h3>🎤 Neue Stimme</h3>
    <div class="opt"><label>Name des Callers</label><input id="vName" maxlength="24" placeholder="z. B. Papa, The Voice, Kalle" value="Meine Stimme"></div>
    <div class="opt"><label>Sprache der Ansagen</label><div class="seg" id="vLang"><button class="on" data-act="vLang" data-v="de-DE">🇩🇪 Deutsch</button><button data-act="vLang" data-v="en-GB">🇬🇧 Englisch</button></div></div>
    <div class="opt"><label>Umfang</label><div class="seg" id="vLevel"><button class="on" data-act="vLevel" data-v="basis">Basis (~40, alle Zahlen)</button><button data-act="vLevel" data-v="profi">Komplett (~55, natürlicher)</button></div></div>
    <p class="muted small">Tipp: Ruhiger Raum, Handy ca. 20 cm vor den Mund, mit Show sprechen – wie im Ally Pally!</p>
    <button class="btn primary big wide" data-act="voiceCreate">Los geht's 🎙️</button>`);
  ui.vNew = { lang: 'de-DE', level: 'basis' };
}

async function openWizard(voiceId, level = 'profi') {
  const V = await import('./voice.js');
  const v = V.voiceById(voiceId);
  if (!v) return;
  const list = V.prompts(v.lang).filter((p) => level === 'profi' || p.level === 'basis');
  const done = await V.recordedKeys(voiceId);
  const idx = Math.max(0, list.findIndex((p) => !done.has(p.key)));
  ui.wiz = { V, voiceId, name: v.name, list, idx, done, running: false, state: 'idle', level: 0 };
  drawWizard();
}

function drawWizard() {
  const w = ui.wiz;
  if (!w) return;
  const p = w.list[w.idx];
  const n = w.list.filter((x) => w.done.has(x.key)).length;
  const finished = n === w.list.length;
  const st = { idle: 'Bereit', listen: '🔴 Sprich jetzt!', save: '✓ Gespeichert', play: '🔊 Wiedergabe …', silent: 'Nichts gehört – nochmal', err: 'Kein Mikrofon-Zugriff' }[w.state] || '';
  modal(`<div class="wiz">
    <div class="row between"><h3>🎤 ${esc(w.name)}</h3><span class="pill">${n} / ${w.list.length}</span></div>
    <div class="xpbar"><i style="width:${(n / w.list.length) * 100}%"></i></div>
    ${finished && !w.running ? `<div class="wiz-done"><div class="trophy">🏆</div><b>Alles eingesprochen!</b><p class="muted small">Deine Stimme ist als Caller ausgewählt. Einzelne Ansagen kannst du unten antippen und neu aufnehmen.</p></div>` : `
    <div class="wiz-say ${w.state === 'listen' ? 'live' : ''}"><small>Sag:</small><div class="wiz-text">„${esc(p.say)}“</div>${p.hint ? `<small class="muted">${esc(p.hint)}</small>` : ''}</div>
    <div class="meter"><i id="wizMeter" style="width:${w.level * 100}%"></i></div>
    <div class="wiz-state">${st}</div>`}
    <div class="row gap center">${w.running
      ? '<button class="btn big grow" data-act="wizPause">⏸ Pause</button>'
      : `<button class="btn primary big grow" data-act="wizStart">${finished ? '⏺ Nochmal aufnehmen' : n ? '⏺ Weiter aufnehmen' : '⏺ Automatisch aufnehmen'}</button>`}
      <button class="btn big" data-act="wizPlay" ${w.done.has(p.key) ? '' : 'disabled'}>▶</button>
      <button class="btn big" data-act="wizSkip">⏭</button></div>
    <div class="wiz-chips">${w.list.map((x, i) => `<button class="${w.done.has(x.key) ? 'ok' : ''} ${i === w.idx ? 'cur' : ''}" data-act="wizGo" data-i="${i}">${esc(x.key === 'hundred' ? (x.say) : x.key)}</button>`).join('')}</div>
    <button class="btn ghost wide" data-act="wizClose">Fertig</button></div>`, 'wide');
}

async function wizardLoop() {
  const w = ui.wiz;
  if (!w || w.running) return;
  w.running = true;
  w.abort = new AbortController();
  while (ui.wiz === w && w.running && w.idx < w.list.length) {
    const p = w.list[w.idx];
    w.state = 'idle'; drawWizard();
    await new Promise((r) => setTimeout(r, 650));
    if (!w.running) break;
    sfx.beep();
    await new Promise((r) => setTimeout(r, 180));
    w.state = 'listen'; drawWizard();
    let clip = null;
    try {
      clip = await w.V.recordClip({ signal: w.abort.signal, onLevel: (l) => { w.level = l; const m = $('#wizMeter'); if (m) m.style.width = l * 100 + '%'; } });
    } catch (e) { w.state = 'err'; w.running = false; drawWizard(); return; }
    if (!w.running) break;
    if (!clip) { w.state = 'silent'; drawWizard(); await new Promise((r) => setTimeout(r, 900)); continue; }
    await w.V.saveClip(w.voiceId, p.key, clip);
    w.done.add(p.key);
    w.state = 'play'; drawWizard();
    await w.V.playKeys([`v:${w.voiceId}:${p.key}`], 1);
    // nächste noch fehlende Ansage
    let nx = w.list.findIndex((x, i) => i > w.idx && !w.done.has(x.key));
    if (nx < 0) nx = w.list.findIndex((x) => !w.done.has(x.key));
    if (nx < 0) { w.running = false; S.caller = 'voice:' + w.voiceId; saveSettings(); sfx.fanfare(); confetti(80); drawWizard(); return; }
    w.idx = nx;
  }
  w.running = false;
  drawWizard();
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
    case 'discardRun': {
      // sofort beenden – mit „Rückgängig“ für versehentliche Tipps
      ui.lastRun = store.running();
      store.clearRunning();
      const card = $('.resume');
      if (card) { card.classList.add('gone'); setTimeout(render, 280); } else render();
      toast('Spiel beendet · <u data-act="restoreRun">Rückgängig</u>');
      break;
    }
    case 'restoreRun': if (ui.lastRun) { store.saveRunning(ui.lastRun); ui.lastRun = null; render(); toast('Spiel wiederhergestellt'); } break;
    case 'resume': {
      const r = store.running();
      if (!r) break;
      ui.daily = !!r.daily;
      startGame({ id: r.gameId, cfg: r.cfg, players: r.players }, r);
      break;
    }
    case 'setup': ui.daily = false; ui.setupMode = null; ui.setup = defaultSetup(el.dataset.g); launch(el, () => go('setup')); break;
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
    case 'rules': { const G = gameById(el.dataset.g); modal(`<div class="rules-head"><span class="gi">${G.meta.icon}</span><div><small>Spielregeln</small><h3>${esc(G.meta.name)}</h3></div></div><p class="pre">${esc(RULES[el.dataset.g] || G.meta.desc)}</p><button class="btn primary wide" data-act="close">Verstanden 👍</button>`); break; }
    case 'close': closeModal(); break;
    case 'leave': askLeave(); break;
    case 'leaveOk': closeModal(); stopCalls(); go('home'); break;
    case 'abandon': closeModal(); stopCalls(); store.clearRunning(); ui.game = null; go('home'); break;
    case 'mute': S.caller = S.caller === 'off' ? (localStorage.getItem('da.lastCaller') || 'showman') : (localStorage.setItem('da.lastCaller', S.caller), 'off'); saveSettings(); stopCalls(); render(); break;
    case 'inmode': ui.input = el.dataset.m; if (['keypad', 'segments', 'board', 'camera'].includes(ui.input)) { S.input = ui.input; saveSettings(); } render(); break;
    case 'mult': ui.mult = ui.mult === +el.dataset.m ? 1 : +el.dataset.m; ui.justSel = `[data-act="mult"][data-m="${ui.mult}"]`; render(); break;
    case 'dart': {
      const s = +el.dataset.s;
      const m = el.dataset.m != null ? +el.dataset.m : ui.mult;
      if (s === 25 && m === 3) { toast('Triple-Bull gibt es nicht', 'warn'); break; }
      humanDart(s === 0 ? MISS : dart(s, m));
      break;
    }
    case 'endturn': { const g = ui.game; if (curPlayer().cpu || curPlayer().remote) break; const n = 3 - g.s.turn.length; for (let i = 0; i < n && !g.s.over && !curPlayer().cpu; i++) { const ev = localThrow(MISS, pointIn(MISS)); if (ev && ev.type === 'turn') { handleEvent(ev); return; } } render(); break; }
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
    case 'camCal': calibrateCam(); break;
    case 'camCalDone': if (ui.cam) ui.cam.endCalibration(); closeModal(); render(); toast('Kalibrierung gespeichert'); break;
    case 'camRelearn': if (ui.cam) ui.cam.relearn(); break;
    case 'camCircle': if (ui.cam) ui.cam.resetCircle(); break;
    case 'camDetect': runDetect(); break;
    case 'camRot': if (ui.cam) ui.cam.rotate(+el.dataset.d); break;
    case 'logShow': showLog(); break;
    case 'logCopy': { const t = fullLog(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Protokoll kopiert'), () => toast('Kopieren nicht möglich – bitte „Teilen/Speichern“ nutzen', 'warn')); break; }
    case 'logShare': {
      const t = fullLog();
      if (navigator.share) { navigator.share({ title: 'Darts Arena – Fehlerprotokoll', text: t }).catch(() => {}); break; }
      const nb = nativeBridge();
      if (nb && nb.saveFile) { nb.saveFile(`darts-arena-protokoll-${new Date().toISOString().slice(0, 10)}.txt`, t); break; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); a.download = 'darts-arena-protokoll.txt'; a.click();
      break;
    }
    case 'logClear': clearLog(); showLog(); break;
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
        log('Musik', `Neuer Song gewählt: ${f0.name}`);
        musicReload(); toast(`🎵 „${esc(f0.name)}“ läuft jetzt im Menü`); render();
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
    case 'mtab': {
      const order = MORE_TABS.map((t) => t.id);
      const from = order.indexOf(ui.moreTab || 'profil'), to = order.indexOf(el.dataset.t);
      if (from === to) break;
      ui.tabAnim = to > from ? 'from-right' : 'from-left';
      ui.moreTab = el.dataset.t;
      render();
      ui.tabAnim = '';
      break;
    }
    case 'voiceNew': newVoiceModal(); break;
    case 'onlMode': ui.onl.mode = el.dataset.id; ui.justSel = `[data-act="onlMode"][data-id="${el.dataset.id}"]`; render(); break;
    case 'onlHost': onlineHost(); break;
    case 'frRefresh': if (presence) { presence.checkAll(); toast('Prüfe, wer online ist …'); } else startPresence(); break;
    case 'frInvite': inviteFriend(el.dataset.code); break;
    case 'frInviteGo': inviteFriendGo(el.dataset.code, el.dataset.mode); break;
    case 'frDel': { const f = friends().find((x) => x.code === el.dataset.code); if (f && confirm(`${f.name} aus der Freundesliste entfernen?`)) { removeFriend(f.code); render(); } break; }
    case 'frShare': shareFriendLink(); break;
    case 'frAdd': addFriendByCode($('#frCode') && $('#frCode').value); break;
    case 'invYes': if (ui.inviteAnswer) ui.inviteAnswer(true); break;
    case 'invNo': if (ui.inviteAnswer) ui.inviteAnswer(false); break;
    case 'onlJoin': { const c = cleanCode($('#onlCode') && $('#onlCode').value); if (c.length < 5) { toast('Bitte den 5-stelligen Code eingeben', 'warn'); break; } onlineJoin(c); break; }
    case 'onlSeek': onlineSeek(); break;
    case 'onlCancel': onlineCancel(); break;
    case 'onlInvite': onlineInvite(); break;
    case 'onlLeave': closeModal(); leaveOnline(); break;
    case 'onlRematch': {
      if (!ui.online) break;
      ui.rematchMine = true;
      ui.online.send({ t: 'rematch' });
      if (ui.rematchTheirs) maybeRematch(); else { toast('Revanche angefragt – warte auf Gegner …'); el.disabled = true; }
      break;
    }
    case 'emote': if (ui.online) { ui.online.send({ t: 'emote', e: el.dataset.e }); bigFlash(el.dataset.e, 'ton'); } break;
    case 'openReleases': { const nb = nativeBridge(); if (nb && nb.openUrl) nb.openUrl('https://github.com/Schnielz87/Apps---APK---PWA/releases/latest'); else window.open('https://github.com/Schnielz87/Apps---APK---PWA/releases/latest', '_blank'); break; }
    case 'tile': {
      const t = tileDefs().find((d) => d.id === el.dataset.id);
      if (!t) break;
      ui.daily = false;
      ui.setupMode = t.cpu ? 'cpu' : 'human';
      const su1 = defaultSetup(t.g, t.cpu ? (+localStorage.getItem('da.lastCpu') || 3) : null);
      if (!t.cpu) {
        // „X01“-Kachel: nur Menschen (Solo oder mit Freunden) – CPU gibt es auf der eigenen Kachel
        su1.players = su1.players.filter((p) => !p.cpu);
        if (!su1.players.length) su1.players = [pl(activeProfile())];
        if (su1.players.length < gameById(t.g).meta.min) su1.players.push(cpuPlayer(+localStorage.getItem('da.lastCpu') || 3));
      }
      ui.setup = su1;
      launch(el, () => go('setup'));
      break;
    }
    case 'tilesEdit': tilesEditor(); break;
    case 'tileStar': {
      const ids = homeTiles().map((t) => t.id);
      const i = ids.indexOf(el.dataset.id);
      if (i >= 0) ids.splice(i, 1); else ids.push(el.dataset.id);
      setTiles(ids); tilesEditor(); render(); break;
    }
    case 'tileUp': {
      const ids = homeTiles().map((t) => t.id);
      const i = ids.indexOf(el.dataset.id);
      if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; setTiles(ids); tilesEditor(); render(); }
      break;
    }
    case 'tilesReset': setTiles(DEFAULT_TILES); tilesEditor(); render(); break;
    case 'pin': {
      const ids = homeTiles().map((t) => t.id);
      const i = ids.indexOf(el.dataset.id);
      if (i >= 0) { ids.splice(i, 1); toast('Von der Startseite entfernt'); } else { ids.push(el.dataset.id); toast('⭐ Auf der Startseite'); }
      setTiles(ids); ui.justSel = `[data-act="pin"][data-id="${el.dataset.id}"]`; render(); break;
    }
    case 'vLang': case 'vLevel': {
      ui.vNew[a === 'vLang' ? 'lang' : 'level'] = el.dataset.v;
      $$('button', el.parentNode).forEach((b) => b.classList.toggle('on', b === el));
      el.classList.add('just');
      break;
    }
    case 'voiceCreate': {
      import('./voice.js').then((V) => {
        const id = V.addVoice(($('#vName').value || '').trim().slice(0, 24) || 'Meine Stimme', ui.vNew.lang);
        openWizard(id, ui.vNew.level);
      });
      break;
    }
    case 'voiceEdit': openWizard(el.dataset.id, 'profi'); break;
    case 'voiceDel': {
      if (!confirm('Diese Stimme mit allen Aufnahmen entfernen?')) break;
      import('./voice.js').then(async (V) => { await V.deleteVoice(el.dataset.id); if (S.caller === 'voice:' + el.dataset.id) { S.caller = 'showman'; saveSettings(); } render(); });
      break;
    }
    case 'wizStart': unlockAudio(); wizardLoop(); break;
    case 'wizPause': if (ui.wiz) { ui.wiz.running = false; if (ui.wiz.abort) ui.wiz.abort.abort(); } break;
    case 'wizPlay': if (ui.wiz) ui.wiz.V.playKeys([`v:${ui.wiz.voiceId}:${ui.wiz.list[ui.wiz.idx].key}`], 1); break;
    case 'wizSkip': if (ui.wiz) { if (ui.wiz.abort) ui.wiz.abort.abort(); ui.wiz.idx = (ui.wiz.idx + 1) % ui.wiz.list.length; if (!ui.wiz.running) drawWizard(); else { ui.wiz.running = false; setTimeout(wizardLoop, 300); } } break;
    case 'wizGo': if (ui.wiz) { const wasRunning = ui.wiz.running; ui.wiz.running = false; if (ui.wiz.abort) ui.wiz.abort.abort(); ui.wiz.idx = +el.dataset.i; drawWizard(); if (wasRunning) setTimeout(wizardLoop, 300); } break;
    case 'wizClose': closeModal(); break;
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
    if (t.dataset.set === 'friendsVisible') { if (t.checked) startPresence(); else if (presence) { presence.stop(); presence = null; } }
  }
  if (t.dataset.cpulvl != null && ui.setup) {
    const p = ui.setup.players[+t.dataset.cpulvl];
    if (p) { Object.assign(p, cpuPlayer(+t.value), { id: p.id }); render(); }
  }
  if (t.dataset.select) { S[t.dataset.select] = t.value; saveSettings(); demo(t.dataset.select === 'voiceEn' ? 'showman' : 'kommentator'); }
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
/** Im Spiel: nachfragen statt die App zu schließen. */
function askLeave() {
  if (ui.isOnline) {
    if (!ui.game || ui.game.s.over) { leaveOnline(); return; }
    modal(`<h3>Online-Spiel verlassen?</h3><p class="muted">Das Spiel wird beendet und ${esc(ui.online && ui.online.opp ? ui.online.opp.name : 'dein Gegner')} wird benachrichtigt.</p>
      <div class="row gap"><button class="btn grow" data-act="close">Weiterspielen</button><button class="btn primary grow" data-act="onlLeave">Verlassen</button></div>`);
    return;
  }
  if (!ui.game || ui.game.s.over) { go('home'); return; }
  modal(`<h3>Möchten Sie das Spiel beenden?</h3><p class="muted">Das Spiel bleibt gespeichert – Sie können es auf der Startseite fortsetzen.</p>
    <div class="row gap"><button class="btn grow" data-act="close">Weiterspielen</button><button class="btn primary grow" data-act="leaveOk">Beenden</button></div>
    <button class="btn ghost wide danger" data-act="abandon">Spiel abbrechen (nicht speichern)</button>`);
}

window.__dartsBack = () => {
  try {
    if ($('#modal').className !== 'hidden') { closeModal(); return true; }
    if (ui.view === 'play') { askLeave(); return true; }
    if (['setup', 'help'].includes(ui.view)) { go('games'); return true; }
    if (ui.view === 'online') { onlineCancel(); return true; }
    if (ui.view === 'result' && ui.isOnline) { leaveOnline(); return true; }
    if (ui.view !== 'home') { go('home'); return true; }
    return false; // Startseite: App darf sich schließen
  } catch (e) {
    logError('Zurück', e);
    return ui.view !== 'home'; // im Zweifel nie aus einem Spiel heraus schließen
  }
};

// Browser/PWA (Android-Zurück, Wisch-Geste): im Spiel einen Verlaufseintrag als „Puffer“ halten
window.addEventListener('popstate', () => {
  if (ui.view === 'play' || $('#modal').className !== 'hidden') {
    history.pushState({ darts: 1 }, '');
    window.__dartsBack();
  }
});

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
  onNative((type, d) => {
    if (type === 'log') log(d && d.area || 'Android', d && d.msg || d, d && d.level || 'info');
    if (type === 'updateStatus' && d && d.text) log('Update', d.text);
    if (type === 'updateConflict') logError('Update', 'Signatur passt nicht – Neuinstallation nötig');
    if (type === 'toast') toast(esc(d));
    if (type === 'updateConflict') {
      modal(`<h3>⚠️ Einmalige Neuinstallation nötig</h3>
        <p>Version ${esc(d && d.tag)} ist mit dem neuen, festen App-Schlüssel signiert. Android erlaubt den Wechsel nur per Neuinstallation – danach funktionieren alle Updates wieder automatisch.</p>
        <p class="pre">1. Unten „Daten sichern“ antippen (Profile, Statistik, Erfolge).
2. Darts Arena deinstallieren (App-Symbol lange drücken → Deinstallieren).
3. Neue App laden: github.com/Schnielz87/Apps---APK---PWA/releases/latest → Darts-Arena.apk
4. In der neuen App: Mehr → System → Wiederherstellen.</p>
        <button class="btn primary wide" data-act="export">💾 Daten sichern</button>
        <button class="btn wide" data-act="openReleases">⬇ Download-Seite öffnen</button>
        <button class="btn ghost wide" data-act="close">Später</button>`);
    }
  });
  await initUpdates({ auto: S.autoUpdate }).catch(() => {});
  log('App', `Start ${APP_VERSION.version} · ${isApk() ? 'APK' : 'PWA'} · ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 120)}`);
  let start = (location.hash || '').slice(1);
  const jm = /^join=([A-Za-z0-9]{5})/.exec(start);
  const fm = /^friend=([A-Za-z0-9]{8})(?:&n=([^&]*))?/.exec(start);
  startPresence();
  if (jm) { go('online'); setTimeout(() => onlineJoin(cleanCode(jm[1])), 400); }
  else if (fm) { go('online'); setTimeout(() => addFriendByCode(fm[1], fm[2] ? decodeURIComponent(fm[2]) : 'Freund'), 1500); history.replaceState(null, '', '#online'); }
  else {
    if (!['home', 'games', 'stats', 'awards', 'more', 'online'].includes(start)) start = 'home';
    go(start);
  }
  // Bildschirm anlassen (PWA)
  if (S.keepAwake && navigator.wakeLock && !isApk()) {
    const lock = () => navigator.wakeLock.request('screen').catch(() => {});
    lock();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.keepAwake) lock(); });
  }
}
boot();
