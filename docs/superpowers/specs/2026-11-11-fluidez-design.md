# Fluidez — design

Data: 2026-11-11. Status: aprovado pelo dono (escopo), pronto para planejar.
Fontes: auditoria de movimento (medições a 375x812, Chromium, observers `layout-shift` e `long-animation-frame`) e a seção "Optimistic update" da auditoria de comportamento/cor.
Marcação: **[DONO]** = decisão do dono, não mudar sem falar com ele. **[decisão minha (pode mudar)]** = escolha de quem escreveu, o construtor pode trocar se achar coisa melhor e disser por quê.

## Intenção e porquê

"Às vezes a fluidez me incomoda." [DONO]
O app já tem uma base boa de movimento (`js/motion.js`: springs viram `linear()` e rodam em CSS/WAAPI; FLIP no feed; popIcon/rollNumber). O que incomoda não é falta de animação, é o app mexer sozinho e perder o lugar da pessoa: o feed pula quando um link carrega, trocar de aba joga para o topo e reconstrói tudo, o acordeão de comentários se perde num toque duplo, as coisas aparecem do nada em vez de sair de onde a pessoa tocou.
Este projeto é só fluidez. [DONO]

## Objetivos

1. Nada empurra a tela depois que ela apareceu (prévias de link, mídia no chat).
2. Trocar de aba é instantâneo, suave e volta exatamente onde a pessoa estava.
3. Post novo nunca mexe no feed sem a pessoa pedir (pílula "novos posts").
4. Toda animação pode ser interrompida e retomada do ponto em que está.
5. Coisas abrem a partir de onde foram tocadas (origem e elemento compartilhado).
6. Listas entram em sequência curta; falha de ação desfaz de forma visível.
7. Movimento reduzido respeitado em 100% dos casos.

## Não-objetivos

- Espaçamento e tipografia (projeto separado depois). [DONO]
- Cor, contraste, OKLCH (projeto separado). [DONO]
- Acessibilidade de teclado/leitor de tela: combobox de menções, `onclick` em `div`, `aria-pressed` nos botões do post. Ficam no projeto de comportamento. [DONO]
- Playlists sincronizarem com o servidor (hoje são só locais; não há o que desfazer).
- Animações decorativas novas (gato, perfil). Não criar nenhuma.

## Anti-objetivos (se acontecer, está errado)

- Animação que bloqueia toque ou rolagem. Nenhum `setTimeout` que trava a próxima interação; nenhuma View Transition acima de ~300 ms.
- Qualquer coisa se mexendo sob o dedo da pessoa enquanto ela rola ou toca.
- Carregamento percebido mais lento: skeleton e animação nunca atrasam o conteúdo que já chegou.
- Quebrar o skin `yt2016` (`html[data-skin="yt2016"]`, `css/skin-yt2016.css`).
- Regressão no botão voltar do Android (commit b5742f5, `js/backButton.js`): voltar fecha dropdown → overlay → passo do histórico → feed → minimiza, nessa ordem.
- AI-slop: sem bounce exagerado, sem blur pesado, sem gradiente, sem efeito novo "porque dá".
- Nova dependência.

## Restrições

- Sem dependência nova: tudo com `js/motion.js` + View Transitions API nativa. [decisão minha (pode mudar)]
- Spring sempre (`SPRINGS.*` ou `var(--spring-*)`), nunca `ease-out`/cubic-bezier fixo, exceto o fallback que `spring()` já tem quando `linear()` não existe.
- Animar só `transform` e `opacity`. `height` só no acordeão (já é exceção documentada em `js/motion.js:100-103`).
- Vale para os dois skins; cada checagem de aceite roda nos dois. [decisão minha (pode mudar)]
- Android: `minSdkVersion = 24` (`android/variables.gradle:2`), Capacitor 8.6, sem `android.minWebViewVersion` em `capacitor.config.json` (padrão 60). View Transitions de mesmo documento pedem Chromium 111+. Regra: detectar `document.startViewTransition`; se não existir, troca instantânea, sem animação substituta. Não mudar `minWebViewVersion` aqui: o projeto de cor já vai propor 111 e isso resolve os dois. [decisão minha (pode mudar)]
- Rolagem é da janela (`window.scrollTo`, `js/app.js:476`), não de um container por aba. O desenho abaixo parte disso.
- Testes ficam em `tools/*.test.mjs` (`node --test`). Ver memória do projeto: `node --check` em `.js` não pega módulo quebrado; checar com cópia `.mjs`.

---

## 1. Parar de empurrar a tela [DONO]

**Problema.**
- Prévia de link: `js/api.js:357-368` desenha `<div class="auto-link-slot" style="min-height:4px">` e ~10 ms depois troca por `outerHTML` pelo card completo (capa de 140px, `css/components.css:1154-1158`, + texto). Cada post com URL cresce ~110px depois de pintado. Medido: CLS 0,142 na carga fria do feed, card de 119→228px, posts abaixo empurrados 123px. Acontece igual em balão de chat com link.
- Mídia do chat: `css/chat.css:617-631` `.chat-msg-media img { width:100%; max-height:260px }` sem `aspect-ratio`; `js/chat.js:462,669,697-716` rolam até o fim uma vez no render e nunca no `load` da imagem. Ao abrir conversa com fotos/GIFs, as últimas mensagens escorregam para fora da tela.
- Menores, mesma família: busca troca "Carregando…" por resultados (`js/search.js:253,344,371`); foto de comentário começa com `min-height:180px` e vira altura natural até 220 (`css/feed.css:718`, `js/feed.js:173`).

**Comportamento desejado.**
- O slot da prévia nasce com o tamanho final do card: skeleton com a área de capa de 140px + 2 linhas de texto, mesmas margens/bordas do card real nos dois skins. Quando os dados chegam, o conteúdo troca dentro da mesma caixa com fade (spring `smooth`), sem mudar altura. Se o link não tiver prévia, o skeleton some com o acordeão (altura animada), nunca de uma vez. Se o link tiver prévia sem imagem, o card sem capa é menor: decidir no código se reserva sempre 140px ou se cacheia "tem imagem?" junto da prévia; o aceite é o CLS, não o método. [decisão minha (pode mudar)]
- Imagem/GIF do chat reserva espaço: largura e altura salvas na mensagem quando houver; senão `aspect-ratio: 4/3` com `object-fit: cover`. Largura/altura podem ir no `body` jsonb da mensagem (`supabase/007_messages.sql`), sem migração; mensagens antigas sem dimensão usam a caixa padrão e re-prendem no fim no `load`. [decisão minha (pode mudar)] A conversa fica presa ao fim: se a pessoa estava a até ~80px do fim, cada `load` de mídia re-prende no fim; se ela rolou para cima, nada se mexe. [decisão minha (pode mudar)]
- Busca: skeleton em forma de linha de resultado no lugar do texto "Carregando…". Foto de comentário: reservar proporção (mesma regra das imagens do chat).

**Aceite.** Carga fria do feed com 8 posts com link e foto: CLS < 0,05 (meta geral abaixo). Abrir conversa com 5 fotos e 2 GIFs no fim: a última mensagem fica visível do começo ao fim do carregamento; rolar para cima antes das imagens chegarem e confirmar que nada se mexe.

## 2. Troca de aba sem corte seco [DONO]

**Problema.**
- Cada visita reconstrói a aba inteira com `innerHTML` (`js/app.js:497-507` → `renderFeedTab()` em `js/app.js:528+` e equivalentes; 93 `innerHTML =` em feed/perfil/busca/playlists/ranking/chat). Medido: quadros de 51-52 ms ao entrar em Playlists e Desafios em CPU de desktop (150-250 ms num Android médio).
- `css/social.css:202` `.tab-view-content { animation: none; }` mata o único fade de entrada (`css/main.css:351`). Há `.tab-indicator` e `panel-in-*` duplicados em `css/social.css:657-689`, sobrescritos por `css/motion.css:90-101`: código morto.
- Swipe "Para você/Seguindo" (`js/swipeTabs.js:69-77`): saída com `.16s ease-out` fixa (ignora a velocidade do dedo), `setTimeout(160)` para trocar o conteúdo, entrada de só 16px (`css/motion.css:97-99`), cancelamento com `.2s ease-out` (linhas 81, 88). Arrastar de novo durante os 160 ms tem o transform apagado pelo `reset()` pendente.

**Comportamento desejado.**
- Cada aba é construída uma vez e mantida. Trocar de aba só alterna `.active` (esconde/mostra). Exceções: perfil é reconstruído quando o usuário mostrado muda (mesmo usuário = mantido); admin pode reconstruir sempre. [DONO no princípio, exceções decisão minha (pode mudar)]
- Atualização de aba mantida (regra de frescor): cada aba tem `render()` e uma `signature()` barata dos dados que mostra, no padrão que o feed já usa (`feedSignature()` e o redesenho com `flip()`, `js/app.js:145-170`). Ao voltar para uma aba, se a última conferência tem mais de 30 s, pede dados novos. "Pedir dados novos" = o `pullNow()` global que já existe; dentro de `refreshFromServer()` entra uma checagem da `signature()` da aba ativa. Não criar camada de fetch por aba. O `pullNow()` que o feed faz em toda entrada (`js/app.js:532`) passa para a mesma regra dos 30 s. [decisão minha (pode mudar)] Quando os dados chegam, se a assinatura mudou, re-renderiza dentro de `flip()` e mantém a rolagem ancorada no primeiro item visível. Sem mudança, não toca no DOM. Contadores (curtidas etc.) continuam atualizando no lugar como hoje. O feed é caso especial: posts novos vão para a pílula (item 4). [decisão minha (pode mudar)] Diff item a item é aceitável se o construtor achar necessário, mas comece pelo padrão existente.
- Primeira visita a uma aba: o que está abaixo da dobra é montado em `requestIdleCallback` (fallback `setTimeout(0)`), para o primeiro quadro caber no orçamento. [decisão minha (pode mudar)]
- Ao entrar, o painel faz enter curto: opacity 0→1 e translateY 8px→0 com `SPRINGS.smooth` via WAAPI (interrompível; trocar de aba no meio cancela e segue). Sem saída animada (a aba velha some na hora; a nova é que entra). Remover o `animation: none` e os duplicados de `css/social.css`. [decisão minha (pode mudar)]
- Swipe "Para você/Seguindo": soltar o dedo vira spring que começa na velocidade de soltura (WAAPI com `SPRINGS.smooth`, partindo do transform atual); o painel novo entra do lado oposto com o mesmo deslocamento, sem emenda visível; sem `setTimeout`: a troca de conteúdo acontece no início da animação de entrada; um `pointerdown` novo durante a animação lê o transform atual, cancela a animação e o dedo continua dali. Cancelamento também é spring. `tools/swipeTabs.test.mjs` precisa continuar passando (ajustar se testar o timeout).

**Aceite.** Visitar todas as abas uma vez; depois alternar Feed↔Playlists↔Desafios 10 vezes a 375px com CPU 4×: nenhum quadro > 50 ms nas voltas. Swipe: arrastar, soltar e arrastar de novo antes de assentar: o painel segue o dedo sem salto.

## 3. Voltar para a aba exatamente onde estava [DONO]

**Problema.** `js/app.js:475-476` faz `window.scrollTo({ top: 0 })` em toda troca de aba. Feed → perfil → feed = topo do feed.

**Comportamento desejado.** Antes de trocar, guardar `scrollY` por chave de tela (`feed`, `search`, `playlists`, `chat`, `desafios`, `comparar`, `profile:<uid>`, `admin`); depois de mostrar a aba nova, restaurar o valor guardado (ou 0 se nunca visitada / perfil de outro usuário). Restaurar no mesmo quadro em que a aba aparece, antes do enter do item 2, para não haver pulo visível. Voltar pelo botão do Android ou `popstate` (`js/app.js:447+`) usa a mesma memória. `history.scrollRestoration = 'manual'` para o navegador não brigar. Tocar de novo no ícone da aba em que já se está continua levando ao topo (comportamento comum de app social), animado com spring se não houver movimento reduzido. [decisão minha (pode mudar)]
Se a altura da aba mudou enquanto estava escondida (item 2 re-renderizou), ancorar no primeiro post/item visível em vez do número cru.

**Aceite.** Em cada aba, rolar até o meio, ir a outra aba, voltar (pelo menu e pelo voltar do Android): posição igual com erro ≤ 1px. Perfil A rolado → perfil B → voltar: A no mesmo ponto, B começou no topo.

## 4. Pílula "novos posts" [DONO]

**Problema.** Não há posts em tempo real: o feed é puxado por `pullNow()` (`js/sync.js:563`) a cada 45 s (`POLL_MS`, `js/sync.js:7,1141`), ao voltar o app para frente (`js/sync.js:1107`), ao entrar no feed (`js/app.js:532`) e 1,2 s depois de cada escrita (`js/sync.js:988`). O Realtime do Supabase só é usado no chat aberto (`js/sync.js:313-326`). Quando chega post novo, `refreshFromServer()` (`js/app.js:145-163`) redesenha o feed com `flip()` e insere os posts no topo: tudo abaixo se mexe sem a pessoa pedir.

**Comportamento desejado.**
- Detecção: continuar com o polling existente, sem canal Realtime novo (45 s é aceitável para uma rede pequena e não custa conexão extra no celular). [decisão minha (pode mudar)]
- Ao chegar dados, separar: posts que já estão na tela (atualizam no lugar, como hoje: contadores, votos, texto editado) e posts novos (ids que não estão na tela e mais novos que o primeiro mostrado). Os novos ficam num buffer e não entram no DOM; a assinatura do feed passa a considerar só o que está na tela, para o buffer não disparar redesenho.
- Uma pílula aparece fixa no topo da área do feed (abaixo do cabeçalho, nos dois skins): "N novos posts", com até 3 avatares dos autores. Entra com spring (opacity + translateY de -8px, `SPRINGS.snappy`); não ocupa espaço no fluxo (posicionada sobre o conteúdo), para não empurrar nada. Ao tocar: rola até o topo com spring, insere o buffer com `flip()` e stagger (item 8), pílula sai. Se a pessoa já está no topo, a pílula aparece mesmo assim; nada entra sem toque. [DONO]
- Post da própria pessoa entra na hora (ação dela) e leva junto o buffer (ver acima). Posts apagados por outros enquanto estão na tela: ficam até o próximo toque na pílula ou a próxima recarga; não somem sob o dedo. [decisão minha (pode mudar)]
- O buffer é um **filtro** respeitado por todo caminho que desenha o feed, não uma guarda só em `refreshFromServer()`. Ex.: um corte (timestamp ou conjunto de ids excluídos) aplicado onde `renderFeed()` usa `getFeedPosts()`, para que `renderFeed()` chamado de qualquer lugar (publicar `js/app.js:1155`, `refreshPostsView` `js/app.js:866`, `setFeedFilter` `js/app.js:611`, `renderFeedTab` `js/app.js:588`) nunca puxe post do buffer. O buffer é esvaziado (corte removido, tudo entra) só por: tocar na pílula, trocar "Para você/Seguindo" e publicar o próprio post (a pessoa vai para o topo e vê tudo, como no Twitter). [decisão minha (pode mudar)]
- Em "Seguindo": tudo que apareceria **acima** do primeiro item visível da pessoa enquanto ela estava longe (posts novos **e** reposts de quem ela segue) vai para a pílula. Itens que cairiam abaixo da área visível podem entrar em silêncio só se não causarem nenhum deslocamento acima da dobra; se causarem, também vão para o buffer. Isso exige a lista em ordem do mais novo para o mais antigo: hoje `getFeedPosts()` (`js/storage.js:643-674`) **não ordena**, devolve a ordem guardada, e `reposts` é só uma lista de ids, sem horário do repost. O construtor ordena por `created` (ou horário do repost, se passar a existir; senão usa o `created` do post) antes de aplicar o corte. [decisão minha (pode mudar)]
- Trocar entre "Para você/Seguindo" esvazia o buffer daquele filtro (é uma ação da pessoa).
- Botão voltar do Android não precisa conhecer a pílula (não é overlay).

**Aceite.** Com o feed rolado no meio, criar um post por outra conta e forçar `pullNow()`: nenhum pixel do feed se move (CLS 0 nesse intervalo); a pílula aparece; tocar leva ao topo e mostra o post. Curtida de outra conta num post visível ainda atualiza o contador no lugar.

## 5. Animações interrompíveis [DONO]

**Problema.** `toggleCollapse` (`js/motion.js:104-128`) cancela a animação em curso (o elemento salta para o tamanho final) e recomeça de `scrollHeight`/`offsetHeight` cheio; usa 200/160 ms com cubic-bezier fixo, não spring. Em `js/feed.js:1140`, "está fechado?" é lido de `style.display`, que continua `'flex'` durante a animação de fechar: o segundo toque fecha de novo em vez de reabrir. Também: enter de painel é keyframe CSS reiniciado via reflow forçado (`js/tabs.js:84-88`), toques rápidos em filtros recomeçam do zero.

**Comportamento desejado.** `toggleCollapse` lê `getComputedStyle(el).height` antes de cancelar e anima dessa altura até o alvo, com `SPRINGS.smooth`. O estado aberto/fechado vive num atributo (`data-open`) atualizado no início do toggle, e `js/feed.js` decide por ele. Toque duplo rápido = abre e fecha suavemente a partir de onde estava. Corrigir todos os chamadores de `toggleCollapse` (procurar com grep), não só o de comentários. Painéis de `js/tabs.js` passam para WAAPI que parte do estado atual.
Regra geral para o resto do projeto: nada de `setTimeout` para "esperar a animação acabar" antes de aceitar input.

**Aceite.** Abrir comentários e tocar de novo a 50%: fecha a partir dos 50%, sem salto. Toque duplo durante o fechamento: reabre. Teste unitário para a decisão de estado (aberto/fechado por `data-open`).

## 6. Menus, popovers e modais nascem do gatilho [DONO]

**Problema.** Menu de opções do post alterna `display` sem animação (`js/app.js:895-1000`, `css/feed.css:426`); `.modal-box` só faz fade (`css/main.css:470-486`); `app-dialog` cresce do centro com `.2s` cubic-bezier (`css/photo-editor.css:71-76`); painel de notificações entra pela esquerda sem relação com o sino (`css/components.css:27-33`). O que já está certo (não mexer): barra de ações do chat (`css/chat.css:655-656`), balões por lado (`css/chat.css:138-139`), bottom sheets (`css/mobile.css:96-102`), player (`css/motion.css:126-137`).

**Comportamento desejado.** Ao abrir, calcular o `transform-origin` a partir do retângulo do gatilho em relação à caixa (helper pequeno em `js/motion.js`). Entrada: scale .96→1 + opacity com `SPRINGS.snappy`; saída mais rápida, para o mesmo ponto. Transições CSS (já interrompíveis), não keyframes. Vale para **todo** dropdown/popover que o botão voltar fecha, não só o menu do post: todos passam a ter estado `data-open` em vez de `style.display`. `js/backButton.js` (detecção hoje em `:21`) trata `data-open="false"` como fechado mesmo enquanto a animação de saída roda, para o próximo voltar navegar; `tools/backButton.test.mjs` atualizado para isso (aberto → voltar fecha; fechando → voltar navega). [decisão minha (pode mudar)] Modais abertos sem gatilho (ex.: atualização forçada) crescem do centro.

**Aceite.** Abrir o menu de um post à direita: cresce do canto do botão "⋯". Voltar do Android com menu aberto: fecha o menu e não navega. Igual nos dois skins.

## 7. Elemento compartilhado: capa → post, avatar → perfil [DONO]

**Problema.** Nenhum `startViewTransition`/`view-transition-name` no projeto. Abrir post = diálogo centrado (`scale(.97)`); avatar → perfil = troca seca de aba; capa → playlist = re-render.

**Comportamento desejado.** Envolver abrir post (`window._openPostView`), abrir perfil (`window._goToProfile`, `js/app.js:802`) e abrir playlist em `document.startViewTransition`. No toque, dar `view-transition-name` só ao elemento tocado (capa ou avatar) e ao destino correspondente; remover os nomes ao terminar (nomes duplicados abortam a transição). Curva: `::view-transition-group(*)` com `var(--spring-smooth)` e duração `var(--spring-smooth-dur)`, teto de 300 ms. O resto da tela faz só crossfade. Elemento compartilhado só quando o destino está disponível de forma síncrona (post no store local; perfil renderizável do cache). Senão, fade curto simples; nunca esperar a rede dentro da transição. Mesma regra para avatar → perfil. [decisão minha (pode mudar)] Fallback: sem API, ou com movimento reduzido, troca instantânea. Um toque durante a transição chama `skipTransition()` para não segurar input. Voltar (botão/gesto) faz o caminho inverso quando o elemento de origem ainda existe e está visível; senão, só fade. Conferir que os elementos nomeados existem nos dois skins (o yt2016 pode esconder/reorganizar). [decisão minha (pode mudar) nos detalhes]

**Aceite.** Num Chrome/WebView ≥ 111, tocar na capa de um post: a capa voa até o lugar dela no post aberto; voltar a devolve. Num navegador sem a API: abre na hora, sem erro no console.

## 8. Stagger nas listas [DONO]

**Problema.** Só o ranking entra em sequência (`js/rankingUi.js:305-306`, `js/rankingCard.js:133-135`). Feed, busca, grade de playlists, contatos do chat e notificações aparecem de uma vez.

**Comportamento desejado.** Extrair o padrão do ranking para `js/motion.js` (opacity + translateY 8px, 40 ms por item, teto de 8 itens, `fill: 'backwards'`, `SPRINGS.smooth`) e usar no primeiro desenho dessas listas e na entrada dos posts da pílula. Nunca ao voltar a uma aba mantida, nunca em atualização no lugar, nunca em itens fora da tela. Conteúdo nunca espera o stagger para ser clicável.

**Aceite.** Primeira abertura de cada lista: itens visíveis entram em sequência em ≤ ~400 ms; voltar à aba: nada anima.

## 9. Falha de curtir/seguir/votar desfaz de forma visível [DONO]

**Problema (corrigido em relação ao briefing).** `toRemote` (`js/storage.js:212`) só engole erros síncronos. Falhas de rede caem em `write()` (`js/sync.js:961-967`), que mostra toast e chama `pullNow()`: o estado volta, mas por recarga, depois de uma ida ao servidor, sem animação e desligado do toast. Seguir mostra "Seguindo!" antes da confirmação, então uma falha gera dois toasts. Curtir comentário e votar em enquete não passam por `tracked()` (`js/sync.js:1010,1068`): toques rápidos podem deixar o servidor no estado errado.

**Comportamento desejado.** Quem faz a ação otimista registra o inverso. Em falha, o inverso roda na hora, pela mesma animação (rollNumber descendo, ícone voltando, botão de seguir voltando), com um único toast que substitui o otimista em vez de empilhar. O `pullNow()` continua depois, como rede de segurança. Curtir comentário e votar passam a usar `tracked()`. Teste em `tools/sync.test.mjs`: falha simulada reverte o estado local e chama o inverso uma vez. [decisão minha (pode mudar) no mecanismo]

**Aceite.** Com rede cortada (DevTools offline com conta logada): curtir → coração acende → apaga com animação em ≤ 1 s após o erro, um toast só. Igual para seguir e votar.

## 10. Movimento reduzido em todo lugar [DONO]

**Problema.** `animateSpring` diz "no-op under reduced motion" mas não checa (`js/motion.js:57-62`), então quem chama precisa lembrar. Sem proteção: crossfade de capa/título do player (`js/ui.js:1326-1329`), slide do toast (`css/main.css:555-561`), slide do painel de notificações (`css/components.css:27-33`).

**Comportamento desejado.** `animateSpring` devolve `null` com movimento reduzido (ou só opacity quando chamado com uma opção explícita de fade); conferir que nenhum chamador quebra com `null` (`.onfinish` em null, etc.). Overrides CSS para toast e notificações. Tudo novo deste projeto (pílula, popovers, View Transitions, stagger, enter de aba, swipe) checa `reducedMotion()`: troca instantânea, sem transformação. Rolagem de "voltar ao topo" vira instantânea.

**Aceite.** Com `prefers-reduced-motion: reduce` emulado, percorrer todos os itens 1-9: nenhum movimento de transform; mudanças de opacidade só onde forem a única pista de estado.

---

## Metas mensuráveis [decisão minha (pode mudar)]

Como medir: Chrome DevTools, viewport 375px, CPU 4× mais lenta, `PerformanceObserver` para `layout-shift` e `long-animation-frame` (o mesmo método da auditoria; `tools/ui-audit.mjs` pode servir de base). Rodar em cada skin.

| Meta | Valor |
|---|---|
| CLS na carga fria do feed (8 posts com link + foto) | < 0,05 (hoje 0,142) |
| CLS enquanto chega post novo com o feed rolado | 0 |
| Maior quadro ao voltar para uma aba já visitada | ≤ 50 ms (hoje 51-52 ms em CPU 1×) |
| Maior quadro na primeira visita a Playlists/Desafios | ≤ 100 ms a 4× (alvo de esforço; reportar o número se não bater) |
| Rolagem restaurada ao voltar à aba | erro ≤ 1px |
| Toque durante qualquer animação deste projeto | atendido no quadro seguinte (nenhum lock) |

A meta de 50 ms para "troca de aba" vale para voltas; a primeira montagem de uma aba pesada a 4× dificilmente cabe em 50 ms sem virtualização, que está fora do escopo.

## O que fica para o construtor

- Ordem sugerida (cada um entregável sozinho): 10 → 5 → 1 → 3 → 2 → 4 → 9 → 6 → 8 → 7. Os primeiros são pequenos e destravam o resto; 2/3/4 mexem no mesmo trecho de `js/app.js` e devem ser feitos juntos ou em sequência imediata.
- Descobrir como cada aba re-renderiza hoje e quais têm estado interno (busca e playlists ouvem `screenrestore`, `js/app.js:456`) antes de mantê-las vivas.
- Largura/altura de mídia do chat: no envio, dentro do `body` jsonb da mensagem (`supabase/007_messages.sql`), sem migração; antigas sem dimensão = caixa padrão + re-prender no fim no `load`. Decidir se a prévia de link guarda "tem imagem". [decisão minha (pode mudar)]
- Buffer de posts novos como filtro dentro do caminho de `renderFeed()`/`getFeedPosts()`, valendo para todos os chamadores (`js/app.js:588,611,866,1155`); esvazia ao tocar na pílula, trocar filtro ou publicar. Ordenar o feed do mais novo para o mais antigo antes do corte (`getFeedPosts()` não ordena hoje). Em "Seguindo", reposts acima do primeiro item visível também vão para a pílula. [decisão minha (pode mudar)]
- Frescor das abas: `pullNow()` global + checagem de `signature()` da aba ativa em `refreshFromServer()`; mover o `pullNow()` de `js/app.js:532` para a regra dos 30 s. Sem fetch por aba. [decisão minha (pode mudar)]
- Elemento compartilhado só com destino síncrono (store/cache); senão fade curto, nunca esperar rede na transição. [decisão minha (pode mudar)]
- Item 6: todos os dropdowns/popovers que o voltar fecha passam a `data-open`; `js/backButton.js` trata `data-open="false"` como fechado mesmo durante a saída; atualizar `tools/backButton.test.mjs`. [decisão minha (pode mudar)]
- Conferir no aparelho Android real (WebView do sistema) View Transitions e o swipe; o emulador com WebView nova esconde o fallback.
- Rodar `node --test tools/` e checar com cópia `.mjs` os módulos alterados.
- Não commitar sem pedido do dono.
