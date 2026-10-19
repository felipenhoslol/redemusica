# Visual refresh — design

Date: 2026-10-19. Written from a conversation with the site owner (felipenhos).
Mockups the owner chose are kept in `.superpowers/brainstorm/1701-1792381326/content/` (local only): `profile-layout.html` (option A), `compose-tools.html` (option A), `visual-rules.html`.

## Intent and why

The palette is fine, but the site "doesn't feel pleasant to use" next to X and Instagram. The owner's words: on those, "all the icons make sense with each other and everything looks clean and organized". On ours, people get lost (they looked for "compare lists" on the friend's profile; on the phone they couldn't tell what each composer icon does) and the profile looks "small and full of information".

Measured on the phone (375px) on 2026-10-19:

| Screen | Text sizes | Bordered boxes | Icon sizes |
|---|---|---|---|
| Profile | 18 | 21 | 9 (13–26px) |
| Feed | 8 | 7 | 5 |
| Challenges | 5 | 3 | 6 |
| Search | 5 | 8 | 6 |
| Chat | 5 | 1 | 2 |

Icon strokes are already uniform (2px) and purple is not overused in text. The mess comes from too many text sizes, too many framed boxes, too many icon sizes and a crowded profile.

## Goals

1. **One set of visual rules for the whole site**, applied everywhere (phone first, desktop follows):
   - **Text: 4 sizes.** Title 22px (profile name, page titles), Name 16px (author of a post/comment, list item names), Text 15px (posts, comments, bio), Detail 13px (@handle, times, counts, captions). Weights: 400 for text, 800 for names, 900 only for titles. (Inputs stay at 16px on phones: below that, iPhone zooms in.)
   - **Icons: 2 sizes.** 24px in the top and bottom bars, 20px in actions (like, comment, repost, save, play, attach). Same family and stroke as today.
   - **Borders only as dividers** (between posts, under tab bars). No framed blocks inside pages. Things that float (windows, the post screen, the pinned comment box, the composer) keep their edge.
   - **Purple only for what can be tapped or is active**: primary buttons (Seguir, Postar, Enviar), the active tab, links, a given like/repost. Everything else white (`--text`) or gray (`--text-2`).
2. **Profile — option A** (top to bottom): large banner; large photo overlapping its bottom edge with the main button beside it (Seguir / Editar + gear on your own); name (Title); @handle (Detail); seguindo · seguidores (numbers in Name size); bio; socials on one line; featured song as a card (cover, title, artist, play — the one card allowed on the profile); "Top 5 artistas" as a row of round photos with names; then the Posts / Playlists / Avaliados tabs and the posts.
   - **Removed from the profile:** status, "ouvindo agora", the song showcase ("vitrine"), "Músicas mais ouvidas do mês", and the big music-match block.
   - **On other people's profiles:** a **"Comparar" button next to Seguir** and the message button. If you don't follow the person, Comparar still shows and tapping it says "Siga para comparar desafios". The **message button keeps today's rule: only after you follow** (owner's decision) — so the two buttons no longer show/hide together. The music match becomes one Detail line under the follower counts ("72% de sintonia") — only when there is enough data.
3. **Homepage — "ouvindo agora" moves here:** a row of round photos at the top of the feed (like Instagram stories) with the people you follow who are listening right now (from Last.fm). Tapping a photo plays that song's preview.
   - The small headphones line on each post ("what the author is listening to") **is removed** (owner's decision): the row is the one place for it, and the Last.fm calls feed the row only.
   - *Builder's call (mine):* the row shows only people playing right now, and is hidden when nobody is — no "last played" fallback, to keep the top of the feed from filling with stale data.
4. **Composer on the phone — option A:** the attach buttons become a row of icon + name above the keyboard, swiping sideways: Música, Letra, Foto, then Playlist, Votação, Nota. Icons that match their meaning: Música = music note (today it is a magnifying glass), Letra = quotation marks (today a music note), Foto = picture, Playlist = list, Votação = poll/bars, Nota = star.
5. **Posted lyrics** keep the bold style but lose the framed box: a purple bar on the left instead.

## Non-goals

- No new color palette, no new font, no new logo or cat. The rounded font (M PLUS Rounded 1c), dark/light themes and accent colors stay.
- No new features beyond the ones above.
- Search and chat are already close to the rules: only align them to the 4 sizes / 2 icon sizes, no redesign.

## Anti-goal (the owner's words)

"Mudar absurdamente de modo que confunda quem já usa o site." Everything stays where people expect it: same tabs, same bottom bar, same screens, same names for things. The refresh tidies; it does not rearrange. The only things that move are the ones listed in Goals 2–4.

## Constraints

- Vanilla ES modules, no bundler locally; CSS split across `css/*.css` (`css/polish.css` loads last; `css/mobile.css` holds phone rules at `@media (max-width: 700px)`). Type tokens already exist in `css/tokens.css` (`--fs-xs` … `--fs-xl`) — reuse/rename them for the 4 sizes rather than adding a parallel system.
- Many sizes are inline `style="font-size:…"` inside JS templates (profile.js, feed.js, ui.js, chat.js, playlists.js); the rules must win over or replace those.
- No emoji in the UI. Escape every user/iTunes value with `esc()`/`safeUrl()` (security tests in `tools/security.test.mjs` must keep passing).
- Desktop must keep working; the refresh applies the same rules there, but the owner's focus is the phone.

## Calls already made (by the designer, not the owner — check while reading)

- Bio fonts the user picks keep their own size; they are an allowed exception to the 4 sizes.
- The Salvos tab and the share-profile button stay on the profile.
- Empty states (no featured song, no Last.fm, no preview) are the builder's to design, quietly (no empty boxes).
- Desktop uses the same profile layout; the named composer row is phone-only.

## Left to the builder

- How to enforce the 4 sizes (tokens + replacing inline sizes, or overriding rules), and how to verify it (the measurement above can be re-run as a check: count distinct text sizes / boxes per screen).
- Exact spacing values, as long as the profile breathes like the chosen mockup.
- Whether removed profile data (status, showcase, top tracks) stays editable anywhere — the owner did not ask for it; dropping it from view is enough.
- Order of work, as long as profile and feed come first (they are the worst offenders).
