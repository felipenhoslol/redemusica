// Guards the chat media boxes in js/chat.js: run with `node --test tools/chatMedia.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Bare-minimum browser stand-ins so chat.js can load in Node
const store = new Map();
const el = () => ({
  innerHTML: '', style: {}, value: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
  querySelector: () => el(), querySelectorAll: () => [], appendChild() {}, append() {}, remove() {}, focus() {},
  closest: () => null, contains: () => false, getBoundingClientRect: () => ({}),
});
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.location ??= { hash: '', pathname: '/', search: '', origin: 'http://localhost', href: 'http://localhost/' };
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: el, addEventListener() {}, body: el(), head: el(), documentElement: el(), activeElement: null,
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.IntersectionObserver = globalThis.MutationObserver = globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.Audio = class { addEventListener() {} pause() {} play() { return Promise.resolve(); } };
try { globalThis.navigator ??= {}; } catch {}

const { mediaBoxStyle, stickToBottom, chatSignature, renderMessages } = await import('../js/chat.js');

class FakeArea extends EventTarget {
  scrollHeight = 1000; clientHeight = 400; scrollTop = 0;
}
const scrollTo = (area, top) => { area.scrollTop = top; area.dispatchEvent(new Event('scroll')); };

test('mediaBoxStyle: reserva a proporção quando a mensagem tem dimensões', () => {
  assert.equal(mediaBoxStyle({ width: 800, height: 600 }), 'aspect-ratio: 800 / 600');
  assert.equal(mediaBoxStyle({}), '');
  assert.equal(mediaBoxStyle({ width: 800 }), '');
});

test('stickToBottom: perto do fim, a imagem que carrega mantém a conversa no fim', () => {
  const area = new FakeArea();
  stickToBottom(area);
  scrollTo(area, 590);           // 10px from the end
  area.scrollHeight = 1300;      // the image grew before its load event
  area.dispatchEvent(new Event('load'));
  assert.equal(area.scrollTop, 1300);
});

test('stickToBottom: lendo mais acima, a imagem que carrega não mexe na rolagem', () => {
  const area = new FakeArea();
  stickToBottom(area);
  scrollTo(area, 300);
  area.scrollHeight = 1300;
  area.dispatchEvent(new Event('load'));
  assert.equal(area.scrollTop, 300);
});

test('stickToBottom: chamar de novo na mesma área não duplica o ouvinte e remede a posição', () => {
  const area = new FakeArea();
  stickToBottom(area);
  area.scrollTop = 300;
  stickToBottom(area);           // re-render left it scrolled up
  area.scrollHeight = 1300;
  area.dispatchEvent(new Event('load'));
  assert.equal(area.scrollTop, 300);
});

test('busca: "Todos" carrega com 1 linha skeleton por seção; abas e listas com 3', async () => {
  const { allSlotsHtml, loading } = await import('../js/search.js');
  const rows = (html) => html.match(/search-row-skeleton/g)?.length ?? 0;
  const sections = allSlotsHtml().split('<section').slice(1);
  assert.equal(sections.length, 6);
  sections.forEach(s => assert.equal(rows(s), 1, s));
  assert.equal(rows(loading()), 3); // renderTab, trending, artist, album
});

test('chatSignature: a conversa escolhida na janelinha de DM muda a assinatura (a aba Chat mantida se redesenha na volta)', async () => {
  (await import('../js/storage.js')).initStorage(); // an active user, as in the app
  const before = chatSignature();
  renderMessages('user_dm_test');
  assert.notEqual(chatSignature(), before);
  assert.equal(chatSignature(), 'user_dm_test');
});
