// Guards js/motion.js: run with `node --test tools/motion.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

let reduced = false;
globalThis.window = { matchMedia: () => ({ get matches() { return reduced; } }) };
globalThis.CSS = { supports: () => true };
globalThis.document = { createElement: () => ({}), head: { appendChild() {} } };

const { animateSpring } = await import('../js/motion.js');

const fakeEl = () => {
  const calls = [];
  return { calls, animate: (kf, opts) => { calls.push({ kf, opts }); return { kf, opts }; } };
};
const kf = [
  { opacity: 0, transform: 'translateY(4px)', filter: 'blur(2px)' },
  { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }
];

test('animateSpring: sem movimento reduzido anima os keyframes como vieram', () => {
  reduced = false;
  const el = fakeEl();
  assert.ok(animateSpring(el, kf, 'snappy', { fade: true }));
  assert.deepEqual(el.calls[0].kf, kf);
  assert.equal('fade' in el.calls[0].opts, false);
});

test('animateSpring: movimento reduzido devolve null e não anima', () => {
  reduced = true;
  const el = fakeEl();
  assert.equal(animateSpring(el, kf), null);
  assert.equal(el.calls.length, 0);
});

test('animateSpring: movimento reduzido com fade roda só a opacidade', () => {
  reduced = true;
  const el = fakeEl();
  assert.ok(animateSpring(el, kf, 'snappy', { fade: true, delay: 10 }));
  assert.deepEqual(el.calls[0].kf, [{ opacity: 0 }, { opacity: 1 }]);
  assert.equal('fade' in el.calls[0].opts, false);
  assert.equal(el.calls[0].opts.delay, 10);
});
