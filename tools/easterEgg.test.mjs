// Guards the 2016 look logic in js/look.js: run with `node --test tools/easterEgg.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };

const { LOOK_KEY, readLooks, saveLook, resolveLook, createTapCounter, discoveryActions } = await import('../js/look.js');

test('resolveLook: só vale para o id que descobriu', () => {
  const looks = { a: { skin: 'yt2016', cat: 'retro', found: true }, b: { skin: 'yt2016' } };
  assert.deepEqual(resolveLook(looks, 'a'), { skin: 'yt2016', cat: 'retro', found: true });
  assert.deepEqual(resolveLook(looks, 'b'), { skin: 'padrao', cat: 'kawaii', found: false }); // sem found
  assert.deepEqual(resolveLook(looks, 'c'), { skin: 'padrao', cat: 'kawaii', found: false });
  assert.deepEqual(resolveLook(looks, null), { skin: 'padrao', cat: 'kawaii', found: false });
  assert.deepEqual(resolveLook({}, 'c', true), { skin: 'padrao', cat: 'kawaii', found: true }); // aparelho novo
  assert.deepEqual(resolveLook({ a: { skin: 'xyz', cat: 1, found: true } }, 'a'), { skin: 'padrao', cat: 'kawaii', found: true });
});

test('resolveLook: só o booleano true conta como descoberta', () => {
  assert.equal(resolveLook({ a: { skin: 'yt2016', found: 'true' } }, 'a').found, false);
  assert.equal(resolveLook({ a: { skin: 'yt2016', found: 1 } }, 'a').skin, 'padrao');
  assert.equal(resolveLook({}, 'a', 'true').found, false);
});

test('saveLook: found nunca volta a false; JSON quebrado vira {}', () => {
  localStorage.setItem(LOOK_KEY, '{');
  assert.deepEqual(readLooks(), {});
  saveLook('a', { found: true });
  saveLook('a', { found: false, skin: 'yt2016' });
  assert.deepEqual(readLooks().a, { found: true, skin: 'yt2016' });
  saveLook('a', { skin: 'padrao', cat: 'retro' });
  assert.deepEqual(readLooks().a, { found: true, skin: 'padrao', cat: 'retro' });
  saveLook('', { found: true });
  assert.deepEqual(Object.keys(readLooks()), ['a']);
});

test('contador: 16 cliques seguidos disparam uma vez', () => {
  const tap = createTapCounter();
  const r = Array.from({ length: 16 }, (_, i) => tap(i * 100));
  assert.deepEqual(r.map((x, i) => x ? i : -1).filter(i => i >= 0), [15]);
  assert.equal(tap(1700), false); // recomeçou
});

test('contador: pausa de mais de 2 s zera', () => {
  const tap = createTapCounter();
  for (let i = 0; i < 15; i++) tap(i * 100);
  assert.equal(tap(1400 + 2001), false);
});

test('discoveryActions', () => {
  assert.deepEqual(discoveryActions(true, false), { saveMirror: false, pushFlag: true });
  assert.deepEqual(discoveryActions(false, true), { saveMirror: true, pushFlag: false });
  assert.deepEqual(discoveryActions(true, true), { saveMirror: false, pushFlag: false });
  assert.deepEqual(discoveryActions(false, false), { saveMirror: false, pushFlag: false });
});
