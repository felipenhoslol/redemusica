// Runs a scenario in a page of a Chrome started with --remote-debugging-port=9222 and prints one JSON line.
// node tools/perf.mjs --url http://localhost:5174/ --scenario tools/perf/reduced.js --skin default|yt2016 [--reduced]
//   [--setup tools/perf/x.setup.js] [--cpu 4] [--width 1280 --height 900] [--port 9222]
// A scenario file is one async function expression; it runs in the page and returns { pass, ... }.
// It can measure with (await import('/tools/ui-audit.mjs')).watchMotion().
// A setup file has the same shape; it runs once on the page before a reload (to seed localStorage).
// The page is opened in local mode (no Supabase session); --skin yt2016 seeds the 2016 look for the local user.
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i < 0 ? def : args[i + 1]; };
const url = opt('url', 'http://localhost:5174/');
const scenarioPath = opt('scenario');
const skin = opt('skin', 'default');
const reduced = args.includes('--reduced');
const port = opt('port', '9222');
const setupPath = opt('setup');
const cpu = Number(opt('cpu', '4'));
const width = Number(opt('width', '1280'));
const height = Number(opt('height', '900'));
if (!scenarioPath) { console.error('missing --scenario'); process.exit(2); }

let seq = 0;
const pending = new Map();
const waiters = [];
const onMessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); }
  else waiters.filter(w => w.method === m.method).forEach(w => { waiters.splice(waiters.indexOf(w), 1); w.ok(m.params); });
};
const send = (method, params = {}) => new Promise((ok, fail) => { const id = ++seq; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });
const once = (method) => new Promise(ok => waiters.push({ method, ok }));

let target, ws;
const evaluate = async (path) => {
  const src = await readFile(path, 'utf8');
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression: `(${src})()`, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

try {
  target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage = onMessage;
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('CDP WebSocket failed')); });
  await send('Page.enable');
  // Measure the files on disk, not what the service worker or HTTP cache kept from an earlier run
  await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await send('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    if (location.origin !== ${JSON.stringify(new URL(url).origin)}) return;
    localStorage.setItem('rmsn_local_mode_v1', '1');
    const id = localStorage.getItem('rmsn_active_v5') || 'user_me';
    const looks = JSON.parse(localStorage.getItem('rmsn_look_v1') || '{}');
    looks[id] = ${skin === 'yt2016'} ? { skin: 'yt2016', cat: 'retro', found: true } : { skin: 'padrao', cat: 'kawaii', found: false };
    localStorage.setItem('rmsn_look_v1', JSON.stringify(looks));
  })();` });
  let loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  if (setupPath) {
    await evaluate(setupPath);
    loaded = once('Page.loadEventFired');
    await send('Page.reload', { ignoreCache: false });
    await loaded;
  }
  console.log(JSON.stringify({ scenario: scenarioPath, skin, reduced, ...await evaluate(scenarioPath) }));
} catch (e) {
  console.log(JSON.stringify({ scenario: scenarioPath, skin, reduced, pass: false, error: e.message }));
  process.exitCode = 1;
} finally {
  ws?.close();
  if (target?.id) await fetch(`http://localhost:${port}/json/close/${target.id}`).catch(() => {});
}
