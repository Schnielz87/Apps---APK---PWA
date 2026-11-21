// Kamera-Autoscore (Beta): erkennt neue Darts in der Scheibe per Bildvergleich und rechnet sie über eine
// 4-Punkt-Kalibrierung (Homographie) in Felder um. Eine Kamera, kein Server – alles läuft auf dem Gerät.
import { R, hitAt, ORDER, label } from './board.js';
import { log, logError } from './log.js';

const W = 256; // Verarbeitungsbreite (Pixel)
const KEY = 'da.cam';

// Kalibrier-Punkte auf der Scheibe (mm): äußerer Doppelring oben (20), rechts (6), unten (3), links (11)
export const CAL_BOARD = [[0, -R.doubleOut], [R.doubleOut, 0], [0, R.doubleOut], [-R.doubleOut, 0]];
export const CAL_NAMES = ['20 (oben)', '6 (rechts)', '3 (unten)', '11 (links)'];

// ------------------------------------------------------------------ Homographie (4 Punkte, DLT)
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
  return x;
}
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [...h, 1];
}
export function apply(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

// ------------------------------------------------------------------ Kamera + Erkennung
export class AutoScore {
  constructor({ onDart, onStatus }) {
    this.onDart = onDart; this.onStatus = onStatus || (() => {});
    this.el = document.createElement('div');
    this.el.className = 'cam';
    this.el.innerHTML = '<video playsinline muted autoplay></video><canvas class="ov"></canvas>';
    this.video = this.el.querySelector('video');
    this.ov = this.el.querySelector('canvas');
    this.work = document.createElement('canvas');
    this.wctx = this.work.getContext('2d', { willReadFrequently: true });
    this.cal = null; // Bildpunkte normiert 0..1
    try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.pts && c.pts.length === 4) this.cal = c.pts; } catch (e) { /* egal */ }
    this.running = false; this.paused = false; this.calibrating = false;
    this.ref = null; this.prev = null; this.stable = 0; this.waitPull = false; this.sawMotion = false;
    this.sens = 1;
    this.setupDrag();
  }

  get calibrated() { return !!this.cal; }

  async start() {
    if (this.running) { this.video.play().catch(() => {}); return true; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { logError('Kamera', `Kein Zugriff: ${e.name || e}`); this.onStatus('Kein Kamerazugriff – bitte Kamera erlauben.', 'warn'); return false; }
    log('Kamera', 'Kamera gestartet');
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.running = true;
    this.updateMatrices();
    this.loop();
    this.onStatus(this.cal ? 'Kamera bereit – lerne leere Scheibe ein …' : 'Bitte zuerst kalibrieren.');
    return true;
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null; this.ref = null; this.warmUntil = 0; this.cand = null; this.refAcc = null;
  }

  /** Nach dem Verschieben im DOM weiterlaufen lassen. */
  attach(parent) { if (parent && this.el.parentNode !== parent) { parent.appendChild(this.el); this.video.play().catch(() => {}); } this.drawOverlay(); }

  /** Neue leere Referenz (z. B. nach dem Ziehen der Darts). */
  relearn() { this.ref = null; this.refAcc = null; this.cand = null; this.stable = 0; this.waitPull = false; this.warmUntil = performance.now() + 1500; this.onStatus('Lerne Scheibe neu ein …'); }
  /** Nach einer vollen Aufnahme: auf das Ziehen der Darts warten, dann neu einlernen. */
  expectPull() { this.waitPull = true; this.sawMotion = false; this.onStatus('Darts ziehen – danach geht es automatisch weiter.'); }

  updateMatrices() {
    if (!this.cal) { this.Hi2b = this.Hb2i = null; return; }
    this.Hi2b = homography(this.cal, CAL_BOARD);
    this.Hb2i = homography(CAL_BOARD, this.cal);
    this.mask = null;
  }

  saveCal() { localStorage.setItem(KEY, JSON.stringify({ pts: this.cal })); this.updateMatrices(); this.relearn(); }

  startCalibration() {
    this.calibrating = true;
    if (!this.cal) this.cal = this.circle();
    this.updateMatrices();
    this.el.classList.add('calib');
    this.drawOverlay();
  }
  endCalibration() { this.calibrating = false; this.el.classList.remove('calib'); this.saveCal(); this.drawOverlay(); }

  /** Kreis in der Bildmitte – in Pixeln rund, egal ob Hoch- oder Querformat. */
  circle(scale = 0.36) {
    const w = this.video.videoWidth || 16, h = this.video.videoHeight || 9;
    const r = Math.min(w, h) * scale, rx = r / w, ry = r / h;
    return [[0.5, 0.5 - ry], [0.5 + rx, 0.5], [0.5, 0.5 + ry], [0.5 - rx, 0.5]];
  }
  resetCircle() { this.cal = this.circle(); this.updateMatrices(); this.drawOverlay(); }

  setupDrag() {
    let drag = -1, from = null, start = null;
    const pos = (e) => { const r = this.ov.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    this.ov.addEventListener('pointerdown', (e) => {
      if (!this.calibrating) return;
      const [x, y] = pos(e);
      let best = -1, bd = 0.08;
      this.cal.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
      // kein Punkt getroffen → ganzes Gitter verschieben
      drag = best >= 0 ? best : 'all';
      from = [x, y]; start = this.cal.map((p) => p.slice());
      this.ov.setPointerCapture(e.pointerId); e.preventDefault();
    });
    this.ov.addEventListener('pointermove', (e) => {
      if (drag === -1) return;
      const [x, y] = pos(e);
      const clamp = (v) => Math.min(1, Math.max(0, v));
      if (drag === 'all') this.cal = start.map(([px, py]) => [clamp(px + x - from[0]), clamp(py + y - from[1])]);
      else this.cal[drag] = [clamp(x), clamp(y)];
      this.updateMatrices(); this.drawOverlay();
    });
    const up = () => { drag = -1; };
    this.ov.addEventListener('pointerup', up);
    this.ov.addEventListener('pointercancel', up);
  }

  /** Scheiben-Gitter (projiziert) über das Kamerabild zeichnen. */
  drawOverlay(lastTip = null) {
    const c = this.ov;
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, r.width, r.height);
    if (!this.Hb2i) return;
    const P = (x, y) => { const [u, v] = apply(this.Hb2i, x, y); return [u * r.width, v * r.height]; };
    g.lineWidth = 1.2;
    g.strokeStyle = this.calibrating ? '#f5c542' : 'rgba(105,240,174,.55)';
    for (const rad of [R.outer, R.tripleIn, R.tripleOut, R.doubleIn, R.doubleOut]) {
      g.beginPath();
      for (let a = 0; a <= 360; a += 6) { const t = (a * Math.PI) / 180; const [x, y] = P(Math.sin(t) * rad, -Math.cos(t) * rad); a ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 20; i++) {
      const t = ((i * 18 + 9) * Math.PI) / 180;
      const [x1, y1] = P(Math.sin(t) * R.outer, -Math.cos(t) * R.outer), [x2, y2] = P(Math.sin(t) * R.doubleOut, -Math.cos(t) * R.doubleOut);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.fillStyle = '#fff'; g.font = 'bold 11px system-ui'; g.textAlign = 'center';
    ORDER.forEach((n, i) => { const t = (i * 18 * Math.PI) / 180; const [x, y] = P(Math.sin(t) * 186, -Math.cos(t) * 186 + 4); g.fillText(n, x, y); });
    if (this.calibrating) {
      this.cal.forEach(([x, y], i) => {
        g.fillStyle = '#e53935'; g.beginPath(); g.arc(x * r.width, y * r.height, 11, 0, 7); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#fff'; g.fillText(String(i + 1), x * r.width, y * r.height + 4);
      });
    }
    if (lastTip) { const [x, y] = P(lastTip.x, lastTip.y); g.fillStyle = '#00e5ff'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  }

  grab() {
    const v = this.video;
    if (!v.videoWidth) return null;
    const h = Math.round((W * v.videoHeight) / v.videoWidth);
    if (this.work.width !== W || this.work.height !== h) { this.work.width = W; this.work.height = h; this.mask = null; }
    this.wctx.drawImage(v, 0, 0, W, h);
    const d = this.wctx.getImageData(0, 0, W, h).data;
    const g = new Uint8Array(W * h);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    const b = new Uint8Array(g.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      b[i] = (g[i - W - 1] + g[i - W] + g[i - W + 1] + g[i - 1] + g[i] + g[i + 1] + g[i + W - 1] + g[i + W] + g[i + W + 1]) / 9;
    }
    return { g: b, w: W, h };
  }

  buildMask(w, h) {
    const m = new Uint8Array(w * h);
    let n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [bx, by] = apply(this.Hi2b, (x + 0.5) / w, (y + 0.5) / h);
      if (Math.hypot(bx, by) < R.doubleOut + 12) { m[y * w + x] = 1; n++; }
    }
    this.mask = m; this.maskN = n;
  }

  diff(a, b, thr) {
    const out = new Uint8Array(a.length);
    let n = 0;
    for (let i = 0; i < a.length; i++) if (this.mask[i] && Math.abs(a[i] - b[i]) > thr) { out[i] = 1; n++; }
    return { out, n };
  }

  loop() {
    if (!this.running) return;
    this.timer = setTimeout(() => this.loop(), 140);
    if (this.calibrating || this.paused || !this.Hi2b || document.hidden) return;
    const f = this.grab();
    if (!f) return;
    if (!this.mask) this.buildMask(f.w, f.h);
    const now = performance.now();
    if (!this.warmUntil) this.warmUntil = now + 2000;

    // Bewegung gegenüber dem letzten Bild (Hand, Wurf, Kamera wackelt)?
    let moving = true;
    if (this.prev) {
      const md = this.meanAbs(f.g, this.prev);
      // Grundrauschen der Kamera mitlernen (nur in ruhigen Phasen)
      if (md < (this.noise || 4) * 2.5) this.noise = this.noise ? this.noise * 0.9 + md * 0.1 : md;
      const m = this.diff(f.g, this.prev, this.thr());
      moving = m.n > Math.max(12, this.maskN * 0.003);
    }
    this.prev = f.g;
    this.stable = moving ? 0 : this.stable + 1;
    if (moving) {
      if (this.waitPull) this.sawMotion = true;
      this.cand = null; this.refAcc = null;
      this.unruhig = (this.unruhig || 0) + 1;
      if (!this.ref && this.unruhig === 40) { this.onStatus('Bild unruhig – Handy fest aufs Stativ stellen, gleichmäßiges Licht.', 'warn'); log('Kamera', 'Bild bleibt unruhig – keine Erkennung möglich'); }
      return;
    }
    this.unruhig = 0;
    if (now < this.warmUntil || this.stable < 5) return;

    // Referenzbild der leeren Scheibe: Mittel aus mehreren ruhigen Bildern
    if (!this.ref) {
      if (!this.refAcc) { this.refAcc = new Float32Array(f.g.length); this.refN = 0; }
      for (let i = 0; i < f.g.length; i++) this.refAcc[i] += f.g[i];
      if (++this.refN >= 4) {
        this.ref = Uint8Array.from(this.refAcc, (v) => v / this.refN);
        this.refAcc = null;
        this.onStatus('Bereit – wirf! 🎯', 'ok');
        log('Kamera', `Scheibe eingelernt (Rauschen ${(this.noise || 0).toFixed(1)})`);
      }
      return;
    }
    if (this.waitPull) {
      // nach Bewegung (Darts ziehen) und wieder Ruhe: neue Referenz
      if (this.sawMotion && this.stable >= 6) { this.ref = null; this.waitPull = false; }
      return;
    }

    // Helligkeit des ganzen Bildes verändert (Licht, Belichtung) → neu einlernen, kein Dart
    const shift = this.meanShift(f.g, this.ref);
    if (Math.abs(shift) > 6) { this.reject('Helligkeit verändert – neu eingelernt'); this.ref = null; return; }

    const d = this.diff(f.g, this.ref, this.thr());
    const frac = d.n / this.maskN;
    const minPx = Math.max(25, this.maskN * 0.0015);
    if (d.n < minPx) { if (d.n > 0) this.absorb(f.g); this.cand = null; return; }
    if (frac > 0.06) {
      if (this.stable >= 8) { this.reject('große Veränderung (Person/Kamera bewegt) – neu eingelernt'); this.ref = null; }
      return;
    }
    const tip = this.findDart(d.out, f.w, f.h);
    if (!tip.ok) { this.reject(tip.why); this.absorb(f.g); this.cand = null; return; }

    // Bestätigung: derselbe Dart muss zweimal hintereinander an derselben Stelle gefunden werden
    if (!this.cand || Math.hypot(this.cand[0] - tip.x, this.cand[1] - tip.y) > 6) { this.cand = [tip.x, tip.y]; return; }
    this.cand = null;
    if (now - (this.lastDart || 0) < 1000) return;
    this.lastDart = now;
    this.ref = f.g; // nächster Dart wird gegen dieses Bild verglichen
    const [bx, by] = apply(this.Hi2b, tip.x / f.w, tip.y / f.h);
    const dart = hitAt(bx, by);
    this.drawOverlay({ x: bx, y: by });
    log('Kamera', `Dart erkannt: ${label(dart)} (${Math.round(bx)}/${Math.round(by)} mm, ${tip.px} px, Länge ${Math.round(tip.len)} mm)`);
    this.onDart(dart, { x: bx, y: by });
  }

  thr() { return Math.max(28, (this.noise || 4) * 6) / this.sens; }
  meanAbs(a, b) { let s = 0, n = 0; for (let i = 0; i < a.length; i += 3) if (this.mask[i]) { s += Math.abs(a[i] - b[i]); n++; } return n ? s / n : 0; }
  meanShift(a, b) { let s = 0, n = 0; for (let i = 0; i < a.length; i += 3) if (this.mask[i]) { s += a[i] - b[i]; n++; } return n ? s / n : 0; }
  /** Kleine, verworfene Veränderungen langsam ins Referenzbild übernehmen (Licht driftet). */
  absorb(g) { const r = this.ref; for (let i = 0; i < r.length; i++) r[i] = (r[i] * 3 + g[i]) >> 2; }
  reject(why) {
    const now = performance.now();
    if (now - (this.lastReject || 0) > 4000) { log('Kamera', `Verworfen: ${why}`); this.lastReject = now; }
  }

  /**
   * Prüft, ob die Veränderung wie EIN Dart aussieht: zusammenhängend, länglich, plausible Länge auf der Scheibe.
   * Ergebnis: {ok, x, y (Spitze in Pixeln), px, len} oder {ok:false, why}.
   */
  findDart(bin, w, h) {
    // Komponenten suchen (8er-Nachbarschaft), Einzelpixel ignorieren
    const lab = new Int32Array(bin.length);
    const comps = [];
    let total = 0;
    const stack = [];
    for (let i = 0; i < bin.length; i++) {
      if (!bin[i] || lab[i]) continue;
      const px = [];
      lab[i] = comps.length + 1; stack.push(i);
      while (stack.length) {
        const p = stack.pop(); px.push(p);
        const x = p % w, y = (p / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (bin[q] && !lab[q]) { lab[q] = comps.length + 1; stack.push(q); }
        }
      }
      if (px.length >= 4) { let cx = 0, cy = 0; for (const p of px) { cx += p % w; cy += (p / w) | 0; } comps.push({ px, cx: cx / px.length, cy: cy / px.length }); total += px.length; }
    }
    if (!comps.length) return { ok: false, why: 'nur Rauschen' };
    comps.sort((a, b) => b.px.length - a.px.length);
    // Hauptfleck + nahe Teile (Schaft und Flight können getrennt erscheinen)
    const main = comps[0];
    let pts = main.px.slice();
    for (const c of comps.slice(1)) if (Math.hypot(c.cx - main.cx, c.cy - main.cy) < w * 0.12) pts = pts.concat(c.px);
    if (pts.length < total * 0.75) return { ok: false, why: `zu verstreut (${comps.length} Flecken)` };
    // Hauptachse (PCA) und Streckung
    let mx = 0, my = 0;
    for (const p of pts) { mx += p % w; my += (p / w) | 0; }
    mx /= pts.length; my /= pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) { const x = (p % w) - mx, y = ((p / w) | 0) - my; sxx += x * x; syy += y * y; sxy += x * y; }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy;
    const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = Math.max(1e-6, tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det)));
    const elong = Math.sqrt(l1 / l2);
    if (elong < 2.2) return { ok: false, why: `nicht länglich wie ein Dart (Verhältnis ${elong.toFixed(1)})` };
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ax = Math.cos(ang), ay = Math.sin(ang);
    let lo = Infinity, hi = -Infinity;
    const proj = pts.map((p) => { const t = ((p % w) - mx) * ax + (((p / w) | 0) - my) * ay; lo = Math.min(lo, t); hi = Math.max(hi, t); return t; });
    // Länge auf der Scheibe (mm) – ein Dart ist ca. 15–20 cm lang, von der Seite kürzer/länger projiziert
    const e1 = apply(this.Hi2b, (mx + ax * lo) / w, (my + ay * lo) / h), e2 = apply(this.Hi2b, (mx + ax * hi) / w, (my + ay * hi) / h);
    const len = Math.hypot(e1[0] - e2[0], e1[1] - e2[1]);
    if (len < 12 || len > 260) return { ok: false, why: `Länge passt nicht zu einem Dart (${Math.round(len)} mm)` };
    // Spitze = dünneres Ende (der Flight ist breiter)
    const cut = (hi - lo) * 0.2;
    let nLo = 0, nHi = 0;
    for (const t of proj) { if (t < lo + cut) nLo++; if (t > hi - cut) nHi++; }
    const t = nLo < nHi ? lo : hi;
    return { ok: true, x: mx + ax * t, y: my + ay * t, px: pts.length, len };
  }


}
