// Erzeugt das Logo (icons/icon.svg) und alle PNG-Icons (PWA + Android) aus derselben Vorlage.
// Aufruf: node Darts/tools/logo.mjs   (braucht Playwright/Chromium für die PNGs)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', 'web');
const res = join(here, '..', 'android', 'app', 'src', 'main', 'res');
const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

function board(cx, cy, s) {
  const p = (r, a) => [cx + Math.sin(a * Math.PI / 180) * r * s, cy - Math.cos(a * Math.PI / 180) * r * s];
  const arc = (r1, r2, a1, a2, fill) => {
    const [x1, y1] = p(r1, a1), [x2, y2] = p(r2, a1), [x3, y3] = p(r2, a2), [x4, y4] = p(r1, a2);
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}A${r2 * s} ${r2 * s} 0 0 1 ${x3.toFixed(1)} ${y3.toFixed(1)}L${x4.toFixed(1)} ${y4.toFixed(1)}A${r1 * s} ${r1 * s} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}Z" fill="${fill}"/>`;
  };
  let o = `<circle cx="${cx}" cy="${cy}" r="${190 * s}" fill="#0d0d0d"/>`;
  ORDER.forEach((_, i) => {
    const a1 = i * 18 - 9, a2 = i * 18 + 9, ev = i % 2 === 0;
    o += arc(16, 99, a1, a2, ev ? '#1a1a1a' : '#e9dcb8');
    o += arc(99, 107, a1, a2, ev ? '#d32f2f' : '#1b8a3a');
    o += arc(107, 162, a1, a2, ev ? '#1a1a1a' : '#e9dcb8');
    o += arc(162, 170, a1, a2, ev ? '#d32f2f' : '#1b8a3a');
  });
  o += `<circle cx="${cx}" cy="${cy}" r="${16 * s}" fill="#1b8a3a"/><circle cx="${cx}" cy="${cy}" r="${6.4 * s}" fill="#d32f2f"/>`;
  return o;
}

export function logo({ bg = true, pad = 0 } = {}) {
  const k = 1 - pad * 2, off = 512 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#3a1216"/><stop offset=".55" stop-color="#121417"/><stop offset="1" stop-color="#050505"/></radialGradient>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9ced6"/></linearGradient>
    <linearGradient id="rb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b71c1c"/><stop offset=".5" stop-color="#f0443f"/><stop offset="1" stop-color="#b71c1c"/></linearGradient>
  </defs>
  ${bg ? '<rect width="512" height="512" rx="112" fill="url(#g)"/>' : ''}
  <g transform="translate(${off} ${off}) scale(${k})">
    <circle cx="256" cy="250" r="206" fill="none" stroke="#ffffff" stroke-opacity=".9" stroke-width="10" stroke-dasharray="980 320" transform="rotate(-128 256 250)"/>
    <circle cx="256" cy="250" r="190" fill="none" stroke="#f5c542" stroke-opacity=".55" stroke-width="3" stroke-dasharray="420 780" transform="rotate(38 256 250)"/>
    <g opacity=".95">${board(256, 250, 1.0)}</g>
    <g transform="rotate(-9 256 262)">
      <rect x="62" y="206" width="388" height="88" rx="14" fill="#0b0b0b" stroke="#ffffff" stroke-width="6"/>
      <text x="256" y="278" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="84" fill="url(#t)" letter-spacing="2">DARTS</text>
      <rect x="138" y="296" width="236" height="50" rx="10" fill="url(#rb)" stroke="#0b0b0b" stroke-width="5"/>
      <text x="256" y="333" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="38" fill="#ffffff" letter-spacing="10">ARENA</text>
    </g>
    <g transform="translate(300 172) rotate(218)">
      <rect x="-5" y="-4" width="10" height="70" rx="3" fill="#cfd8dc"/><rect x="-9" y="60" width="18" height="46" rx="6" fill="#455a64"/>
      <path d="M0 104 L-26 150 L0 140 L26 150Z" fill="#e53935" stroke="#0b0b0b" stroke-width="3"/><path d="M0 -4 L-2 -26 L2 -26Z" fill="#eceff1"/>
    </g>
  </g>
</svg>`;
}

mkdirSync(join(web, 'icons'), { recursive: true });
writeFileSync(join(web, 'icons', 'icon.svg'), logo());

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NODE_PATH ? require.resolve('playwright', { paths: process.env.NODE_PATH.split(':') }) : 'playwright');
const br = await chromium.launch();
const page = await br.newPage();
async function png(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await png(logo(), 192, join(web, 'icons', 'icon-192.png'));
await png(logo(), 512, join(web, 'icons', 'icon-512.png'));
// maskable: Inhalt in der sicheren Zone (80 %), Hintergrund vollflächig
await png(logo().replace('rx="112"', 'rx="0"').replace('<g transform="translate(0 0) scale(1)">', '<g transform="translate(51 51) scale(0.8)">'), 512, join(web, 'icons', 'icon-maskable-512.png'));
// Android-Launcher-Icons
const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(dens)) {
  await png(logo(), s, join(res, `mipmap-${d}`, 'ic_launcher.png'));
  await png(logo().replace('rx="112"', `rx="256"`), s, join(res, `mipmap-${d}`, 'ic_launcher_round.png'));
  // Adaptive Icon: Vordergrund 108dp mit 18dp Rand
  const fs = Math.round(s * 108 / 48);
  await png(logo({ bg: false, pad: 0.17 }), fs, join(res, `mipmap-${d}`, 'ic_launcher_foreground.png'));
}
await png(logo(), 512, join(here, '..', 'store', 'icon-512.png'));
await br.close();
console.log('Icons erzeugt');
