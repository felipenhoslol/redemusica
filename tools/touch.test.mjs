// Guards how the CSS behaves on touch phones vs. mouse desktops: run with `node --test tools/touch.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const CSS_DIR = new URL('../css/', import.meta.url);

// Every style rule in css/*.css (or just `file`), with the at-rule preludes that wrap it
export function cssRules(file) {
  const files = file ? [file] : readdirSync(CSS_DIR).filter(f => f.endsWith('.css')).sort();
  const rules = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, CSS_DIR), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const stack = [];
    let buf = '';
    let quote = null;
    for (const ch of src) {
      if (quote) { buf += ch; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
      if (ch === '{') {
        const prelude = buf.trim().replace(/\s+/g, ' ');
        stack.push({ prelude, at: prelude.startsWith('@') });
        buf = '';
      } else if (ch === '}') {
        const open = stack.pop();
        if (open && !open.at) rules.push({
          file: f,
          selectors: open.prelude.split(',').map(s => s.trim()).filter(Boolean),
          body: buf.trim(),
          media: stack.filter(s => s.at).map(s => s.prelude),
        });
        buf = '';
      } else if (ch === ';' && !stack.length) {
        buf = ''; // top-level @import / @charset
      } else buf += ch;
    }
  }
  return rules;
}

export const mouseOnly = (r) => r.media.some(m => /\(hover:\s*hover\)/.test(m));
export const touchOnly = (r) => r.media.some(m => /\(hover:\s*none\)/.test(m));
export const MOVES = /(^|[;\s])(transform|translate|scale|rotate|box-shadow)\s*:\s*(?!none\b)/;

test('hover that moves or casts a shadow only applies with a mouse', () => {
  const stuck = cssRules().filter(r => !mouseOnly(r) && !touchOnly(r) && MOVES.test(r.body))
    .flatMap(r => r.selectors.filter(s => s.includes(':hover')).map(s => `${r.file} ${s}`));
  assert.deepEqual(stuck, []);
});

test('desktop keeps every hover lift (36 today: 35 to move + 1 already guarded)', () => {
  const kept = cssRules().filter(r => mouseOnly(r) && MOVES.test(r.body)).flatMap(r => r.selectors.filter(s => s.includes(':hover')));
  assert.ok(kept.length >= 36, `only ${kept.length}`);
  for (const s of ['.profile-playlist-card:hover', '.player-ctrl-btn:hover', '.player-play-btn:hover', '.gif-picker-item:hover',
    '.star-pick-btn:hover', '.dm-send-btn:hover', '.dm-attach-btn:hover', '.doodle-btn:hover', '.auth-submit:hover:not(:disabled)'])
    assert.ok(kept.includes(s), s);
});

test('the profile vinyl slides with translate, never animates left, and the spin stays on transform', () => {
  const disk = cssRules().filter(r => r.selectors.some(s => s.includes('.featured-vinyl-disk')));
  assert.ok(disk.every(r => !/transition:[^;]*\bleft\b/.test(r.body)));
  const slid = disk.filter(r => /(^|[;\s])left\s*:/.test(r.body) && r.selectors.some(s => /:hover|\.playing/.test(s)));
  assert.deepEqual(slid.map(r => r.selectors.join()), []);
  assert.ok(disk.some(r => r.selectors.includes('.featured-vinyl-disk.playing') && /translate:\s*14px/.test(r.body)));
  assert.ok(disk.some(r => mouseOnly(r) && r.selectors.includes('.featured-vinyl-stage:hover .featured-vinyl-disk')));
  assert.ok(cssRules('profile.css').some(r => r.media[0] === '@keyframes spinVinyl' && /transform:\s*rotate/.test(r.body)));
});

test('player bars change size with transform or clip-path only', () => {
  const bars = cssRules().filter(r => r.selectors.some(s => /\.(progress-track|progress-fill|player-vol-fill)\b/.test(s)));
  assert.deepEqual(bars.filter(r => /transition[^;]*\b(width|height)\b/.test(r.body)).map(r => r.file + ' ' + r.selectors.join()), []);
  assert.ok(!bars.some(r => r.selectors.some(s => s.includes(':hover')) && /(^|[;\s])height\s*:\s*8px/.test(r.body)));
  const ui = readFileSync('js/ui.js', 'utf8');
  assert.ok(!/player-vol-fill[^>]*width:/.test(ui) && !/fill\.style\.width/.test(ui));
  assert.match(ui, /scaleX\(/);
});

test('no hover done in JavaScript', () => {
  for (const f of readdirSync('js').filter(f => f.endsWith('.js')))
    assert.doesNotMatch(readFileSync(`js/${f}`, 'utf8'), /onmouse(over|out|enter|leave)=/, f);
});
test('tapping anything, even a clickable div, does not flash', () => {
  assert.ok(cssRules('motion.css').some(r => r.selectors.includes('html') && /-webkit-tap-highlight-color:\s*transparent/.test(r.body)));
});
// cssRules splits selectors on every comma, so the :has() list is rejoined before matching
const INSIDE = ':not(:has(button:active, a:active, [onclick]:active, [role="button"]:active))';
test('cards and list rows sink when pressed, but not when the press is on a button or clickable child inside', () => {
  const press = cssRules('motion.css').filter(r => /transform:\s*scale\(0\.98/.test(r.body)).map(r => r.selectors.join(', ')).join(', ');
  for (const c of ['.playlist-card', '.q-card', '.chat-contact-card', '.search-row', '.playlist-track-row', '.me-sheet-item'])
    assert.ok(press.includes(c + ':active' + INSIDE), c);
});
test('on desktop a lifted card stays lifted while the mouse button is held', () => {
  const held = cssRules().filter(mouseOnly).map(r => [r.selectors.join(', '), r.body]);
  for (const [c, y] of [['.playlist-card', -4], ['.profile-playlist-card', -4], ['.share-option-card', -2]])
    assert.ok(held.some(([s, b]) => s.includes(c + ':hover:active' + INSIDE) && b.includes(`translateY(${y}px) scale(.98)`)), c);
});
test('delete-comment and review stars have a 40px touch area', () => {
  const del = cssRules('feed.css').find(r => r.selectors.includes('.comment-delete-btn::before'));
  assert.match(del.body, /width:\s*40px/); assert.match(del.body, /height:\s*40px/);
  assert.match(cssRules('feed.css').find(r => r.selectors.includes('.review-star')).body, /padding:\s*4px/);
  assert.ok(cssRules().some(r => mouseOnly(r) && r.selectors.includes('.review-star:hover')));
});
