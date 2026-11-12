// Guards js/scrollMemory.js: run with `node --test tools/scrollMemory.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A page: cards at document positions; the viewport is at scrollY
const page = { y: 0, height: 5000, cards: [] };
const card = (id, docTop, h = 200) => ({
  dataset: { postId: id }, docTop,
  getBoundingClientRect() { return { top: this.docTop - page.y, bottom: this.docTop + h - page.y }; }
});
const root = { querySelectorAll: () => page.cards };
let scrolled = [];
globalThis.window = {
  get scrollY() { return page.y; },
  scrollTo: ({ top }) => { scrolled.push(top); page.y = top; }
};
globalThis.document = {
  querySelectorAll: () => page.cards,
  documentElement: { get scrollHeight() { return page.height; } }
};

const { screenKey, saveScroll, restoreScroll, ANCHOR } = await import('../js/scrollMemory.js');

const setup = () => {
  page.y = 0; page.height = 5000; scrolled = [];
  page.cards = Array.from({ length: 20 }, (_, i) => card(`p${i}`, i * 250));
};

test('volta exatamente ao y salvo quando nada mudou', () => {
  setup();
  page.y = 1200;
  saveScroll('feed', ANCHOR);
  page.y = 0; // another tab opened at its top
  restoreScroll('feed', root, ANCHOR);
  assert.deepEqual(scrolled, [1200]);
});

test('conteúdo novo acima: segue o post que estava na tela (300 px abaixo)', () => {
  setup();
  page.y = 1200;
  saveScroll('feed', ANCHOR);
  page.y = 0;
  page.height += 300;
  page.cards.forEach(c => { c.docTop += 300; });
  restoreScroll('feed', root, ANCHOR);
  assert.deepEqual(scrolled, [1500]);
});

test('tela nunca vista abre no topo; cada perfil tem a sua chave', () => {
  setup();
  page.y = 900;
  saveScroll(screenKey('profile', 'A'), ANCHOR);
  restoreScroll(screenKey('profile', 'B'), root, ANCHOR);
  assert.deepEqual(scrolled, [0]);
  assert.notEqual(screenKey('profile', 'A'), screenKey('profile', 'B'));
  assert.equal(screenKey('feed', 'A'), 'feed');
});
