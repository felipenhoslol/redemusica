// Song ratings someone gave: notes on their own posts plus notes given in challenges (pure, no DOM/storage).

const time = (iso) => Date.parse(iso) || 0;
const songOf = (s) => ({ title: s?.title || 'Música', artist: s?.artist || '', artwork: s?.artwork || '', previewUrl: s?.previewUrl || '' });

/** One server row of challenge_reviews → the shape the profile list and the notifications use. */
export const reviewFromRow = (r) => ({
  reviewerId: r.reviewer_id, targetUserId: r.target_id, challengeId: r.challenge_id, questionId: String(r.question_id),
  rating: Number(r.rating) || 0, song: r.song || null, updatedAt: r.updated_at
});

/**
 * Posts by `userId` with a rating and challenge reviews by `userId`, newest first.
 * The same review in two lists (server + this browser) shows once, the newer copy.
 */
export function mergeRatings(posts, reviews, userId) {
  const fromPosts = (posts || [])
    .filter(p => p.authorId === userId && Number(p.rating) > 0 && p.song)
    .map(p => ({ id: `post:${p.id}`, source: 'post', postId: p.id, rating: Number(p.rating), song: songOf(p.song), at: time(p.createdAtIso) || Number(String(p.id).split('_')[1]) || 0 })); // unsent post: id is post_<ms>_x
  const byKey = new Map();
  (reviews || []).filter(r => r.reviewerId === userId && r.rating > 0 && r.song).forEach(r => {
    const id = `challenge:${r.challengeId}:${r.targetUserId}:${r.questionId}`;
    const item = { id, source: 'challenge', challengeId: r.challengeId, rating: r.rating, song: songOf(r.song), at: time(r.updatedAt) };
    if (!byKey.has(id) || byKey.get(id).at < item.at) byKey.set(id, item);
  });
  return [...fromPosts, ...byKey.values()].sort((a, b) => b.at - a.at);
}

/** "fulano avaliou a sua música X no desafio": reviews of my songs by other people. */
export function reviewNotifications(reviews, me) {
  return (reviews || [])
    .filter(r => r.targetUserId === me && r.reviewerId && r.reviewerId !== me && r.updatedAt)
    .map(r => ({
      id: `review:${r.challengeId}:${r.questionId}:${r.reviewerId}`, type: 'review', fromUserId: r.reviewerId,
      text: `avaliou a sua música ${r.song?.title || ''} no desafio`.replace(/\s+/g, ' '),
      createdAt: r.updatedAt, challengeId: r.challengeId
    }));
}
