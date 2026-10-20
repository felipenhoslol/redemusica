# Desafio "ranking por estrelas" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new challenge type where a person rates an artist's releases (albums, EPs, singles) or an album's tracks from 1 to 5 stars, keeps that ranking saved and visible to friends, and can post a frozen snapshot of it to the feed.

**Architecture:** Pure ranking logic (dedupe, grouping, ordering, validation) lives in a new `js/ranking.js` with no DOM. Saved rankings live in `js/storage.js` under one localStorage key and sync to a new `public.rankings` table (not profile extras: one artist ranking can be ~50 KB). A post carries a validated copy in `body.ranking`; the feed card (`js/rankingCard.js`) and the rating screens plus challenge area (`js/rankingUi.js`) render from those shapes.

**Tech Stack:** Vanilla ES modules in `js/`, Supabase (SQL migrations in `supabase/`), iTunes via `js/api.js`, motion helpers in `js/motion.js` (`animateSpring`, `popIcon`, `rollNumber`, `flip`, `SPRINGS`), tests with `node --test` + `node:assert/strict` in `tools/*.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-20-desafio-ranking-estrelas-design.md`

## Global Constraints

- Vanilla JS in `js/`, no new framework, no new dependency (`package.json` stays `gsap` only).
- Music data only from iTunes via `js/api.js`.
- House visual direction: social layout, kawaii cat for empty states, M PLUS Rounded 1c, stroke-2 icons from `ICONS`, no emoji in UI, existing 4 text sizes (`--fs-*`) and 3 weights, purple only on tappable things.
- No gradients, no pills/over-rounded shapes, no heavy shadows, no purple/neon glow.
- Every action (marking a star, posting, switching tab) gets spring feedback through `js/motion.js` (respect `reducedMotion()`).
- Layout stable: cover slots have fixed `aspect-ratio: 1` boxes before images load; tab switches never resize the header.
- All user-facing copy in Portuguese.
- The same release never appears twice in the grid, the podium, or the full list.
- Editing a ranking never changes a post already in the feed (posts hold a snapshot).
- "Amigos" = `getFollowing()`.
- Ratings: 0.5 to 5 in 0.5 steps; unrated items are allowed and excluded from the ranking.
- Tie-break: artist mode, newer release first; album mode, disc order.
- Known gotcha: `node --check` passes broken ES modules. Every new module must be loaded by a real `import` in a test file.

## Review Focus

- A person rates in two tabs (desktop + phone): the newer `updatedAt` wins per ranking on pull, and a local edit still on its way up is not overwritten by an older server copy. Test in Task 2 (`mergeRemoteRankings keeps my newer local ranking`).
- A hostile or old client writes junk in `rankings.body` or `posts.body.ranking` (string ratings, `javascript:` artwork, 5000 items): `cleanRanking` drops it to a safe shape and the card still renders. Test in Task 1.
- An artist with 150+ releases: the grid stays usable (lazy images, `loading="lazy"`) and the post snapshot stays under the 300-item cap. Test in Task 1 (`snapshotRanking caps items`).
- Tapping on a ranking card in the feed must not open the post detail (the feed's click-to-open list at `js/feed.js:1509`). Test in Task 4.
- The `rankings` table not yet created on the server (migration not run): the app keeps working locally and does not spam errors, the same way `votesTable` is handled. Covered by Task 3's manual check.

---

## File Structure

- Create `js/ranking.js`: pure logic, no DOM, no storage.
- Modify `js/api.js`: `toAlbum` gains `released` (ISO date string) for the tie-break.
- Modify `js/storage.js`: saved rankings CRUD, post `ranking` field.
- Create `supabase/014_rankings.sql`; modify `js/sync.js`: remote rankings + post body field.
- Create `js/rankingCard.js`: feed card HTML + full ranking view; modify `js/feed.js` to call it.
- Create `js/rankingUi.js`: rating screen (artist grid / album tracklist) and the challenge area; modify `js/ui.js` (pill) and `js/app.js` (Desafios tab switch).
- Create `css/ranking.css`, linked in `index.html` after `css/search.css` (the build tool picks up every `<link>` in order).
- Create `tools/ranking.test.mjs`; extend `tools/ui.test.mjs`.

Test commands: `node --test tools/ranking.test.mjs`, `node --test tools/ui.test.mjs`, and the full suite `node --test tools/`.

## Shared data shapes (all tasks)

```js
// RankingItem
{ id: string, title: string, kind: 'album'|'ep'|'single'|'track', year: number|'', released: string /* ISO or '' */,
  artwork: string /* https or '' */, order: number /* album mode: position in tracklist, else 0 */, rating: number /* 0.5..5 */ }

// Ranking (saved, one per person per subject)
{ key: 'artist:<itunesArtistId>' | 'album:<itunesCollectionId>', mode: 'artist'|'album',
  subject: { id: string, title: string /* artist name or album title */, artist: string, artwork: string, year: number|'' },
  items: RankingItem[] /* rated only, unordered */, updatedAt: string /* ISO */ }

// Post snapshot: post.ranking = snapshotRanking(ranking) -> same shape, items sorted by rankItems, capped at 300
```

---

### Task 1: Ranking core logic (dedupe, order, validation)

**Files:**
- Create: `js/ranking.js`
- Modify: `js/api.js` (`toAlbum`, ~line 155)
- Test: `tools/ranking.test.mjs`

**Interfaces:**
- Consumes: `albumKind`, `cleanAlbumTitle` from `js/musicResults.js`; album objects from `lookupArtist`/`toAlbum` (`{id,title,kind,artist,artwork,year,released}`).
- Produces:
  - `editionBase(title: string) -> string`: lowercase, accent-free title with edition suffixes stripped.
  - `dedupeReleases(releases: Album[]) -> Album[]`: one per `kind + editionBase(title)`, keeping the earliest `released` (then smallest id) version's id, title, artwork and year.
  - `groupReleases(releases: Album[]) -> { albums, eps, singles }`: each newest first.
  - `rankItems(items: RankingItem[], mode) -> RankingItem[]`: rated only, unique by id, sorted.
  - `rankingKey(mode, subjectId) -> string`.
  - `cleanRanking(raw: unknown) -> Ranking|null`.
  - `snapshotRanking(ranking: Ranking) -> Ranking`: deep copy, items ranked, cap 300.
  - `RANKING_MAX_ITEMS = 300`.
  - `RANKING_CHALLENGE_ID = 'stars_ranking'` (lives here so `ui.js` and `rankingUi.js` share it without a circular import).

- [ ] **Step 1: Write the failing tests** in `tools/ranking.test.mjs` (header comment: `// Guards the star-ranking logic in js/ranking.js: run with node --test tools/ranking.test.mjs`)

```js
import { editionBase, dedupeReleases, groupReleases, rankItems, cleanRanking, snapshotRanking, rankingKey } from '../js/ranking.js';
const al = (id, title, released, kind = 'album') => ({ id, title, kind, artist: 'X', artwork: `https://a/${id}.jpg`, year: Number(released.slice(0, 4)), released });

test('editionBase strips edition suffixes only', () => {
  assert.equal(editionBase('1989 (Deluxe Edition)'), editionBase('1989'));
  assert.equal(editionBase('Abbey Road (Super Deluxe Edition)'), editionBase('Abbey Road'));
  assert.equal(editionBase('Rumours (Remastered)'), editionBase('Rumours'));
  assert.equal(editionBase('Disintegration (Expanded)'), editionBase('Disintegration'));
  assert.equal(editionBase('Acabou Chorare (Edição Especial)'), editionBase('Acabou Chorare'));
  assert.notEqual(editionBase("Fearless (Taylor's Version)"), editionBase('Fearless'));
  assert.notEqual(editionBase('MTV Unplugged in New York (Live)'), editionBase('MTV Unplugged in New York'));
});

test('dedupeReleases keeps the original version once', () => {
  const out = dedupeReleases([al('2', '1989 (Deluxe Edition)', '2014-10-27'), al('1', '1989', '2014-10-27'),
    al('3', '1989 (Taylor\'s Version)', '2023-10-27'), al('4', 'Rumours (Remastered)', '2004-01-01'), al('5', 'Rumours', '1977-02-04')]);
  assert.deepEqual(out.map(a => a.id).sort(), ['1', '3', '5']);
});

test('dedupeReleases keeps a single and an album with the same name apart', () => {
  assert.equal(dedupeReleases([al('1', 'Lover', '2019-08-23'), al('2', 'Lover', '2019-08-16', 'single')]).length, 2);
});

test('groupReleases splits albums, EPs and singles, newest first', () => {
  const g = groupReleases([al('1', 'A', '2001-01-01'), al('2', 'B', '2010-01-01'), al('3', 'C', '2005-01-01', 'ep'), al('4', 'D', '2003-01-01', 'single')]);
  assert.deepEqual([g.albums.map(a => a.id), g.eps.map(a => a.id), g.singles.map(a => a.id)], [['2', '1'], ['3'], ['4']]);
});

test('rankItems orders by stars, newer release breaks artist ties, disc order breaks album ties', () => {
  const it = (id, rating, released, order = 0) => ({ id, title: id, kind: 'album', year: '', released, artwork: '', order, rating });
  assert.deepEqual(rankItems([it('old', 5, '2001-01-01'), it('new', 5, '2020-01-01'), it('mid', 4.5, '2010-01-01'), it('none', 0, '2022-01-01')], 'artist').map(i => i.id), ['new', 'old', 'mid']);
  assert.deepEqual(rankItems([it('t3', 4, '', 3), it('t1', 4, '', 1), it('t2', 5, '', 2)], 'album').map(i => i.id), ['t2', 't1', 't3']);
  assert.equal(rankItems([it('a', 4, ''), it('a', 3, '')], 'artist').length, 1); // never twice
});

test('cleanRanking drops junk from untrusted rows', () => {
  assert.equal(cleanRanking('x'), null);
  assert.equal(cleanRanking({ mode: 'playlist', key: 'p:1', subject: {}, items: [] }), null);
  const r = cleanRanking({ key: 'artist:1', mode: 'artist', subject: { id: '1', title: 'X', artwork: 'javascript:alert(1)' },
    items: [{ id: 'a', title: 'A', rating: '9' }, { id: 'b', title: 'B', rating: 3.3 }, { id: 'c', rating: 4, artwork: 'https://ok/c.jpg' }, ...Array(5000).fill({ id: 'z', rating: 1 })] });
  assert.equal(r.subject.artwork, '');
  assert.deepEqual(r.items.map(i => [i.id, i.rating]).slice(0, 3), [['a', 5], ['b', 3.5], ['c', 4]]);
  assert.ok(r.items.length <= 300);
});

test('snapshotRanking is a ranked copy that later edits cannot touch', () => {
  const live = { key: rankingKey('album', '9'), mode: 'album', subject: { id: '9', title: 'S', artist: 'X', artwork: '', year: 2000 },
    items: [{ id: 't1', title: 'T1', kind: 'track', year: '', released: '', artwork: '', order: 1, rating: 3 }], updatedAt: '2026-10-20T00:00:00Z' };
  const snap = snapshotRanking(live);
  live.items[0].rating = 1;
  assert.equal(snap.items[0].rating, 3);
  assert.equal(snap.key, 'album:9');
});

test('snapshotRanking caps items', () => {
  const items = Array.from({ length: 400 }, (_, i) => ({ id: String(i), title: 't', kind: 'single', year: '', released: '', artwork: '', order: 0, rating: 3 }));
  assert.equal(snapshotRanking({ key: 'artist:1', mode: 'artist', subject: { id: '1', title: 'X' }, items }).items.length, 300);
});
```

- [ ] **Step 2: Run** `node --test tools/ranking.test.mjs`. Expected: FAIL, cannot find module `../js/ranking.js`.

- [ ] **Step 3: Implement `js/ranking.js`** with the signatures above.
  - `editionBase`: NFD-normalize, drop accents, lowercase, then repeatedly strip a trailing `(...)` or `[...]` (or ` - ...` suffix) whose text contains one of: `deluxe, remaster, remastered, expanded, edition, edição, edicao, anniversary, bonus, special, especial, explicit, clean, collector, platinum`. Must NOT include `version`, `live`, `ao vivo`.
  - `cleanRanking`: mode in `artist|album`; key matches `^(artist|album):[\w-]{1,40}$` and its prefix equals mode; strings sliced to 200; artwork kept only if `/^https:\/\//`; rating = clamp(round to 0.5, 0.5, 5), items with non-finite rating dropped; items unique by id; cap `RANKING_MAX_ITEMS`; `updatedAt` kept only if `Date.parse` is finite, else `''`.
- [ ] **Step 4: Add `released: r.releaseDate || ''` to `toAlbum` in `js/api.js`.** Run `node --test tools/ranking.test.mjs tools/search.test.mjs`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add js/ranking.js js/api.js tools/ranking.test.mjs && git commit -m "Ranking por estrelas: lógica de deduplicar, ordenar e validar"`

---

### Task 2: Saved rankings in storage + post snapshot field

**Files:**
- Modify: `js/storage.js` (new section after challenges ~line 1018; `createPost` ~line 676)
- Test: `tools/ui.test.mjs` (add tests; it already stubs the browser and seeds `ana`/`bia` as people I follow)

**Interfaces:**
- Consumes: `rankingKey`, `cleanRanking`, `snapshotRanking` from Task 1.
- Produces (all exported from `js/storage.js`):
  - `getRanking(key: string, userId = getActiveUserId()) -> Ranking|null`
  - `getUserRankings(userId = getActiveUserId()) -> Ranking[]` (newest `updatedAt` first)
  - `getFriendsRankings() -> Array<{ userId, ranking }>` (only users in `getFollowing()`, newest first)
  - `setRankingRating(mode, subject, item: Omit<RankingItem,'rating'>, rating: number) -> Ranking|null`: upsert item; rating 0 removes it; sets `updatedAt`; when no items remain, deletes the ranking; calls `toRemote('saveRanking', ranking)` or `toRemote('deleteRanking', key)`.
  - `mergeRemoteRankings(rows: Array<{ user_id, key, body, updated_at }>, userIds: string[])`: replaces stored rankings for those `userIds` with the cleaned rows, except my own ranking whose local `updatedAt` is newer than the row's.
  - `createPost` accepts `postData.ranking` and stores `ranking: postData.ranking ? snapshotRanking(postData.ranking) : null`.
  - Storage key: `rmsn_rankings_v1` -> `{ [userId]: { [key]: Ranking } }`.

- [ ] **Step 1: Write the failing tests** in `tools/ui.test.mjs`

```js
test('rating a release saves my ranking, and clearing the last one removes it', () => {
  const subject = { id: '1', title: 'Daft Punk', artist: 'Daft Punk', artwork: '', year: '' };
  const item = { id: 'd1', title: 'Discovery', kind: 'album', year: 2001, released: '2001-03-12', artwork: '', order: 0 };
  storage.setRankingRating('artist', subject, item, 4.5);
  assert.equal(storage.getRanking('artist:1').items[0].rating, 4.5);
  storage.setRankingRating('artist', subject, item, 0);
  assert.equal(storage.getRanking('artist:1'), null);
});

test('a post keeps the ranking as it was when posted', () => {
  const subject = { id: '2', title: 'Discovery', artist: 'Daft Punk', artwork: '', year: 2001 };
  const t = { id: 't1', title: 'One More Time', kind: 'track', year: '', released: '', artwork: '', order: 1 };
  storage.setRankingRating('album', subject, t, 5);
  const post = storage.createPost({ ranking: storage.getRanking('album:2') });
  storage.setRankingRating('album', subject, t, 2);
  assert.equal(storage.getPostById(post.id).ranking.items[0].rating, 5);
});

test('friends rankings come only from people I follow', () => {
  storage.mergeRemoteRankings([
    { user_id: 'u_ana', key: 'album:3', body: { key: 'album:3', mode: 'album', subject: { id: '3', title: 'A' }, items: [{ id: 'x', rating: 4 }] }, updated_at: '2026-10-19T00:00:00Z' },
    { user_id: 'u_stranger', key: 'album:4', body: { key: 'album:4', mode: 'album', subject: { id: '4', title: 'B' }, items: [{ id: 'y', rating: 4 }] }, updated_at: '2026-10-19T00:00:00Z' }
  ], ['u_ana', 'u_stranger']);
  assert.deepEqual(storage.getFriendsRankings().map(f => f.userId), ['u_ana']);
});

test('mergeRemoteRankings keeps my newer local ranking', () => {
  const me = storage.getActiveUserId();
  const subject = { id: '5', title: 'S', artist: 'X', artwork: '', year: '' };
  storage.setRankingRating('album', subject, { id: 'q', title: 'Q', kind: 'track', year: '', released: '', artwork: '', order: 1 }, 5);
  storage.mergeRemoteRankings([{ user_id: me, key: 'album:5', updated_at: '2000-01-01T00:00:00Z',
    body: { key: 'album:5', mode: 'album', subject: { id: '5', title: 'S' }, items: [{ id: 'q', rating: 1 }], updatedAt: '2000-01-01T00:00:00Z' } }], [me]);
  assert.equal(storage.getRanking('album:5').items[0].rating, 5);
});
```

- [ ] **Step 2: Run** `node --test tools/ui.test.mjs`. Expected: FAIL, `storage.setRankingRating is not a function`.
- [ ] **Step 3: Implement** the Interfaces block in `js/storage.js`. Store `subject` and items through `cleanRanking` before writing so local and remote shapes match.
- [ ] **Step 4: Run** `node --test tools/ui.test.mjs`. Expected: all PASS (old tests included).
- [ ] **Step 5: Commit** `git add js/storage.js tools/ui.test.mjs && git commit -m "Ranking por estrelas: salvar o ranking e a foto dele no post"`

---

### Task 3: Remote sync (rankings table + post body)

**Files:**
- Create: `supabase/014_rankings.sql`
- Modify: `js/sync.js` (`toBody` ~line 141, `fromRow` ~line 156, `POST_FIELDS`/`LIGHT_KEYS` ~lines 651-658, remote hooks ~line 980, `pullNow` ~line 558)

**Interfaces:**
- Consumes: `cleanRanking` (Task 1); `Storage.mergeRemoteRankings`, `Storage.getFollowing` (Task 2); `toRemote('saveRanking', ranking)` / `toRemote('deleteRanking', key)` (Task 2).
- Produces: remote hooks `saveRanking(ranking)`, `deleteRanking(key)`; post rows map `body.ranking` <-> `post.ranking`.

- [ ] **Step 1: Write `supabase/014_rankings.sql`**, header in Portuguese in the style of `004_polls.sql` ("Rode depois do 013... Pode rodar de novo."):
  - `public.rankings (user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade, key text not null check (key ~ '^(artist|album):[A-Za-z0-9_-]{1,40}$'), body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 200000), updated_at timestamptz not null default now(), primary key (user_id, key))`.
  - RLS on; `rankings_select` for select using (true); insert/update/delete own with `user_id = auth.uid()` (insert/update also `public.can_post()`, matching `post_votes`).
- [ ] **Step 2: Post body.** `toBody` adds `ranking: cleanRanking(post.ranking)`; `fromRow` adds `ranking: cleanRanking(b.ranking)`; `POST_FIELDS` adds `ranking:body->ranking`; `LIGHT_KEYS` adds `'ranking'`.
- [ ] **Step 3: Hooks + pull.** Add `saveRanking` (upsert on `user_id,key` with `body` and `updated_at: ranking.updatedAt`) and `deleteRanking` (delete by `user_id = me` and `key`) to the remote hooks object, using the existing `write(db => must(...), '<mensagem>')` pattern with messages "Não foi possível salvar seu ranking." / "Não foi possível apagar seu ranking.". In `pullNow`, after posts: select `user_id, key, body, updated_at` from `rankings` where `user_id in [me, ...getFollowing()]` and call `Storage.mergeRemoteRankings(rows, ids)`. Add `let rankingsTable = true;` beside `votesTable`; on a missing-table error set it false and skip silently (no toast).
- [ ] **Step 4: Verify.** `node --test tools/` passes (sync.js is loaded through `ui.test.mjs`). Then in the app with the migration run: rate one album as user A, wait one pull as user B (who follows A), confirm the ranking appears in B's localStorage `rmsn_rankings_v1`. Without the migration: no console error loop, local ranking still saves.
- [ ] **Step 5: Commit** `git add supabase/014_rankings.sql js/sync.js && git commit -m "Ranking por estrelas: sincronizar rankings e a foto no post"`

---

### Task 4: Feed card and full ranking view

**Files:**
- Create: `js/rankingCard.js`, `css/ranking.css`
- Modify: `js/feed.js` (`renderPostCard` after `${pollHtml(post)}` ~line 380; click-to-open selector ~line 1509), `index.html` (link `css/ranking.css` after `css/search.css`)
- Test: `tools/ranking.test.mjs`

**Interfaces:**
- Consumes: `rankItems` (Task 1), `post.ranking` snapshot (Tasks 2-3), `renderRatingStars(rating, size)` from `js/icons.js`, `esc`/`safeUrl` from `js/dom.js`.
- Produces:
  - `rankingPostHtml(post) -> string` (`''` when `!post.ranking`), root element `<div class="post-ranking" data-mode="artist|album">`.
  - `rankingListHtml(ranking) -> string`: the full numbered list (cover, title, kind label "Álbum"/"EP"/"Single", stars).
  - `window._openRankingView(postId)`: opens the full list of that post's snapshot in a modal (reuse the existing modal pattern from `ui.js` `openModal`), title "Ranking completo".
  - `RANKING_ROW_COUNT = 4` (items shown in the row under the podium).

- [ ] **Step 1: Write the failing tests** (append to `tools/ranking.test.mjs`; import `rankingPostHtml` from `../js/rankingCard.js`; if `icons.js`/`dom.js` touch `document` at load, add the minimal `globalThis.document` stub from `ui.test.mjs`)

```js
const snap = (mode, n) => ({ key: `${mode}:1`, mode, subject: { id: '1', title: 'Disco', artist: 'X', artwork: 'https://a/s.jpg', year: 2001 },
  items: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, title: `Item ${i}`, kind: mode === 'album' ? 'track' : 'album', year: 2000 + i, released: '', artwork: `https://a/${i}.jpg`, order: i + 1, rating: 5 - i * 0.5 })) });

test('artist card: podium of 3, a row of the next 4 and the full count', () => {
  const html = rankingPostHtml({ id: 'p1', ranking: snap('artist', 9) });
  assert.equal((html.match(/class="ranking-podium-slot/g) || []).length, 3);
  assert.equal((html.match(/class="ranking-row-item/g) || []).length, 4);
  assert.match(html, /ver ranking completo \(9\)/);
});

test('album card: big cover and top 3 tracks, no row', () => {
  const html = rankingPostHtml({ id: 'p2', ranking: snap('album', 12) });
  assert.match(html, /ranking-album-cover/);
  assert.equal((html.match(/class="ranking-podium-slot/g) || []).length, 3);
  assert.doesNotMatch(html, /ranking-row-item/);
});

test('a ranking with one rated item still renders, without an empty podium slot', () => {
  assert.equal((rankingPostHtml({ id: 'p3', ranking: snap('artist', 1) }).match(/class="ranking-podium-slot/g) || []).length, 1);
});

test('a post without ranking renders nothing', () => assert.equal(rankingPostHtml({ id: 'p4' }), ''));
```

And in `tools/ui.test.mjs`: `test('tapping a ranking card does not open the post', ...)` asserting the exported selector string used at `feed.js:1509` includes `.post-ranking` (export it as `POST_INNER_CONTROLS` if it is not exported yet).

- [ ] **Step 2: Run** `node --test tools/ranking.test.mjs tools/ui.test.mjs`. Expected: FAIL (module/selector missing).
- [ ] **Step 3: Implement** `js/rankingCard.js`, the `feed.js` hook, and `css/ranking.css`.
  - Artist podium order on screen: 2nd, 1st, 3rd; 1st cover larger and centered. Below, `RANKING_ROW_COUNT` small covers and the link `ver ranking completo (N)`, N = `ranking.items.length` (all rated releases, all kinds).
  - Album: subject cover large, then top 3 tracks as podium (track name + stars, position number).
  - Every cover box has `aspect-ratio: 1` and a flat placeholder background, `loading="lazy"`; no gradients or heavy shadows; radius from existing tokens (`--radius-md` or smaller).
  - Opening the full view: the modal list enters with `animateSpring` (`SPRINGS.snappy`) on opacity + translateY; skip under `reducedMotion()`.
- [ ] **Step 4: Run** `node --test tools/`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add js/rankingCard.js css/ranking.css js/feed.js index.html tools/ranking.test.mjs tools/ui.test.mjs && git commit -m "Ranking por estrelas: card do pódio no feed e ranking completo"`

---

### Task 5: Rating screen (artist grid with tabs, album tracklist)

**Files:**
- Create: `js/rankingUi.js`
- Modify: `css/ranking.css`
- Test: `tools/ui.test.mjs` (import check + one behavior test)

**Interfaces:**
- Consumes: `lookupArtist(artistId)`, `lookupAlbum(albumId)` from `js/api.js`; `dedupeReleases`, `groupReleases`, `rankingKey` (Task 1); `getRanking`, `setRankingRating`, `createPost` (Task 2); `popIcon`, `rollNumber`, `flip`, `animateSpring`, `reducedMotion` from `js/motion.js`; `showToast` from `js/ui.js`.
- Produces:
  - `openRankingEditor(container: HTMLElement, { mode: 'artist'|'album', subject }) -> Promise<void>`
  - `postRanking(key: string) -> object|null`: `createPost({ text: '', ranking })`, toast "Ranking postado", returns the post; returns `null` with toast "Dê nota a pelo menos um item para postar" when no items.
  - `rateFromStarTap(current: number, tapped: number) -> number`: tapping the current value clears it (returns 0).

- [ ] **Step 1: Write the failing tests** in `tools/ui.test.mjs`

```js
const rankingUi = await import('../js/rankingUi.js'); // real import: node --check misses broken modules

test('tapping the same star value again clears the rating', () => {
  assert.equal(rankingUi.rateFromStarTap(3.5, 3.5), 0);
  assert.equal(rankingUi.rateFromStarTap(3.5, 4), 4);
});

test('posting an empty ranking is refused', () => {
  assert.equal(rankingUi.postRanking('artist:nobody'), null);
});
```

- [ ] **Step 2: Run** `node --test tools/ui.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `js/rankingUi.js`.**
  - Artist mode: header (artist name, counter "N com nota" animated with `rollNumber`, buttons "Ver ranking" and "Postar"; "Postar" disabled with the hint when N = 0). Tabs "Álbuns / EPs / Singles" with counts; an empty tab is shown disabled. Grid of covers, stars under each. Releases = `groupReleases(dedupeReleases([...albums, ...singles]))` from `lookupArtist`.
  - Album mode: big cover + title, then the tracklist (number, name, stars). Item `order` = index in `lookupAlbum().tracks` + 1, `kind: 'track'`.
  - Star control: 5 stars, each with left/right half tap targets (pattern from `renderCreatorRating`, `feed.js:663-704`), 44px min touch target, `aria-label="Nota N"`. Each tap: `setRankingRating(...)`, re-render only that item's stars, `popIcon` on the tapped star.
  - Tab switch: content swapped in a fixed-height header area; grid change via `flip` so nothing jumps.
  - States: loading = grid of fixed-size placeholder squares (same count as last time or 8); iTunes failure = message "Não foi possível carregar o catálogo." + button "Tentar de novo"; artist with no releases = kawaii cat empty state "Esse artista ainda não tem lançamentos no iTunes".
- [ ] **Step 4: Run** `node --test tools/`. Expected: all PASS. Then open the app (`run` skill or a static server on the repo root), rate releases of a real artist (e.g. Taylor Swift: check "1989" shows once and "1989 (Taylor's Version)" shows separately), switch tabs, confirm no layout jump while covers load.
- [ ] **Step 5: Commit** `git add js/rankingUi.js css/ranking.css tools/ui.test.mjs && git commit -m "Ranking por estrelas: tela de dar notas (artista e álbum)"`

---

### Task 6: Challenge area (new pill, my rankings, friends' rankings)

**Files:**
- Modify: `js/ui.js` (`renderChallengePills` ~line 965), `js/app.js` (`renderDesafiosTab` ~line 630), `js/rankingUi.js`, `css/ranking.css`
- Test: `tools/ui.test.mjs`

**Interfaces:**
- Consumes: `searchArtists`, `searchAlbums` (`js/api.js`); `getUserRankings`, `getFriendsRankings`, `getUserById` (Task 2); `openRankingEditor`, `postRanking` (Task 5); `rankingListHtml` (Task 4).
- Produces:
  - Uses `RANKING_CHALLENGE_ID` from `js/ranking.js` (Task 1); `rankingUi.js` re-exports it.
  - `renderRankingChallenge(container: HTMLElement) -> void`.
  - `renderChallengePills(container, onSwitch)` (unchanged signature): adds a pill "Ranking por estrelas" before "+ Novo Desafio"; clicking it calls `onSwitch(RANKING_CHALLENGE_ID)` and does NOT call `setActiveChallengeId` (so Comparar and `getActiveChallenge` never see this id).

- [ ] **Step 1: Write the failing tests** in `tools/ui.test.mjs`

```js
test('opening the ranking pill keeps the active question challenge', () => {
  const before = storage.getActiveChallengeId();
  const box = { innerHTML: '' };
  ui.renderChallengePills(box, () => {});
  assert.match(box.innerHTML, /Ranking por estrelas/);
  window._switchChallenge(rankingUi.RANKING_CHALLENGE_ID);
  assert.equal(storage.getActiveChallengeId(), before);
});

test('the ranking area lists my rankings and the ones from people I follow', () => {
  const box = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  rankingUi.renderRankingChallenge(box);
  assert.match(box.innerHTML, /Meus rankings/);
  assert.match(box.innerHTML, /Amigos/);
  assert.match(box.innerHTML, /ana/); // relies on Task 2's merge test running first in this file
});
```

- [ ] **Step 2: Run** `node --test tools/ui.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `renderDesafiosTab`: keep a module-level `desafiosView` (`'questions'` or `RANKING_CHALLENGE_ID`); `onSwitch` renders `renderRankingChallenge(grid)` or `renderMusicAskGrid(grid, id)`.
  - `renderRankingChallenge`: section "Novo ranking" with two choices "Artista" / "Álbum", each opening a search field (debounced, existing search styles) whose result opens `openRankingEditor`. Section "Meus rankings": one row per saved ranking (cover, name, mode label, top item, "N com nota", buttons "Editar" and "Postar"). Section "Amigos": one row per friend ranking (avatar + name, cover, top item), tap opens the full list via `rankingListHtml`. Empty states with the kawaii cat: "Você ainda não fez nenhum ranking" / "Ninguém que você segue fez um ranking ainda". Rows enter with `animateSpring` stagger; respect `reducedMotion()`.
  - Only the saved (current) rankings appear here, never posts.
- [ ] **Step 4: Run** `node --test tools/`. Expected: all PASS. In the app: create an artist ranking, leave mid-way, return via "Editar" (ratings kept), post it, edit it again, confirm the old feed post is unchanged and a second "Postar" makes a new post.
- [ ] **Step 5: Commit** `git add js/ui.js js/app.js js/rankingUi.js css/ranking.css tools/ui.test.mjs && git commit -m "Ranking por estrelas: área do desafio com meus rankings e dos amigos"`
