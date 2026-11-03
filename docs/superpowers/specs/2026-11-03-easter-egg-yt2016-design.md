# Easter egg "YouTube 2016" — design

Data: 2026-11-03 · Status: aprovado pelo dono, pronto para planejar

Legenda: **[DONO]** = decisão do dono do produto, não muda sem falar com ele. **[decisão minha (pode mudar)]** = escolha do orquestrador; o construtor pode trocar se tiver motivo, e deve dizer qual foi.

## Intenção e porquê

Um segredo para quem fuça. Clicar 16 vezes no gato do logo transforma o app inteiro no visual do YouTube de 2016. É um presente de nostalgia, não uma feature anunciada. A graça está em descobrir sem aviso e em o resultado parecer de verdade aquele YouTube, não uma imitação genérica.

## Objetivos

- Gatilho escondido: 16 cliques no gato do logo. **[DONO]**
- Cada clique toca uma animação pequena e fofa no gato, sempre a mesma, sem pista de que algo vai acontecer. **[DONO]**
- No 16º clique, animação diferente: o gato vira retrô; o site recarrega e volta no visual YouTube 2016, no app inteiro. **[DONO]**
- Depois da descoberta, aparece nas configurações uma opção para trocar o visual do site e o visual do gato, separadamente. Só existe para quem descobriu. É o caminho de volta ao normal e de volta ao 2016. **[DONO]**
- A skin 2016 tem modo claro e escuro. **[DONO]**
- Fiel ao YouTube real de 2016, "sem cara de vibecode". **[DONO]**

## Não-objetivos

- Mais de duas opções de visual (por enquanto só "Padrão" e "YouTube 2016"). **[DONO]**
- Mudar layout/estrutura de telas, rotas ou funcionalidades. A skin é só CSS + arte do gato.
- Replicar páginas do YouTube que o app não tem (comentários aninhados, "Em alta", etc.).
- Conquista/badge pública, contador visível, ranking de quem descobriu.
- Trocar o gato nos cards de compartilhamento (storyImage). **[decisão minha (pode mudar)]**

## Anti-objetivos (o que NÃO pode acontecer)

- Dar pista do egg: nada de contador, tooltip, vibração crescente, animação que "escala" a cada clique, log no console, texto nas configurações para quem não descobriu.
- Usar nome ou logo do YouTube em qualquer lugar (UI, textos, alt, título da aba). O gato continua sendo o logo. O nome da opção é "2016" com descrição neutra, ex.: "Visual retrô de 2016". **[decisão minha (pode mudar)]** no texto exato.
- Cara de vibecode: gradientes, pílulas, cantos muito redondos, sombras difusas grandes, roxo/neon. Em 2016 era tudo reto, plano, cinza e vermelho.
- Layout shift: trocar de skin não pode deixar elementos pulando depois da pintura (skin aplicada antes do primeiro paint). Animação dos cliques não pode mexer nada em volta do gato.
- Quebrar os temas atuais: com skin "Padrão", nada muda em relação a hoje (mesmos tokens, mesmas cores de destaque).
- Regressão de acessibilidade: contraste AA (4,5:1 texto normal, 3:1 texto grande/ícones) nos dois modos da skin; foco visível; `prefers-reduced-motion` respeitado.
- Quebrar a navegação: clicar no gato continua indo para o feed.

## Restrições

- Vanilla JS, sem build. Sem Framer Motion: usar `js/motion.js` (`animateSpring`, `SPRINGS`, `reducedMotion`). Molas, nada de easing linear (CLAUDE.md do projeto).
- App Android (Capacitor) usa o mesmo código: `location.reload()` precisa funcionar lá; respeitar safe areas já existentes no `css/mobile.css`.
- CSP em `index.html:8`: `style-src` já permite `fonts.googleapis.com` e `font-src` permite `fonts.gstatic.com`. Roboto pelo Google Fonts cabe sem mexer na CSP.
- Modo deslogado/local existe (`js/auth.js`): o egg tem que funcionar sem conta.
- Arquivos CSS grandes (`feed.css`, `chat.css`, `profile.css`, `mobile.css`, `ranking.css`, `auth.css`): não editar para a skin; sobrescrever num arquivo próprio.

## Comportamento

### Gatilho
- Alvos: o gato do sidebar desktop (`js/app.js:184`, `<a class="sidebar-logo">`) e o do header mobile (`js/app.js:281`, `.mobile-brand`). Outros gatos (auth, feedback, ranking, preview de configurações) não contam. **[decisão minha (pode mudar)]**
- 16 cliques; o contador zera após ~2 s sem clique. **[DONO]** (zerar após pausa) / **[decisão minha (pode mudar)]** (os 2 s).
- Cada clique continua chamando `switchTab('feed')` normalmente. **[decisão minha (pode mudar)]**
- Repetir os 16 cliques (já descobriu, em qualquer skin) sempre roda a sequência completa, como da primeira vez: define `skin=yt2016` **e** `cat=retro`, sobrescrevendo a escolha de gato feita nas configurações, e recarrega. **[decisão minha (pode mudar)]**
- O contador de cliques (e o timer de 2 s e a trava da sequência) vive no estado do módulo (`js/easterEgg.js`), não no DOM: `renderSidebar`/`renderMobileNav` recriam o elemento do gato, então qualquer contador guardado no elemento (dataset, propriedade) se perderia. **[decisão minha (pode mudar)]**

### Animações
- Por clique (1º–15º): squash/bounce curto no gato, ex.: `scaleY .9 / scaleX 1.06 → 1` com `animateSpring(el, kf, 'pop')`. Sempre igual, sem crescer. Sem som. Só `transform`, sem afetar layout. Hoje só há hover wiggle (`css/social.css:53-123`), sem `:active`. **[decisão minha (pode mudar)]**
- 16º clique (~600–900 ms): tremidinha → flicker/dessaturação (`filter: grayscale + contrast`, 2–3 frames tipo TV velha) → troca da arte para o gato retrô → pausa curta → `location.reload()`. Só `transform`/`filter`/`opacity`. **[decisão minha (pode mudar)]**
- Bloquear cliques durante a sequência para não disparar duas vezes.
- `reducedMotion()`: sem movimento; troca direto a arte, espera ~300 ms, recarrega.

### Recarga
Antes do reload, gravar as preferências (skin, gato, descoberta) junto com o id da identidade atual (veja "Visual acompanha a conta"). O script inline do `<head>` (`index.html:60-69`) lê `rmsn_display_v1` e aplica `data-skin` antes da pintura, então não há flash do visual antigo — mas só se a escolha salva pertencer a quem está logado e essa identidade tiver descoberto o egg.

### Visual acompanha a conta — **[DONO]**
- Quem está ativo (conta logada, ou a identidade do modo local) e **não** descobriu o egg vê sempre a skin padrão e o gato padrão, mesmo num aparelho onde outra pessoa ativou o 2016.
- A tela de login/auth (ninguém conhecido ainda) sempre renderiza a skin padrão.
- "Descobriu" = espelho local **daquele id de usuário** OU flag `easterEgg2016` do servidor. Lógica OR: qualquer uma das fontes verdadeira basta, e nada "desdescobre".
- Implicação para o head script: ele só aplica `data-skin="yt2016"` / `data-cat="retro"` quando sabe que a identidade atual descobriu. Guardar a escolha visual chaveada pelo id do usuário (ou junto com ele) localmente e, antes da pintura, aplicar só se o id salvo bater com o último usuário logado e esse usuário tiver o flag no espelho local. Sem sessão conhecida → padrão. **[decisão minha (pode mudar)]** no formato exato do armazenamento.
- No logout / troca de conta: voltar para o padrão na hora (remover `data-skin`/`data-cat`).
- Depois do login, assim que o flag for conhecido (espelho local ou servidor), aplicar a escolha salva daquele usuário. Se só o servidor confirmar (aparelho novo), atualizar o espelho local para o próximo carregamento já sair certo.

### Configurações
- Em `openDisplaySettings()` (`js/display.js`), nova seção "Visual" renderizada só se a identidade ativa descobriu (espelho local daquele id OU flag do servidor). Outra conta no mesmo aparelho não vê a seção. **[decisão minha (pode mudar)]** / **[DONO]** (visual acompanha a conta)
- Dois controles independentes **[DONO]**: "Visual do site" (Padrão / 2016) e "Visual do gato" (Fofo / Retrô). Mesmo componente de opção usado hoje para tema.
- Trocar o visual do site recarrega a página (mais simples e igual ao egg). Trocar o gato pode ser ao vivo (re-render dos gatos via `catLogoHtml`) ou recarregar — construtor decide. **[decisão minha (pode mudar)]**
- Na skin 2016 o seletor de cor de destaque fica escondido; o destaque é o vermelho. O tema Escuro/Claro/Automático continua valendo e escolhe a variante da skin. **[decisão minha (pode mudar)]**
- Entrar no 2016 pelo egg define `skin=yt2016` e `cat=retro`. **[DONO]** (gato retrô no 2016) — depois o usuário pode combinar como quiser.

### Persistência
- Descoberta por conta, segue entre aparelhos e no app Android. **[DONO]**
  - Chave `easterEgg2016` em `PROFILE_EXTRA_KEYS` (`js/storage.js:262`), gravada via `updateUser` (`storage.js:368`) e enviada por `sync.js:871-883`. **[decisão minha (pode mudar)]**
  - Atenção: `cleanExtra` (`storage.js:277`) descarta booleanos hoje (só `spotifyConnected` tem tratamento). Precisa de um ramo novo: `easterEgg2016 → Boolean(value)`.
  - A descoberta nunca se perde: `easterEgg2016` é mesclado com OR. Uma vez `true` numa conta, toda escrita de extras mantém `true` — ao montar os extras para enviar em `sync.js` e ao mesclar perfis remotos com os locais (`true` se qualquer um dos lados for `true`). Nenhum caminho grava `false` por cima. **[decisão minha (pode mudar)]**
  - `profiles.extras` é público. Expõe que a pessoa achou o egg — aceitável (não é dado sensível), mas o construtor deve confirmar que nenhuma tela mostra isso.
- Espelho local em localStorage para modo deslogado/local e para o head script saber sem esperar a rede, **chaveado pelo id do usuário** (ou da identidade local). **[decisão minha (pode mudar)]**
- Escolhas visuais `skin: 'padrao'|'yt2016'` e `cat: 'kawaii'|'retro'` ficam em `rmsn_display_v1`, por aparelho, como o tema hoje, mas guardadas junto com o id do usuário a que pertencem; só valem para esse id (veja "Visual acompanha a conta"). **[decisão minha (pode mudar)]** Consequência: num aparelho novo a pessoa vê a opção nas configurações, mas a skin começa "Padrão".
- `getDisplayPrefs` hoje valida e descarta campos desconhecidos (`display.js:23-33`); incluir `skin` e `cat` na validação e no `saveDisplay`.
- Ao logar numa conta que já descobriu, a seção aparece assim que os extras chegarem.

## Visual YT 2016 — claro

Medido no snapshot do Wayback de youtube.com em 2016-06-14 (estilos computados). Mapeamento para os tokens de `css/tokens.css`.

| Token / papel | Valor 2016 | Onde aparece no app |
|---|---|---|
| `--bg` | `#f1f1f1` | fundo da página |
| `--surface` | `#fff` | sidebar, header, cards, modais |
| `--line` | `#e8e8e8` | borda do header, divisórias |
| `--text` | `#000` (títulos) / `#333` (texto corrente, links) | |
| `--text-2` (meta) | `#767676`, 11px | autor, data, contagens |
| `--accent` | `#cc181e` | item ativo, títulos de seção, progresso |
| link/título de música | `#167ac6`, 13px, 500, lh 1.3 | títulos de faixa, nomes clicáveis |
| `--radius` | `0` (botões `2px`) | tudo; nada de pílula |
| sombra de card | `0 1px 2px rgba(0,0,0,.1)` | cards/posts |
| fonte | `Roboto, arial, sans-serif`, 13px base | app inteiro |

Componentes:
- **Sidebar → guide**: 230px, branco. Itens 13px `#222`, altura 28px, sem ícone grande. Ativo: fundo `#cc181e`, texto branco. Títulos de seção 11px, 500, caixa-alta, `#cc181e`. Gato no topo no lugar do logo.
- **Header / masthead**: branco, borda inferior 1px `#e8e8e8`. Botão hambúrguer 38px se houver. Busca: input reto, borda 1px `#ccc`, `inset 0 1px 2px #eee`; botão de busca `#f8f8f8`, 36×29, raio `0 2px 2px 0`, encostado no input.
- **Feed → prateleiras de cards** (`.yt-card`): cada post é um card branco, raio 0, sombra acima, `margin-bottom: 10px`. Títulos de seção 15px, 500, `#333`.
- **Capas**: raio 0. Duração/badges sobre capa: preto 75%, branco 11px 500, padding `0 4px`, raio 0.
- **Seguir → Inscrever-se**: fundo `#e62117`, texto `#fefefe`, 11px 500, raio 2px, altura 24px. Estado "seguindo": botão padrão cinza. (Texto do botão continua "Seguir"; só o estilo muda. **[decisão minha (pode mudar)]**)
- **Botão padrão**: `#f8f8f8`, borda 1px `#d3d3d3`, texto `#333`, raio 2px, sombra `0 1px 0 rgba(0,0,0,.05)`, altura 28px, 11px 500. Hover levemente mais escuro (`#f0f0f0`).
- **Inputs** (compor post, chat, formulários): como a busca — reto, borda `#ccc`, sombra interna.
- **Tab bar mobile / header mobile**: m.youtube.com de 2016 *talvez* tivesse barra superior vermelha — **não verificado**; conferir num snapshot do Wayback de m.youtube.com (meados de 2016) antes de usar. Sem confirmação: header branco com borda `#e8e8e8`, tab bar branca, ativo em `#cc181e`.
- **Chat**: lista à esquerda como guide (item ativo vermelho ou `#f1f1f1` — construtor escolhe pelo contraste), bolhas viram blocos retos: as minhas `#e8e8e8`, as do outro brancas com borda `#e8e8e8`. Sem bolhas arredondadas.
- **Perfil**: banner reto de ponta a ponta, avatar quadrado ou raio mínimo, nome 15–18px 500, botão vermelho de inscrever, abas tipo "Início / Vídeos" com sublinhado vermelho de 3px no ativo.
- **Player**: barra de progresso vermelha (`#cc181e`/`#e62117`) sobre cinza; controles simples, sem fundo de vidro. (Valor de memória, não medido.)
- **Modais**: branco, raio 0–2px, sombra curta, título 15px 500, botões padrão/vermelho.
- **Ícones**: manter os do app (stroke 2), cor `#767676`, ativo `#cc181e`. Sem emoji na UI.

## Visual YT 2016 — escuro

O YouTube não tinha modo escuro em 2016 (chegou em 2017). Esta paleta é **inventada** na linguagem de 2016: plana, reta, cinza neutro, vermelho como único destaque. **[decisão minha (pode mudar)]**

| Papel | Valor proposto |
|---|---|
| `--bg` | `#1a1a1a` |
| `--surface` | `#232323` |
| `--hover` | `#2e2e2e` |
| `--line` | `#383838` |
| `--text` | `#f1f1f1` / corrente `#ddd` |
| `--text-2` | `#9a9a9a` |
| `--accent` / item ativo | `#cc181e` com texto branco |
| link/título | `#4ea1e8` (o `#167ac6` não passa AA sobre `#232323`) |
| botão inscrever | `#e62117`, texto branco |
| botão padrão | `#2e2e2e`, borda `#444`, texto `#ddd` |
| input | `#1a1a1a`, borda `#444`, sombra interna `#111` |
| sombra de card | `0 1px 2px rgba(0,0,0,.5)` |

Obrigatório: medir contraste de cada par texto/fundo (AA) e ajustar os valores, não o critério. Texto vermelho sobre fundo escuro (títulos de seção) provavelmente falha — usar `#ff4e45` ou similar só nesses títulos.

## Gato retrô

- Nova variante de arte em `js/logo.js` ao lado de `CAT_ART` (mesmo `viewBox 0 0 64 64`, mesmos moods idle/playing/paused/love/happy/alert, mesmos hooks de `data-mood` em `css/social.css` para não quebrar animações). **[decisão minha (pode mudar)]**
- Menos kawaii **[DONO]**: olhos menores, sem blush, formas mais angulares, traço plano de ícone de 2016 (cores chapadas, sem gradiente).
- Fone com fio característico da época **[DONO]**: over-ear, arco por cima da cabeça, cabo saindo de um lado e descendo para fora do quadro.
- `catLogoHtml` escolhe a arte pela preferência `cat` (ou um atributo `data-cat` no `<html>`, aplicado pelo head script). Funciona em qualquer skin.
- Share cards (`js/storyImage.js:74-79`) continuam com o gato padrão. **[decisão minha (pode mudar)]**
- Preview nas configurações (`display.js:92`) mostra o gato escolhido.

## Forma da implementação — **[decisão minha (pode mudar)]**

- `html[data-skin="yt2016"]` aplicado pelo head script (`index.html:60-69`) junto com `data-theme`, só quando a escolha salva é do último usuário logado e ele tem o flag no espelho local; senão, padrão.
- Um arquivo novo `css/skin-yt2016.css`, carregado por último (depois de `app-promo.css`), tudo escopado em `[data-skin="yt2016"]`: overrides de tokens para claro e escuro + overrides de componente. Com skin padrão, ele não afeta nada.
- Roboto (400/500) do Google Fonts carregada só quando a skin está ativa (o head script injeta o `<link>`).
- Lógica do egg num módulo pequeno (ex.: `js/easterEgg.js`) ligado aos dois gatos do logo.

## O que fica para o construtor

1. Verificar no Wayback o m.youtube.com de meados de 2016 (barra vermelha?) e decidir header/tab bar mobile.
2. Varrer as telas (feed, post, perfil, chat, busca, ranking, playlists, auth, admin, editor de foto, player, modais, toasts) e listar os seletores que precisam de override; valores fixos (cores/raios hardcoded fora dos tokens) são o grosso do trabalho.
3. Desenhar o gato retrô nos 6 moods e testar em 24px (sidebar) e no tamanho do auth.
4. Medir contraste dos dois modos da skin e ajustar a paleta escura.
5. Adicionar o ramo booleano em `cleanExtra` e confirmar que o flag não aparece em nenhuma tela pública.
6. Garantir o OR do `easterEgg2016` em todo caminho que escreve extras: montagem dos extras no `sync.js` e mesclagem de perfil remoto × local. Nunca gravar `false` por cima de `true`.
7. Head script: escolha visual chaveada pelo id do usuário; aplicar 2016 antes da pintura só se o id bater com o último usuário logado e ele tiver o flag; tela de auth sempre padrão; logout/troca de conta volta ao padrão; depois do login, aplicar a escolha salva assim que o flag for conhecido (local OU servidor).
8. Contador de cliques no estado do módulo (sobrevive ao re-render de `renderSidebar`/`renderMobileNav`); repetir os 16 cliques sempre grava `skin=yt2016` + `cat=retro`.
9. Testar: deslogado, logado em dois aparelhos, duas contas no mesmo aparelho (a que não descobriu vê padrão e não vê a seção), app Android (reload + safe areas), `prefers-reduced-motion`, troca padrão↔2016 sem flash, skin padrão idêntica a hoje.
10. Textos finais da seção "Visual" nas configurações (sem citar YouTube).
