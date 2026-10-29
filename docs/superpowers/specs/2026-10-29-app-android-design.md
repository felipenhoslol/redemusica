# App Android da "rede de música sem nome"

Data: 2026-10-29 · Status: rascunho para aprovação

## Intenção

O dono quer que a rede de música vire um app Android (APK) e que o site anuncie o APK quando lançar. O motivo é a sensação de uso no celular: hoje "certas animações não funcionam direito e não dá vontade de usar com o celular". O dono também quer notificações de verdade, com o app fechado.

Ser um app não deixa nada mais fluido por si só. O app vai rodar o mesmo código do site, então o ganho de fluidez vem de consertar o toque e as animações no código. Esse conserto melhora o site também.

## Três partes, nesta ordem

As partes podem ser planejadas e entregues separadas. A ordem conta: o app nasce com o toque já consertado.

1. Toque e animações no celular (site e app)
2. App Android + anúncio no site
3. Notificações com o app fechado

## Contexto do projeto (o que já existe)

- Vanilla JS + CSS, sem framework. `package.json` só tem `gsap` e nenhum script.
- Deploy: GitHub Pages via `.github/workflows/pages.yml`, que copia `index.html 404.html assets css js` para `_site` e roda `tools/optimize-build.mjs` e `tools/stamp-version.mjs`. Também há um `vercel.json`. O sitemap aponta para `redemusicasemnome.vercel.app`.
- Backend: Supabase (`js/supabase.js`, `js/config.js`), com SQL em `supabase/001`–`014`. Não há código de servidor nem functions.
- Tempo real: só um canal broadcast no chat aberto (`js/sync.js:315`). O resto é polling: feed a cada 45 s e mensagens a cada 8 s.
- As notificações de hoje são montadas no próprio aparelho, a partir dos posts e mensagens (`buildNotifications` e `buildMessageNotifications` em `js/sync.js`), e ficam guardadas em localStorage. Não há tabela de notificações em uso.
- Não existe service worker, manifest, Web Push, Firebase nem Capacitor.
- Auth: Supabase email/senha. O id do usuário é `auth.uid()`, igual a `profiles.id`.
- Movimento: `js/motion.js` simula molas e gera easings CSS `linear()`, usados em transitions e no WAAPI. As diretrizes de movimento ficam no `CLAUDE.md` (molas, feedback em toda ação, sem pulos de layout).
- Menu "Você" no celular: `me-sheet` em `js/app.js` (~linha 350), com Playlists, Desafios, Admin, Exibição, Conta e senha, Enviar feedback e Sair.

## Parte 1 — Toque e animações

**Objetivo:** usar pelo celular dá vontade, sem nada preso, pulando ou engasgando.

Problemas encontrados na auditoria (consertar todos):

1. **Hover preso depois do toque.** Há cerca de 169 regras `:hover` e quase nenhuma está protegida. Colocar os hovers de transform e sombra dentro de `@media (hover:hover) and (pointer:fine)`. Exemplos: `css/profile.css:1033`, `css/components.css:144,161,1097`, `css/social.css:466`, `css/feed.css:187`, `css/chat.css:220,239`, `css/main.css:421`, `css/auth.css:142`.
2. **Vinil do perfil pula e fica para fora.** Ele anima `left` com overshoot no `:hover` (`css/profile.css:467,470`, `css/mobile.css:227`). Trocar por `transform: translateX()` e, no toque, ativar só pelo estado `.playing`.
3. **O swipe do feed briga com os carrosséis.** Em `js/swipeTabs.js:21-40`, o pointerdown precisa ignorar alvos dentro de um scroller horizontal (reaproveitar `horizontalScroller` de `dragScroll.js`).
4. **A barra de progresso muda `height` e `width`** (`css/components.css:190,193,201,260`). Trocar por `scaleY` e `scaleX`.
5. **`transition: all`** aparece cerca de 30 vezes (`css/playlists.css`, `profile.css`, `chat.css`, `feed.css`…). Listar só as propriedades que mudam de verdade.
6. **Engasgo na rolagem.** `np-glow` anima box-shadow sem parar (`css/profile.css:1080`), `eq-bounce` anima `height` (`:1067`) e há `backdrop-filter: blur(16px)` na barra de baixo do celular (`css/mobile.css:57`) e em `components.css:90`, `chat.css:507` e `playlists.css:347`. Fazer o brilho com opacity num pseudo-elemento, o eq com `scaleY`, e reduzir ou remover o blur no celular.
7. **Flash ao tocar.** Colocar `-webkit-tap-highlight-color: transparent` global em `button, a, [role=button]`. Os estados `:active` já existem.
8. **Alvos pequenos e hover feito em JS.** O apagar comentário (`js/feed.js:185`) e as estrelas (`js/ui.js:922`) precisam de área de toque de 40px ou mais e `:active` em CSS, sem `onmouseover`.

Extra: a lista de press-scale `:active` em `css/motion.css:25` não cobre cards nem linhas de lista. Incluir.

**Não-objetivos:** redesenhar telas, trocar o sistema de molas, adicionar biblioteca de animação.
**Anti-objetivo:** consertar o celular e quebrar o hover no computador. O desktop tem que continuar igual.

## Parte 2 — App Android + anúncio

### O app

- **Ferramenta:** Capacitor, que embrulha o site existente num APK sem reescrever nada. *(escolha do Claude)*
- **Os arquivos vão dentro do APK** e o app não abre o site online. *(decisão do dono)* Cada versão nova do site precisa de um APK novo. O app ainda precisa de internet para dados (Supabase, busca, Last.fm, áudio). "Offline" quer dizer só que a interface abre sem carregar o site.
- **Nome do app:** "rede de música sem nome". *(decisão do dono)* O ícone vem do gato/logo atual.
- **Só Android.** Sem iPhone e sem Play Store. *(decisão do dono)*
- **Distribuição:** o APK é baixado pelo próprio site.

### O anúncio no site (só para quem está no Android)

O fluxo foi aprovado nos esboços com o dono:

1. **Janela que sobe na primeira visita** depois do lançamento, no formato de bottom sheet como o `me-sheet`. Título "rede de música sem nome agora é app", uma linha curta, o botão "Baixar APK" e o link "Agora não". Depois de fechar ou baixar, ela não aparece mais.
2. **Item fixo "Baixar app"** no menu "Você" (`me-sheet`), entre Exibição e Conta e senha, com uma etiqueta "NOVO" nos primeiros dias. *(a etiqueta é ideia do Claude)*
3. **Página de download:** título "rede de música sem nome pra Android", o botão "Baixar APK · vX · N MB" e três passos de instalação (baixar, permitir "fontes desconhecidas", abrir e instalar).

Regras:
- **Só aparece no Android.** No iPhone e no computador, a janela e o item ficam escondidos.
- **Dentro do próprio app** (Capacitor), a janela e o item também somem.
- Seguir a direção visual do projeto: sem emoji na interface, ícones stroke-2, fonte M PLUS Rounded 1c e movimento com mola.

## Parte 3 — Notificações com o app fechado

**Tipos (decisão do dono, só estes dois):**
- **"Fulano postou":** quando alguém que você **segue** publica. *(seguidos é escolha do Claude, para evitar spam)*
- **"Fulano mandou mensagem":** mensagens seguidas da mesma pessoa se juntam num aviso só. *(agrupar é escolha do Claude)*

**Comportamento:**
- Chega com o app fechado e com o celular bloqueado.
- Tocar no aviso abre o post ou a conversa dentro do app.
- Na primeira abertura, o app pede permissão. Quem recusar continua com o sininho interno, como hoje.
- Em Exibição ou Conta, um botão liga e desliga cada tipo. *(escolha do Claude)*
- Só vale para o app Android. Web Push no navegador fica de fora por agora.

**Como (escolha do Claude):** Firebase Cloud Messaging com o plugin de push do Capacitor. Uma tabela nova no Supabase guarda os tokens de cada aparelho, ligados a `auth.uid()`, com RLS. Quando entra um post ou uma mensagem, um trigger ou webhook do banco chama uma Supabase Edge Function, que descobre quem deve receber e manda pelo FCM. As chaves do Firebase ficam nos segredos da Edge Function e nunca vão para o cliente.

**Anti-objetivos:** mandar aviso para o próprio autor, mandar aviso repetido do mesmo evento, e quebrar o sininho interno que já existe.

## Restrições

- Sem framework novo. O site continua vanilla JS.
- O desktop não pode piorar.
- Nada de chave secreta (Firebase server key, service role do Supabase) no código do cliente.
- O `CLAUDE.md` do projeto pede que o trabalho seja feito por subagentes, com modelos distribuídos (Fable 5.1 para arquitetura e revisão, Opus 5.5 para edições).

## Decisões depois da revisão

- **Build e assinatura no GitHub Actions** *(o dono pediu "o mais prático e o recomendado")*: um job no `pages.yml` (ou num workflow próprio) gera o APK assinado a cada deploy e o publica junto com o site, ou como Release. O keystore fica como secret do repositório. O dono precisa guardar uma cópia do keystore fora do GitHub, porque perder a chave obriga todo mundo a reinstalar. O plano deve incluir esse passo para o dono.
- **Aviso de versão nova no app** *(escolha do Claude)*: o app lê o `app-version.json` do site ao abrir. Se existir versão mais nova, mostra um aviso que leva para a página de download. Pode haver uma "versão mínima" para forçar a atualização quando o banco mudar.
- **Firebase e Supabase com passo a passo para o dono** *(escolha do Claude, o mais prático)*: o dono cria o projeto no Firebase e faz as configurações no painel do Supabase (segredos da Edge Function, webhook/trigger). Quem constrói entrega um checklist curto, com prints ou textos exatos, mais os arquivos SQL e da function prontos. A function pode ser feita pelo painel, se o Supabase CLI não estiver disponível. O SQL segue o padrão atual: arquivos numerados em `supabase/` que o dono cola no SQL Editor.
- **Emails de cadastro e senha** *(escolha do Claude)*: na v1, o link abre no navegador. Abrir direto no app (App Links) fica para depois.
- **Domínio principal** *(escolha do Claude)*: `redemusicasemnome.vercel.app`, como já está no sitemap. Quem constrói deve confirmar qual deploy (Vercel ou Pages) serve esse domínio antes de decidir onde o APK fica hospedado.
- **Conferir o banco real:** nomes de colunas como `from_id` e `from_user_id` podem variar entre `schema.sql` e as migrations. Usar as migrations `001`–`014` como fonte.

## Fica a critério de quem constrói

- A estrutura do projeto Capacitor (pasta `android/`, como copiar os arquivos do site, comando de build).
- Onde hospedar o arquivo APK e como o site descobre a versão e o tamanho atuais (por exemplo, um `app-version.json` gerado no build).
- O texto exato das telas, dentro do tom acima.
- Os detalhes de cada conserto da Parte 1, desde que siga a lista.
- A forma de agrupar as mensagens e de evitar avisos duplicados.
