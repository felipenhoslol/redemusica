// Guards js/viewTransition.js: run with `node --test tools/viewTransition.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

let reduced = false;
globalThis.window = { matchMedia: () => ({ get matches() { return reduced; } }) };
globalThis.CSS = { supports: () => true };
globalThis.history = { state: null };

// A tiny DOM: elements are on screen unless `hidden`; querySelector looks them up by selector
const els = {};
let probing = null;
const listeners = [];
const fakeEl = (sel) => {
  const attrs = {};
  const el = {
    sel, hidden: false, isConnected: true, style: { viewTransitionName: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
    contains: (o) => o === el,
    setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, hasAttribute: (k) => k in attrs
  };
  els[sel] = el;
  return el;
};
globalThis.document = {
  createElement: () => ({}), head: { appendChild() {} },
  querySelector: (sel) => sel === '[data-vt-origin]'
    ? Object.values(els).find(e => e.hasAttribute('data-vt-origin')) || null
    : (els[sel]?.isConnected ? els[sel] : null),
  elementFromPoint: () => probing, // the element just measured, unless it is hidden (see below)
  addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
  removeEventListener: (type, fn) => { const i = listeners.findIndex(l => l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); }
};

const { withTransition, withReturn, transitioning, afterPending } = await import('../js/viewTransition.js');

// Fake API: runs the callback at once and logs the names seen at each moment
let log, skipped;
const install = () => {
  log = []; skipped = 0;
  document.startViewTransition = (cb) => {
    log.push({ phase: 'old', names: names() });
    cb();
    log.push({ phase: 'new', names: names() });
    return { finished: Promise.resolve(), ready: Promise.resolve(), skipTransition: () => { skipped++; } };
  };
};
const names = () => Object.values(els).filter(e => e.style.viewTransitionName).map(e => `${e.sel}=${e.style.viewTransitionName}`);
const settle = () => new Promise(r => setTimeout(r, 0));
for (const k of ['cover', '#post-view .cover', 'avatar', '#tab-profile .avatar']) fakeEl(k);
// shown() asks getBoundingClientRect then elementFromPoint: route the hit to the element (or null when hidden)
for (const el of Object.values(els)) {
  const rect = el.getBoundingClientRect;
  el.getBoundingClientRect = () => { probing = el.hidden ? null : el; return rect(); };
}

test('sem startViewTransition: update roda uma vez, sem erro', () => {
  delete document.startViewTransition;
  let n = 0;
  withTransition(() => { n++; }, { from: els.cover, toSelector: '#post-view .cover', name: 'post-cover' });
  assert.equal(n, 1);
  assert.equal(els.cover.style.viewTransitionName, '');
});

test('movimento reduzido: update direto, sem transição', () => {
  install(); reduced = true;
  let n = 0;
  withTransition(() => { n++; }, { from: els.cover, toSelector: '#post-view .cover', name: 'post-cover' });
  reduced = false;
  assert.equal(n, 1);
  assert.equal(log.length, 0);
});

test('com par: origem nomeada antes, destino depois, nomes limpos ao terminar', async () => {
  install();
  let ran = 0;
  withTransition(() => { ran++; }, { from: els.cover, toSelector: '#post-view .cover', name: 'post-cover' });
  assert.equal(ran, 1);
  assert.deepEqual(log, [
    { phase: 'old', names: ['cover=post-cover'] },
    { phase: 'new', names: ['#post-view .cover=post-cover'] }
  ]);
  assert.equal(transitioning(), true);
  await settle();
  assert.deepEqual(names(), []);
  assert.equal(transitioning(), false);
});

test('sem destino visível: só crossfade (nenhum nome no estado novo)', async () => {
  install();
  els['#post-view .cover'].hidden = true;
  withTransition(() => {}, { from: els.cover, toSelector: '#post-view .cover', name: 'post-cover' });
  els['#post-view .cover'].hidden = false;
  assert.deepEqual(log[1].names, []);
  await settle();
});

test('origem escondida (aba guardada): sem nome na origem', async () => {
  install();
  els.avatar.hidden = true;
  withTransition(() => {}, { from: els.avatar, toSelector: '#tab-profile .avatar', name: 'profile-avatar' });
  els.avatar.hidden = false;
  assert.deepEqual(log[0].names, []);
  await settle();
});

test('dois pares seguidos nunca deixam o mesmo nome em dois elementos', async () => {
  install();
  withTransition(() => {}, { from: els.cover, toSelector: '#post-view .cover', name: 'post-cover' });
  // The second one arrives while the first still runs: it changes the screen at once, names nothing
  withTransition(() => {}, { from: els.avatar, toSelector: '#tab-profile .avatar', name: 'profile-avatar' });
  for (const entry of log) assert.equal(new Set(entry.names.map(n => n.split('=')[1])).size, entry.names.length);
  await settle();
  withTransition(() => {}, { from: els.avatar, toSelector: '#tab-profile .avatar', name: 'profile-avatar' });
  assert.deepEqual(log.at(-1).names, ['#tab-profile .avatar=profile-avatar']);
  await settle();
  assert.deepEqual(names(), []);
});

test('pointerdown durante a transição chama skipTransition; depois o ouvinte sai', async () => {
  install();
  withTransition(() => {}, { from: els.cover, toSelector: '#post-view .cover', name: 'post-cover' });
  const l = listeners.find(x => x.type === 'pointerdown');
  assert.ok(l && l.capture, 'ouvinte em captura');
  l.fn();
  assert.equal(skipped, 1);
  await settle();
  assert.equal(listeners.filter(x => x.type === 'pointerdown').length, 0);
});

test('voltar: faz o inverso do último voo quando o destino ainda está na tela', async () => {
  install();
  withTransition(() => {}, { from: els.cover, toSelector: '#post-view .cover', name: 'post-cover' });
  await settle();
  log = [];
  withReturn(() => {});
  assert.deepEqual(log, [
    { phase: 'old', names: ['#post-view .cover=post-cover'] },
    { phase: 'new', names: ['cover=post-cover'] }
  ]);
  await settle();
  assert.deepEqual(names(), []);
  // Used up: the next back is a plain change
  log = [];
  let n = 0;
  withReturn(() => { n++; });
  assert.equal(n, 1);
  assert.equal(log.length, 0);
});

test('voltar sem o destino do voo na tela: troca direta, e o voo continua guardado', async () => {
  install();
  withTransition(() => {}, { from: els.avatar, toSelector: '#tab-profile .avatar', name: 'profile-avatar' });
  await settle();
  log = [];
  els['#tab-profile .avatar'].hidden = true; // e.g. under the post view, or another tab is shown
  let n = 0;
  withReturn(() => { n++; });
  els['#tab-profile .avatar'].hidden = false;
  assert.equal(n, 1);
  assert.equal(log.length, 0);
  withReturn(() => {});
  assert.deepEqual(log[0].names, ['#tab-profile .avatar=profile-avatar']);
  await settle();
});

test('par com `back`: a volta pousa nesse seletor (origem redesenhada)', async () => {
  install();
  fakeEl('grid .cover');
  const g = els['grid .cover'], rect = g.getBoundingClientRect;
  g.getBoundingClientRect = () => { probing = g.hidden ? null : g; return rect(); };
  withTransition(() => {}, { from: els.cover, toSelector: '#post-view .cover', name: 'pl-cover', back: 'grid .cover' });
  await settle();
  log = [];
  withReturn(() => {});
  assert.deepEqual(log[1].names, ['grid .cover=pl-cover']);
  await settle();
});

// Like the browser: the callback runs later (after the old screen is captured), not inside startViewTransition
const installAsync = () => {
  log = []; skipped = 0;
  document.startViewTransition = (cb) => {
    let done;
    const finished = new Promise(r => { done = r; });
    setTimeout(() => { cb(); setTimeout(done, 0); }, 5);
    return { finished, ready: Promise.resolve(), skipTransition: () => { skipped++; } };
  };
};

test('callback assíncrono: o que chega antes da captura entra na mesma transição, em ordem', async () => {
  installAsync();
  const order = [];
  withTransition(() => order.push('A'), { from: els.avatar, toSelector: '#tab-profile .avatar', name: 'profile-avatar' });
  withTransition(() => order.push('B'));
  withReturn(() => order.push('C'));
  afterPending(() => order.push('D'));
  assert.deepEqual(order, []);
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(order, ['A', 'B', 'C', 'D']);
  afterPending(() => order.push('E')); // nothing waiting: at once
  assert.deepEqual(order, ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(names(), []);
});

test('post aberto → toque no autor: o passo do perfil existe antes de fechar o post decidir voltar', async () => {
  installAsync();
  history.state = { tab: 'feed', layer: 'post', depth: 1 };
  const backs = [];
  const goToProfile = () => withTransition(() => { history.state = { tab: 'profile', uid: 'u', depth: 1 }; },
    { from: els.avatar, toSelector: '#tab-profile .avatar', name: 'profile-avatar' });
  // app.js _leaveLayer('post'), reached from the post view's setTimeout(close, 0)
  const leaveLayer = () => setTimeout(() => afterPending(() => { if (history.state?.layer === 'post') backs.push('back'); }), 0);
  goToProfile();
  setTimeout(leaveLayer, 0);
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(backs, [], "no history.back: the profile took the post step's place");
  assert.equal(history.state.tab, 'profile');
  history.state = null;
});

test('voo lembrado não volta de uma tela mais funda (depois de outra navegação)', async () => {
  install();
  history.state = { depth: 2 };
  withTransition(() => {}, { from: els.avatar, toSelector: '#tab-profile .avatar', name: 'profile-avatar' });
  await settle();
  history.state = { depth: 3 }; // went somewhere else from the profile, then forward/back landed deeper
  log = [];
  withReturn(() => {});
  assert.equal(log.length, 0);
  history.state = { depth: 1 }; // back from the profile's own step: flies
  withReturn(() => {});
  assert.deepEqual(log[0].names, ['#tab-profile .avatar=profile-avatar']);
  await settle();
  history.state = null;
});

test('skipTransition libera na hora: a próxima troca não espera o finished', async () => {
  installAsync();
  withTransition(() => {}, { from: els.cover, toSelector: '#post-view .cover', name: 'post-cover' });
  await new Promise(r => setTimeout(r, 8)); // callback ran, finished not yet
  assert.equal(transitioning(), true);
  listeners.find(x => x.type === 'pointerdown').fn();
  assert.equal(transitioning(), false);
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(names(), []);
});
