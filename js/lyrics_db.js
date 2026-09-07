// Expanded lyrics database with real album artwork from MusicBrainz/Cover Art Archive
export const REAL_LYRICS_DB = [
  {
    lyrics: "Viver é melhor que sonhar, e eu sei que o amor é uma coisa boa...",
    song: "Como Nossos Pais",
    artist: "Elis Regina",
    searchQuery: "Como Nossos Pais Elis Regina",
    year: "1976"
  },
  {
    lyrics: "É preciso amar as pessoas como se não houvesse amanhã...",
    song: "Pais e Filhos",
    artist: "Legião Urbana",
    searchQuery: "Pais e Filhos Legiao Urbana",
    year: "1989"
  },
  {
    lyrics: "Is this the real life? Is this just fantasy? Caught in a landslide, no escape from reality...",
    song: "Bohemian Rhapsody",
    artist: "Queen",
    searchQuery: "Bohemian Rhapsody Queen",
    year: "1975"
  },
  {
    lyrics: "There is a light that never goes out...",
    song: "There Is a Light That Never Goes Out",
    artist: "The Smiths",
    searchQuery: "There Is a Light That Never Goes Out The Smiths",
    year: "1986"
  },
  {
    lyrics: "Ninguém me ouve, mas eu falo mesmo assim. O que é que eu posso fazer se a vida é assim?",
    song: "Ovelha Negra",
    artist: "Rita Lee",
    searchQuery: "Ovelha Negra Rita Lee",
    year: "1975"
  },
  {
    lyrics: "We're just two lost souls swimming in a fish bowl, year after year...",
    song: "Wish You Were Here",
    artist: "Pink Floyd",
    searchQuery: "Wish You Were Here Pink Floyd",
    year: "1975"
  },
  {
    lyrics: "Eu não quero dinheiro, eu só quero amar...",
    song: "Não Quero Dinheiro",
    artist: "Tim Maia",
    searchQuery: "Nao Quero Dinheiro Tim Maia",
    year: "1971"
  },
  {
    lyrics: "And you run and you run to catch up with the sun but it's sinking...",
    song: "Time",
    artist: "Pink Floyd",
    searchQuery: "Time Pink Floyd",
    year: "1973"
  },
  {
    lyrics: "When routine bites hard and ambitions are low, and the resentment rides high...",
    song: "Love Will Tear Us Apart",
    artist: "Joy Division",
    searchQuery: "Love Will Tear Us Apart Joy Division",
    year: "1980"
  },
  {
    lyrics: "Ainda há tempo de dançar na chuva e rir do que passou...",
    song: "Tempo Perdido",
    artist: "Legião Urbana",
    searchQuery: "Tempo Perdido Legiao Urbana",
    year: "1986"
  },
  {
    lyrics: "Look at the stars, look how they shine for you, and everything you do...",
    song: "Yellow",
    artist: "Coldplay",
    searchQuery: "Yellow Coldplay",
    year: "2000"
  },
  {
    lyrics: "We can be heroes, just for one day...",
    song: "Heroes",
    artist: "David Bowie",
    searchQuery: "Heroes David Bowie",
    year: "1977"
  },
  {
    lyrics: "With the lights out, it's less dangerous. Here we are now, entertain us...",
    song: "Smells Like Teen Spirit",
    artist: "Nirvana",
    searchQuery: "Smells Like Teen Spirit Nirvana",
    year: "1991"
  },
  {
    lyrics: "What is love? Baby don't hurt me, don't hurt me no more...",
    song: "What Is Love",
    artist: "Haddaway",
    searchQuery: "What Is Love Haddaway",
    year: "1993"
  },
  {
    lyrics: "Eu sei que vou te amar, por toda minha vida eu vou te amar...",
    song: "Eu Sei Que Vou Te Amar",
    artist: "Tom Jobim",
    searchQuery: "Eu Sei Que Vou Te Amar Tom Jobim",
    year: "1959"
  },
  {
    lyrics: "Every breath you take, every move you make, every bond you break, I'll be watching you...",
    song: "Every Breath You Take",
    artist: "The Police",
    searchQuery: "Every Breath You Take The Police",
    year: "1983"
  },
  {
    lyrics: "Que país é esse? Onde o amor é proibido e a guerra é incentivada...",
    song: "Que País é Este",
    artist: "Legião Urbana",
    searchQuery: "Que Pais E Este Legiao Urbana",
    year: "1987"
  },
  {
    lyrics: "Somebody that I used to know...",
    song: "Somebody That I Used to Know",
    artist: "Gotye",
    searchQuery: "Somebody That I Used to Know Gotye",
    year: "2011"
  }
];

/**
 * Get a random lyric from the database
 * @returns {object}
 */
export function getRandomLyric() {
  const idx = Math.floor(Math.random() * REAL_LYRICS_DB.length);
  return REAL_LYRICS_DB[idx];
}

/**
 * Get a lyric card style randomly for visual variety
 * @returns {'compact' | 'with-cover' | 'full-bleed'}
 */
export function getRandomCardStyle() {
  const styles = ['compact', 'compact', 'with-cover', 'with-cover', 'full-bleed'];
  return styles[Math.floor(Math.random() * styles.length)];
}
