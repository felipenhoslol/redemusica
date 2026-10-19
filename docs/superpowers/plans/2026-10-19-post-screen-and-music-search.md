# Post screen (mobile) and music search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones, the comment box sits fixed at the bottom of the post screen and grows when typing, and tapping anywhere on a post opens it; the music search shows songs, albums and artists without duplicates or unrelated results.

**Architecture:** Search cleanup lives in a new dependency-free module (`js/musicResults.js`) that `js/api.js` applies to every iTunes result, so the search tab, the "choose a song" window and the artist pages all benefit; it is tested with `node --test`. The post screen changes are CSS plus small listeners in `js/feed.js`; the comment box stays where it is in the HTML (the comment functions find it through the post card) and is only pinned to the bottom with CSS.

**Tech Stack:** Vanilla ES modules (no bundler locally), iTunes Search/Lookup API, `node --test` (Node 22+), served raw by Vercel and bundled by `.github/workflows/pages.yml` for GitHub Pages.

**Spec:** the user's request of 2026-10-19 (quoted here, it is the only spec):
> "tem q ficar em baixo ao apertar no comentario do post o escreva um comentario e expandir qnd o teclado for ativado no mobile, ao apertar em qlqr area ao redor do post ele tem que expandir igual no twitter, pesquisar ainda ta bugado e desorganizado aparece mt vezes o artista nao aparece todos os albuns certinho (na pesquisa tem q aparecer album musica e artista)"

Reproduced on 2026-10-19 with the query `daft punk`:
- `searchArtists('daft punk', 30)` → 30 artists, only 3 contain "daft punk" (others: blink-182, Arctic Monkeys, Alan Walker…).
- `searchTracks('daft punk', 25)` → "I Feel It Coming (feat. Daft Punk)" ×3, "Get Lucky" ×2.
- `searchAlbums('daft punk', 48)` → albums, "- Single"/"- EP" releases and other artists' singles named "Daft Punk" all mixed.
- `lookupArtist(<Daft Punk id>)` → capped at 24, half singles; "Daft Club" and "Alive 2007" buried among singles.

## Before you start

The working tree holds an uncommitted batch from the previous request (X-style navigation, chat, challenges, play sync, preview start point). Ask the user to approve committing it first, so each task below commits only its own files.

## Global Constraints

- UI copy in Brazilian Portuguese, sentence case, no emoji (memory: visual direction).
- Escape every value from users or iTunes with `esc()` / `safeUrl()` from `js/dom.js` (security baseline; `tools/security.test.mjs` must keep passing).
- Phone layout = `@media (max-width: 700px)`; desktop behavior must not change unless a task says so.
- Check every edited module with `node --check` on a `.mjs` copy (plain `.js` checks miss ESM errors — memory note).
- Play buttons that follow the player use the `data-play-key` attribute (`playAttr()` in `js/audio.js`); `data-play` belongs to `js/search.js` rows and holds JSON — never reuse it.

## Review Focus

1. Accents and case in the query ("beyonce", "BEYONCÉ") still find the artist — test in Task 1.
2. A query mixing song and artist ("one more time daft punk") keeps the artist Daft Punk — test in Task 1.
3. A real album whose title contains "Single" or "EP" mid-title ("Single Ladies", "EPIC") stays an album — test in Task 1.
4. On an iPhone, the pinned comment box stays above the keyboard and the reply banner ("Respondendo a…") stays visible — browser check in Task 4.
5. Tapping a link, @mention, image, song, poll, play/like buttons or selecting text inside a post does not open the post screen — browser check in Task 5.

---

### Task 1: Pure helpers that clean iTunes results

**Files:**
- Create: `js/musicResults.js`
- Create: `tools/search.test.mjs`
- Modify: `.github/workflows/pages.yml` (add the test next to the existing `node --test tools/security.test.mjs` step)

**Interfaces:**
- Produces (all pure, no imports):
  - `normalize(text: string): string` — lowercase, accents removed (NFD + strip `\p{M}`), spaces collapsed, trimmed.
  - `dedupeTracks(tracks: Track[]): Track[]` — keeps the first of each `normalize(title) + '|' + normalize(artist)`, order preserved.
  - `relevantArtists(artists: {id,name}[], query: string): {id,name}[]` — keeps an artist when its normalized name contains every query word, or the normalized query contains the whole normalized name; then dedupes by normalized name (first wins); order preserved.
  - `albumKind(rawTitle: string): 'album'|'single'|'ep'` — `'single'` / `'ep'` only when the title ends with ` - Single` / ` - EP` (case-insensitive).
  - `cleanAlbumTitle(rawTitle: string): string` — the title without that suffix.
  - `organizeAlbums(albums: Album[]): { albums: Album[], singles: Album[] }` — splits by `album.kind` (`single` and `ep` go to `singles`), dedupes each list by `normalize(title) + '|' + normalize(artist)` (first wins), sorts each by `year` descending (stable; missing year last).

- [ ] **Step 1: Write the failing tests in `tools/search.test.mjs`** (same style as `tools/security.test.mjs`)

```js
test('dedupeTracks keeps one of each song', () => {
  const t = (title, artist) => ({ title, artist });
  assert.equal(dedupeTracks([t('Get Lucky','Daft Punk'), t('get lucky ','DAFT PUNK'), t('Get Lucky','Other')]).length, 2);
});
test('relevantArtists drops unrelated and repeated artists', () => {
  const a = (name) => ({ id: name, name });
  const out = relevantArtists([a('Daft Punk'), a('blink-182'), a('Daft Punk Experience'), a('Daft Punk')], 'daft punk');
  assert.deepEqual(out.map(x => x.name), ['Daft Punk', 'Daft Punk Experience']);
});
test('relevantArtists ignores accents and case', () => {
  assert.equal(relevantArtists([{ id: 1, name: 'Beyoncé' }], 'BEYONCE').length, 1);
});
test('relevantArtists keeps the artist when the query also has a song name', () => {
  assert.equal(relevantArtists([{ id: 1, name: 'Daft Punk' }], 'one more time daft punk').length, 1);
});
test('albumKind only reads the " - Single" / " - EP" suffix', () => {
  assert.equal(albumKind('One More Time - Single'), 'single');
  assert.equal(albumKind('Around the World - EP'), 'ep');
  assert.equal(albumKind('Single Ladies'), 'album');
  assert.equal(albumKind('EPIC'), 'album');
  assert.equal(cleanAlbumTitle('Da Funk - Single'), 'Da Funk');
});
test('organizeAlbums splits, dedupes and sorts newest first', () => {
  const al = (title, year) => ({ title: cleanAlbumTitle(title), artist: 'Daft Punk', year, kind: albumKind(title) });
  const { albums, singles } = organizeAlbums([al('Discovery', 2001), al('Random Access Memories', 2013),
    al('One More Time - Single', 2000), al('Discovery', 2001), al('Revolution 909 - EP', 1998)]);
  assert.deepEqual(albums.map(a => a.title), ['Random Access Memories', 'Discovery']);
  assert.deepEqual(singles.map(a => a.title), ['One More Time', 'Revolution 909']);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tools/search.test.mjs`
Expected: FAIL — module `../js/musicResults.js` not found.

- [ ] **Step 3: Implement the six functions in `js/musicResults.js`** with the signatures above.

- [ ] **Step 4: Run all tests**

Run: `node --test tools/search.test.mjs tools/security.test.mjs`
Expected: all pass (6 + 4).

- [ ] **Step 5: Add `tools/search.test.mjs` to the workflow test step and commit**

```bash
git add js/musicResults.js tools/search.test.mjs .github/workflows/pages.yml
git commit -m "Busca: funções que limpam os resultados do iTunes (com testes)"
```

### Task 2: Apply the cleanup to every iTunes call

**Files:**
- Modify: `js/api.js` — `searchTracks`, `searchArtists`, `toAlbum`, `searchAlbums`, `lookupArtist`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces:
  - `searchTracks(query, limit)` — unchanged signature; asks iTunes for `Math.min(limit * 2, 200)`, returns `dedupeTracks(...).slice(0, limit)`.
  - `searchArtists(query, limit)` — asks for `Math.min(limit * 2, 200)`, returns `relevantArtists(..., query).slice(0, limit)`.
  - Album objects gain `kind` (`albumKind(collectionName)`), and `title` becomes `cleanAlbumTitle(collectionName)`.
  - `lookupArtist(artistId)` → `{ songs: Track[], albums: Album[], singles: Album[] }`; album lookup uses `limit=200`; songs pass through `dedupeTracks`; albums through `organizeAlbums`.

- [ ] **Step 1: Make the changes above in `js/api.js`.**

- [ ] **Step 2: Syntax check**

Run: `cp js/api.js "$TEMP/api.mjs" && node --check "$TEMP/api.mjs"`
Expected: no output.

- [ ] **Step 3: Check against the real iTunes data in the browser pane** (dev server `musicask-static`, logged in), in the page console:

```js
const api = await import('/js/api.js?v=' + Date.now());
const [ar, tr] = await Promise.all([api.searchArtists('daft punk', 30), api.searchTracks('daft punk', 25)]);
const look = await api.lookupArtist(ar.find(a => a.name === 'Daft Punk').id);
({ unrelated: ar.filter(a => !/daft punk/i.test(a.name)).length,
   dupSongs: tr.length - new Set(tr.map(t => (t.title + '|' + t.artist).toLowerCase())).size,
   hasDaftClub: look.albums.some(a => a.title === 'Daft Club'),
   hasAlive2007: look.albums.some(a => a.title.startsWith('Alive 2007')),
   singleInAlbums: look.albums.some(a => a.kind !== 'album') })
```

Expected: `{ unrelated: 0, dupSongs: 0, hasDaftClub: true, hasAlive2007: true, singleInAlbums: false }`.

- [ ] **Step 4: Commit**

```bash
git add js/api.js
git commit -m "Busca: sem artistas repetidos ou sem relação, músicas sem repetir e todos os álbuns do artista"
```

### Task 3: Organize the search screens (songs, albums, artists)

**Files:**
- Modify: `js/search.js` — `renderAll`, `renderTab` (`albuns` branch), `renderArtistView`
- Modify: `js/ui.js` — `openModalView` artist branch (the "choose a song" window)

**Interfaces:**
- Consumes: `lookupArtist` → `{ songs, albums, singles }`; album `kind` (Task 2).

- [ ] **Step 1: Overview order in `renderAll`:** slots in this order — `musicas` ("Músicas"), `albuns` ("Álbuns"), `artistas` ("Artistas"), then `pessoas`, `posts`, `playlists`. The `albuns` slot shows up to 6 from `[...albums, ...singles]` of `organizeAlbums(await searchAlbums(q, 24))`, so full albums come first.
- [ ] **Step 2: `albuns` tab:** two sections, "Álbuns" then "Singles e EPs", from `organizeAlbums(await searchAlbums(q, 48))`; a section with no items is not rendered.
- [ ] **Step 3: `renderArtistView` and `ui.js` `openModalView` (artist):** after "Músicas populares"/"Mais tocadas", render "Álbuns" (`albums`) and then "Singles e EPs" (`singles`), same `albumCard` / `.msearch-album` markup they use today.
- [ ] **Step 4: Browser check (phone size 375×812):** search `daft punk` in the Pesquisar tab.
  Expected: sections appear in the order Músicas, Álbuns, Artistas; Artistas shows only names containing "Daft Punk"; tapping the Daft Punk artist shows "Álbuns" (includes Daft Club, Alive 2007, newest first) and a separate "Singles e EPs". In the "choose a song" window (composer → Música), tapping the Daft Punk artist shows the same two album groups. No console errors.
- [ ] **Step 5: Syntax check `search.js` and `ui.js` (`.mjs` copies), commit**

```bash
git add js/search.js js/ui.js
git commit -m "Busca organizada: músicas, álbuns e artistas; singles separados dos álbuns"
```

### Task 4: Comment box pinned to the bottom of the post screen (phone)

**Files:**
- Modify: `js/feed.js` — comment composer markup in the comments section (give the attachment row `class="comment-attach-bar"`), `window._openPostView`
- Modify: `css/mobile.css` (phone section)
- Modify: `index.html` — viewport meta gains `interactive-widget=resizes-content`

**Interfaces:**
- Consumes: `#post-view` dialog from `window._openPostView` (already a full-screen layer on phones, with history step `post`).
- Produces: CSS custom property `--kb` (px, keyboard height) on `#post-view` while open on a phone.

Rules (phone only):
- The `.comment-composer-box` inside `#post-view` is `position: fixed` at the bottom (`bottom: var(--kb, 0px)`, full width, `padding-bottom: env(safe-area-inset-bottom)`), and `.post-view-body` gets bottom padding equal to its height so the last comment is not hidden.
- The box stays inside the post card in the DOM (the comment functions find the input through `visiblePostCard` → `.post-card`). Do not move it.
- Collapsed while not focused: only the text field and "Enviar"; `.comment-attach-bar` hidden. Expanded with `:focus-within`: attachment bar shows. The reply banner stays visible in both states.
- In `_openPostView`, on phones, track the keyboard with `visualViewport` (`resize` and `scroll`): `--kb = max(0, innerHeight - visualViewport.height - visualViewport.offsetTop)`; remove the listeners in `close()`.
- Opening comments from the post screen still does not autofocus on touch (existing rule in `_toggleComments`).

- [ ] **Step 1: Make the changes above.**
- [ ] **Step 2: Browser check (375×812):** open a post with several comments from the feed's comment button.
  Expected: the box sits at the bottom edge while the post scrolls; the last comment scrolls fully above it; the attachment row is hidden until the field is focused and appears when it is; "Responder" on a comment shows the reply banner in the pinned box; sending a comment from the pinned box adds it to the list (then delete that test comment).
- [ ] **Step 3: Keyboard check:** in the console, simulate the keyboard by setting `document.getElementById('post-view').style.setProperty('--kb', '300px')`.
  Expected: the box moves up 300px and stays fully visible. Note for the final report that a real iPhone was not available.
- [ ] **Step 4: Desktop check (1280×800):** the post dialog and inline comments look as before.
- [ ] **Step 5: Syntax check `feed.js`, commit**

```bash
git add js/feed.js css/mobile.css index.html
git commit -m "Post no celular: caixa de comentário fixa embaixo e abre ao digitar"
```

### Task 5: Tap anywhere on a post to open it (phone)

**Files:**
- Modify: `js/feed.js` — replace the phone listener that only reacts to `.post-text` (bottom of the file) with one for the whole `.post-card`.

Rule: on phones, a click inside a `.post-card` opens `window._openPostView(card.dataset.postId)` unless:
- the card is already inside `#post-view`;
- the target is inside `a, button, input, textarea, label, img, video, [onclick], [role="button"], .mention-link, .post-attached-song, .post-attached-playlist, .post-poll, .post-comments-section, .rich-link-card`;
- `getSelection().toString()` is not empty.

- [ ] **Step 1: Make the change.**
- [ ] **Step 2: Browser check (375×812), one tap each:**
  - Must open the post screen: the post's text, empty space beside the author's name, the lyric card.
  - Must not open it: the author's avatar/name (goes to their profile), an @mention, a post image (photo viewer), a song's play button, a poll option, like/repost/save, the "⋮" menu.
  - Must not open it with text selected: in the console, select part of a post's text (`getSelection().selectAllChildren(document.querySelector('.post-text'))`) and dispatch a click on it; the post screen stays closed.
- [ ] **Step 3: Syntax check, commit**

```bash
git add js/feed.js
git commit -m "Post no celular: tocar em qualquer parte do post abre a tela do post"
```

### Task 6: Final pass and publish

- [ ] **Step 1:** `node --test tools/search.test.mjs tools/security.test.mjs` → all pass; `node --check` on `.mjs` copies of every changed module → no output.
- [ ] **Step 2:** Phone and desktop smoke test in the browser pane: feed, post screen, search (`daft punk`, `anitta`, `beyonce`), "choose a song" window. No console errors.
- [ ] **Step 3:** With the user's approval, `git push origin main`; confirm Vercel serves `js/musicResults.js` and the GitHub Pages run (which now runs both test files) ends in `success`.
