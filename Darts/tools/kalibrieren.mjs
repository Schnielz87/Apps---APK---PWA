// Kalibriert die Streuung (sigma) der CPU-Stufen auf einen Ziel-3-Dart-Schnitt im 501 (Double-Out).
// Aufruf: node Darts/tools/kalibrieren.mjs
import { throwAt, value } from '../web/js/board.js';
import { aimFor } from '../web/js/checkout.js';

function avg(sigma, legs = 1500) {
  let pts = 0, darts = 0;
  for (let l = 0; l < legs; l++) {
    let rest = 501, n = 0;
    while (rest > 0 && n < 300) {
      const start = rest;
      let bust = false;
      for (let i = 0; i < 3; i++) {
        const d = throwAt(aimFor(rest, 3 - i), sigma).dart;
        n++;
        const r = rest - value(d);
        if (r < 0 || r === 1 || (r === 0 && d.mult !== 2)) { rest = start; bust = true; break; }
        rest = r;
        if (rest === 0) break;
      }
    }
    pts += 501 - rest; darts += n;
  }
  return (pts / darts) * 3;
}
for (const target of [25, 35, 45, 55, 65, 75, 85, 95, 105, 115]) {
  let lo = 2, hi = 150;
  for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (avg(m, 400) > target) lo = m; else hi = m; }
  const s = (lo + hi) / 2;
  console.log(target, s.toFixed(1), avg(s).toFixed(1));
}
