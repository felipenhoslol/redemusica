// Seeds two made-up people with 30 text posts each, so the feed and both profiles are tall enough to scroll.
// Used with --setup by tools/perf/scroll-restore.js.
async () => {
  const users = JSON.parse(localStorage.getItem('rmsn_users_v5') || '[]').filter(u => !u.id.startsWith('perf_'));
  const people = ['Lia Prado', 'Teo Ramos'].map((name, i) => ({
    id: `perf_${i}`, name, handle: '@' + name.split(' ')[0].toLowerCase() + '_perf', avatar: name[0], bannerUrl: '', bio: '', status: '',
    pinnedPostId: null, songShowcase: [], topArtistsMonth: [], featuredSong: null
  }));
  const posts = Array.from({ length: 60 }, (_, i) => ({
    id: `perf_post_${i}`, authorId: people[i % 2].id, text: `post ${i}: aquele disco que eu não paro de ouvir esta semana`, lyrics: '', lyricsSong: '', lyricsArt: '',
    tag: '', rating: 0, song: null, playlistId: null, poll: null, ranking: null, votes: {}, imageUrl: '', images: [], mentions: [],
    likes: [], comments: [], reposts: [], bookmarks: [], createdAt: `há ${i} min`, createdAtIso: new Date(Date.now() - i * 60000).toISOString()
  }));
  localStorage.setItem('rmsn_users_v5', JSON.stringify([...users, ...people]));
  localStorage.setItem('rmsn_posts_v5', JSON.stringify(posts));
  return { pass: true };
}
