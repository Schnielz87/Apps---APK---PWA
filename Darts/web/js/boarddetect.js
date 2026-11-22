// Automatische Erkennung der Dartscheibe im Kamerabild – ohne Server, ohne KI-Modell.
// Idee: Doppel- und Triple-Ring (und Bull) sind kräftig rot und grün. Diese Pixel suchen, Störer (Rauchmelder-LED,
// rote Gegenstände) über die Häufung aussortieren, die konvexe Hülle bilden (= Außenkante des Doppelrings) und
// daraus ein Oval (Ellipse) berechnen. Von der Seite gefilmt ist die Scheibe ein Oval – das passt automatisch.

/** Rot/Grün der Scheibe über den Farbton erkennen (robust gegen gelbe/orange Wände und warmes Licht). */
export function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx < 40 || d < 34 || d / mx < 0.38) return 0; // zu dunkel oder zu blass
  let h;
  if (mx === r) h = (60 * ((g - b) / d) + 360) % 360;
  else if (mx === g) h = 60 * ((b - r) / d) + 120;
  else h = 60 * ((r - g) / d) + 240;
  if (h <= 14 || h >= 338) return 1;  // rot (Orange beginnt ab ca. 18°)
  if (h >= 80 && h <= 175) return 2;  // grün
  return 0;
}

function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Sucht die Scheibe in einem Bild (ImageData-ähnlich: {data, width, height}).
 * Ergebnis: {cx, cy, a, b, angle, score, red, green} in Pixeln oder null.
 */
export function findBoard(img) {
  const { data, width: w, height: h } = img;
  // 1) farbige Pixel sammeln (jedes 2. Pixel genügt)
  const pts = [];
  let red = 0, green = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * 4;
    const c = classify(data[i], data[i + 1], data[i + 2]);
    if (c) { pts.push([x, y, c]); if (c === 1) red++; else green++; }
  }
  if (pts.length < 60 || red < 20 || green < 20) return null;

  // 1b) Rot und Grün liegen auf der Scheibe immer direkt nebeneinander (Ringe wechseln die Farbe):
  //     Farbflecken ohne Partner der anderen Farbe in der Nähe sind Wand, Lampe, LED … → verwerfen
  {
    const cs0 = Math.max(6, Math.round(w / 40));
    const gw0 = Math.ceil(w / cs0), gh0 = Math.ceil(h / cs0);
    const R = new Uint16Array(gw0 * gh0), G = new Uint16Array(gw0 * gh0);
    for (const [x, y, c] of pts) (c === 1 ? R : G)[((y / cs0) | 0) * gw0 + ((x / cs0) | 0)]++;
    const near = (arr, gx, gy) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = gx + dx, y = gy + dy; if (x >= 0 && y >= 0 && x < gw0 && y < gh0 && arr[y * gw0 + x]) return true; } return false; };
    const filtered = pts.filter(([x, y, c]) => near(c === 1 ? G : R, (x / cs0) | 0, (y / cs0) | 0));
    pts.length = 0; pts.push(...filtered);
    red = pts.filter((p) => p[2] === 1).length; green = pts.length - red;
    if (pts.length < 60 || red < 20 || green < 20) return null;
  }

  // 2) Dichtester Bereich: Raster-Histogramm, Zelle mit den meisten farbigen Nachbarn = Scheibe
  const cs = Math.max(8, Math.round(w / 32));
  const gw = Math.ceil(w / cs), gh = Math.ceil(h / cs);
  const grid = new Uint16Array(gw * gh);
  for (const [x, y] of pts) grid[((y / cs) | 0) * gw + ((x / cs) | 0)]++;
  let best = -1, bx = 0, by = 0;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let s = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = gx + dx, y = gy + dy; if (x >= 0 && y >= 0 && x < gw && y < gh) s += grid[y * gw + x]; }
    if (s > best) { best = s; bx = gx; by = gy; }
  }
  let cx = (bx + 0.5) * cs, cy = (by + 0.5) * cs;

  // 3) Ausreißer entfernen: iterativ nur Punkte nahe am Zentrum behalten (robust über Median-Abstand)
  let keep = pts;
  for (let it = 0; it < 4; it++) {
    const d = keep.map(([x, y]) => Math.hypot(x - cx, y - cy)).sort((a, b) => a - b);
    const med = d[d.length >> 1] || 1;
    const lim = med * 2.1;
    const k2 = keep.filter(([x, y]) => Math.hypot(x - cx, y - cy) <= lim);
    if (k2.length < 40) return null;
    keep = k2;
    cx = keep.reduce((s, p) => s + p[0], 0) / keep.length;
    cy = keep.reduce((s, p) => s + p[1], 0) / keep.length;
  }
  const r2 = keep.filter((p) => p[2] === 1).length, g2 = keep.length - r2;
  if (r2 < 15 || g2 < 15 || Math.min(r2, g2) / Math.max(r2, g2) < 0.18) return null; // eine Scheibe hat beides

  // 4) Konvexe Hülle = Außenkante des Doppelrings → Fläche rastern → Ellipse aus den Flächenmomenten
  const hp = hull(keep.map((p) => [p[0], p[1]]));
  if (hp.length < 6) return null;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (const [x, y] of hp) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  if (maxX - minX < w * 0.08 || maxY - minY < h * 0.05) return null; // zu klein
  let n = 0, sx = 0, sy = 0;
  const cells = [];
  for (let y = Math.floor(minY); y <= maxY; y += 2) for (let x = Math.floor(minX); x <= maxX; x += 2) if (inPoly(x, y, hp)) { cells.push(x, y); sx += x; sy += y; n++; }
  if (n < 30) return null;
  const mx = sx / n, my = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < cells.length; i += 2) { const dx = cells[i] - mx, dy = cells[i + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  // gefüllte Ellipse: Varianz entlang Halbachse = a²/4  →  a = 2·√λ
  const a = 2 * Math.sqrt(l1), b = 2 * Math.sqrt(Math.max(1e-6, l2));
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // Plausibilität: wie gut füllt die Hülle die Ellipse? (Scheibe = sehr rund/oval, Störer = unregelmäßig)
  const fill = n / ((Math.PI * a * b) / 4);
  if (b / a < 0.2 || fill < 0.75 || fill > 1.25) return null;
  return { cx: mx, cy: my, a, b, angle, score: Math.min(1, keep.length / 400) * (1 - Math.abs(1 - fill)), red: r2, green: g2 };
}

/**
 * Ellipse → 4 Kalibrierpunkte (normiert 0..1) für 20 / 6 / 3 / 11.
 * „Oben“ = höchster Punkt des Ovals (Scheibe hängt normal mit der 20 oben); rot = Drehung in Grad (Feinkorrektur).
 */
export function ellipseToCal(e, w, h, rot = 0) {
  const ux = Math.cos(e.angle), uy = Math.sin(e.angle), vx = -uy, vy = ux;
  const P = (t) => [e.cx + e.a * Math.cos(t) * ux + e.b * Math.sin(t) * vx, e.cy + e.a * Math.cos(t) * uy + e.b * Math.sin(t) * vy];
  // Parameter des höchsten Punkts suchen
  let tTop = 0, yMin = Infinity;
  for (let i = 0; i < 720; i++) { const t = (i / 720) * Math.PI * 2; const y = P(t)[1]; if (y < yMin) { yMin = y; tTop = t; } }
  // Richtung so wählen, dass es im Uhrzeigersinn (nach rechts) weitergeht
  const s = P(tTop + 0.05)[0] > P(tTop)[0] ? 1 : -1;
  const r = (rot * Math.PI) / 180;
  return [0, 1, 2, 3].map((k) => { const [x, y] = P(tTop + s * (r + (k * Math.PI) / 2)); return [Math.min(1, Math.max(0, x / w)), Math.min(1, Math.max(0, y / h))]; });
}
