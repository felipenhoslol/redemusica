// Guards the story-image layout and helpers in js/storyImage.js: run with `node --test tools/storyImage.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Bare-minimum browser stand-ins so the module (and logo.js → audio.js) loads in Node
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.document = { head: { appendChild() {} }, createElement: () => ({}), querySelectorAll: () => [], addEventListener() {} };
globalThis.Audio = class { addEventListener() {} pause() {} play() { return Promise.resolve(); } };
globalThis.CSS = { supports: () => true };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { storyPalette, storyFilename, challengeGrid, rankingLayout, loadCover, storyButtonHtml, STORY_W, STORY_H } = await import('../js/storyImage.js');

test('challenge grid: 30 equal squares, 5 per row, 6 rows, inside the 84px side margins', () => {
  const cells = challengeGrid(500);
  assert.equal(cells.length, 30);
  assert.equal(new Set(cells.map(c => c.y)).size, 6);
  assert.equal(new Set(cells.map(c => c.x)).size, 5);
  assert.equal(cells[0].x, 84);
  assert.ok(Math.abs(cells[4].x + cells[4].size - (STORY_W - 84)) < 1e-6);
  assert.equal(cells[5].y, 500 + cells[0].size + 15); // 5px gap ×3
  assert.ok(cells[29].y + cells[29].size < STORY_H - 180, 'grid stays above the footer');
});

test('ranking layout shows only the places that exist (1 to 5)', () => {
  for (let n = 0; n <= 6; n++) {
    const L = rankingLayout(400, n);
    assert.equal(!!L.hero, n > 0);
    assert.equal(L.mini.length, Math.max(0, Math.min(n, 5) - 1));
    assert.equal(L.divider !== null, n > 1);
  }
  const { hero, mini } = rankingLayout(400, 5);
  assert.equal(hero.x * 2 + hero.size, STORY_W, 'hero centered');
  assert.deepEqual(mini.map(m => [m.x === mini[0].x, m.y === mini[0].y]), [[true, true], [false, true], [true, false], [false, false]]); // 2×2
  assert.ok(mini[3].y + mini[3].size < STORY_H - 180, '2×2 stays above the footer');
});

test('palette follows the tokens, falls back to dark, keeps the theme', () => {
  const light = { '--bg': '#ffffff', '--text': '#16131d', '--accent': ' #1d6fe0 ' };
  const p = storyPalette(n => light[n], 'light');
  assert.equal(p.theme, 'light');
  assert.equal(p.bg, '#ffffff');
  assert.equal(p.accent, '#1d6fe0');
  assert.equal(p.line, '#2a2633'); // missing → dark fallback
  assert.equal(storyPalette(() => '', null).theme, 'dark');
  assert.equal(storyPalette(() => '').bg, '#0b0a10');
});

test('filenames: fixed for the challenge, accent-free slug for rankings', () => {
  assert.equal(storyFilename('challenge'), 'desafio-30-musicas.png');
  assert.equal(storyFilename('ranking', 'Discografia do Radiohead'), 'ranking-discografia-do-radiohead.png');
  assert.equal(storyFilename('ranking', 'Ação & Reação!'), 'ranking-acao-reacao.png');
  assert.equal(storyFilename('ranking', '***'), 'ranking.png');
});

test('covers: failed, missing or non-https ones resolve to null (placeholder), loaded ones ask for CORS and 600px', async () => {
  const made = [];
  globalThis.Image = class { constructor() { made.push(this); } set src(v) { this._src = v; queueMicrotask(() => (v.includes('bad') ? this.onerror?.() : (this.naturalWidth = 600, this.onload?.()))); } };
  assert.equal(await loadCover(''), null);
  assert.equal(await loadCover('http://x/a.jpg'), null);
  assert.equal(await loadCover('https://is1-ssl.mzstatic.com/bad/100x100bb.jpg'), null);
  const img = await loadCover('https://is1-ssl.mzstatic.com/a/100x100bb.jpg');
  assert.ok(img);
  assert.equal(img.crossOrigin, 'anonymous');
  assert.match(img._src, /600x600bb\.jpg$/);
});

test('cover that never answers times out to the placeholder', async () => {
  globalThis.Image = class { set src(v) {} };
  assert.equal(await loadCover('https://x/slow.jpg', 10), null);
});

test('button: house style, download icon, "Baixar imagem", no emoji', () => {
  const html = storyButtonHtml('window._x(this)');
  assert.match(html, /class="doodle-btn doodle-btn-secondary story-btn"/);
  assert.match(html, /Baixar imagem/);
  assert.match(html, /stroke-width="2"/);
  assert.doesNotMatch(html, /\p{Extended_Pictographic}/u);
});
