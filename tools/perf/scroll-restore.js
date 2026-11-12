// Scroll memory: every tab, and every profile, comes back exactly where it was left (within 1px).
// For each tab tall enough to scroll: scroll to the middle, go to another tab, come back by the menu and by history.back().
// Profile A scrolled → profile B (opens at 0) → history.back() lands on A where it was. Re-tapping the current tab goes to the top.
// Each return is read twice: right after the switch (same frame) and 500 ms later (nothing moved it afterwards).
// node tools/perf.mjs --url http://localhost:5174/ --setup tools/perf/scroll-restore.setup.js --scenario tools/perf/scroll-restore.js --skin default|yt2016
async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.switchTab; i++) await wait(100);
  await wait(500);
  if (!(await import('/js/storage.js')).getUserById('perf_0')) return { pass: false, error: 'run with --setup tools/perf/scroll-restore.setup.js' };

  const checks = [];
  const go = async (name, want, move) => {
    await move();
    const now = window.scrollY;
    await wait(500);
    const later = window.scrollY;
    checks.push({ name, want, now, later, ok: Math.abs(now - want) <= 1 && Math.abs(later - want) <= 1 });
  };
  const back = () => new Promise(r => { addEventListener('popstate', () => r(), { once: true }); history.back(); });
  const room = () => document.documentElement.scrollHeight - innerHeight;
  const toMiddle = async () => { window.scrollTo({ top: Math.round(room() / 2), behavior: 'instant' }); await wait(200); return window.scrollY; };

  const tested = [], skipped = [];
  for (const tab of ['feed', 'search', 'playlists', 'chat', 'desafios']) {
    window.switchTab(tab); await wait(400);
    if (room() < 400) { skipped.push(tab); continue; }
    tested.push(tab);
    const other = tab === 'feed' ? 'search' : 'feed';
    const y = await toMiddle();
    window.switchTab(other); await wait(300);
    await go(`${tab} pelo menu`, y, () => window.switchTab(tab));
    window.switchTab(other); await wait(300);
    await go(`${tab} por history.back()`, y, back);
  }

  window._goToProfile('perf_0'); await wait(400);
  const ya = await toMiddle();
  await go('perfil B nunca visto', 0, () => window._goToProfile('perf_1'));
  await go('perfil A por history.back()', ya, back);

  window.switchTab('feed'); await wait(400);
  await toMiddle();
  await go('toque no ícone da aba atual', 0, () => window.switchTab('feed'));

  return { pass: checks.every(c => c.ok) && tested.length > 0, tested, skipped, checks: checks.filter(c => !c.ok), all: checks.length, skinAttr: document.documentElement.dataset.skin || '' };
}
