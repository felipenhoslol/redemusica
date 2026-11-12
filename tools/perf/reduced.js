// Reduced motion: no animation that moves things (transform) while liking, opening comments,
// changing song, showing a toast, opening a post menu and opening notifications. Run with tools/perf.mjs --reduced.
async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 50 && !document.getElementById('creator-text'); i++) await wait(100);
  await wait(800); // let boot settle before counting

  const moving = [];
  const hasTransform = (kf) => (Array.isArray(kf) ? kf : [kf]).some(f => f && 'transform' in f && f.transform != null);
  const label = (el) => `${el.tagName?.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0]}`;
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (kf, opts) {
    if (hasTransform(kf)) moving.push(`waapi ${label(this)}`);
    return animate.call(this, kf, opts);
  };
  document.addEventListener('animationstart', (e) => {
    const a = e.target.getAnimations().find(x => x.animationName === e.animationName);
    if (a && hasTransform(a.effect.getKeyframes())) moving.push(`css ${e.animationName} on ${label(e.target)}`);
  }, true);
  document.addEventListener('transitionrun', (e) => {
    if (e.propertyName === 'transform') moving.push(`transition transform on ${label(e.target)}`);
  }, true);

  const steps = {};
  const click = (sel) => { const el = document.querySelector(sel); el?.click(); return el; };

  window._submitPost(); // empty composer: shows a toast
  await wait(500);
  steps.toast = !!document.querySelector('.toast');

  document.getElementById('creator-text').value = 'movimento reduzido';
  window._submitPost();
  await wait(600);

  steps.like = !!click('.post-card .btn-post-action[onclick*="_likePost"]');
  await wait(500);
  steps.comments = !!click('.post-card .btn-post-action[onclick*="_toggleComments"]');
  await wait(500);
  click('.post-card .post-options-btn');
  await wait(400);
  steps.menu = !!document.querySelector('.post-options-dropdown[data-open="true"]');
  document.body.click(); // outside click closes it
  await wait(300);

  const tracks = [...document.querySelectorAll('[onclick^="window._playTrack"]')];
  tracks[0]?.click();
  await wait(500);
  tracks[1]?.click();
  await wait(600);
  steps.song = tracks.length > 1 && document.getElementById('player-title')?.textContent !== '';

  window.toggleNotifPanel();
  await wait(500);
  steps.notifications = !!document.querySelector('.notifications-overlay.active');

  Element.prototype.animate = animate;
  const ran = Object.values(steps).every(Boolean);
  return { pass: ran && moving.length === 0, reducedMedia: matchMedia('(prefers-reduced-motion: reduce)').matches, skinAttr: document.documentElement.dataset.skin || null, steps, moving: [...new Set(moving)] };
}
