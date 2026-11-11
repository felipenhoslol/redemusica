// The link preview slot is born with the card's box, so the feed doesn't jump: `node --test tools/linkSlot.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
// One fake slot on the page; the preview loader finds it by selector and fills it in place
const slot = {
  innerHTML: '', href: '', children: [], attrs: {},
  classList: { removed: [], remove(...c) { this.removed.push(...c); } },
  querySelector(sel) { return sel === '.rich-link-cover' && this.innerHTML.includes('class="rich-link-cover') ? {} : null; },
  removeAttribute(a) { this.attrs[a] = null; }
};
globalThis.matchMedia = () => ({ matches: false });
globalThis.fetch = () => Promise.reject(new Error('offline')); // no Microlink: plain fallback, no image for b.com
globalThis.document = { head: { appendChild() {} }, createElement: () => ({}), querySelectorAll: () => [slot] };

const { linkSlotHtml, renderRichLinkCard } = await import('../js/api.js');
const count = (s, part) => s.split(part).length - 1;

test('slot with image: card classes, a cover from CSS and two skeleton lines', () => {
  const html = linkSlotHtml('a.com', true);
  assert.ok(html.includes('class="auto-link-slot rich-link-card is-skeleton"'));
  assert.equal(count(html, 'class="rich-link-cover'), 1);
  assert.equal(count(html, 'skeleton-line'), 2);
  assert.ok(!html.includes('min-height:4px'));
  assert.ok(!/rich-link-cover[^>]*style=/.test(html));
});

test('slot without image has no cover', () => {
  assert.ok(!linkSlotHtml('a.com', false).includes('rich-link-cover'));
});

test('unknown image (no cache) reserves the cover, the common case', () => {
  assert.equal(count(linkSlotHtml('a.com', undefined), 'class="rich-link-cover'), 1);
});

test('an image-less preview filled into a slot keeps its cover in later renders (no 140px shrink)', async () => {
  slot.innerHTML = renderRichLinkCard('b.com'); // not cached yet: a slot with the cover reserved
  assert.ok(slot.innerHTML.includes('is-skeleton'));
  for (let i = 0; i < 100 && slot.innerHTML.includes('skeleton-line'); i++) await new Promise(r => setTimeout(r, 10));
  assert.ok(!slot.innerHTML.includes('skeleton-line'), 'slot was filled');
  assert.ok(slot.innerHTML.includes('class="rich-link-cover is-empty"'));
  const again = renderRichLinkCard('b.com'); // cached now, e.g. the post re-renders after a like
  assert.ok(!again.includes('is-skeleton'));
  assert.ok(again.includes('class="rich-link-cover is-empty"'));
});
