// Chat media: a conversation ending in 5 photos + 2 GIFs must not slide as they load.
//   pinned:     opened at the end, the last message stays inside the list on every frame for 3 s
//   scrolledUp: scrolled 300px up before the first image loads, scrollTop never changes for 3 s
// Photos carry width/height (new messages); GIFs don't (old messages, 4/3 default box).
// node tools/perf.mjs --url http://localhost:5174/ --setup tools/perf/chat-media.setup.js --scenario tools/perf/chat-media.js --skin default|yt2016
async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window._selectChatContact; i++) await wait(100);
  await wait(500);
  const Storage = await import('/js/storage.js');
  const me = Storage.getActiveUserId();
  const contact = Storage.getUserById('perf_chat'); // seeded by chat-media.setup.js
  if (!contact) return { pass: false, error: 'run with --setup tools/perf/chat-media.setup.js' };

  const seed = (run) => {
    const t0 = Date.now() - 3600e3;
    const msg = (i, extra) => ({
      id: `msg_perf_${run}_${i}`, fromUserId: i % 2 ? me : contact.id, toUserId: i % 2 ? contact.id : me, text: '', song: null,
      imageUrl: '', gifUrl: '', link: null, replyTo: null, edited: false, createdAt: '12:00',
      createdAtIso: new Date(t0 + i * 60e3 * 7).toISOString(), synced: true, ...extra
    });
    // ?run&i: a fresh network fetch per image (perf.mjs also disables the cache), so each load lands after the first paint
    const img = (i) => `/assets/og-image.png?chat=${run}_${i}`;
    const msgs = [
      ...Array.from({ length: 12 }, (_, i) => msg(i, { text: `mensagem ${i} sobre aquele disco` })),
      ...Array.from({ length: 5 }, (_, i) => msg(12 + i, { imageUrl: img(i), width: 1200, height: 630 })),
      msg(17, { gifUrl: img(5) }), msg(18, { gifUrl: img(6) })
    ];
    localStorage.setItem('rmsn_messages_v5', JSON.stringify(msgs));
  };

  const watch = async (area, check) => {
    let frames = 0, bad = 0, loads = 0;
    area.addEventListener('load', () => loads++, true);
    const end = performance.now() + 3000;
    await new Promise(done => {
      const tick = () => { frames++; if (!check()) bad++; performance.now() < end ? requestAnimationFrame(tick) : done(); };
      requestAnimationFrame(tick);
    });
    return { frames, bad, loads, pass: bad === 0 && loads > 0 };
  };

  window.switchTab?.('chat');
  await wait(300);

  // 1. Opened at the end
  seed('a');
  window._selectChatContact(contact.id);
  let area = document.getElementById('chat-tab-messages');
  const pinned = await watch(area, () => {
    const last = [...area.querySelectorAll('.dm-bubble')].at(-1)?.getBoundingClientRect();
    return last && last.bottom <= area.getBoundingClientRect().bottom + 1;
  });

  // 2. Scrolled up before the first load
  window._selectChatContact(null);
  seed('b');
  window._selectChatContact(contact.id);
  area = document.getElementById('chat-tab-messages');
  area.scrollTop -= 300;
  const top = area.scrollTop;
  const scrolledUp = await watch(area, () => area.scrollTop === top);
  scrolledUp.scrollTop = top;

  return { pass: pinned.pass && scrolledUp.pass, pinned, scrolledUp, skinAttr: document.documentElement.dataset.skin || '' };
}
