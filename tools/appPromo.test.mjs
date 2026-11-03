// Reading the app version out of a GitHub release: `node --test tools/appPromo.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

// motion.js touches the DOM on import: the bare minimum for it to load in Node
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.CSS = { supports: () => true };
globalThis.document = { createElement: () => ({}), head: { appendChild() {} } };
const { parseRelease } = await import('../js/appPromo.js');

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
