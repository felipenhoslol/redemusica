// Guards the XSS filters in js/dom.js: run with `node --test tools/security.test.mjs` (Node 22+ loads js/dom.js as a module)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, safeUrl, cssUrl, jsArg } from '../js/dom.js';

const PAYLOAD = `"'><img src=x onerror=alert(1)>`;

test('esc leaves no HTML special characters', () => {
  assert.doesNotMatch(esc(PAYLOAD), /[<>"']/);
});

test('safeUrl drops scripts and other sites', () => {
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', '//evil.com/a', '/\\evil.com']) {
    assert.equal(safeUrl(bad), '', bad);
  }
  assert.equal(safeUrl('https://a.com/x.jpg'), 'https://a.com/x.jpg');
});

test('cssUrl cannot close url() or the attribute', () => {
  assert.equal(cssUrl("a.jpg');x"), '');
  assert.equal(cssUrl('javascript:alert(1)'), '');
  assert.doesNotMatch(cssUrl(`https://a.com/x');background:url('//evil" onmouseover="x`), /['"()\s<>]/);
});

test('jsArg keeps the value inside a JS string in an onclick', () => {
  const out = jsArg("x');alert(1);//");
  assert.doesNotMatch(out, /['"]/);
  // what the browser hands to the handler after decoding the attribute is a plain JSON string
  assert.equal(JSON.parse(out.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')), "x');alert(1);//");
});
