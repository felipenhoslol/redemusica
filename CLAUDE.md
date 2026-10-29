# UI/UX & Motion Directives (Emil Kowalski Style)

- **No Artificial Polish / Anti-AI-Slop:** Evite gradientes exagerados, cantos arredondados excessivos (pílulas genéricas), sombras difusas pesadas ou efeitos roxos/neon clichês.
- **Micro-interactions First:** Toda ação (curtir, adicionar à playlist, dar play) precisa de feedback tátil e suave via Framer Motion ou CSS Transitions.
- **Physics-Based Motion:** Use spring animations em vez de easing linear ou cubic-bezier padrão. (`stiffness`, `damping`, `mass`).
- **Layout Stability:** Nunca mova elementos adjacentes de forma brusca durante carregamentos ou expansões (use Layout Animations do Framer Motion).
- **Typography & Rhythm:** Hierarquia clara com fontes bem espaçadas. Destaque para a capa do álbum/música e o controle de reprodução.

Nunca execute o trabalho por conta própria. Sempre delegue a tarefa a um subagente. Não use sempre o Fable. Use o Opus 5.5 para tarefas mais simples.

## Distribuição de modelos

• Fable 5.1: arquitetura, bugs complexos e revisão de código. Opus 5.5: edições, testes, documentação e refatoração. • Haiku 4.5: pesquisas e resumos. Especifique o modelo em cada chamada de agente.

## Delegação

Um subagente por tarefa. Planeje antes de executar.

• Execute subagentes independentes em paralelo.

• Leia os relatórios, nunca os arquivos.
