// Guards js/keptTabs.js: run with `node --test tools/keptTabs.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

let reduced = false;
globalThis.window = { matchMedia: () => ({ get matches() { return reduced; } }) };
globalThis.CSS = { supports: () => true };
globalThis.document = { createElement: () => ({}), head: { appendChild() {} } };
globalThis.getComputedStyle = (n) => ({ opacity: '1', transform: 'none', position: n?.position || 'static' });

const { needsBuild, isStale, enterPanel, hasFixedContent, mountBelowFold, appendBelowFold } = await import('../js/keptTabs.js');

const fakeEl = (children = [{ position: 'static' }]) => {
  const calls = [];
  return { calls, getAnimations: () => [], querySelectorAll: () => children, animate: (kf, opts) => { calls.push({ kf, opts }); return { kf, opts }; } };
};

test('needsBuild: aba já montada fica como está', () => {
  assert.equal(needsBuild('feed', { built: new Set(['feed']) }), false);
});

test('needsBuild: primeira visita monta', () => {
  assert.equal(needsBuild('playlists', { built: new Set(['feed']) }), true);
});

test('needsBuild: perfil de outra pessoa monta de novo; o mesmo perfil fica', () => {
  assert.equal(needsBuild('profile', { built: new Set(['profile']), profileUid: 'A' }, 'B'), true);
  assert.equal(needsBuild('profile', { built: new Set(['profile']), profileUid: 'A' }, 'A'), false);
});

test('needsBuild: admin sempre monta', () => {
  assert.equal(needsBuild('admin', { built: new Set(['admin']) }), true);
});

test('isStale: mais de 30 s desde a última checagem', () => {
  assert.equal(isStale(0, 30001), true);
  assert.equal(isStale(0, 29999), false);
});

test('enterPanel: sobe 8px e aparece com a mola smooth', () => {
  reduced = false;
  const el = fakeEl();
  assert.ok(enterPanel(el));
  assert.deepEqual(el.calls[0].kf, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]);
});

test('enterPanel: movimento reduzido devolve null e não anima', () => {
  reduced = true;
  const el = fakeEl();
  assert.equal(enterPanel(el), null);
  assert.equal(el.calls.length, 0);
  reduced = false;
});

test('mountBelowFold: sem requestIdleCallback roda depois, não na hora', async () => {
  let ran = false;
  mountBelowFold(() => { ran = true; });
  assert.equal(ran, false);
  await new Promise(r => setTimeout(r, 5));
  assert.equal(ran, true);
});

test('appendBelowFold: acrescenta o resto depois; desiste se a lista foi redesenhada', async () => {
  const fakeList = () => {
    const list = { isConnected: true, added: [], lastElementChild: { id: 'card8' } };
    list.insertAdjacentHTML = (where, html) => list.added.push([where, html]);
    return list;
  };
  const kept = fakeList();
  appendBelowFold(kept, '<b>9</b>');
  assert.deepEqual(kept.added, []);
  const redrawn = fakeList();
  appendBelowFold(redrawn, '<b>9</b>');
  redrawn.lastElementChild = { id: 'other' };
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(kept.added, [['beforeend', '<b>9</b>']]);
  assert.deepEqual(redrawn.added, []);
});

test('enterPanel: aba com conteúdo fixo (chat no celular, composer) só aparece, sem transform', () => {
  reduced = false;
  const el = fakeEl([{ position: 'static' }, { position: 'fixed' }]);
  assert.equal(hasFixedContent(el), true);
  assert.ok(enterPanel(el));
  assert.deepEqual(el.calls[0].kf, [{ opacity: 0 }, { opacity: 1 }]);
  assert.equal(hasFixedContent(fakeEl()), false);
});
