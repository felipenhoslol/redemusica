// Preset Challenges & Custom Lists System for Rede de Música Sem Nome

export const DEFAULT_CHALLENGES = [
  {
    id: 'classic_30',
    title: 'Desafio Clássico das 30 Músicas',
    description: 'O desafio mais popular com 30 categorias para definir sua identidade musical.',
    questions: [
      { id: 1, title: 'Uma música com uma cor no título', subtitle: 'A song with a color in the title', category: 'Cores' },
      { id: 2, title: 'Uma música com um número no título', subtitle: 'A song with a number in the title', category: 'Números' },
      { id: 3, title: 'Uma música que te lembra o verão', subtitle: 'A song that reminds you of summertime', category: 'Estações' },
      { id: 4, title: 'Uma música que te lembra alguém que prefere esquecer', subtitle: 'Someone you would rather forget', category: 'Memórias' },
      { id: 5, title: 'Uma música que precisa ser tocada no VOLUME MÁXIMO', subtitle: 'Needs to be played LOUD', category: 'Energia' },
      { id: 6, title: 'Uma música que te dá vontade de dançar', subtitle: 'Makes you want to dance', category: 'Dança' },
      { id: 7, title: 'Uma música para ouvir na estrada / dirigindo', subtitle: 'A song to drive to', category: 'Viagem' },
      { id: 8, title: 'Uma música sobre drogas ou álcool', subtitle: 'About drugs or alcohol', category: 'Vibes' },
      { id: 9, title: 'Uma música que te deixa feliz', subtitle: 'Makes you happy', category: 'Felicidade' },
      { id: 10, title: 'Uma música que te deixa triste', subtitle: 'Makes you sad', category: 'Nostalgia' },
      { id: 11, title: 'Uma música que você nunca enjoa', subtitle: 'Never get tired of', category: 'Favoritas' },
      { id: 12, title: 'Uma música da sua pré-adolescência', subtitle: 'From your preteen years', category: 'Épocas' },
      { id: 13, title: 'Uma das suas músicas favoritas dos anos 80', subtitle: 'Favorite 80s song', category: 'Anos 80' },
      { id: 14, title: 'Uma música que você adoraria no seu casamento', subtitle: 'Played at your wedding', category: 'Romance' },
      { id: 15, title: 'Uma música que é um cover por outro artista', subtitle: 'A cover by another artist', category: 'Covers' },
      { id: 16, title: 'Uma das suas músicas clássicas favoritas', subtitle: 'Favorite classical song', category: 'Clássicos' },
      { id: 17, title: 'Uma música que você cantaria em dueto no karaokê', subtitle: 'Sing a duet on karaoke', category: 'Karaokê' },
      { id: 18, title: 'Uma música do ano em que você nasceu', subtitle: 'From the year you were born', category: 'Origens' },
      { id: 19, title: 'Uma música que faz você refletir sobre a vida', subtitle: 'Makes you think about life', category: 'Reflexão' },
      { id: 20, title: 'Uma música que tem muitos significados para você', subtitle: 'Many meanings to you', category: 'Significado' },
      { id: 21, title: 'Uma música favorita com o nome de alguém no título', subtitle: 'With a person name in title', category: 'Nomes' },
      { id: 22, title: 'Uma música que te faz seguir em frente', subtitle: 'Moves you forward', category: 'Motivação' },
      { id: 23, title: 'Uma música que você acha que todo mundo deveria ouvir', subtitle: 'Everybody should listen to', category: 'Recomendação' },
      { id: 24, title: 'Uma música de uma banda que você gostaria que ainda existisse', subtitle: 'Band you wish were still together', category: 'Saudade' },
      { id: 25, title: 'Uma música de um artista que já faleceu', subtitle: 'Artist no longer living', category: 'Lendas' },
      { id: 26, title: 'Uma música que te dá vontade de se apaixonar', subtitle: 'Makes you want to fall in love', category: 'Amor' },
      { id: 27, title: 'Uma música que parte o seu coração', subtitle: 'Breaks your heart', category: 'Coração Partido' },
      { id: 28, title: 'Uma música de um artista com uma voz que você ama', subtitle: 'Voice that you love', category: 'Vozes' },
      { id: 29, title: 'Uma música que você lembra da sua infância', subtitle: 'From your childhood', category: 'Infância' },
      { id: 30, title: 'Uma música que te lembra você mesmo', subtitle: 'Reminds you of yourself', category: 'Identidade' }
    ]
  },
];

export const DEFAULT_QUESTIONS = DEFAULT_CHALLENGES[0].questions;
