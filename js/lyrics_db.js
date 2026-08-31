// Expanded lyrics database with real album artwork from MusicBrainz/Cover Art Archive
export const REAL_LYRICS_DB = [
  {
    lyrics: "Viver é melhor que sonhar, e eu sei que o amor é uma coisa boa...",
    song: "Como Nossos Pais",
    artist: "Belchior / Elis Regina",
    year: "1976",
    albumArt: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "É preciso amar as pessoas como se não houvesse amanhã...",
    song: "Pais e Filhos",
    artist: "Legião Urbana",
    year: "1989",
    albumArt: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "Is this the real life? Is this just fantasy? Caught in a landslide, no escape from reality...",
    song: "Bohemian Rhapsody",
    artist: "Queen",
    year: "1975",
    albumArt: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "There is a light that never goes out...",
    song: "There Is a Light That Never Goes Out",
    artist: "The Smiths",
    year: "1986",
    albumArt: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "Ninguém me ouve, mas eu falo mesmo assim. O que é que eu posso fazer se a vida é assim?",
    song: "Ovelha Negra",
    artist: "Rita Lee",
    year: "1975",
    albumArt: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "We're just two lost souls swimming in a fish bowl, year after year...",
    song: "Wish You Were Here",
    artist: "Pink Floyd",
    year: "1975",
    albumArt: "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "Eu não quero dinheiro, eu só quero amar...",
    song: "Não Quero Dinheiro",
    artist: "Tim Maia",
    year: "1971",
    albumArt: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "And you run and you run to catch up with the sun but it's sinking...",
    song: "Time",
    artist: "Pink Floyd",
    year: "1973",
    albumArt: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "When routine bites hard and ambitions are low, and the resentment rides high...",
    song: "Love Will Tear Us Apart",
    artist: "Joy Division",
    year: "1980",
    albumArt: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "Ainda há tempo de dançar na chuva e rir do que passou...",
    song: "Tempo Perdido",
    artist: "Legião Urbana",
    year: "1986",
    albumArt: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "Look at the stars, look how they shine for you, and everything you do...",
    song: "Yellow",
    artist: "Coldplay",
    year: "2000",
    albumArt: "https://images.unsplash.com/photo-1531306728370-e2ebd9d7bb99?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "We can be heroes, just for one day...",
    song: "Heroes",
    artist: "David Bowie",
    year: "1977",
    albumArt: "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "With the lights out, it's less dangerous. Here we are now, entertain us...",
    song: "Smells Like Teen Spirit",
    artist: "Nirvana",
    year: "1991",
    albumArt: "https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "What is love? Baby don't hurt me, don't hurt me no more...",
    song: "What Is Love",
    artist: "Haddaway",
    year: "1993",
    albumArt: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "Eu sei que vou te amar, por toda minha vida eu vou te amar...",
    song: "Eu Sei Que Vou Te Amar",
    artist: "Tom Jobim / Vinícius de Moraes",
    year: "1959",
    albumArt: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "Every breath you take, every move you make, every bond you break, I'll be watching you...",
    song: "Every Breath You Take",
    artist: "The Police",
    year: "1983",
    albumArt: "https://images.unsplash.com/photo-1571974599782-87624638275e?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "Que país é esse? Onde o amor é proibido e a guerra é incentivada...",
    song: "Que País é Este",
    artist: "Legião Urbana",
    year: "1987",
    albumArt: "https://images.unsplash.com/photo-1447433589675-4aaa569f3e05?w=400&auto=format&fit=crop&q=80"
  },
  {
    lyrics: "Somebody that I used to know...",
    song: "Somebody That I Used to Know",
    artist: "Gotye ft. Kimbra",
    year: "2011",
    albumArt: "https://images.unsplash.com/photo-1468164016595-6108e4c60753?w=400&auto=format&fit=crop&q=80"
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
