// Runs a scenario in a page of a Chrome started with --remote-debugging-port=9222 and prints one JSON line.
// node tools/perf.mjs --url http://localhost:5174/ --scenario tools/perf/reduced.js --skin default|yt2016 [--reduced]
// A scenario file is one async function expression; it runs in the page and returns { pass, ... }.
// The page is opened in local mode (no Supabase session); --skin yt2016 seeds the 2016 look for the local user.
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i < 0 ? def : args[i + 1]; };
const url = opt('url', 'http://localhost:5174/');
const scenarioPath = opt('scenario');
const skin = opt('skin', 'default');
const reduced = args.includes('--reduced');
const port = opt('port', '9222');
if (!scenarioPath) { console.error('missing --scenario'); process.exit(2); }

const target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let seq = 0;
const pending = new Map();
const waiters = [];
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); }
  else waiters.filter(w => w.method === m.method).forEach(w => { waiters.splice(waiters.indexOf(w), 1); w.ok(m.params); });
};
const send = (method, params = {}) => new Promise((ok, fail) => { const id = ++seq; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });
const once = (method) => new Promise(ok => waiters.push({ method, ok }));

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    if (location.origin !== ${JSON.stringify(new URL(url).origin)}) return;
    localStorage.setItem('rmsn_local_mode_v1', '1');
    const id = localStorage.getItem('rmsn_active_v5') || 'user_me';
    const looks = JSON.parse(localStorage.getItem('rmsn_look_v1') || '{}');
    looks[id] = ${skin === 'yt2016'} ? { skin: 'yt2016', cat: 'retro', found: true } : { skin: 'padrao', cat: 'kawaii', found: false };
    localStorage.setItem('rmsn_look_v1', JSON.stringify(looks));
  })();` });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  const src = await readFile(scenarioPath, 'utf8');
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression: `(${src})()`, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  console.log(JSON.stringify({ scenario: scenarioPath, skin, reduced, ...result.value }));
} catch (e) {
  console.log(JSON.stringify({ scenario: scenarioPath, skin, reduced, pass: false, error: e.message }));
  process.exitCode = 1;
} finally {
  ws.close();
  await fetch(`http://localhost:${port}/json/close/${target.id}`).catch(() => {});
}
