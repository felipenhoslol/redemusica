// The link preview slot is born with the card's box, so the feed doesn't jump: `node --test tools/linkSlot.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.document = { querySelectorAll: () => [] };

const { linkSlotHtml } = await import('../js/api.js');
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
