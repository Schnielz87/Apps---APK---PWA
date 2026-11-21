// Simuliert jedes Spiel mit allen Optionen (CPU gegen CPU) – prüft, dass es fehlerfrei endet.
// Aufruf: node Darts/test/games.test.mjs
import { GAMES } from '../web/js/games.js';
import { throwAt, CPU_LEVELS } from '../web/js/board.js';
import { bestCheckout } from '../web/js/checkout.js';
import assert from 'node:assert/strict';

let runs = 0;
function combos(opts) {
  let out = [{}];
  for (const o of opts) out = out.flatMap((c) => o.values.map((v) => ({ ...c, [o.key]: v })));
  return out;
}
for (const G of GAMES) {
  const cfgs = combos(G.meta.options);
  for (const cfg of cfgs.slice(0, 60)) {
    for (const n of [G.meta.min, Math.min(G.meta.max, 3)]) {
      for (let rep = 0; rep < 3; rep++) {
        const players = Array.from({ length: n }, (_, i) => ({ id: 'c' + i, name: 'CPU' + i, cpu: 1 + ((i * 4 + rep * 3) % 10) }));
        const g = new G(cfg, players);
        let darts = 0;
        while (!g.s.over && darts < 6000) {
          const p = g.players[g.cur];
          const t = throwAt(g.cpuTarget(), CPU_LEVELS[p.cpu].sigma);
          g.throwDart(t.dart);
          darts++;
          g.hint(); g.players.forEach((_, i) => g.panel(i));
          if (darts % 17 === 0 && g.canUndo()) { g.undo(); }
        }
        assert.ok(g.s.over, `${G.meta.id} ${JSON.stringify(cfg)} n=${n} endet nicht`);
        assert.ok(g.s.winner != null && g.s.winner >= 0 && g.s.winner < n, `${G.meta.id} ohne Sieger`);
        const res = g.result();
        assert.equal(res.length, n);
        JSON.stringify(g.s);
        runs++;
      }
    }
  }
}
// X01 mit Tastatur-Eingabe
{
  const X01 = GAMES[0];
  const g = new X01({ start: 501, in: 'straight', out: 'double', legs: 2, sets: 1 }, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const seq = [180, 100, 180, 100, 141]; // A: 501-180-180-141=0
  for (const v of seq) { const left = g.s.rest[g.cur]; g.enterVisit(v, { darts: left === v ? 3 : undefined }); }
  assert.equal(g.s.legs[0], 1, 'Leg für A');
  assert.equal(g.s.rest[0], 501, 'neues Leg');
  assert.equal(g.cur, 1, 'B wirft das zweite Leg an');
  const r = g.enterVisit(179);
  assert.equal(r.type, 'invalid');
  g.enterVisit(60); // B 441
  const before = g.s.rest[0];
  g.enterVisit(200);
  assert.equal(g.s.rest[0], before, '200 ungültig');
  // Bust
  g.s.rest[0] = 40; g.enterVisit(41); assert.equal(g.s.rest[0], 40, 'Bust');
  runs++;
}
// Checkout-Rechner
assert.equal(bestCheckout(170).map((d) => d.seg * d.mult).join(','), '60,60,50');
assert.equal(bestCheckout(169), null);
assert.equal(bestCheckout(2).length, 1);
for (let r = 2; r <= 170; r++) {
  const c = bestCheckout(r);
  if ([169, 168, 166, 165, 163, 162, 159].includes(r)) { assert.equal(c, null, r + ' ist Bogey'); continue; }
  assert.ok(c, 'Checkout für ' + r);
  assert.equal(c.reduce((a, d) => a + d.seg * d.mult, 0), r);
  assert.equal(c[c.length - 1].mult, 2);
}
console.log(`OK – ${runs} simulierte Spiele, Checkouts 2–170 geprüft`);
