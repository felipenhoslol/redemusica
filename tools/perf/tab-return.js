// Kept tabs: returning to a tab already visited never takes a frame over 50 ms.
// Visits every tab once (first visits are reported, target ≤ 100 ms for Playlists/Desafios), then goes
// Feed → Playlists → Desafios 10 times (one frame + 300 ms between switches). pass = no long frame while returning.
// Long frames are read per window (startTime), since watchMotion() also returns the ones buffered from page load.
// node tools/perf.mjs --url http://localhost:5174/ --setup tools/perf/scroll-restore.setup.js --scenario tools/perf/tab-return.js --width 375 --height 812 --skin default|yt2016
async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  for (let i = 0; i < 50 && !window.switchTab; i++) await wait(100);
  await wait(800);

  const motion = (await import('/tools/ui-audit.mjs')).watchMotion(); // same long-frame source as the other scenarios
  const frames = [];
  const loaf = new PerformanceObserver(list => list.getEntries().forEach(e => frames.push({ t: e.startTime, d: Math.round(e.duration) })));
  loaf.observe({ type: 'long-animation-frame' });
  const longIn = (from, to) => { loaf.takeRecords().forEach(e => frames.push({ t: e.startTime, d: Math.round(e.duration) })); return frames.filter(f => f.t + f.d > from && f.t < to).map(f => f.d); }; // a frame that overlaps the window

  const firstVisit = {};
  for (const tab of ['search', 'playlists', 'chat', 'desafios', 'profile']) { // the feed is built at start
    const t0 = performance.now();
    window.switchTab(tab);
    const switchMs = Math.round(performance.now() - t0);
    await frame(); await wait(600);
    const long = longIn(t0, performance.now());
    firstVisit[tab] = { switchMs, maxLongFrame: long.length ? Math.max(...long) : 0 };
  }
  window.switchTab('feed'); await frame(); await wait(600);

  const t1 = performance.now();
  const switchMs = [];
  for (let i = 0; i < 10; i++) {
    for (const tab of ['playlists', 'desafios', 'feed']) {
      const a = performance.now();
      window.switchTab(tab);
      switchMs.push(performance.now() - a);
      await frame(); await wait(300);
    }
  }
  const longFrames = longIn(t1, performance.now());
  loaf.disconnect();
  motion.stop();
  return {
    pass: longFrames.length === 0, longFrames, maxReturnSwitchMs: Math.round(Math.max(...switchMs)),
    firstVisit, skinAttr: document.documentElement.dataset.skin || ''
  };
}
