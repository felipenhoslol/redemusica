// Feed swipe vs. horizontal carousels inside the feed
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BODY = { parentElement: null };
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { body: BODY };
globalThis.getComputedStyle = n => ({ overflowX: n.overflowX ?? 'visible' });
globalThis.getSelection = () => null;

const { bindSwipeTabs } = await import('../js/swipeTabs.js'); // real import: node --check misses broken modules

const node = (parentElement, extra = {}) => ({ parentElement, scrollWidth: 300, clientWidth: 300, closest: () => null, ...extra });

const scrollingAncestor = node(BODY, { scrollWidth: 800, overflowX: 'auto' });
const h = {};
const panel = {
  ...node(scrollingAncestor),
  style: {}, offsetWidth: 400,
  classList: { add() {}, remove() {} },
  setPointerCapture() {},
  addEventListener(t, f) { h[t] = f; },
  contains(n) { for (; n; n = n.parentElement) if (n === this) return true; return false; },
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
function drag(target, dx) {
  panel.style = {};
  const ev = x => ({ pointerType: 'touch', pointerId: 1, button: 0, target, clientX: x, clientY: 100, timeStamp: (t += 1000) });
  h.pointerdown(ev(200));
  h.pointermove(ev(200 + dx));
  lastMoveTransform = panel.style.transform;
  h.pointerup(ev(200 + dx));
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
