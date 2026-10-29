# Parte 1 — Toque e animações: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** usar o site pelo celular sem hover preso, vinil pulando, swipe brigando com carrossel, animação de layout ou engasgo na rolagem, sem mudar nada do que o desktop vê com mouse.

**Architecture:** só CSS e pequenos toques em JS que já existe. Os hovers de movimento passam para dentro de `@media (hover: hover) and (pointer: fine)` no lugar onde já estão (a ordem da cascata não muda). Animações viram `transform`/`opacity`. Cada conserto fica preso por um teste `node --test` que lê o CSS/JS, mais uma conferência no navegador no fim.

**Tech Stack:** vanilla JS (ES modules), CSS puro, `node --test` (Node 22, igual ao CI), servidor estático `musicask-static` de `.claude/launch.json` (`python -m http.server 5173`).

**Spec:** `docs/superpowers/specs/2026-10-29-app-android-design.md` (só "Parte 1 — Toque e animações")

## Global Constraints

- "**Não-objetivos:** redesenhar telas, trocar o sistema de molas, adicionar biblioteca de animação."
- "**Anti-objetivo:** consertar o celular e quebrar o hover no computador. O desktop tem que continuar igual."
- "Sem framework novo. O site continua vanilla JS."
- Guarda de hover com a grafia que o projeto já usa: `@media (hover: hover) and (pointer: fine)` (`css/motion.css:39`, `css/mobile.css:208`).
- Movimento (CLAUDE.md + cabeçalho de `css/motion.css`): só `transform`, `opacity` e `clip-path`; molas via `var(--spring-press|snappy|smooth|pop|drawer)` e `var(--spring-*-dur)` de `js/motion.js:39-45`, sempre com fallback (`var(--spring-press, var(--ease-out))`); nunca `ease-in`, nunca `scale(0)` em entrada; nada empurra vizinho.
- Sem emoji na interface; ícones continuam os de `ICONS`.
- Breakpoint de celular do projeto: `max-width: 700px`; "aparelho de toque" = `@media (hover: none)`.
- Testes ficam em `tools/*.test.mjs`, estilo de `tools/ui.test.mjs` (`import { test } from 'node:test'`, `assert/strict`, nomes de teste em inglês descrevendo o comportamento).
- `node --check` não acha erro em ES module: para conferir um `.js`, importe-o num teste (como `tools/ui.test.mjs:131`) ou rode `node --check` numa cópia `.mjs`.
- Commits: mensagem em português no estilo dos recentes ("Área: o que muda", corpo curto), terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git add` só nos arquivos da task, nunca `git add -A`/`.`.

## Review Focus

- Carrossel que **não transborda** (todos os itens cabem) dentro do feed: o swipe do feed tem que continuar funcionando ali; só um scroller que rola de verdade, e que esteja dentro do painel, bloqueia o swipe → teste na Task 3.
- Tocar num botão **dentro** de um card (play, curtir): só o botão afunda; o card inteiro não pode encolher junto (`:active` sobe para os ancestrais) → teste na Task 5.
- Vinil tocando **e** deslocado ao mesmo tempo: o giro (`spinVinyl`, que usa `transform: rotate`) não pode parar nem ser sobrescrito pelo deslocamento → teste na Task 2.
- `prefers-reduced-motion: reduce`: o brilho novo (pseudo-elemento) e o equalizador em `scaleY` também param → teste na Task 7.
- Desktop com mouse: cada hover de movimento continua existindo, na mesma posição da cascata, e as barras translúcidas continuam com blur → testes nas Tasks 1 e 7 e conferência no navegador na Task 7.

---

## Passo 0 — antes da Task 1 (obrigatório)

O dono tem mudanças não commitadas (snapshot de 2026-10-29): `css/components.css` (~linha 701, `.compare-song-play-overlay.playing`), `css/profile.css` (~linha 1101, reduced-motion com `.featured-vinyl-disk`), `css/polish.css`, `js/app.js`, `js/audio.js`, `js/feed.js` (tirou a fileira "ouvindo agora"), `js/lastfm.js`, `js/profile.js`, `js/ui.js` (play nas comparações), `.gitignore`, `CLAUDE.md`. As Tasks 1, 2, 4, 5, 6 e 7 mexem em `components.css`, `profile.css`, `feed.js`, `ui.js` e `app.js`.

- [ ] Rode `git status --short` e `git diff --stat`.
- [ ] Se algum arquivo que a próxima task toca aparece com mudança que não é sua: **pare e avise** (diga o arquivo e o trecho). Não faça `git stash`, `git checkout --`, `git restore` nem commit dessas mudanças, e não as junte no commit da task. Só continue quando o dono tiver commitado/guardado as dele.
- [ ] Repita esta conferência no começo de cada task.

---

### Task 1: Hover de movimento só com mouse (item 1)

**Files:**
- Create: `tools/touch.test.mjs`
- Modify: `css/auth.css:142`, `css/chat.css:220,239` (+1), `css/components.css:144,161,1097` (+3), `css/feed.css:187` (+2), `css/main.css:421` (+1), `css/playlists.css` (5), `css/profile.css:1033` (+9), `css/social.css:466` (+4) — a lista exata sai do teste.

**Interfaces:**
- Produces (em `tools/touch.test.mjs`, usados pelas Tasks 2, 4, 5, 6 e 7 no mesmo arquivo):
  - `cssRules(file?: string): { file: string, selectors: string[], body: string, media: string[] }[]` — lê `css/*.css` (ou só `file`), tira comentários, anda pelas chaves; `media` são os prelúdios dos at-rules que envolvem a regra (`'@media (hover: hover) and (pointer: fine)'`, `'@keyframes np-glow'`…).
  - `const mouseOnly = (r) => r.media.some(m => /\(hover:\s*hover\)/.test(m))`
  - `const touchOnly = (r) => r.media.some(m => /\(hover:\s*none\)/.test(m))`
  - `const MOVES = /(^|[;\s])(transform|translate|scale|rotate|box-shadow)\s*:\s*(?!none\b)/`

- [ ] **Step 1: Escreva os testes que falham**

```js
test('hover that moves or casts a shadow only applies with a mouse', () => {
  const stuck = cssRules().filter(r => !mouseOnly(r) && !touchOnly(r) && MOVES.test(r.body))
    .flatMap(r => r.selectors.filter(s => s.includes(':hover')).map(s => `${r.file} ${s}`));
  assert.deepEqual(stuck, []);
});
test('desktop keeps every hover lift (36 today: 35 to move + 1 already guarded)', () => {
  const kept = cssRules().filter(r => mouseOnly(r) && MOVES.test(r.body)).flatMap(r => r.selectors.filter(s => s.includes(':hover')));
  assert.ok(kept.length >= 36, `only ${kept.length}`);
  for (const s of ['.profile-playlist-card:hover', '.player-ctrl-btn:hover', '.player-play-btn:hover', '.gif-picker-item:hover',
    '.star-pick-btn:hover', '.dm-send-btn:hover', '.dm-attach-btn:hover', '.doodle-btn:hover', '.auth-submit:hover:not(:disabled)'])
    assert.ok(kept.includes(s), s);
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node --test tools/touch.test.mjs`
Expected: FAIL; o primeiro teste lista 35 seletores (regras por arquivo hoje: auth 1, chat 3, components 6, feed 3, main 2, playlists 5, profile 10, social 5). O `.player-play-btn:hover { transform: none }` de `motion.css:37` fica de fora por estar em `(hover: none)`.

- [ ] **Step 3: Envolva cada regra listada em `@media (hover: hover) and (pointer: fine) { … }` no lugar onde ela está**

Nunca mova a regra para outro ponto do arquivo (a ordem entre arquivos e dentro do arquivo decide quem ganha). Regras vizinhas podem dividir o mesmo bloco. Seletor misto (parte com `:hover`, parte sem, ex. `a:hover, a.active`): separe, deixando a parte sem `:hover` fora do bloco com o mesmo corpo. A regra vai inteira para dentro (cor/fundo do hover também deixam de grudar no toque).

- [ ] **Step 4: Rode e veja passar**

Run: `node --test tools/touch.test.mjs`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add tools/touch.test.mjs css/auth.css css/chat.css css/components.css css/feed.css css/main.css css/playlists.css css/profile.css css/social.css
git commit -m "Toque: hover que mexe só vale com mouse

No celular, o hover de transform e sombra ficava preso depois do toque. As regras agora ficam dentro de (hover: hover) and (pointer: fine), no mesmo lugar da cascata, então o desktop continua igual.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Vinil do perfil sem pular (item 2)

**Files:**
- Modify: `css/profile.css:451-478` (`.featured-vinyl-disk`, hover/`.playing`), `css/mobile.css:226-227`
- Test: `tools/touch.test.mjs`

**Interfaces:**
- Consumes: `cssRules`, `mouseOnly` (Task 1).
- Produces: nada novo. `.featured-vinyl-disk.playing` continua sendo ligado por `js/ui.js:1336-1346` (não mexer).

O disco gira com `animation: spinVinyl` (`transform: rotate`, `profile.css:546`). Por isso o deslocamento usa a propriedade individual `translate`, não `transform: translateX()`, que apagaria o giro.

- [ ] **Step 1: Teste que falha**

```js
test('the profile vinyl slides with translate, never animates left, and the spin stays on transform', () => {
  const disk = cssRules().filter(r => r.selectors.some(s => s.includes('.featured-vinyl-disk')));
  assert.ok(disk.every(r => !/transition:[^;]*\bleft\b/.test(r.body)));
  const slid = disk.filter(r => /(^|[;\s])left\s*:/.test(r.body) && r.selectors.some(s => /:hover|\.playing/.test(s)));
  assert.deepEqual(slid.map(r => r.selectors.join()), []);
  assert.ok(disk.some(r => r.selectors.includes('.featured-vinyl-disk.playing') && /translate:\s*14px/.test(r.body)));
  assert.ok(disk.some(r => mouseOnly(r) && r.selectors.includes('.featured-vinyl-stage:hover .featured-vinyl-disk')));
  assert.ok(cssRules('profile.css').some(r => r.media[0] === '@keyframes spinVinyl' && /transform:\s*rotate/.test(r.body)));
});
```

- [ ] **Step 2: Rode e veja falhar** — `node --test tools/touch.test.mjs` → FAIL no teste novo.
- [ ] **Step 3: Implemente**

`profile.css`: o `left: 42px` da base fica; o deslocamento vira `translate: 14px 0` (56−42) em `.featured-vinyl-disk.playing` (sempre) e em `.featured-vinyl-stage:hover .featured-vinyl-disk` (dentro da guarda de mouse); `transition: translate var(--spring-smooth-dur, 350ms) var(--spring-smooth, var(--ease-out)), box-shadow 0.3s ease` (sai o cubic-bezier com overshoot). `mobile.css:227`: mesmo esquema com `translate: 6px 0` (36−30), hover dentro da guarda.

- [ ] **Step 4: Rode e veja passar** — `node --test tools/touch.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `git add css/profile.css css/mobile.css tools/touch.test.mjs`; mensagem: `Perfil: vinil desliza com translate e não sai do lugar` + corpo de uma linha + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 3: Swipe do feed não briga com carrossel (item 3)

**Files:**
- Modify: `js/dragScroll.js:6` (só exportar), `js/swipeTabs.js:1-25`
- Create: `tools/swipeTabs.test.mjs`

**Interfaces:**
- Produces: `export function horizontalScroller(start: Element | null): Element | null` em `js/dragScroll.js` (corpo atual, sem mudança).
- `bindSwipeTabs(el, { tabs, current, onSwitch })` mantém a assinatura (`js/app.js:578`).

- [ ] **Step 1: Testes que falham** (`tools/swipeTabs.test.mjs`)

Stubs mínimos antes do import: `globalThis.window = globalThis`, `matchMedia = () => ({ matches: false })`, `document = { body: BODY }`, `getComputedStyle = n => ({ overflowX: n.overflowX ?? 'visible' })`, `getSelection = () => null`. Painel fake: `{ style: {}, offsetWidth: 400, classList: { add() {}, remove() {} }, setPointerCapture() {}, addEventListener(t, f) { h[t] = f }, contains(n) { sobe por parentElement } }`. Nós fake: `{ parentElement, scrollWidth, clientWidth, overflowX, closest: () => null }`. Helper `drag(target, dx)`: `pointerdown` (pointerType `'touch'`, x 200) → `pointermove` (x 200+dx) → `pointerup`.

```js
test('dragging sideways inside a carousel that scrolls does not move the feed', () => {
  // target dentro de um nó com scrollWidth 800, clientWidth 300, overflowX 'auto', dentro do painel
  drag(inCarousel, -120);
  assert.equal(panel.style.transform ?? '', '');
  assert.equal(switched.length, 0);
});
test('a row that fits on screen (no overflow) still lets the feed swipe', () => {
  drag(inFittingRow, -60);          // scrollWidth === clientWidth
  assert.equal(lastMoveTransform, 'translateX(-60px)');
});
test('a scroller outside the panel does not block the swipe', () => {
  drag(inPanelUnderScrollingAncestor, -60);
  assert.equal(lastMoveTransform, 'translateX(-60px)');
});
```

(`lastMoveTransform` = `panel.style.transform` lido logo depois do `pointermove`.)

- [ ] **Step 2: Rode e veja falhar** — `node --test tools/swipeTabs.test.mjs` → FAIL no primeiro teste (o painel anda).
- [ ] **Step 3: Implemente** — exporte `horizontalScroller`; em `swipeTabs.js`, importe-o e, no `pointerdown` (linha 21-25), depois do `closest(...)`, retorne cedo se `const sc = horizontalScroller(e.target)` existe, `sc !== el` e `el.contains(sc)`.
- [ ] **Step 4: Rode e veja passar** — `node --test tools/swipeTabs.test.mjs tools/ui.test.mjs` → PASS (o import real também prova que os módulos carregam).
- [ ] **Step 5: Commit** — `git add js/dragScroll.js js/swipeTabs.js tools/swipeTabs.test.mjs`; mensagem: `Feed: swipe de aba não rouba o arraste dos carrosséis` + corpo + Co-Authored-By.

---

### Task 4: Barras do player sem animar tamanho (item 4)

**Files:**
- Modify: `css/components.css:184-202` (`.progress-track`, `:hover`, `.progress-fill`), `css/components.css:250-261` (`.player-vol-fill`), `js/ui.js:1265` (style inline do volume), `js/ui.js:1296` (`updateVolumeUI`)
- Test: `tools/touch.test.mjs`

**Interfaces:**
- Consumes: `cssRules` (Task 1).
- `#player-vol-fill` passa a ser dimensionado só por `style.transform = scaleX(v)`, `v` em 0–1.

Estado atual: `css/social.css:468-483` já fixa a trilha em 4px (com e sem hover) e desenha o progresso com `clip-path` + `--p`; então `components.css:190` (`transition: height`), `:193-195` (`height: 8px` no hover) e `:201` (`transition: width`) são código morto e saem. O volume é o único que ainda anima `width` de verdade (`:260` + `ui.js:1296`).

- [ ] **Step 1: Teste que falha**

```js
test('player bars change size with transform or clip-path only', () => {
  const bars = cssRules().filter(r => r.selectors.some(s => /\.(progress-track|progress-fill|player-vol-fill)\b/.test(s)));
  assert.deepEqual(bars.filter(r => /transition[^;]*\b(width|height)\b/.test(r.body)).map(r => r.file + ' ' + r.selectors.join()), []);
  assert.ok(!bars.some(r => r.selectors.some(s => s.includes(':hover')) && /(^|[;\s])height\s*:\s*8px/.test(r.body)));
  const ui = readFileSync('js/ui.js', 'utf8');
  assert.ok(!/player-vol-fill[^>]*width:/.test(ui) && !/fill\.style\.width/.test(ui));
  assert.match(ui, /scaleX\(/);
});
```

- [ ] **Step 2: Rode e veja falhar** — `node --test tools/touch.test.mjs` → FAIL.
- [ ] **Step 3: Implemente** — apague as três linhas mortas; `.player-vol-fill`: `width: 100%`, `transform-origin: left center`, `transition: transform var(--spring-snappy-dur, 120ms) var(--spring-snappy, var(--ease-out))`; em `ui.js`, inline vira `style="transform:scaleX(.8)"` e `updateVolumeUI` faz `fill.style.transform = \`scaleX(${val})\``.
- [ ] **Step 4: Rode e veja passar** — `node --test tools/touch.test.mjs tools/ui.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `git add css/components.css js/ui.js tools/touch.test.mjs`; mensagem: `Player: volume com scaleX e sem transições de tamanho mortas` + corpo + Co-Authored-By.

---

### Task 5: Feedback de toque — flash, press-scale e alvos de 40px (itens 7, 8 e extra)

**Files:**
- Modify: `css/motion.css:17-30` (tap highlight + press-scale), `js/feed.js:184-187` (apagar comentário), `js/ui.js:922` (estrelas), `css/feed.css` (perto de `.star-pick-btn`, `:177-187`)
- Test: `tools/touch.test.mjs`

**Interfaces:**
- Consumes: `cssRules`, `mouseOnly` (Task 1).
- Produces: classes CSS `.comment-delete-btn` (agora estilizada só em CSS) e `.review-star` (wrapper de cada estrela do modal de review). Ninguém mais depende delas.

Decisões:
- `button, a, [role="button"] { -webkit-tap-highlight-color: transparent; }` em `motion.css`, antes da lista de press.
- Press de cards: `.playlist-card, .profile-playlist-card, .q-card, .chat-contact-card, .dm-contact-item, .compare-user-card, .share-option-card` → `scale(0.98)`. Linhas de lista: `.search-row, .friend-item, .playlist-track-row, .post-options-item, .trending-item, .playlist-picker-item, .me-sheet-item, .notif-item:not(.no-link)` → `scale(0.985)`. Cada um como `X:active:not(:has(button:active, a:active))`, para o card não afundar quando o toque é num botão dentro dele. Entram também na lista de `transition-property` (`motion.css:18-23`). `.post-card` fica de fora (grande, cheio de botões, e afundaria a cada rolagem). Antes de incluir, confira com grep que cada classe é clicável; tire a que não for.
- Apagar comentário: tira o `style` inline, `onmouseover`/`onmouseout`; o botão fica do mesmo tamanho visual e ganha `position: relative` + `::before { content: ""; position: absolute; width: 40px; height: 40px; left: 50%; top: 50%; translate: -50% -50%; }` (mesmo truque de `social.css:475`, a linha não cresce). Cor `var(--muted)`, `opacity: .6`; `:active` → `opacity: 1; color: var(--danger); transform: scale(.94)`; o mesmo realce em `:hover` só dentro da guarda de mouse.
- Estrelas: wrapper vira `<div class="review-star" title="Nota ${n}">`, sem style inline nem `onmouseover`; `.review-star { position: relative; display: inline-block; line-height: 0; padding: 4px; cursor: pointer; transition: transform var(--spring-press-dur, 160ms) var(--spring-press, var(--ease-out)); }` (32px + 4+4 = 40px); `#review-stars-row` passa de `gap:8px` para `gap:0` (o espaço visual entre estrelas continua 8px); `:active` → `scale(.9)`; `:hover` → `scale(1.15)` só na guarda.

- [ ] **Step 1: Testes que falham**

```js
test('no hover done in JavaScript', () => {
  for (const f of readdirSync('js').filter(f => f.endsWith('.js')))
    assert.doesNotMatch(readFileSync(`js/${f}`, 'utf8'), /onmouse(over|out|enter|leave)=/, f);
});
test('tapping a button or link does not flash', () => {
  assert.ok(cssRules('motion.css').some(r => ['button', 'a', '[role="button"]'].every(s => r.selectors.includes(s)) && /-webkit-tap-highlight-color:\s*transparent/.test(r.body)));
});
test('cards and list rows sink when pressed, but not when the press is on a button inside', () => {
  const press = cssRules('motion.css').filter(r => /transform:\s*scale\(0\.98/.test(r.body)).flatMap(r => r.selectors);
  for (const c of ['.playlist-card', '.q-card', '.chat-contact-card', '.search-row', '.playlist-track-row', '.me-sheet-item'])
    assert.ok(press.some(s => s.startsWith(c + ':active') && s.includes(':not(:has(')), c);
});
test('delete-comment and review stars have a 40px touch area', () => {
  const del = cssRules('feed.css').find(r => r.selectors.includes('.comment-delete-btn::before'));
  assert.match(del.body, /width:\s*40px/); assert.match(del.body, /height:\s*40px/);
  assert.match(cssRules('feed.css').find(r => r.selectors.includes('.review-star')).body, /padding:\s*4px/);
  assert.ok(cssRules().some(r => mouseOnly(r) && r.selectors.includes('.review-star:hover')));
});
```

- [ ] **Step 2: Rode e veja falhar** — `node --test tools/touch.test.mjs` → FAIL nos 4 novos.
- [ ] **Step 3: Implemente** as decisões acima.
- [ ] **Step 4: Rode e veja passar** — `node --test tools/touch.test.mjs tools/ui.test.mjs` → PASS (o `ui.test.mjs` importa `feed.js` e `ui.js` de verdade).
- [ ] **Step 5: Commit** — `git add css/motion.css css/feed.css js/feed.js js/ui.js tools/touch.test.mjs`; mensagem: `Toque: sem flash, cards afundam e alvos de 40px` com corpo em lista curta + Co-Authored-By.

---

### Task 6: Sem `transition: all` (item 5)

**Files:**
- Modify: as 32 linhas em CSS — `css/chat.css:293,468,538`; `css/components.css:158,315,553,753,781,804,863`; `css/feed.css:37,222,363,497`; `css/main.css:416`; `css/playlists.css:39,100,134,232,441,628,659`; `css/profile.css:47,170,218,277,297,337,664,709,807,972` — e os inline em `js/app.js:1229`, `js/feed.js:74`, `js/ui.js:933` (o de `feed.js:185` saiu na Task 5). Linhas podem ter andado alguns números com as Tasks 1-5.
- Test: `tools/touch.test.mjs`

**Interfaces:**
- Consumes: nada além de `readFileSync`/`readdirSync`.

- [ ] **Step 1: Teste que falha**

```js
test('no "transition: all" anywhere in CSS or inline styles', () => {
  const hits = [...readdirSync('css').map(f => `css/${f}`), ...readdirSync('js').filter(f => f.endsWith('.js')).map(f => `js/${f}`)]
    .flatMap(p => readFileSync(p, 'utf8').split('\n').map((l, i) => /transition(-property)?\s*:\s*all\b/.test(l) ? `${p}:${i + 1}` : null)).filter(Boolean);
  assert.deepEqual(hits, []);
});
```

- [ ] **Step 2: Rode e veja falhar** — `node --test tools/touch.test.mjs` → FAIL com 35 linhas.
- [ ] **Step 3: Troque cada uma pela lista do que muda de verdade** — olhe os estados daquele seletor (`:hover`, `:active`, `.active`, `.selected`, `[aria-*]`, classes ligadas em JS) e liste só essas propriedades, com a mesma duração e curva de antes (o desktop não pode mudar de ritmo). Sem certeza: `background-color, border-color, color, opacity, transform`. Nunca liste `width`, `height`, `top`, `left`, `margin` ou `padding`.
- [ ] **Step 4: Rode e veja passar** — `node --test tools/touch.test.mjs tools/ui.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `git add css/chat.css css/components.css css/feed.css css/main.css css/playlists.css css/profile.css js/app.js js/feed.js js/ui.js tools/touch.test.mjs`; mensagem: `Transições: só as propriedades que mudam, sem "all"` + corpo + Co-Authored-By.

---

### Task 7: Rolagem sem engasgo + CI + conferência no navegador (item 6)

**Files:**
- Modify: `css/profile.css:1064-1068` (`.eq`, `eq-bounce`), `css/profile.css:1072-1084` (`.profile-listening.is-playing`, `np-glow`), `css/profile.css:1100-1102` (reduced-motion), fim de `css/mobile.css` (bloco novo), `.github/workflows/pages.yml:37`
- Test: `tools/touch.test.mjs`

**Interfaces:**
- Consumes: `cssRules`, `touchOnly` (Task 1).

Decisões:
- Brilho: `.profile-listening.is-playing` perde o `animation`; ganha `.profile-listening.is-playing::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: <a sombra de hoje do 50% do np-glow>; opacity: 0; animation: np-glow 2.4s ease-in-out infinite; }` e `@keyframes np-glow { 50% { opacity: 1; } }`. O elemento já é `position: relative`.
- Equalizador: `.eq i { height: 100%; transform-origin: bottom; }`, `@keyframes eq-bounce { 0%, 100% { transform: scaleY(.27); } 50% { transform: none; } }` (3px/11px); reduced-motion de `:1068` vira `animation: none; transform: scaleY(.73)` (8/11).
- Reduced-motion de `:1100-1102` ganha `.profile-listening.is-playing::after`.
- Blur no toque: no fim de `mobile.css`, `@media (hover: none)` com `backdrop-filter: none; -webkit-backdrop-filter: none` para `.mobile-tabbar` (`mobile.css:57`), `.player-bar` (`social.css:456`, que é o que vale sobre `components.css:90`), `.timeline-header` (`social.css:224`, cabeçalho fixo do feed), `.search-top` (`search.css:5`), `.chat-msg-actions-bar` (`chat.css:507`), `.playlist-detail-hero` (`playlists.css:347`). Os quatro que usam `var(--scrim)` (tabbar, player, timeline, search-top) ganham `background: var(--bg)` para o texto de baixo não vazar. Desktop fica com o blur.

- [ ] **Step 1: Testes que falham**

```js
test('no keyframes animate layout or shadow', () => {
  const bad = cssRules().filter(r => r.media.some(m => m.startsWith('@keyframes')) && /(^|[;\s])(width|height|top|left|right|bottom|margin[\w-]*|padding[\w-]*|box-shadow)\s*:/.test(r.body));
  assert.deepEqual(bad.map(r => `${r.file} ${r.media.at(-1)}`), []);
});
test('reduced motion also stops the glow and the equalizer', () => {
  const rm = cssRules('profile.css').filter(r => r.media.some(m => /prefers-reduced-motion:\s*reduce/.test(m)) && /animation:\s*none/.test(r.body)).flatMap(r => r.selectors);
  assert.ok(rm.includes('.profile-listening.is-playing::after') && rm.includes('.eq i'));
});
test('touch screens drop the backdrop blur; desktop keeps it', () => {
  const off = cssRules('mobile.css').filter(r => touchOnly(r) && /(^|[;\s])backdrop-filter:\s*none/.test(r.body) && /-webkit-backdrop-filter:\s*none/.test(r.body)).flatMap(r => r.selectors);
  for (const s of ['.mobile-tabbar', '.player-bar', '.timeline-header', '.search-top', '.chat-msg-actions-bar', '.playlist-detail-hero']) assert.ok(off.includes(s), s);
  assert.ok(cssRules('social.css').some(r => r.selectors.includes('.player-bar') && !touchOnly(r) && /blur\(14px\)/.test(r.body)));
});
```

- [ ] **Step 2: Rode e veja falhar** — `node --test tools/touch.test.mjs` → FAIL (`eq-bounce`, `np-glow`, reduced-motion, blur).
- [ ] **Step 3: Implemente** as decisões acima.
- [ ] **Step 4: Rode tudo** — `node --test tools/` → PASS em todos os `*.test.mjs`.
- [ ] **Step 5: Ponha os testes de toque no CI** — em `pages.yml:37`, acrescente `tools/touch.test.mjs tools/swipeTabs.test.mjs` ao `node --test` existente (e ajuste o nome do passo para "Testar filtros contra XSS e o toque (se falhar, não publica)").
- [ ] **Step 6: Conferência no navegador** (servidor `musicask-static`, `http://localhost:5173`)
  - Desktop (viewport padrão): passe o mouse num `.doodle-btn` e num card de playlist do perfil → `getComputedStyle(el).transform !== 'none'`; o vinil do perfil desliza no hover e gira tocando; o player continua com blur.
  - Celular (preset mobile, recarregue): `matchMedia('(hover: none)').matches === true`; toque num card de playlist e solte → `transform` volta a `none`; arraste de lado na fileira de artistas da busca/perfil dentro do feed → só a fileira rola; no feed, swipe fora dela troca de aba; `document.elementFromPoint` 18px ao lado do centro do botão de apagar comentário e de uma estrela do review cai no próprio botão/estrela; sem erros no console.
  - Volte o preset para desktop no fim.
  Expected: tudo como descrito. Se algo falhar, conserte na task dona e rode `node --test tools/` de novo.
- [ ] **Step 7: Commit** — `git add css/profile.css css/mobile.css .github/workflows/pages.yml tools/touch.test.mjs`; mensagem: `Rolagem: brilho e equalizador só com transform/opacity, sem blur no toque` + corpo citando o CI + Co-Authored-By.

---

## Self-review (feito)

- Cobertura: item 1 → T1; 2 → T2; 3 → T3; 4 → T4; 5 → T6; 6 → T7; 7, 8 e o extra de `:active` → T5; anti-objetivo do desktop → testes "desktop keeps…" (T1), blur no desktop (T7) e conferência com mouse (T7).
- Nomes: `cssRules`, `mouseOnly`, `touchOnly`, `MOVES` definidos na T1 e usados iguais nas T2, T4, T5, T7; `horizontalScroller` exportado na T3 com o nome atual.
- Desvios conscientes do spec: vinil usa `translate` (não `transform: translateX`) por causa do `spinVinyl`; a barra de progresso já usa `clip-path` (`social.css:476-483`), então ali só sai código morto, e o `scaleX` vai para o volume.
