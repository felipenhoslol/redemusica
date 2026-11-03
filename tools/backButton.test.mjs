import { test } from 'node:test';
import assert from 'node:assert/strict';

const { backStep } = await import('../js/backButton.js'); // real import: node --check misses broken modules

test('back button: innermost thing first, then history, then feed, then leave', () => {
  const base = { dropdown: false, overlay: false, depth: 0, tab: 'feed' };
  assert.equal(backStep({ ...base, dropdown: true, overlay: true, depth: 2 }), 'dropdown');
  assert.equal(backStep({ ...base, overlay: true, depth: 2, tab: 'chat' }), 'overlay');
  assert.equal(backStep({ ...base, depth: 1, tab: 'chat' }), 'back');
  assert.equal(backStep({ ...base, tab: 'chat' }), 'feed');
  assert.equal(backStep(base), 'minimize');
});
