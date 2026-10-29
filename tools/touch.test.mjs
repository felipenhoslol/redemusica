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
