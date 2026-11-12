// "Novos posts" pill: a post that arrives while you read the middle of the feed waits behind the pill (CLS 0,
// nothing in the DOM); tapping the pill goes to the top and shows it. Then a like count changes on a post on
// screen: it updates in place, CLS 0. The arrival is faked by writing the local cache and calling refreshFromServer().
// Layout shifts are read as a difference: watchMotion() also returns the ones buffered from page load.
// node tools/perf.mjs --url http://localhost:5174/ --setup tools/perf/scroll-restore.setup.js --scenario tools/perf/new-posts.js --width 375 --height 812 --skin default|yt2016 [--reduced]
async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.switchTab; i++) await wait(100);
  await wait(800);
  const Storage = await import('/js/storage.js');
  if (!Storage.getUserById('perf_0')) return { pass: false, error: 'run with --setup tools/perf/scroll-restore.setup.js' };
  const { refreshFromServer } = await import('/js/app.js');
  const { watchMotion } = await import('/tools/ui-audit.mjs');
  const shiftsDuring = async (fn) => {
    const base = watchMotion().stop().cls;
    const m = watchMotion();
    await fn();
    return +(m.stop().cls - base).toFixed(4);
  };
  const toMiddle = async () => {
    window.scrollTo({ top: Math.round((document.documentElement.scrollHeight - innerHeight) / 2), behavior: 'instant' });
    await wait(500);
  };
  const card = (id) => document.querySelector(`#feed-posts .post-card[data-post-id="${CSS.escape(id)}"]`);
  const firstVisible = () => [...document.querySelectorAll('#feed-posts .feed-posts-list > .post-card')]
    .find(c => c.getBoundingClientRect().top > 120);
  const pillState = () => {
    const pill = document.querySelector('#tab-feed .new-posts-pill:not(.leaving)');
    const r = pill?.getBoundingClientRect();
    return pill ? { text: pill.querySelector('.new-posts-label')?.textContent, onScreen: r.top >= 0 && r.bottom <= innerHeight && r.width > 0 } : null;
  };

  window.switchTab('feed'); await wait(300);
  await toMiddle();

  // 1. Someone posts while you read
  const id = `perf_new_${Date.now()}`;
  const y0 = window.scrollY;
  const arrivalCls = await shiftsDuring(async () => {
    Storage.upsertPostsCache([{
      id, authorId: 'perf_1', text: 'acabou de chegar', lyrics: '', lyricsSong: '', lyricsArt: '', tag: '', rating: 0, song: null,
      playlistId: null, poll: null, ranking: null, votes: {}, imageUrl: '', images: [], mentions: [],
      likes: [], comments: [], reposts: [], bookmarks: [], createdAt: 'agora', createdAtIso: new Date().toISOString()
    }]);
    refreshFromServer();
    await wait(1000);
  });
  const arrival = { cls: arrivalCls, pill: pillState(), inDom: Boolean(card(id)), scrollMoved: Math.round(window.scrollY - y0) };

  // 2. Tap the pill: top of the feed, the post is there, the pill leaves
  document.querySelector('#tab-feed .new-posts-pill')?.click();
  await wait(1000);
  const tap = { scrollY: Math.round(window.scrollY), inDom: Boolean(card(id)), pillGone: !document.querySelector('#tab-feed .new-posts-pill') };

  // 3. A like count changes on a post on screen (scrolled to the middle again): updated in place
  await toMiddle();
  const target = firstVisible();
  const pid = target?.dataset.postId;
  const post = Storage.getPostById(pid);
  const likesCls = await shiftsDuring(async () => {
    Storage.upsertPostsCache([{ ...post, likes: [...(post.likes || []), 'perf_0', 'perf_1'] }]);
    refreshFromServer();
    await wait(1000);
  });
  const likes = { cls: likesCls, count: card(pid)?.querySelector('.like-count')?.textContent.trim(), want: String((post.likes || []).length + 2), pill: pillState() };

  const pass = arrival.cls === 0 && arrival.pill?.text === '1 novo post' && arrival.pill.onScreen && !arrival.inDom && arrival.scrollMoved === 0
    && tap.scrollY === 0 && tap.inDom && tap.pillGone
    && likes.cls === 0 && likes.count === likes.want && !likes.pill;
  return { pass, arrival, tap, likes, skinAttr: document.documentElement.dataset.skin || '' };
}
