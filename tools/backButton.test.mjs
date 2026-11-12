import { test } from 'node:test';
import assert from 'node:assert/strict';

// backButton.js imports motion.js, which reads matchMedia and adds a <style> on load
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.document = { createElement: () => ({}), head: { appendChild() {} } };

const { backStep, openDropdowns } = await import('../js/backButton.js'); // real import: node --check misses broken modules

test('back button: innermost thing first, then history, then feed, then leave', () => {
  const base = { dropdown: false, overlay: false, depth: 0, tab: 'feed' };
  assert.equal(backStep({ ...base, dropdown: true, overlay: true, depth: 2 }), 'dropdown');
  assert.equal(backStep({ ...base, overlay: true, depth: 2, tab: 'chat' }), 'overlay');
  assert.equal(backStep({ ...base, depth: 1, tab: 'chat' }), 'back');
  assert.equal(backStep({ ...base, tab: 'chat' }), 'feed');
  assert.equal(backStep(base), 'minimize');
});

test('back button: dropdown fechando (data-open="false") já conta como fechado', () => {
  const open = { dataset: { open: 'true' } }, closing = { dataset: { open: 'false' } }, never = { dataset: {} };
  const root = (...els) => ({ querySelectorAll: () => els });
  assert.deepEqual(openDropdowns(root(open, closing, never)), [open]);
  const base = { overlay: false, depth: 1, tab: 'feed' };
  assert.equal(backStep({ ...base, dropdown: openDropdowns(root(open, closing, never)).length > 0 }), 'dropdown');
  assert.equal(backStep({ ...base, dropdown: openDropdowns(root(closing, never)).length > 0 }), 'back');
  assert.equal(backStep({ ...base, overlay: true, dropdown: openDropdowns(root(closing)).length > 0 }), 'overlay');
});
