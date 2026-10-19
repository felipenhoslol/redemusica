#!/usr/bin/env node
// Rewrites literal font sizes to the 4 type tokens (docs/superpowers/specs/2026-10-19-visual-refresh-design.md):
//   Detail 13px · Text 15px · Name 16px · Title 22px   (css/tokens.css: --fs-detail, --fs-text, --fs-name, --fs-title)
// Covers `font-size: …` and the size inside `font: …` shorthands, in css/*.css and in JS template strings.
// Leaves alone: em/% sizes, sizes above 1.6rem / 25.6px (decorative), tokens.css, auth.css, pages.css, bioFonts.js.
// --weights: instead, maps font weights to the 3 allowed ones (500 → 400; 600 and 700 → 800), in font-weight and font shorthands.
// Usage: node tools/type-codemod.mjs [--weights] [--dry]

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dry = process.argv.includes('--dry');
const weights = process.argv.includes('--weights');
const WEIGHT = { 500: '400', 600: '800', 700: '800' };
const weightRe = /(font-weight\s*:\s*)(500|600|700)\b/gi;
const shortWeightRe = /(\bfont\s*:\s*(?:[a-z-]+\s+)*)(500|600|700)(?=\s)/gi;
function rewriteWeights(text) {
  let count = 0;
  const swap = (m, pre, w) => { count++; return pre + WEIGHT[w]; };
  return { out: text.replace(weightRe, swap).replace(shortWeightRe, swap), count };
}
const SKIP = new Set(['tokens.css', 'auth.css', 'pages.css', 'bioFonts.js']);

/** px value → token, or null to keep */
function tokenFor(px) {
  if (px > 25.6) return null;
  if (px < 14.5) return 'var(--fs-detail)';
  if (px < 15.6) return 'var(--fs-text)';
  if (px < 18.5) return 'var(--fs-name)';
  return 'var(--fs-title)';
}
const toPx = (n, unit) => (unit === 'px' ? n : n * 16);

const SIZE = String.raw`(\d*\.?\d+)(rem|px)\b`;
const fontSizeRe = new RegExp(String.raw`(font-size\s*:\s*)` + SIZE, 'gi');
// font shorthand: optional style/weight words, then the size, optionally /line-height
const fontShortRe = new RegExp(String.raw`(\bfont\s*:\s*(?:[a-z-]+\s+|\d{3}\s+)*)` + SIZE, 'gi');

function rewrite(text) {
  let count = 0;
  const swap = (m, pre, n, unit) => {
    const token = tokenFor(toPx(parseFloat(n), unit));
    if (!token) return m;
    count++;
    return pre + token;
  };
  const out = text.replace(fontSizeRe, swap).replace(fontShortRe, swap);
  return { out, count };
}

let total = 0;
for (const dir of ['css', 'js']) {
  for (const name of readdirSync(join(root, dir))) {
    if (SKIP.has(name) || !/\.(css|js)$/.test(name)) continue;
    const file = join(root, dir, name);
    const { out, count } = (weights ? rewriteWeights : rewrite)(readFileSync(file, 'utf8'));
    if (!count) continue;
    total += count;
    console.log(`${String(count).padStart(4)}  ${dir}/${name}`);
    if (!dry) writeFileSync(file, out);
  }
}
console.log(`${total} ${weights ? 'weights' : 'sizes'} ${dry ? 'would be ' : ''}rewritten`);
