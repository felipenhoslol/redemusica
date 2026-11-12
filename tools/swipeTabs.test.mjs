// Feed swipe vs. horizontal carousels inside the feed; spring release that the finger can catch again
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BODY = { parentElement: null };
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.CSS = { supports: () => true };
globalThis.document = { body: BODY, createElement: () => ({}), head: { appendChild() {} } };
let panelComputed = { transform: 'none', opacity: '1' };
globalThis.getComputedStyle = n => n === panel ? panelComputed : { overflowX: n.overflowX ?? 'visible' };
globalThis.getSelection = () => null;

const { bindSwipeTabs, releaseKeyframes } = await import('../js/swipeTabs.js'); // real import: node --check misses broken modules
const { SPRINGS } = await import('../js/motion.js');

const node = (parentElement, extra = {}) => ({ parentElement, scrollWidth: 300, clientWidth: 300, closest: () => null, ...extra });

const scrollingAncestor = node(BODY, { scrollWidth: 800, overflowX: 'auto' });
const h = {};
let running = [], recorded = [], animateReturnsNull = false;
const panel = {
  ...node(scrollingAncestor),
  style: {}, offsetWidth: 400,
  classList: { add() {}, remove() {} },
  setPointerCapture() {},
  addEventListener(t, f) { h[t] = f; },
  contains(n) { for (; n; n = n.parentElement) if (n === this) return true; return false; },
  animate(kf, opts) {
    if (animateReturnsNull) return null;
    const a = { kf, opts };
    a.finished = new Promise((res, rej) => { a.finish = res; a.reject = rej; });
    a.finished.catch(() => {});
    a.cancel = () => { running = running.filter(x => x !== a); a.reject(new Error('AbortError')); };
    running.push(a); recorded.push(a);
    return a;
  },
  getAnimations: () => running,
};
const switched = [];
bindSwipeTabs(panel, { tabs: ['a', 'b'], current: () => 'a', onSwitch: t => switched.push(t) });

const carousel = node(panel, { scrollWidth: 800, overflowX: 'auto' });
const inCarousel = node(carousel);
const fittingRow = node(panel, { overflowX: 'auto' });
const inFittingRow = node(fittingRow);
const inPanelUnderScrollingAncestor = node(panel);

let lastMoveTransform;
let t = 0;
const ev = (target, x, step = 1000) => ({ pointerType: 'touch', pointerId: 1, button: 0, target, clientX: x, clientY: 100, timeStamp: (t += step) });
function drag(target, dx) {
  panel.style = {};
  running = []; recorded = [];
  h.pointerdown(ev(target, 200));
  h.pointermove(ev(target, 200 + dx));
  lastMoveTransform = panel.style.transform;
  h.pointerup(ev(target, 200 + dx));
}

test('dragging sideways inside a carousel that scrolls does not move the feed', () => {
  drag(inCarousel, -120);
  assert.equal(panel.style.transform ?? '', '');
  assert.equal(switched.length, 0);
});

test('a row that fits on screen (no overflow) still lets the feed swipe', () => {
  drag(inFittingRow, -60);
  assert.equal(lastMoveTransform, 'translateX(-60px)');
});

test('a scroller outside the panel does not block the swipe', () => {
  drag(inPanelUnderScrollingAncestor, -60);
  assert.equal(lastMoveTransform, 'translateX(-60px)');
});

test('releaseKeyframes: out leaves by 60% of the width, in arrives from the same distance on the other side', () => {
  const { out, in: enter } = releaseKeyframes(-100, 400, 1);
  assert.equal(out[0].transform, 'translateX(-100px)');
  assert.equal(out.at(-1).transform, 'translateX(-240px)');
  assert.equal(out.at(-1).opacity, 0);
  assert.equal(enter[0].transform, 'translateX(240px)');
  assert.equal(enter.at(-1).transform, 'translateX(0px)');
  assert.equal(enter.at(-1).opacity, 1);
});

test('a release that commits lets the old list leave, then switches and the new one enters (no timer)', async () => {
  switched.length = 0;
  drag(inFittingRow, -200);
  assert.deepEqual(switched, []); // old list still on screen while it leaves
  assert.equal(recorded.length, 1);
  const out = recorded[0];
  assert.equal(out.opts.easing, SPRINGS.smooth.easing);
  assert.ok(out.opts.duration >= SPRINGS.smooth.duration * 0.5 && out.opts.duration <= SPRINGS.smooth.duration);
  out.finish();
  await out.finished;
  assert.deepEqual(switched, ['b']);
  assert.equal(recorded.length, 2);
  assert.equal(recorded[1].opts.easing, SPRINGS.smooth.easing);
  assert.equal(recorded[1].kf[0].transform, 'translateX(240px)');
  assert.ok(!running.includes(out)); // the held exit frame is released once the new list enters
});

test('no animation (animate returns null): switches at once', () => {
  switched.length = 0;
  animateReturnsNull = true;
  drag(inFittingRow, -200);
  animateReturnsNull = false;
  assert.deepEqual(switched, ['b']);
});

test('grabbed during the exit: no switch, the old list stays under the finger', async () => {
  switched.length = 0;
  drag(inFittingRow, -200);
  const out = recorded[0];
  panelComputed = { transform: 'matrix(1, 0, 0, 1, -150, 0)', opacity: '0.5' };
  h.pointerdown(ev(inFittingRow, 200));
  await out.finished.catch(() => {});
  await null;
  assert.deepEqual(switched, []);
  assert.equal(panel.style.transform, 'translateX(-150px)');
  h.pointerup(ev(inFittingRow, 200)); // tap: springs back
  panelComputed = { transform: 'none', opacity: '1' };
});

test('a fast release shortens the exit, never below half the spring', () => {
  panel.style = {}; running = []; recorded = [];
  h.pointerdown(ev(inFittingRow, 200));
  h.pointermove(ev(inFittingRow, 100, 10));
  h.pointermove(ev(inFittingRow, 0, 10)); // 10 px/ms
  h.pointerup(ev(inFittingRow, 0, 10));
  assert.equal(recorded[0].opts.duration, SPRINGS.smooth.duration * 0.5);
});

test('touching the panel mid-animation catches it where it is', () => {
  panel.style = {}; running = []; recorded = [];
  panel.animate([], {}); // the release animation in flight
  panelComputed = { transform: 'matrix(1, 0, 0, 1, -80, 0)', opacity: '0.8' };
  h.pointerdown(ev(inFittingRow, 200));
  assert.equal(running.length, 0);
  assert.equal(panel.style.transform, 'translateX(-80px)');
  h.pointermove(ev(inFittingRow, 210));
  assert.equal(panel.style.transform, 'translateX(-70px)');
  panelComputed = { transform: 'none', opacity: '1' };
});

test('a release below the threshold springs back (no CSS transition)', () => {
  drag(inFittingRow, -60);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].opts.easing, SPRINGS.smooth.easing);
  assert.equal(recorded[0].kf.at(-1).transform, 'translateX(0px)');
  assert.ok(!/ease/.test(panel.style.transition ?? ''));
});

test('released exactly at the exit point with no speed: the exit takes the whole spring (not NaN)', () => {
  panel.style = {}; running = []; recorded = [];
  h.pointerdown(ev(inFittingRow, 200));
  h.pointermove(ev(inFittingRow, 200 - 240)); // 60% of 400
  h.pointermove(ev(inFittingRow, 200 - 240)); // held still: speed 0
  h.pointerup(ev(inFittingRow, 200 - 240));
  assert.equal(recorded[0].opts.duration, SPRINGS.smooth.duration);
});

test('caught mid-fade at x 0 and released without a swipe: springs back to full opacity, no inline opacity left', () => {
  panel.style = {}; running = []; recorded = [];
  panel.animate([], {}); // e.g. the new list fading in
  panelComputed = { transform: 'none', opacity: '0.4' };
  h.pointerdown(ev(inFittingRow, 200));
  h.pointerup(ev(inFittingRow, 200)); // a tap
  panelComputed = { transform: 'none', opacity: '1' };
  assert.equal(panel.style.opacity, '');
  const back = recorded.at(-1);
  assert.equal(back.kf[0].opacity, 0.4);
  assert.equal(back.kf.at(-1).opacity, 1);
});
