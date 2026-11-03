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

// Runs the real inline <head> script from index.html against fake storage/DOM and compares with resolveLook
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const headBody = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('rmsn_display_v1'));

function runHead(entries) {
  const data = new Map(Object.entries(entries));
  const ls = { getItem: k => data.has(k) ? data.get(k) : null, key: i => [...data.keys()][i] ?? null, get length() { return data.size; } };
  const attrs = {}, links = [];
  const document = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    getElementById: id => links.find(l => l.id === id) || null,
    createElement: () => ({}),
    head: { appendChild: el => links.push(el) },
  };
  new Function('localStorage', 'document', 'matchMedia', headBody)(ls, document, () => ({ matches: false }));
  return { attrs, links };
}

const tok = id => JSON.stringify({ user: { id } });
const expectFrom = (looks, id) => {
  const r = resolveLook(looks, id);
  const a = {};
  if (r.skin !== 'padrao') a['data-skin'] = r.skin;
  if (r.cat !== 'kawaii') a['data-cat'] = r.cat;
  return a;
};
const lookAttrs = attrs => Object.fromEntries(Object.entries(attrs).filter(([k]) => k === 'data-skin' || k === 'data-cat'));

test('head script: mesma decisão que resolveLook', () => {
  const looks = { a: { skin: 'yt2016', cat: 'retro', found: true }, user_me: { skin: 'yt2016', found: true } };
  const L = JSON.stringify(looks);
  const cases = [
    [{ 'sb-x-auth-token': tok('a'), rmsn_look_v1: L }, 'a', 1],
    [{ 'sb-x-auth-token': JSON.stringify({ currentSession: { user: { id: 'a' } } }), rmsn_look_v1: L }, 'a', 1],
    [{ 'sb-x-auth-token': tok('b'), rmsn_look_v1: L }, 'b', 0],
    [{ rmsn_active_v5: 'a', rmsn_look_v1: L }, null, 0], // logout: sem token e sem modo local
    [{ rmsn_local_mode_v1: '1', rmsn_look_v1: L }, 'user_me', 1],
    [{ 'sb-x-auth-token': tok('a'), rmsn_look_v1: JSON.stringify({ a: { skin: 'padrao', cat: 'retro', found: true } }) }, 'a', 0],
  ];
  for (const [entries, id, nLinks] of cases) {
    const { attrs, links } = runHead(entries);
    assert.deepEqual(lookAttrs(attrs), expectFrom(JSON.parse(entries.rmsn_look_v1), id), JSON.stringify(entries));
    assert.equal(links.length, nLinks);
    if (nLinks) assert.deepEqual({ id: links[0].id, rel: links[0].rel, href: links[0].href }, { id: 'font-2016', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap' });
    assert.equal(attrs['data-theme'], 'dark');
  }
  // spot-check the expectations themselves
  assert.deepEqual(expectFrom(looks, 'a'), { 'data-skin': 'yt2016', 'data-cat': 'retro' });
  assert.deepEqual(expectFrom({ a: { skin: 'padrao', cat: 'retro', found: true } }, 'a'), { 'data-cat': 'retro' });
});

test('head script: JSON quebrado não aplica nada e não lança', () => {
  const { attrs, links } = runHead({ 'sb-x-auth-token': tok('a'), rmsn_look_v1: '{' });
  assert.deepEqual(lookAttrs(attrs), {});
  assert.equal(links.length, 0);
  assert.equal(attrs['data-theme'], 'dark');
});
