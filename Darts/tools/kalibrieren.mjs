// Kalibriert die Streuung (sigma) der CPU-Stufen so, dass der 3-Dart-Schnitt im 501 (Double-Out) dem Ziel entspricht.
// Doppel-Nervosität (dbl), Ausreißer (wild) und Tempo (pace) sind fest je Stufe (board.js). Aufruf: node Darts/tools/kalibrieren.mjs
import { cpuThrow, CPU_LEVELS } from '../web/js/board.js';
import { X01 } from '../web/js/games.js';

function play(L, legs) {
  let darts = 0, pts = 0, dblHit = 0, dblAtt = 0;
  for (let i = 0; i < legs; i++) {
    const g = new X01({ start: 501, in: 'straight', out: 'double', legs: 1, sets: 1 }, [{ id: 'c', name: 'c', cpu: 1 }]);
    let n = 0;
    while (!g.s.over && n++ < 500) {
      const rest = g.s.rest[0], tgt = g.cpuTarget();
      const t = cpuThrow(tgt, 0, L);
      const finishDbl = tgt.mult === 2 && value(tgt) === rest;
      if (finishDbl) { dblAtt++; if (t.dart.seg === tgt.seg && t.dart.mult === 2) dblHit++; }
      g.throwDart(t.dart);
    }
    darts += g.s.st[0].darts; pts += g.s.st[0].points;
  }
  return { avg: (pts / darts) * 3, dpl: darts / legs, dbl: dblHit / Math.max(1, dblAtt) };
}
const value = (d) => (d.seg === 25 ? 25 * d.mult : d.seg * d.mult);

const out = [];
for (let l = 1; l <= 10; l++) {
  const base = CPU_LEVELS[l];
  let lo = 1, hi = 120;
  for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (play({ ...base, sigma: m }, 300).avg > base.avg) lo = m; else hi = m; }
  const sigma = +((lo + hi) / 2).toFixed(1);
  const r = play({ ...base, sigma }, 2000);
  out.push(sigma);
  console.log(String(l).padEnd(3), base.name.padEnd(16), 'sigma', String(sigma).padStart(5), '| Ø', r.avg.toFixed(1).padStart(5), '| Darts/Leg', r.dpl.toFixed(1).padStart(5), '| Doppel', (r.dbl * 100).toFixed(0).padStart(3) + '%');
}
console.log('\nsigma:', JSON.stringify(out));
