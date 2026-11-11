// Seeds the local cache with 8 posts, each with a link and a photo, from made-up authors; clears what the
// app remembers about link previews so the next load is cold. Used with --setup by tools/perf.mjs.
async () => {
  const users = JSON.parse(localStorage.getItem('rmsn_users_v5') || '[]').filter(u => !u.id.startsWith('perf_'));
  const links = ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://github.com/', 'https://www.wikipedia.org/',
    'https://youtu.be/kJQP7kiw5Fk', 'https://developer.mozilla.org/', 'https://www.bbc.com/', 'https://open.spotify.com/', 'https://example.com/'];
  const authors = ['Lia Prado', 'Teo Ramos', 'Bia Lopes', 'Caio Neves'].map((name, i) => ({
    id: `perf_${i}`, name, handle: '@' + name.split(' ')[0].toLowerCase() + '_perf', avatar: name[0], bannerUrl: '', bio: '', status: '',
    pinnedPostId: null, songShowcase: [], topArtistsMonth: [], featuredSong: null
  }));
  const posts = links.map((url, i) => ({
    id: `perf_post_${i}`, authorId: authors[i % authors.length].id, text: `olha isso ${url}`, lyrics: '', lyricsSong: '', lyricsArt: '',
    tag: '', rating: 0, song: null, playlistId: null, poll: null, ranking: null, votes: {},
    imageUrl: '/assets/og-image.png', images: ['/assets/og-image.png'], mentions: [],
    likes: [], comments: [], reposts: [], bookmarks: [], createdAt: new Date(Date.now() - i * 60000).toISOString()
  }));
  localStorage.setItem('rmsn_users_v5', JSON.stringify([...users, ...authors]));
  localStorage.setItem('rmsn_posts_v5', JSON.stringify(posts));
  localStorage.removeItem('rmsn_link_img_v1');
  return { pass: true };
}
