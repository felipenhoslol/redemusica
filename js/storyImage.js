// Story images (1080×1920 PNG) for Instagram: "Desafio das 30 Músicas" done and a star ranking.
// Drawn on <canvas> from the approved 360×640 mockup, every measure ×3. Colors come from the live tokens.
import { getHighResArtwork } from './api.js';
import { normalize } from './musicResults.js';
import { ICONS } from './icons.js';

export const STORY_W = 1080;
export const STORY_H = 1920;
const S = 3;                 // mockup px → story px
const PAD_X = 28 * S;
const PAD_TOP = 40 * S;
const INNER_W = STORY_W - PAD_X * 2;
const FONT = '"M PLUS Rounded 1c", system-ui, sans-serif';
const STAR = 'M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26Z';

const DARK = { bg: '#0b0a10', hover: '#1c1925', line: '#2a2633', text: '#f1ecf8', text2: '#a59db3', accent: '#b56cff' };

/** Story colors from the live tokens; `get(name)` reads a CSS custom property. Missing ones fall back to the dark theme. */
export function storyPalette(get, theme = 'dark') {
  const v = (name, fb) => String(get(name) || '').trim() || fb;
  return { theme: theme === 'light' ? 'light' : 'dark', bg: v('--bg', DARK.bg), hover: v('--hover', DARK.hover), line: v('--line', DARK.line),
    text: v('--text', DARK.text), text2: v('--text-2', DARK.text2), accent: v('--accent', DARK.accent) };
}

/** "Discografia do Radiohead" → "ranking-discografia-do-radiohead.png" */
export function storyFilename(kind, title = '') {
  if (kind === 'challenge') return 'desafio-30-musicas.png';
  const slug = normalize(title).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `ranking${slug ? '-' + slug : ''}.png`;
}

/** The 30 cover squares: 5 columns × 6 rows, 5px gaps (mockup), starting at `top`. */
export function challengeGrid(top, count = 30) {
  const gap = 5 * S;
  const size = (INNER_W - gap * 4) / 5;
  return Array.from({ length: count }, (_, i) => ({ x: PAD_X + (i % 5) * (size + gap), y: top + Math.floor(i / 5) * (size + gap), size }));
}

/** #1 big and centered; 2nd–5th in a 2×2 grid under a divider. Only the places that exist. */
export function rankingLayout(top, count) {
  const heroSize = 196 * S;
  const hero = count ? { x: (STORY_W - heroSize) / 2, y: top, size: heroSize } : null;
  const textTop = top + heroSize + 12 * S;
  const heroBottom = textTop + (11 + 2 + 23 + 6 + 16) * S; // "1º lugar", title, stars
  const divider = count > 1 ? heroBottom + 16 * S : null;
  const colW = (INNER_W - 16 * S) / 2;
  const mini = Array.from({ length: Math.max(0, Math.min(count, 5) - 1) }, (_, i) => ({
    x: PAD_X + (i % 2) * (colW + 16 * S), y: divider + 16 * S + Math.floor(i / 2) * (44 + 12) * S, size: 44 * S, w: colW }));
  return { hero, textTop, divider, mini };
}

/** A cover as a drawable image, or null (missing, failed, or no CORS — so the canvas never gets tainted). */
export function loadCover(url, timeout = 8000) {
  const src = getHighResArtwork(url, 600);
  if (!/^https:\/\//.test(src)) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    const done = (v) => { clearTimeout(timer); img.onload = img.onerror = null; resolve(v); };
    const timer = setTimeout(() => done(null), timeout);
    img.crossOrigin = 'anonymous';
    img.onload = () => done(img.naturalWidth ? img : null);
    img.onerror = () => done(null);
    img.src = src;
  });
}

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  return storyPalette(n => cs.getPropertyValue(n), document.documentElement.getAttribute('data-theme'));
}

// The cat logo (happy face) as an image: its colors live in css/social.css, which an SVG image can't see
async function loadCat(p) {
  const { catLogoHtml } = await import('./logo.js'); // logo.js pulls in the audio player: only load it when drawing
  const css = `.cat-head{fill:#fff${p.theme === 'light' ? ';stroke:#2a2233;stroke-width:1.5;stroke-linejoin:round' : ''}}.cat-inner{fill:#ffb3c8}.cat-eye{fill:#2a2233}
    .cat-line{fill:none;stroke:#2a2233;stroke-width:2.5;stroke-linecap:round}.cat-blush{fill:#ff8fb1;opacity:.6}.cat-nose{fill:#ff6f9c}.cat-tongue{fill:#ff8fb1}
    .cat-band{fill:none;stroke:${p.accent};stroke-width:4.4;stroke-linecap:round}.cat-cup{fill:${p.accent}}.cat-cup-shine{fill:none;stroke:rgb(255 255 255/.7);stroke-width:1.6;stroke-linecap:round}
    .cat-shadow,.m{display:none}.m-happy{display:inline}.cat-sparkle{display:none}`;
  const svg = catLogoHtml({ mood: 'happy' }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" ')
    .replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

async function loadFonts() {
  try { await Promise.all([500, 800, 900].map(w => document.fonts.load(`${w} 40px ${FONT}`))); } catch { /* system font still draws */ }
}

const font = (ctx, weight, px) => { ctx.font = `${weight} ${px * S}px ${FONT}`; };

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** Word-wraps into at most `max` lines; the last one ends in "…" if it doesn't fit. */
function wrap(ctx, text, maxW, max) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  while (words.length && lines.length < max) {
    let line = words.shift();
    while (words.length && ctx.measureText(line + ' ' + words[0]).width <= maxW) line += ' ' + words.shift();
    lines.push(line);
  }
  if (words.length) lines[lines.length - 1] += ' ' + words.join(' ');
  return lines.map((l, i) => (i === lines.length - 1 ? fit(ctx, l, maxW) : l));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function drawIcon(ctx, x, y, size, color, paths, circles = []) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  paths.forEach(d => ctx.stroke(new Path2D(d)));
  circles.forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });
  ctx.restore();
}

function drawCover(ctx, img, { x, y, size }, p, radius) {
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  if (img) {
    const s = Math.min(img.naturalWidth, img.naturalHeight); // object-fit: cover
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, x, y, size, size);
  } else {
    ctx.fillStyle = p.hover;
    ctx.fillRect(x, y, size, size);
    const icon = size * 0.32; // ICONS.music
    drawIcon(ctx, x + (size - icon) / 2, y + (size - icon) / 2, icon, p.text2, ['M9 18V5l12-2v13'], [[6, 18, 3], [18, 16, 3]]);
  }
  ctx.restore();
}

/** Five stars like getStarSVG: filled, half (left side) or outline, stroke 2. */
function drawStars(ctx, x, y, size, gap, rating, color) {
  const star = new Path2D(STAR);
  for (let n = 1; n <= 5; n++) {
    const fill = rating >= n ? 1 : rating >= n - 0.5 ? 0.5 : 0;
    ctx.save();
    ctx.translate(x + (n - 1) * (size + gap), y);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    if (fill) { ctx.save(); if (fill < 1) { ctx.beginPath(); ctx.rect(0, 0, 12, 24); ctx.clip(); } ctx.fill(star); ctx.restore(); }
    ctx.stroke(star);
    ctx.restore();
  }
}

// Kicker ("✓ DESAFIO CONCLUÍDO") + title lines; returns the y under the title
function drawHeader(ctx, p, kicker, titleLines) {
  drawIcon(ctx, PAD_X, PAD_TOP, 14 * S, p.accent, ['M8 12.5l2.7 2.7L16 9.8'], [[12, 12, 9]]);
  font(ctx, 800, 11);
  ctx.fillStyle = p.accent;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${0.07 * 11 * S}px`;
  ctx.fillText(kicker.toUpperCase(), PAD_X + 20 * S, PAD_TOP + 7 * S + 1);
  ctx.letterSpacing = '0px';
  font(ctx, 900, 26);
  ctx.fillStyle = p.text;
  ctx.textBaseline = 'top';
  const lh = 26 * 1.12 * S;
  const top = PAD_TOP + (14 + 10) * S;
  titleLines.forEach((l, i) => ctx.fillText(l, PAD_X, top + i * lh + 1 * S));
  return top + titleLines.length * lh;
}

function drawFooter(ctx, p, username, cat) {
  const lineY = STORY_H - (22 + 24 + 14) * S;
  ctx.fillStyle = p.line;
  ctx.fillRect(PAD_X, lineY, INNER_W, S);
  const mid = STORY_H - (22 + 12) * S;
  ctx.textBaseline = 'middle';
  font(ctx, 800, 13);
  ctx.fillStyle = p.text;
  ctx.fillText(fit(ctx, username, INNER_W / 2), PAD_X, mid);
  font(ctx, 800, 12);
  ctx.fillStyle = p.text2;
  ctx.textAlign = 'right';
  ctx.fillText('rede de música', STORY_W - PAD_X, mid);
  const brandW = ctx.measureText('rede de música').width;
  ctx.textAlign = 'left';
  if (cat) ctx.drawImage(cat, STORY_W - PAD_X - brandW - (6 + 24) * S, mid - 12 * S, 24 * S, 24 * S);
}

function newCanvas(p) {
  const canvas = document.createElement('canvas');
  canvas.width = STORY_W; canvas.height = STORY_H;
  // Software canvas: a one-shot export gains nothing from the GPU, and a broken GPU canvas silently drops every draw
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  return { canvas, ctx };
}

const handleOf = (u) => { const h = String(u || '').trim(); return h.startsWith('@') ? h : '@' + h; };

/** "Desafio das 30 Músicas": only the covers, in question order. `songs` = the 30 answers (missing ones get the placeholder). */
export async function renderChallengeStory(songs, username) {
  const p = readPalette();
  const [, cat, ...covers] = await Promise.all([loadFonts(), loadCat(p), ...songs.slice(0, 30).map(s => loadCover(s?.artwork))]);
  const { canvas, ctx } = newCanvas(p);
  const y = drawHeader(ctx, p, 'Desafio concluído', ['Desafio das', '30 Músicas']);
  font(ctx, 500, 13);
  ctx.fillStyle = p.text2;
  ctx.fillText('As 30 que contam quem eu sou', PAD_X, y + 6 * S);
  challengeGrid(y + (6 + 17 + 26) * S).forEach((cell, i) => drawCover(ctx, covers[i], cell, p, 3 * S));
  drawFooter(ctx, p, handleOf(username), cat);
  return canvas;
}

/** A star ranking: `items` already ranked (best first); album tracks without art use the album's. */
export async function renderRankingStory(ranking, items, username) {
  const p = readPalette();
  const subject = ranking?.subject || {};
  const top = items.slice(0, 5);
  const [, cat, ...covers] = await Promise.all([loadFonts(), loadCat(p), ...top.map(it => loadCover(it.artwork || subject.artwork))]);
  const { canvas, ctx } = newCanvas(p);
  font(ctx, 900, 26);
  const y = drawHeader(ctx, p, 'Meu ranking', wrap(ctx, subject.title || 'Ranking', INNER_W, 2));
  const L = rankingLayout(y + 16 * S, top.length);
  if (L.hero) {
    drawCover(ctx, covers[0], L.hero, p, 5 * S);
    const x = L.hero.x;
    ctx.textBaseline = 'top';
    font(ctx, 800, 11);
    ctx.fillStyle = p.accent;
    ctx.letterSpacing = `${0.06 * 11 * S}px`;
    ctx.fillText('1º LUGAR', x, L.textTop);
    ctx.letterSpacing = '0px';
    font(ctx, 900, 20);
    ctx.fillStyle = p.text;
    ctx.fillText(fit(ctx, top[0].title || '', L.hero.size), x, L.textTop + 13 * S);
    drawStars(ctx, x, L.textTop + (13 + 23 + 6) * S, 16 * S, 2 * S, Number(top[0].rating) || 0, p.text);
  }
  if (L.divider) { ctx.fillStyle = p.line; ctx.fillRect(PAD_X, L.divider, INNER_W, S); }
  L.mini.forEach((cell, i) => {
    const it = top[i + 1];
    drawCover(ctx, covers[i + 1], cell, p, 3 * S);
    const tx = cell.x + cell.size + 10 * S;
    const tw = cell.w - cell.size - 10 * S;
    // Place number and title wrap as one line of text (mockup: "2 OK / Computer"), the number in text-2
    const num = String(i + 2);
    font(ctx, 800, 12.5);
    const lines = wrap(ctx, `${num} ${it.title || ''}`, tw, 2);
    const lh = 12.5 * 1.2 * S;
    const ty = cell.y + (cell.size - (lines.length * lh + (4 + 10) * S)) / 2;
    ctx.textBaseline = 'top';
    ctx.fillStyle = p.text;
    lines.forEach((l, k) => ctx.fillText(k ? l : l.slice(num.length), tx + (k ? 0 : ctx.measureText(num).width), ty + k * lh));
    font(ctx, 900, 12.5);
    ctx.fillStyle = p.text2;
    ctx.fillText(num, tx, ty);
    drawStars(ctx, tx, ty + lines.length * lh + 4 * S, 10 * S, 2 * S, Number(it.rating) || 0, p.text);
  });
  drawFooter(ctx, p, handleOf(username), cat);
  return canvas;
}

/** canvas → PNG file download. Refuses a canvas that didn't paint (its opaque background is missing). */
export function downloadCanvas(canvas, filename) {
  // A dead canvas exports a fully transparent PNG, which viewers show as all black
  if (canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] !== 255) return Promise.reject(new Error('blank canvas'));
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) return reject(new Error('toBlob'));
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    resolve();
  }, 'image/png'));
}

/** The house button for both screens; `onclick` is the inline handler. */
export const storyButtonHtml = (onclick) =>
  `<button type="button" class="doodle-btn doodle-btn-secondary story-btn" onclick="${onclick}"><span class="ui-icon" aria-hidden="true">${ICONS.download}</span><span class="story-btn-label">Baixar imagem</span></button>`;


/** Busy state while drawing ("Gerando…", width locked so nothing moves), then the download; a toast on failure. */
export async function runStoryButton(btn, make, filename, toast) {
  if (!btn || btn.getAttribute('aria-busy') === 'true') return;
  const label = btn.querySelector('.story-btn-label');
  btn.style.minWidth = btn.offsetWidth + 'px';
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  if (label) label.textContent = 'Gerando…';
  try {
    await downloadCanvas(await make(), filename);
  } catch {
    toast?.('Não foi possível gerar a imagem. Tente de novo.');
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (label) label.textContent = 'Baixar imagem';
    btn.style.minWidth = '';
  }
}
