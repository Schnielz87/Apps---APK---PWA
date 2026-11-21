// Dartscheibe: Geometrie (offizielle Maße in mm), Treffer-Auswertung, SVG-Zeichnung und Wurf-Simulation für die CPU.

export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const R = { bull: 6.35, outer: 15.9, tripleIn: 99, tripleOut: 107, doubleIn: 162, doubleOut: 170 };

/** Ein Dart: seg 1–20, 25 (Bull) oder 0 (daneben); mult 1/2/3 (Bull: 1 = Single Bull 25, 2 = Bullseye 50). */
export const dart = (seg, mult = 1) => ({ seg, mult: seg === 0 ? 0 : mult });
export const MISS = Object.freeze({ seg: 0, mult: 0 });
export const value = (d) => (d.seg === 0 ? 0 : d.seg * d.mult);
export const isDouble = (d) => d.mult === 2;

export function label(d) {
  if (!d || d.seg === 0) return 'Miss';
  if (d.seg === 25) return d.mult === 2 ? 'Bull' : '25';
  return (d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : '') + d.seg;
}

/** Text wie „T20“, „D16“, „Bull“, „25“, „S5“, „7“ → Dart. */
export function parse(txt) {
  const t = String(txt).trim().toUpperCase();
  if (t === 'BULL' || t === 'DB' || t === 'D25' || t === '50') return dart(25, 2);
  if (t === '25' || t === 'SB' || t === 'OB') return dart(25, 1);
  if (t === 'MISS' || t === '0' || t === 'M') return MISS;
  const m = /^([SDT]?)(\d{1,2})$/.exec(t);
  if (!m) return null;
  const seg = +m[2];
  if (seg < 1 || seg > 20) return null;
  return dart(seg, m[1] === 'T' ? 3 : m[1] === 'D' ? 2 : 1);
}

/** Punkt (mm, Mitte = 0/0, y nach unten) → Dart. */
export function hitAt(x, y) {
  const r = Math.hypot(x, y);
  if (r <= R.bull) return dart(25, 2);
  if (r <= R.outer) return dart(25, 1);
  if (r > R.doubleOut) return MISS;
  // Winkel: 0° = oben (20), im Uhrzeigersinn
  let a = (Math.atan2(x, -y) * 180) / Math.PI;
  if (a < 0) a += 360;
  const seg = ORDER[Math.floor(((a + 9) % 360) / 18)];
  if (r >= R.tripleIn && r <= R.tripleOut) return dart(seg, 3);
  if (r >= R.doubleIn) return dart(seg, 2);
  return dart(seg, 1);
}

/** Zielpunkt (Mitte des Feldes) für einen Dart. */
export function aimPoint(d) {
  if (!d || d.seg === 0) return { x: 0, y: -185 };
  if (d.seg === 25) return { x: 0, y: 0 };
  const i = ORDER.indexOf(d.seg);
  const ang = (i * 18 * Math.PI) / 180;
  const r = d.mult === 3 ? 103 : d.mult === 2 ? 166 : 135; // Single: großes äußeres Feld
  return { x: Math.sin(ang) * r, y: -Math.cos(ang) * r };
}

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * CPU-Stufen 1–10. sigma = Streuung in mm (kalibriert per Simulation, siehe tools/kalibrieren.mjs):
 * ungefährer 3-Dart-Schnitt im 501 steht in avg.
 */
export const CPU_LEVELS = [
  null,
  { name: 'Anfänger', sigma: 34.5, avg: 25 },
  { name: 'Kneipe', sigma: 24.1, avg: 35 },
  { name: 'Hobby', sigma: 18.5, avg: 45 },
  { name: 'Vereinsspieler', sigma: 14.5, avg: 55 },
  { name: 'Ligaspieler', sigma: 12.2, avg: 65 },
  { name: 'Fortgeschritten', sigma: 10.2, avg: 75 },
  { name: 'Regional-Ass', sigma: 8.4, avg: 85 },
  { name: 'Turnierspieler', sigma: 7.0, avg: 95 },
  { name: 'Profi', sigma: 5.8, avg: 105 },
  { name: 'Weltklasse', sigma: 4.9, avg: 115 },
];

/** Wurf auf ein Ziel mit Streuung sigma → {dart, x, y}. */
export function throwAt(target, sigma) {
  const p = aimPoint(target);
  const x = p.x + gauss() * sigma;
  const y = p.y + gauss() * sigma;
  return { dart: hitAt(x, y), x, y };
}

// ---------------------------------------------------------------- SVG

const C = { black: '#141414', cream: '#efe3c4', red: '#d32f2f', green: '#1b8a3a', wire: '#9aa0a6' };

function arcPath(r1, r2, a1, a2) {
  const p = (r, a) => {
    const rad = (a * Math.PI) / 180;
    return `${(Math.sin(rad) * r).toFixed(2)} ${(-Math.cos(rad) * r).toFixed(2)}`;
  };
  return `M${p(r1, a1)} L${p(r2, a1)} A${r2} ${r2} 0 0 1 ${p(r2, a2)} L${p(r1, a2)} A${r1} ${r1} 0 0 0 ${p(r1, a1)}Z`;
}

/**
 * Komplette Scheibe als SVG-Text. heat: optionale Map label→0..1 für die Treffer-Heatmap.
 * Jedes Feld trägt data-seg/data-mult, damit Antippen direkt den Dart ergibt.
 */
export function boardSvg({ heat = null, numbers = true, id = '' } = {}) {
  let s = `<svg ${id ? `id="${id}"` : ''} class="board" viewBox="-225 -225 450 450" xmlns="http://www.w3.org/2000/svg">`;
  s += `<circle r="225" fill="#0b0b0b"/><circle r="${R.doubleOut + 2}" fill="${C.black}"/>`;
  const ring = (r1, r2, mult, colA, colB) => {
    ORDER.forEach((seg, i) => {
      const a1 = i * 18 - 9, a2 = i * 18 + 9;
      let fill = i % 2 === 0 ? colA : colB;
      const key = label({ seg, mult });
      if (heat) fill = heatColor(heat[key] || 0, i % 2 === 0);
      s += `<path class="bseg" data-seg="${seg}" data-mult="${mult}" d="${arcPath(r1, r2, a1, a2)}" fill="${fill}" stroke="${C.wire}" stroke-width="0.6"/>`;
    });
  };
  ring(R.outer, R.tripleIn, 1, C.black, C.cream);
  ring(R.tripleIn, R.tripleOut, 3, C.red, C.green);
  ring(R.tripleOut, R.doubleIn, 1, C.black, C.cream);
  ring(R.doubleIn, R.doubleOut, 2, C.red, C.green);
  const ob = heat ? heatColor(heat['25'] || 0, false) : C.green;
  const bb = heat ? heatColor(heat.Bull || 0, true) : C.red;
  s += `<circle class="bseg" data-seg="25" data-mult="1" r="${R.outer}" fill="${ob}" stroke="${C.wire}" stroke-width="0.6"/>`;
  s += `<circle class="bseg" data-seg="25" data-mult="2" r="${R.bull}" fill="${bb}" stroke="${C.wire}" stroke-width="0.6"/>`;
  if (numbers) {
    ORDER.forEach((seg, i) => {
      const a = (i * 18 * Math.PI) / 180;
      s += `<text x="${(Math.sin(a) * 196).toFixed(1)}" y="${(-Math.cos(a) * 196 + 7).toFixed(1)}" text-anchor="middle" font-size="21" font-weight="700" fill="#f5f5f5" font-family="inherit" pointer-events="none">${seg}</text>`;
    });
  }
  s += `<g class="marks"></g></svg>`;
  return s;
}

function heatColor(v, dark) {
  if (v <= 0) return dark ? '#1d1d1d' : '#2b2b2b';
  const h = 50 - v * 50; // gelb → rot
  return `hsl(${h} 95% ${30 + v * 25}%)`;
}

/** Markierung (Dartspitze) auf einem gezeichneten Board setzen. */
export function markDart(svg, x, y, cls = '') {
  const g = svg.querySelector('.marks');
  if (!g) return;
  const ns = 'http://www.w3.org/2000/svg';
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', x);
  c.setAttribute('cy', y);
  c.setAttribute('r', 6);
  c.setAttribute('class', 'mark ' + cls);
  g.appendChild(c);
}
export function clearMarks(svg) {
  const g = svg && svg.querySelector('.marks');
  if (g) g.innerHTML = '';
}

/** Zufälliger Punkt im Feld (für die Markierung manuell eingegebener Darts). */
export function pointIn(d) {
  if (d.seg === 0) {
    const a = Math.random() * Math.PI * 2;
    return { x: Math.sin(a) * 190, y: -Math.cos(a) * 190 };
  }
  if (d.seg === 25) {
    const r = d.mult === 2 ? Math.random() * 4 : 9 + Math.random() * 5;
    const a = Math.random() * Math.PI * 2;
    return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
  }
  const i = ORDER.indexOf(d.seg);
  const ang = ((i * 18 + (Math.random() * 12 - 6)) * Math.PI) / 180;
  const r = d.mult === 3 ? 100 + Math.random() * 5 : d.mult === 2 ? 163 + Math.random() * 5 : 112 + Math.random() * 45;
  return { x: Math.sin(ang) * r, y: -Math.cos(ang) * r };
}
