// A sync that redraws the profile leaves history, the sub-tab and open comments as they were; presence alone never redraws it.
// A: post opened from a profile, liked, then someone else's like arrives → the profile redraws behind it, history keeps the post's step,
//    closing it lands on the profile and back goes on (it doesn't reopen the post). B: the sub-tab stays. C: only lastSeenAt changed: no redraw.
// D (wide layout: on a phone comments open the post view): open comments stay open. E: your own like is shown in place: no redraw after.
// node tools/perf.mjs --url http://localhost:5174/ --setup tools/perf/scroll-restore.setup.js --scenario tools/perf/profile-redraw.js --skin default|yt2016 [--width 375 --height 812]
async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.switchTab; i++) await wait(100);
  await wait(500);
  const S = await import('/js/storage.js');
  const { refreshFromServer } = await import('/js/app.js');
  if (!S.getUserById('perf_0')) return { pass: false, error: 'setup missing' };
  const presence = () => { S.setPresence({ perf_0: new Date(Date.now() - Math.random() * 1e6).toISOString() }); refreshFromServer(); };
  // Someone else liked a post of perf_0 (a real data change): the profile must redraw
  let n = 0;
  const bump = () => {
    const post = S.getPostById('perf_post_2');
    S.upsertPostsCache([{ ...post, likes: [...post.likes, `ghost_${n++}`] }]);
    S.setPresence({ perf_0: new Date(Date.now() - Math.random() * 1e6).toISOString() });
    refreshFromServer();
  };
  const back = () => new Promise(r => { addEventListener('popstate', () => r(), { once: true }); history.back(); });
  const out = {};

  // A: post opened from a profile, like, server sync → X (close) must land on the profile with nothing above
  window._goToProfile('perf_0'); await wait(500);
  const d0 = history.state?.depth;
  window._openPostView('perf_post_0'); await wait(600);
  const d1 = history.state?.depth;
  window._likePost('perf_post_0'); await wait(100);
  const wrapA = document.querySelector('#tab-profile .profile-wrap');
  bump(); await wait(400);
  out.A = { redrew: wrapA !== document.querySelector('#tab-profile .profile-wrap'), depthProfile: d0, depthPost: d1, depthAfterSync: history.state?.depth, layerAfterSync: history.state?.layer || null };
  document.querySelector('#post-view [data-close]')?.click(); await wait(900);
  out.A.afterClose = { depth: history.state?.depth, layer: history.state?.layer || null, postView: !!document.getElementById('post-view'), tab: document.body.dataset.tab };
  await back(); await wait(700);
  out.A.afterBack = { depth: history.state?.depth, tab: document.body.dataset.tab, postView: !!document.getElementById('post-view') };

  // B: sub-tab survives a sync redraw
  window._goToProfile('perf_0'); await wait(500);
  const btn = document.querySelector('#tab-profile .profile-subtab-btn[data-profile-tab="avaliados"]');
  window._switchProfileTab('avaliados', btn); await wait(300);
  const dB = history.state?.depth;
  const wrapB = document.querySelector('#tab-profile .profile-wrap');
  bump(); await wait(400);
  out.B = { redrew: wrapB !== document.querySelector('#tab-profile .profile-wrap'), subTab: document.querySelector('#tab-profile .profile-subtab-btn.active')?.dataset.profileTab, depthBefore: dB, depthAfter: history.state?.depth };

  // C: a sync with only presence changed does not redraw
  const wrap = document.querySelector('#tab-profile .profile-wrap');
  presence(); await wait(400);
  out.C = { sameDom: wrap === document.querySelector('#tab-profile .profile-wrap') };

  // D (wide layout only: on a phone comments open the post view): open comments survive a redraw
  if (innerWidth > 700) {
    const posts = document.querySelector('#tab-profile .profile-subtab-btn[data-profile-tab="posts"]');
    window._switchProfileTab('posts', posts); await wait(300);
    const card = document.querySelector('#tab-profile .post-card[data-post-id="perf_post_2"]');
    window._toggleComments('perf_post_2', card.querySelector('.btn-post-action[onclick*="_toggleComments"]')); await wait(600);
    document.activeElement?.blur(); // reading them, not typing (typing holds the redraw)
    bump(); await wait(400);
    const sec = document.querySelector('#tab-profile .post-card[data-post-id="perf_post_2"] .post-comments-section');
    out.D = { redrew: card !== document.querySelector('#tab-profile .post-card[data-post-id="perf_post_2"]'), open: sec?.dataset.open, display: sec?.style.display };
  }
  // E: a like on a profile post does not trigger a redraw on the next sync
  const wrapE = document.querySelector('#tab-profile .profile-wrap');
  window._likePost('perf_post_4'); await wait(100);
  refreshFromServer(); await wait(400);
  out.E = { sameDom: wrapE === document.querySelector('#tab-profile .profile-wrap') };
  out.pass = out.A.depthAfterSync === out.A.depthPost && out.A.layerAfterSync === 'post'
    && out.A.afterClose.tab === 'profile' && !out.A.afterClose.postView && out.A.afterBack.postView === false
    && out.B.subTab === 'avaliados' && out.B.depthAfter === out.B.depthBefore && out.C.sameDom && out.A.redrew && out.B.redrew && out.E.sameDom && (!out.D || (out.D.redrew && out.D.open === 'true'));
  return out;
}
