// Kamera-Autoscore (Beta): erkennt neue Darts in der Scheibe per Bildvergleich und rechnet sie über eine
// 4-Punkt-Kalibrierung (Homographie) in Felder um. Eine Kamera, kein Server – alles läuft auf dem Gerät.
import { R, hitAt, ORDER } from './board.js';

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
    } catch (e) { this.onStatus('Kein Kamerazugriff – bitte Kamera erlauben.', 'warn'); return false; }
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
    this.stream = null; this.ref = null;
  }

  /** Nach dem Verschieben im DOM weiterlaufen lassen. */
  attach(parent) { if (parent && this.el.parentNode !== parent) { parent.appendChild(this.el); this.video.play().catch(() => {}); } this.drawOverlay(); }

  /** Neue leere Referenz (z. B. nach dem Ziehen der Darts). */
  relearn() { this.ref = null; this.stable = 0; this.waitPull = false; this.onStatus('Lerne Scheibe neu ein …'); }
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
    if (!this.cal) this.cal = [[0.5, 0.18], [0.78, 0.5], [0.5, 0.82], [0.22, 0.5]];
    this.updateMatrices();
    this.el.classList.add('calib');
    this.drawOverlay();
  }
  endCalibration() { this.calibrating = false; this.el.classList.remove('calib'); this.saveCal(); this.drawOverlay(); }

  setupDrag() {
    let drag = -1;
    const pos = (e) => { const r = this.ov.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    this.ov.addEventListener('pointerdown', (e) => {
      if (!this.calibrating) return;
      const [x, y] = pos(e);
      let best = -1, bd = 0.08;
      this.cal.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
      drag = best;
      if (drag >= 0) { this.ov.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    this.ov.addEventListener('pointermove', (e) => {
      if (drag < 0) return;
      const [x, y] = pos(e);
      this.cal[drag] = [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
      this.updateMatrices(); this.drawOverlay();
    });
    this.ov.addEventListener('pointerup', () => { drag = -1; });
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
    return { g, w: W, h };
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
    const thr = 30 / this.sens;
    // Bewegung gegenüber dem letzten Bild?
    let moving = true;
    if (this.prev) { const m = this.diff(f.g, this.prev, thr); moving = m.n > Math.max(6, this.maskN * 0.004); }
    this.prev = f.g;
    this.stable = moving ? 0 : this.stable + 1;
    if (moving) { if (this.waitPull) this.sawMotion = true; return; }
    if (this.stable < 3) return;
    if (!this.ref) { this.ref = f.g; this.onStatus('Bereit – wirf! 🎯', 'ok'); return; }
    const d = this.diff(f.g, this.ref, thr);
    const frac = d.n / this.maskN;
    if (this.waitPull) {
      // nach Bewegung (Hand) und wieder Ruhe: neue Referenz
      if (this.sawMotion && this.stable >= 5) { this.ref = f.g; this.waitPull = false; this.onStatus('Bereit – wirf! 🎯', 'ok'); }
      return;
    }
    if (d.n < 8) return;
    if (frac > 0.08) { // große Änderung (Licht, Person, Kamera bewegt) → neu einlernen
      if (this.stable >= 6) { this.ref = f.g; this.onStatus('Bild hat sich stark verändert – neu eingelernt.', 'warn'); }
      return;
    }
    const tip = this.findTip(d.out, f.w, f.h);
    this.ref = f.g; // nächster Dart wird gegen dieses Bild verglichen
    if (!tip) return;
    const [bx, by] = apply(this.Hi2b, tip[0] / f.w, tip[1] / f.h);
    const dart = hitAt(bx, by);
    this.drawOverlay({ x: bx, y: by });
    this.onDart(dart, { x: bx, y: by });
  }

  /** Alle Änderungs-Pixel (ohne Rauschen) zusammen betrachten – Schaft und Flight sind oft getrennte Flecken. */
  findTip(bin, w, h) {
    const best = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!bin[i]) continue;
      const nb = bin[i - 1] + bin[i + 1] + bin[i - w] + bin[i + w] + bin[i - w - 1] + bin[i - w + 1] + bin[i + w - 1] + bin[i + w + 1];
      if (nb >= 2) best.push(i);
    }
    // weit entfernte Ausreißer (z. B. Lichtreflex) verwerfen: nur Pixel nahe am Median
    if (best.length > 10) {
      const xs = best.map((p) => p % w).sort((a, b) => a - b), ys = best.map((p) => (p / w) | 0).sort((a, b) => a - b);
      const medx = xs[xs.length >> 1], medy = ys[ys.length >> 1];
      const lim = w * 0.25;
      for (let k = best.length - 1; k >= 0; k--) { const p = best[k]; if (Math.hypot((p % w) - medx, ((p / w) | 0) - medy) > lim) best.splice(k, 1); }
    }
    if (!best || best.length < 6) return null;
    let mx = 0, my = 0;
    for (const p of best) { mx += p % w; my += (p / w) | 0; }
    mx /= best.length; my /= best.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of best) { const x = (p % w) - mx, y = ((p / w) | 0) - my; sxx += x * x; syy += y * y; sxy += x * y; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ax = Math.cos(ang), ay = Math.sin(ang);
    let lo = Infinity, hi = -Infinity;
    const proj = best.map((p) => { const t = ((p % w) - mx) * ax + (((p / w) | 0) - my) * ay; lo = Math.min(lo, t); hi = Math.max(hi, t); return t; });
    const len = hi - lo;
    if (len < 3) return [mx, my];
    const cut = len * 0.2;
    let nLo = 0, nHi = 0;
    for (const t of proj) { if (t < lo + cut) nLo++; if (t > hi - cut) nHi++; }
    // Spitze = dünneres Ende (der Flight ist breiter)
    const t = nLo < nHi ? lo : hi;
    return [mx + ax * t, my + ay * t];
  }
}
