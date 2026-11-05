#!/usr/bin/env node
/**
 * Renders the app icons (PNG) used for the home screen and install prompts.
 *
 *   node scripts/make-icons.js
 *
 * The PNGs are committed to site/, so you only need to run this when you
 * change the mark. It needs the `playwright` package (any Chromium works).
 *
 * Two designs, drawn from the same mark as favicon.svg:
 *  - FULL_BLEED: red square edge to edge. iOS rounds the corners itself and
 *    fills transparent pixels with black, so apple-touch-icon must be opaque.
 *    Android "maskable" icons also need a full-bleed image with the artwork
 *    kept inside the central 80% circle (the "safe zone").
 *  - ROUNDED: the circular favicon on a transparent background, for browsers
 *    and install dialogs that show the icon as-is.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'site');
const RED = '#b31942';
const NAVY = '#0a3161';
const CREAM = '#fbf3de';
const STAR = 'M32 14.5l4.1 12.6h13.3l-10.7 7.8 4.1 12.6L32 39.7l-10.8 7.8 4.1-12.6-10.7-7.8h13.3z';

// Artwork is scaled to 0.8 so the outer ring sits inside the maskable safe zone.
const FULL_BLEED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${RED}"/>
  <g transform="translate(32 32) scale(0.8) translate(-32 -32)">
    <circle cx="32" cy="32" r="25.5" fill="none" stroke="${CREAM}" stroke-width="2"/>
    <circle cx="32" cy="32" r="22" fill="${NAVY}"/>
    <path fill="${CREAM}" d="${STAR}"/>
  </g>
</svg>`;

const ROUNDED = fs.readFileSync(path.join(OUT, 'favicon.svg'), 'utf8');

const JOBS = [
  { file: 'apple-touch-icon.png', size: 180, svg: FULL_BLEED, transparent: false },
  { file: 'icons/icon-192.png', size: 192, svg: ROUNDED, transparent: true },
  { file: 'icons/icon-512.png', size: 512, svg: ROUNDED, transparent: true },
  { file: 'icons/icon-maskable-512.png', size: 512, svg: FULL_BLEED, transparent: false },
];

(async () => {
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  const browser = await chromium.launch();
  for (const job of JOBS) {
    const page = await browser.newPage({ viewport: { width: job.size, height: job.size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${job.size}px;height:${job.size}px}</style>${job.svg}`
    );
    await page.screenshot({ path: path.join(OUT, job.file), omitBackground: job.transparent });
    await page.close();
    console.log(`wrote site/${job.file} (${job.size}x${job.size})`);
  }
  await browser.close();
})();
