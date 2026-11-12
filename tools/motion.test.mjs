// Guards js/motion.js: run with `node --test tools/motion.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

let reduced = false;
globalThis.window = { matchMedia: () => ({ get matches() { return reduced; } }) };
globalThis.CSS = { supports: () => true };
globalThis.document = { createElement: () => ({}), head: { appendChild() {} } };

// Mid-animation or hidden: `computed`; shown and at rest: `natural`
let computed = {};
const natural = { display: 'flex', height: '120px', opacity: '1' };
globalThis.getComputedStyle = (el) =>
  el?.running?.length || !el?.style?.display || el.style.display === 'none' ? computed : natural;

const { animateSpring, toggleCollapse, isCollapseOpen, enterFrom, originFrom, SPRINGS } = await import('../js/motion.js');

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

// Element with a running animation list, so toggleCollapse/enterFrom can cancel and restart
const animEl = () => {
  const calls = [];
  const el = {
    calls, dataset: {}, style: {}, running: [],
    getAnimations: () => el.running,
    animate(kf, opts) {
      const a = { kf, opts, cancel() { el.running = el.running.filter(x => x !== a); } };
      calls.push(a); el.running.push(a); return a;
    }
  };
  return el;
};

test('toggleCollapse: abrir marca data-open e isCollapseOpen', () => {
  reduced = false;
  computed = { display: 'none', height: 'auto', opacity: '1' };
  const el = animEl();
  assert.ok(toggleCollapse(el, true));
  assert.equal(el.dataset.open, 'true');
  assert.equal(isCollapseOpen(el), true);
  assert.equal(el.calls[0].kf[0].height, '0px');
  assert.equal(el.calls[0].kf.at(-1).height, '120px');
});

test('toggleCollapse: fechar no meio parte da altura atual, com a mola smooth', () => {
  reduced = false;
  const el = animEl();
  computed = { display: 'none', height: 'auto', opacity: '1' };
  toggleCollapse(el, true);
  computed = { display: 'flex', height: '60px', opacity: '0.5' };
  toggleCollapse(el, false);
  const a = el.calls[1];
  assert.equal(a.kf[0].height, '60px');
  assert.equal(a.kf.at(-1).height, '0px');
  assert.equal(a.opts.easing, SPRINGS.smooth.easing);
  assert.deepEqual(el.running, [a]); // the opening one was cancelled
});

test('toggleCollapse: abrir, fechar, abrir segue o último pedido sem onfinish', () => {
  reduced = false;
  computed = { display: 'flex', height: '30px', opacity: '1' };
  const el = animEl();
  toggleCollapse(el, true); toggleCollapse(el, false); toggleCollapse(el, true);
  assert.equal(isCollapseOpen(el), true);
  toggleCollapse(el, false);
  assert.equal(isCollapseOpen(el), false);
});

test('toggleCollapse: movimento reduzido troca na hora e devolve null', () => {
  reduced = true;
  computed = { display: 'none', height: 'auto', opacity: '1' };
  const el = animEl();
  assert.equal(toggleCollapse(el, true, 'block'), null);
  assert.equal(el.style.display, 'block');
  assert.equal(isCollapseOpen(el), true);
  assert.equal(el.calls.length, 0);
});

test('enterFrom: parado entra do keyframe dado; em curso, do estado atual', () => {
  reduced = false;
  const el = animEl();
  const from = { opacity: 0, transform: 'translateX(16px)' };
  enterFrom(el, from);
  assert.deepEqual(el.calls[0].kf, [from, { opacity: 1, transform: 'none' }]);
  computed = { transform: 'matrix(1, 0, 0, 1, 8, 0)', opacity: '0.4' };
  enterFrom(el, from);
  assert.deepEqual(el.calls[1].kf[0], { opacity: '0.4', transform: 'matrix(1, 0, 0, 1, 8, 0)' });
  assert.deepEqual(el.running, [el.calls[1]]);
});

test('enterFrom: movimento reduzido cancela e não anima', () => {
  reduced = true;
  const el = animEl();
  el.running.push({ cancel() { el.running = []; } });
  assert.equal(enterFrom(el, { opacity: 0 }), null);
  assert.equal(el.running.length, 0);
});

test('originFrom: centro do gatilho relativo à caixa, preso aos limites dela', () => {
  const rect = (r) => ({ getBoundingClientRect: () => r });
  const trigger = rect({ left: 280, top: 10, width: 32, height: 32 });
  const box = rect({ left: 120, top: 46, width: 200, height: 180 });
  assert.equal(originFrom(trigger, box), '176px 0px');
});
