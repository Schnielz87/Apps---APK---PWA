// Checkout-Rechner: beste Wege zum Finish (Double-, Master- oder Single-Out) mit 1–3 Darts.
import { dart, value, label } from './board.js';

const ALL = [];
for (let s = 1; s <= 20; s++) for (const m of [1, 2, 3]) ALL.push(dart(s, m));
ALL.push(dart(25, 1), dart(25, 2));

// Beliebtheit der Finish-Doppel (kleiner = besser)
const DOUBLE_RANK = { 16: 0, 20: 1, 8: 2, 18: 3, 12: 4, 10: 5, 4: 6, 6: 7, 14: 8, 2: 9, 1: 9, 9: 11, 19: 11, 17: 12, 15: 12, 13: 13, 11: 13, 7: 13, 5: 13, 3: 13, 25: 10 };
const GOOD_SEG = { 20: 0, 19: 1, 18: 3, 17: 3, 16: 2, 15: 4, 25: 4 };

function finishOk(d, mode) {
  if (mode === 'single') return d.seg !== 0;
  if (mode === 'master') return d.mult >= 2;
  return d.mult === 2;
}

function cost(route, mode) {
  const last = route[route.length - 1];
  let c = route.length * 100;
  if (mode === 'single') {
    c += last.mult === 1 ? 0 : last.mult === 2 ? 4 : 6;
  } else {
    c += (DOUBLE_RANK[last.seg] ?? 14) * 2 + (last.mult === 3 ? 6 : 0);
  }
  for (let i = 0; i < route.length - 1; i++) {
    const d = route[i];
    c += d.mult === 3 ? 6 : d.mult === 2 ? 26 : 0;
    c += (GOOD_SEG[d.seg] ?? 6) * (d.mult === 3 ? 2 : 1);
    if (d.seg === 25) c += d.mult === 2 ? 18 : 10;
  }
  return c;
}

const cache = new Map();

/** Bester Finish-Weg für `rest` mit höchstens `dartsLeft` Darts oder null. */
export function bestCheckout(rest, dartsLeft = 3, mode = 'double') {
  const key = `${rest}|${dartsLeft}|${mode}`;
  if (cache.has(key)) return cache.get(key);
  let best = null, bestC = Infinity;
  const consider = (r) => {
    const c = cost(r, mode);
    if (c < bestC) { bestC = c; best = r; }
  };
  if (rest > 0 && rest <= 180) {
    for (const a of ALL) {
      if (value(a) === rest && finishOk(a, mode)) consider([a]);
    }
    if (dartsLeft >= 2) {
      for (const a of ALL) {
        const r1 = rest - value(a);
        if (r1 <= 0) continue;
        for (const b of ALL) if (value(b) === r1 && finishOk(b, mode)) consider([a, b]);
      }
    }
    if (dartsLeft >= 3 && !best) {
      for (const a of ALL) {
        const r1 = rest - value(a);
        if (r1 <= 1) continue;
        for (const b of ALL) {
          const r2 = r1 - value(b);
          if (r2 <= 0) continue;
          for (const c of ALL) if (value(c) === r2 && finishOk(c, mode)) consider([a, b, c]);
        }
      }
    }
  }
  cache.set(key, best);
  return best;
}

export const checkoutText = (route) => (route ? route.map(label).join(' · ') : '');

/** Kann man diesen Rest überhaupt noch checken (bei Double-Out: 169, 168, 166, 165, 163, 162, 159 nicht)? */
export const isFinishable = (rest, mode = 'double') => !!bestCheckout(rest, 3, mode);

/** Mindestanzahl Darts für ein Finish (oder 0). */
export function minDarts(rest, mode = 'double') {
  for (let n = 1; n <= 3; n++) {
    const r = bestCheckout(rest, n, mode);
    if (r && r.length <= n) return n;
  }
  return 0;
}

const GOOD_LEAVES = [32, 40, 16, 36, 24, 20, 8, 12, 50, 18, 28, 10, 4];

/**
 * Ziel für die CPU (und den Tipp „Stellen“): Finish versuchen, sonst eine gute Doppel-Zahl stellen, sonst T20/T19.
 */
export function aimFor(rest, dartsLeft, mode = 'double') {
  const route = bestCheckout(rest, dartsLeft, mode);
  if (route && route.length <= dartsLeft) return route[0];
  if (rest > 170 || rest > 60 + 40) {
    // T19 wenn T20 einen „Bogey“-Rest (keine Chance) hinterlässt
    const after20 = rest - 60;
    if (after20 <= 170 && after20 > 1 && !isFinishable(after20, mode) && isFinishable(rest - 57, mode)) return dart(19, 3);
    return dart(20, 3);
  }
  // Stellen mit einer Single-Zahl
  for (const leave of GOOD_LEAVES) {
    const need = rest - leave;
    if (need >= 1 && need <= 20) return dart(need, 1);
    if (need === 25) return dart(25, 1);
  }
  if (rest > 60) return dart(20, 3);
  return dart(Math.min(20, Math.max(1, rest - 32)), 1);
}
