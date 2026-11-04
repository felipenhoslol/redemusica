// WCAG AA contrast of the 2016 skin, read from css/skin-yt2016.css itself: run with `node --test tools/skinContrast.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/skin-yt2016.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(theme) {
  const sel = `:root[data-skin="yt2016"][data-theme="${theme}"] {`;
  const start = css.indexOf(sel);
  assert.ok(start >= 0, `missing ${theme} block`);
  const body = css.slice(start + sel.length, css.indexOf('}', start));
  const vars = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[name] = value.trim();
  return vars;
}

function hex(vars, name) {
  let v = vars[name];
  for (let i = 0; v?.startsWith('var('); i++) {
    assert.ok(i < 10, `${name}: var() cycle`);
    v = vars[/var\((--[\w-]+)/.exec(v)[1]];
  }
  assert.match(v ?? '', /^#([0-9a-f]{3}|[0-9a-f]{6})$/i, `${name} must be a hex colour, got ${v}`);
  return v;
}

function luminance(h) {
  h = h.slice(1);
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('contrast math matches known WCAG values', () => {
  assert.equal(ratio('#000', '#fff').toFixed(1), '21.0');
  assert.equal(ratio('#767676', '#fff').toFixed(2), '4.54');
});

const TEXT = [ // [foreground, background], 4.5:1 (11–13px is normal text)
  ['--text', '--bg'], ['--text', '--surface'],
  ['--text-2', '--bg'], ['--text-2', '--surface'],
  ['--yt-link', '--bg'], ['--yt-link', '--surface'],
  ['--yt-title', '--surface'],
  ['--accent', '--bg'], ['--accent', '--surface'], // the app paints text with --accent in ~60 places
  ['--accent', '--accent-soft'], ['--accent', '--hover'], // fallback initials, cover placeholders
  ['--danger', '--surface'], ['--danger', '--accent-soft'], ['--danger', '--hover'],
  ['--on-accent', '--accent'],
  ['--yt-active-text', '--yt-active-bg'], // active guide item, primary buttons
  ['--yt-sub-text', '--yt-sub-bg'],
  ['--yt-btn-text', '--yt-btn-bg'],
  ['--yt-section-title', '--surface'],
  ['--text', '--yt-input-bg'],
  ['--yt-avatar-text', '--yt-avatar-bg'],
  ['--yt-toast-text', '--yt-toast-bg'],
];
const ICONS = [['--text-2', '--surface'], ['--accent', '--surface'], ['--yt-active-text', '--yt-active-bg']]; // 3:1

for (const theme of ['light', 'dark']) {
  test(`${theme}: text pairs reach 4.5:1`, () => {
    const v = block(theme);
    for (const [fg, bg] of TEXT) {
      const r = ratio(hex(v, fg), hex(v, bg));
      assert.ok(r >= 4.5, `${theme} ${fg} on ${bg}: ${r.toFixed(2)}:1`);
    }
  });
  test(`${theme}: icons reach 3:1`, () => {
    const v = block(theme);
    for (const [fg, bg] of ICONS) {
      const r = ratio(hex(v, fg), hex(v, bg));
      assert.ok(r >= 3, `${theme} ${fg} on ${bg}: ${r.toFixed(2)}:1`);
    }
  });
}

test('light and dark declare the same variables', () => {
  assert.deepEqual(Object.keys(block('dark')).sort(), Object.keys(block('light')).sort());
});

test('components take colours from variables, not literals', () => {
  const rules = css.replace(/:root\[data-skin="yt2016"\]\[data-theme="\w+"\]\s*\{[^}]*\}/g, '').replace(/\[style\*="[^"]*"\]/g, '');
  assert.deepEqual(rules.match(/#[0-9a-f]{3,6}\b|rgba?\(/gi) ?? [], []);
});

test('no brand name in css/', async () => {
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(new URL('../css/', import.meta.url))) {
    assert.doesNotMatch(readFileSync(new URL(`../css/${f}`, import.meta.url), 'utf8'), /youtube/i, f);
  }
});
