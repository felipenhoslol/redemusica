// Reading the app version out of a GitHub release: `node --test tools/appPromo.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

// motion.js touches the DOM on import: the bare minimum for it to load in Node
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.CSS = { supports: () => true };
globalThis.document = { createElement: () => ({}), head: { appendChild() {} } };
const { parseRelease, freshCache, fetchLatest } = await import('../js/appPromo.js');

const rel = (body, assets = [{ name: 'rede-de-musica.apk', size: 7 * 1048576 + 400000 }]) => ({ body, assets });
const BODY = 'App.\n\n<!-- app-version {"version":"1.0.42","versionCode":42,"minVersionCode":30} -->\n';

test('reads version, codes and size from the release written by android.yml', () => {
  assert.deepEqual(parseRelease(rel(BODY)), {
    version: '1.0.42', versionCode: 42, minVersionCode: 30, sizeMB: '7,4',
    url: 'https://github.com/felipenhoslol/redemusica/releases/latest/download/rede-de-musica.apk'
  });
});

test('no APK, no marker or a broken marker means no promo', () => {
  assert.equal(parseRelease(rel(BODY, [])), null);
  assert.equal(parseRelease(rel('just notes')), null);
  assert.equal(parseRelease(rel('<!-- app-version {"versionCode":"x"} -->')), null);
  assert.equal(parseRelease(rel('<!-- app-version {oops} -->')), null);
  assert.equal(parseRelease(null), null);
});

test('cache: a found release lasts 30 min, "no release" 10 min, old formats are ignored', () => {
  const at = 1e12, info = { versionCode: 42 };
  const raw = (o) => JSON.stringify(o);
  assert.deepEqual(freshCache(raw({ at, info }), at + 29 * 60e3), { at, info });
  assert.equal(freshCache(raw({ at, info }), at + 31 * 60e3), undefined);
  assert.deepEqual(freshCache(raw({ at, info: null }), at + 9 * 60e3), { at, info: null });
  assert.equal(freshCache(raw({ at, info: null }), at + 11 * 60e3), undefined);
  assert.equal(freshCache('null'), undefined); // what the old code stored when there was no release
  assert.equal(freshCache(raw(info)), undefined);
  assert.equal(freshCache(null), undefined);
  assert.equal(freshCache('{oops'), undefined);
});

test('fetchLatest refetches past a stale "null" and caches the result with a timestamp', async () => {
  const saved = { rmsn_app_latest: 'null' };
  globalThis.sessionStorage = { getItem: (k) => saved[k] ?? null, setItem: (k, v) => { saved[k] = v; } };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => rel(BODY) }; };
  const info = await fetchLatest();
  assert.equal(calls, 1);
  assert.equal(info.versionCode, 42);
  const c = JSON.parse(saved.rmsn_app_latest);
  assert.equal(c.info.versionCode, 42);
  assert.equal(typeof c.at, 'number');
});
