# Visual refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the site feel as clean as X/Instagram without moving things around: one set of visual rules everywhere, a simpler profile (option A), "ouvindo agora" as a row on the feed, and a named composer row on phones.

**Architecture:** A browser-side audit module measures each screen (text sizes, icon sizes, framed boxes, purple on non-interactive text) and is the test for every task. Profile and feed get their structural changes first (spec: they come first), then the site-wide rules are enforced through the existing type tokens plus a codemod over literal font sizes, and a final CSS layer for icons, borders and purple.

**Tech Stack:** Vanilla ES modules, CSS in `css/*.css` (`css/mobile.css` = phone rules at `max-width: 700px`, `css/polish.css` loads last), Last.fm via `js/lastfm.js`, `node --test` for pure helpers, the browser pane (dev server `musicask-static`, port 5173, logged-in session) for screen checks.

**Spec:** `docs/superpowers/specs/2026-10-19-visual-refresh-design.md`

## Global Constraints

- Text: 4 sizes — Title 22px, Name 16px, Text 15px, Detail 13px; weights 400 text, 800 names, 900 titles only. Inputs stay 16px on phones. User bio fonts keep their own size.
- Icons: 24px in the top/bottom bars, 20px in actions; same family and stroke (2px).
- Borders only as dividers; no framed blocks inside pages. Floating things (windows, post screen, pinned comment box, composer) keep their edge. The featured-song card is the one card allowed on the profile.
- Purple only for what can be tapped or is active.
- Anti-goal: nothing changes place or name except what the spec lists (profile, Comparar, feed row, composer row). Same tabs, same bars, same screens.
- No emoji in the UI; escape user/iTunes/Last.fm values with `esc()`/`safeUrl()`; `node --test tools/search.test.mjs tools/security.test.mjs` keeps passing.
- Check every edited JS module with `node --check` on a `.mjs` copy.

## Review Focus

1. A followed person with a private or missing Last.fm, or Last.fm down: the feed row hides itself, no console errors — check in Task 3.
2. Long names in the Top 5 row and the listening row: ellipsis, no horizontal page scroll at 375px — check in Tasks 2 and 3.
3. Light theme: dividers visible and purple still marks only tappable things — check in Task 5.
4. Desktop 1280px: the option-A profile still looks right (banner not stretched, actions aligned) — check in Task 2.
5. Not following someone and tapping Comparar: a toast "Siga para comparar desafios", no navigation; after following, Comparar opens the comparison — check in Task 2.

---

### Task 1: Screen audit (the test for every later task)

**Files:**
- Create: `tools/ui-audit.mjs` (browser module, no imports)

**Interfaces:**
- Produces: `auditScreen(root: Element = document.querySelector('.tab-view-content.active')): { textSizes: string[], textWeights: string[], iconSizes: number[], framedBoxes: string[], accentOnStatic: string[] }`
  - `textSizes`: distinct computed `font-size` of visible elements that own a non-empty text node, excluding `input, textarea, select`, `.profile-bio` and its descendants, and anything inside `.cat`.
  - `iconSizes`: distinct rounded widths of visible `svg[stroke="currentColor"]`, excluding `.cat` and anything inside `.player-bar`.
  - `framedBoxes`: `tag.firstClass` of visible elements wider than 60px with a border on all four sides, excluding `input, textarea, select, button, a, [role="button"]`, `.featured-song-box`, `.comment-composer-box`, `.app-dialog-panel`, and avatar/photo elements (`img`, `[class*="avatar"]`, `[class*="photo"]`).
  - `accentOnStatic`: `tag.firstClass` of visible text elements whose computed color equals `--accent` and that are not inside `a, button, [role="button"], .active, [aria-current], [aria-selected="true"], .liked, .reposted, .bookmarked`.
  - "visible" = has a box, and its top lies within 3 viewport heights.

- [ ] **Step 1: Write `auditScreen` with the rules above.**
- [ ] **Step 2: Baseline (it must reproduce the spec's numbers).** In the browser pane at 375×812, logged in, for feed, search, chat, desafios and your own profile run `(await import('/tools/ui-audit.mjs?v=' + Date.now())).auditScreen()` after `switchTab(...)`/`_goToProfile(me)`.
  Expected: the profile reports about 18 text sizes and about 20 framed boxes (spec table: 18 / 21); the feed reports about 8 sizes. Write the five results into the ledger as the baseline.
- [ ] **Step 3: Commit** — `git add tools/ui-audit.mjs` · "Ferramenta: auditoria visual das telas (tamanhos, ícones, caixas, roxo)".

### Task 2: Profile, option A

**Files:**
- Modify: `js/profile.js` — `renderProfileView`, `buildTopArtistsMonthHtml`, `matchHtml`, `refreshProfileFollowState`; delete `loadListening` and its call, `buildShowcaseHtml` and its call, `buildTopTracksHtml` and its call, the status block (display + inline edit form) and the window handlers that only it uses (`_startEditStatus`, `_saveStatus`, `_cancelEditStatus` — grep for other callers first).
- Modify: `css/profile.css` or `css/polish.css` for the new blocks.

Order inside `.profile-wrap` (top to bottom): banner (taller than today: `aspect-ratio: 3 / 1` on phones, max 220px on desktop) → photo 96px overlapping the banner's bottom edge, action row on its right → name (Title) → @handle (Detail) → stats row "N seguindo · N seguidores" (numbers 800, Name size) → one Detail line "N% de sintonia musical" only when `calculateMusicalAffinity(...).hasEnoughData` and not your own profile → bio → socials (existing `buildSocialsHtml`, one line) → featured song card (existing) → "Top 5 artistas" row → subtabs.

- Action row, someone else: Seguir/Seguindo, message button (`data-dm-id`, still hidden until you follow), **Comparar** (`class="profile-compare-btn"`, always visible), share. Comparar: if not following → `showToast('Siga para comparar desafios')`; else `window._compareWith(userId)`. Remove `data-compare-id` from the follow-state toggle so Comparar no longer hides with the message button. The old `.profile-match` block goes away.
- Action row, you: Editar, gear (`profile-menu-btn`), share — unchanged.
- Top 5 row: `buildTopArtistsMonthHtml` returns a header "Top 5 artistas" (Name size; for you, an "Atualizar"/"Editar" text button on the right, same handler as today) and a horizontally scrolling row of up to 5 items: round photo 56px (`artistPhotoHtml(a, 'top5-photo')`, still hydrated by `hydrateArtistImages`) and the name below in Detail size, one line, ellipsis, max width 64px; tapping calls `window._searchArtistInCatalog(name)`. The empty state for you (connect Last.fm) stays, without a frame.

- [ ] **Step 1: Failing check.** At 375×812 on someone else's profile (followed) run the Task 1 audit and also `!!document.querySelector('#tab-profile .profile-listening, #tab-profile .top-tracks-section, #tab-profile .showcase-section, #tab-profile .profile-status-wrap, #tab-profile .profile-match')`.
  Expected now: `true` (old blocks present) and framedBoxes ≥ 10.
- [ ] **Step 2: Make the changes above.**
- [ ] **Step 3: Check again (375×812):** the same selector → `false`; `framedBoxes` → `[]` on the profile; the order of visible blocks matches the list above; `document.documentElement.scrollWidth === innerWidth` with a 30-character artist name injected into the Top 5 data (Review Focus 2).
- [ ] **Step 4: Comparar (Review Focus 5):** on a profile you don't follow, click `.profile-compare-btn` → a toast with "Siga para comparar desafios", `document.body.dataset.tab` still `profile`; on a followed profile → tab becomes `comparar` with that person selected; the message button is visible only on the followed one.
- [ ] **Step 5: Desktop 1280×800 (Review Focus 4):** screenshot of a profile; banner ≤ 220px tall, actions on one line beside the photo.
- [ ] **Step 6: Syntax check, commit** — "Perfil: banner e foto grandes, Top 5 em fileira, Comparar ao lado de Seguir; sai status, vitrine, ouvindo agora e mais ouvidas".

### Task 3: Feed — "ouvindo agora" row and lyric posts

**Files:**
- Modify: `js/feed.js` — new `export function renderListeningRow(container: Element): void`; remove the Last.fm now-playing hydration at the end of `renderFriendsWidget` (the sidebar line keeps showing presence: online / visto há…).
- Modify: `js/app.js` — `renderFeedTab` adds `<div id="listening-row" class="listening-row" hidden></div>` between the "Para você / Seguindo" bar and `#creator-wrap`, then calls `renderListeningRow`.
- Modify: `css/social.css` (`.lyric-quote`) and `css/polish.css` (row styles).

Rules for `renderListeningRow`:
- People you follow with `lastFmUserOf(u)`, at most 15, each asked `fetchLastFmRecentTracks(user, 1)` in parallel; keep those with `nowPlaying`; failures count as "not playing".
- No one playing → the container stays `hidden` (no empty space).
- Each item: round photo 56px with a 2px accent ring, the person's first name below (Detail, ellipsis, max 64px). Tap → `window._playTrack({ title, artist, artwork })` of their `nowPlaying`. `aria-label="<name> está ouvindo <title> de <artist>"`.
- Results cached for 60 seconds per Last.fm user, so re-rendering the feed doesn't refetch.

Lyric posts: `.lyric-quote` loses its box (no background, no border, no radius) and gets `border-left: 3px solid var(--accent); padding-left: 12px`.

- [ ] **Step 1: Failing check:** `document.getElementById('listening-row')` → `null`; `getComputedStyle(document.querySelector('.lyric-quote')).borderLeftWidth` → not `3px`.
- [ ] **Step 2: Make the changes.**
- [ ] **Step 3: Row with someone playing:** `renderListeningRow` builds its markup with `export function listeningRowHtml(items: Array<{ user, track }>): string` (also in feed.js). In the console, inject `listeningRowHtml` of two fake items (one named `<b>x</b>`) into `#listening-row`, unhide it, stub `window._playTrack` to record. Expected: two `.listening-item` elements, the `<b>` shows as text, clicking the first records its track.
- [ ] **Step 4: Review Focus 1:** with the real data, `#listening-row` is either hidden or has items; no new console errors; a followed user with a private Last.fm is simply absent.
- [ ] **Step 5:** `.lyric-quote` shows the left bar and no box; the friends sidebar (desktop) no longer shows the headphones line.
- [ ] **Step 6: Syntax check, commit** — "Feed: fileira de quem está ouvindo agora no topo; letras com barra em vez de caixa".

### Task 4: The 4 text sizes everywhere

**Files:**
- Modify: `css/tokens.css` — `--fs-xs: .8125rem; --fs-sm: .8125rem; --fs-base: .9375rem; --fs-md: 1rem; --fs-lg: 1.375rem; --fs-xl: 1.375rem;` and add named aliases `--fs-detail`, `--fs-text`, `--fs-name`, `--fs-title` pointing at them.
- Create: `tools/type-codemod.mjs` (node script, run once, kept for future use) that rewrites literal font sizes in `css/*.css` (except `tokens.css`, `auth.css`, `pages.css`) and in `font-size:` inside JS template strings in `js/*.js`:
  - map, by value: < 0.9rem (or < 14.5px) → `var(--fs-detail)`; 0.9–0.97rem → `var(--fs-text)`; 0.98–1.15rem → `var(--fs-name)`; 1.16–1.6rem → `var(--fs-title)`;
  - leave alone: values > 1.6rem (decorative big numbers, empty-state icons), `16px` on inputs (the mobile.css input rule), anything in `bioFonts.js`, and `font` shorthands (rewrite only their size part).
  - weights are not touched by the codemod (choosing 400 vs 800 is judgment): Step 4 handles them.
- [ ] **Step 1: Failing check:** Task 1 audit on feed, search, chat, desafios, profile, post screen (`_openPostView`) at 375×812 → at least one screen with more than 4 `textSizes`.
- [ ] **Step 2: Write and run the codemod; review its diff summary (count of replacements per file).**
- [ ] **Step 3: Check again:** every screen's `textSizes` ⊆ {13px, 15px, 16px, 22px} (16px may also be an input).
- [ ] **Step 4: Weights:** audit `textWeights` per screen ⊆ {400, 800, 900}; fix remaining 500/600/700 in the selectors the audit points to (names/titles → 800, else 400).
- [ ] **Step 5: Desktop 1280×800:** same audit on feed and profile, same expectation.
- [ ] **Step 6: Syntax check all changed JS, run both test files, commit** — "Visual: 4 tamanhos de texto e 3 pesos no site inteiro".

### Task 5: Icons, borders and purple

**Files:**
- Modify: `css/polish.css` (one section "Regras do visual"), plus targeted edits where a rule needs it.

Rules:
- Icons: `#mobile-tabbar svg, #mobile-header svg, .app-sidebar .nav-item svg` → 24px; action icons (`.btn-post-action, .doodle-btn, .btn-attach, .msearch-play, .poll-play, .chat-tool-btn, .search-icon-btn, .post-options-btn, .comment-like-btn, .comment-reply-btn`) `svg` → 20px.
- Borders: for each class `auditScreen().framedBoxes` lists, either remove the border (`border: 0` + a `border-bottom: 1px solid var(--line)` divider when it separates rows) or turn the frame into spacing.
- Purple: for each element `accentOnStatic` lists, set color to `var(--text)` or `var(--text-2)`.
- [ ] **Step 1: Failing check:** audit on the six screens (375×812) → some `iconSizes` outside {20, 24}, `framedBoxes` not empty, `accentOnStatic` not empty somewhere.
- [ ] **Step 2: Apply the rules, screen by screen, re-running the audit.**
- [ ] **Step 3: Check:** every screen → `iconSizes` ⊆ {20, 24}, `framedBoxes` = [], `accentOnStatic` = []; same on desktop feed/profile.
- [ ] **Step 4: Light theme (Review Focus 3):** set `document.documentElement.dataset.theme = 'light'`, screenshot feed and profile: dividers visible, purple only on buttons/links/active tab.
- [ ] **Step 5: Commit** — "Visual: ícones em 2 tamanhos, divisórias em vez de caixas e roxo só no que se toca".

### Task 6: Composer — named row on phones

**Files:**
- Modify: `js/icons.js` — add `quote` (two quotation marks, stroke 2, 24 viewBox, same style as the other icons).
- Modify: `js/feed.js` `renderPostCreator` — button order and icons: Música (`ICONS.music`, opens `_creatorOpenSearch`), Letra (`ICONS.quote`, `_creatorToggleLyrics`), Foto (`ICONS.image`, label "Foto", `_creatorOpenImagePicker`), Playlist (`ICONS.playlist`), Votação (`ICONS.poll`), Nota (`ICONS.star`). Titles/aria-labels match the names.
- Modify: `css/mobile.css` — in `body.composing` the attach buttons show icon + name as pills (height 36px, Detail size, gap 8px) in one row that scrolls sideways; outside compose nothing changes (the inline composer is hidden on phones anyway).
- [ ] **Step 1: Failing check:** at 375×812 open `_composeNew()`; the first attach button's label is "Letra" and labels are `display: none`.
- [ ] **Step 2: Make the changes.**
- [ ] **Step 3: Check:** labels visible in order Música, Letra, Foto, Playlist, Votação, Nota; each opens the same thing as before (open and close each picker); desktop composer shows the same order with labels as today.
- [ ] **Step 4: Syntax check, commit** — "Postar no celular: botões com nome e ícones que combinam com o que fazem".

### Task 7: Final pass

- [ ] Both test files pass; `node --check` on `.mjs` copies of every changed module.
- [ ] Audit all six screens at 375×812 and feed/profile at 1280×800; record the final numbers next to the baseline in the ledger.
- [ ] Before/after screenshots of profile and feed for the user.
- [ ] Do not push without the user's approval.
