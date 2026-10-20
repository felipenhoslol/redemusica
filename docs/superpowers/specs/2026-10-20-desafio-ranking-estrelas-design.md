# Desafio "ranking por estrelas": design

Data: 2026-10-20

## Intenção e porquê

Hoje os desafios do rabisco são listas de perguntas, e cada uma se responde com uma música. Falta um jeito de dizer o que você acha da obra inteira de um artista ou de um álbum, faixa por faixa, e mostrar isso aos amigos. O ranking por estrelas preenche esse espaço: você dá nota, o app ordena e o resultado vira um post que dá vontade de comentar ("como assim esse álbum ficou em 4º?").

## Objetivos

- Um novo tipo de desafio, o "ranking por estrelas", que aparece junto com os desafios que já existem.
- Dois modos:
  - **Artista**: dar de 1 a 5 estrelas para cada lançamento da discografia (álbuns, EPs e singles).
  - **Álbum**: dar de 1 a 5 estrelas para cada faixa de um álbum.
- Compartilhar o resultado no feed, com um card próprio para cada modo.
- Na área de desafios, mostrar o ranking atual (salvo) de cada pessoa, o seu e o dos amigos. Os posts ficam só no feed.

## Não-objetivos

- Ranking de playlists, de gêneros ou entre artistas diferentes.
- Ranking colaborativo ou média de notas de vários usuários.
- Histórico de versões de um ranking (editar sobrescreve o ranking salvo, veja abaixo).
- Escolher trecho de 30s ou tocar prévia dentro da tela de avaliação.

## Anti-objetivos (o que não pode acontecer)

- O mesmo disco aparecer repetido na grade ou no pódio. A usuária detesta isso.
- Mudar um ranking e, com isso, alterar posts antigos que já estão no feed.
- Visual genérico de "IA": gradientes, pílulas, sombras pesadas, roxo/neon, emoji na interface.
- Elementos pulando de lugar enquanto as capas carregam ou quando se troca de aba.

## Restrições

- Vanilla JS em `js/`, sem framework novo e sem dependência nova.
- Direção visual da casa: layout social, gato kawaii, fonte M PLUS Rounded 1c, ícones com stroke 2, sem emoji na UI, a escala de 4 tamanhos de texto e 3 pesos que já existe, roxo só no que se toca.
- Movimento (CLAUDE.md): micro-interações com mola (stiffness/damping) em toda ação, como marcar estrela ou postar. O layout tem que ficar estável.
- Dados de música vêm só do iTunes via `js/api.js`.
- Os rankings dos amigos precisam aparecer, então os dados sincronizam remotamente, como já acontece com posts e respostas.

## O que foi decidido

### Decisões da usuária

1. **Tipo novo de desafio**, mostrado ao lado dos desafios atuais na área de desafios.
2. **Dois modos**: Artista (álbuns, EPs e singles, 1–5 estrelas cada) e Álbum (cada faixa, 1–5 estrelas).
3. **Tela do modo Artista em grade**: capas com as estrelas embaixo de cada uma e abas **Álbuns / EPs / Singles**. Ela escolheu grade em vez de lista. As abas só organizam a tela de dar notas (veja a decisão 10).
4. **Post no feed**:
   - Artista: um **pódio** com as 3 primeiras capas (a 1ª maior, no centro) e suas estrelas. Embaixo, uma linha com os próximos itens e o link **"ver ranking completo (N)"**.
   - Álbum: a capa do álbum em tamanho grande e o **top 3 de faixas** em pódio (nome da faixa + estrelas).
5. **Nada de duplicata**: o mesmo disco nunca aparece duas vezes.
6. **Refazer o ranking** do mesmo artista ou álbum é editar e sobrescrever o ranking salvo. Os posts antigos continuam só no feed, do jeito que foram publicados, como foto do momento.
7. **Área de desafios** mostra o ranking da própria pessoa e os dos amigos (veja a decisão 8).
8. **A área do desafio mostra o ranking ATUAL de cada pessoa**, um por artista ou álbum por pessoa, e não os posts. Posts antigos ficam só no feed, como foto do momento.
9. **Salvar e postar são separados**: o ranking é salvo enquanto a pessoa dá as notas (pode começar e terminar depois). Postar é um botão à parte. Refazer = editar/sobrescrever o ranking salvo; postar de novo cria um post novo.
10. **Modo Artista é um ranking único** juntando álbuns, EPs e singles (um single pode ficar acima de um álbum). As abas só organizam a tela de dar notas; o pódio junta tudo; "ver ranking completo (N)" conta todos os lançamentos com nota.

### Decisões do Claude (a usuária pode mudar)

1. **Lançamentos sem nota são permitidos**. Só o que recebeu nota entra no ranking. **Meia estrela é permitida**, já que `renderRatingStars` suporta.
2. **Desempate**: lançamento mais recente primeiro. No modo Álbum, vale a ordem das faixas no disco.
3. **Regra de deduplicação**: versões cujo nome só muda por um sufixo como (Deluxe), (Remastered), (Expanded), (Edição ...) e parecidos viram um item só, com a capa e o ano da versão original. Álbuns ao vivo e regravações como "Taylor's Version" continuam separados.
4. **O post guarda uma cópia (snapshot)** do ranking no momento em que foi publicado, e não uma referência. É isso que mantém os posts antigos intactos (decisão 6 da usuária).
5. **"ver ranking completo"** abre a visualização do ranking inteiro.
6. **"Amigos" = quem a pessoa segue**, usando o grafo de follow que já existe (`rmsn_follows_v5` / `getFollowing`), igual ao feed.

## O que fica para quem construir

Referências no código:

- **Desafios**: `DEFAULT_CHALLENGES` em `js/questions.js:3` (`{id, title, description, questions[]}`). O ranking não cabe nesse formato de perguntas, então ele é um *tipo* novo de desafio. O armazenamento fica em `js/storage.js` (chaves `rmsn_challenges_v5`, `rmsn_active_challenge_v5`, `rmsn_answers_v5_<challengeId>_<userId>`). `saveChallengeAnswer` está em `storage.js:1000` e `publishChallengeAnswers` sincroniza remotamente.
- **Posts**: `createPost` em `storage.js:676-708`, a parte remota via `toRemote('createPost')` e o mapeamento de sync em `js/sync.js:144, 653, 989`. É preciso um campo novo no post para o snapshot do ranking e um card novo em `renderPostCard` (`js/feed.js:283-380`). Os cards especiais que servem de modelo: enquete (`js/poll.js:21`), letra (`feed.js:21`) e playlist (`feed.js:34`).
- **Estrelas**: `renderRatingStars` em `js/icons.js:135` (0–5, com meia estrela) e o seletor de estrelas em `feed.js:663-704`.
- **Música**: `searchArtists` (`api.js:143`), `searchAlbums` (`:167`), `lookupArtist` (`:174`, já separa álbuns e singles) e `lookupAlbum` (`:187`, traz as faixas). `albumKind` (`js/musicResults.js:29`) detecta os sufixos " - Single" e " - EP". `organizeAlbums` (`:37`) devolve só `{albums, singles}`, então os EPs precisam de um grupo próprio. A arte vem em 600px.

- **Sync dos rankings salvos**: precisam de sync remoto próprio para os amigos verem. Cuidado com o limite (~60 KB) dos extras do perfil usados pelas respostas de desafio; os rankings talvez não caibam lá.

Fica a critério de quem construir:

- O schema de storage e de sync dos rankings, incluindo como os amigos os leem.
- A estrutura exata dos componentes e telas.
- As animações (com mola), dentro das diretrizes do CLAUDE.md.
- Os estados vazio, carregando e erro (artista sem lançamentos, falha do iTunes, ranking sem nenhuma nota).
- Quantos itens cabem na linha abaixo do pódio.
- Onde aplicar a deduplicação e como testá-la (vale ter um teste pequeno com nomes reais: Deluxe, Remastered, Taylor's Version, Live).
