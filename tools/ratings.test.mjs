import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRatings, reviewNotifications, reviewFromRow } from '../js/ratings.js';

const song = { title: 'Song', artist: 'A' };

test('mergeRatings: posts and challenge reviews, newest first, only by the user', () => {
  const posts = [
    { id: 'p1', authorId: 'u', rating: 4, song, createdAtIso: '2026-01-02T00:00:00Z' },
    { id: 'p2', authorId: 'u', rating: 0, song, createdAtIso: '2026-01-05T00:00:00Z' }, // no rating
    { id: 'p3', authorId: 'x', rating: 5, song, createdAtIso: '2026-01-06T00:00:00Z' }, // someone else
    { id: 'post_1767571200000_ab', authorId: 'u', rating: 3, song } // unsent: time from id (2026-01-05)
  ];
  const reviews = [
    { reviewerId: 'u', targetUserId: 't', challengeId: 'c', questionId: '1', rating: 2, song, updatedAt: '2026-01-03T00:00:00Z' },
    { reviewerId: 'u', targetUserId: 't', challengeId: 'c', questionId: '1', rating: 4.5, song, updatedAt: '2026-01-04T00:00:00Z' }, // newer copy wins
    { reviewerId: 'x', targetUserId: 'u', challengeId: 'c', questionId: '2', rating: 5, song, updatedAt: '2026-01-09T00:00:00Z' }
  ];
  const out = mergeRatings(posts, reviews, 'u');
  assert.deepEqual(out.map(i => [i.source, i.rating]), [['post', 3], ['challenge', 4.5], ['post', 4]]);
});

test('reviewNotifications: only other people reviewing my songs', () => {
  const rows = [
    { reviewer_id: 'a', target_id: 'me', challenge_id: 'c', question_id: 3, rating: '4.0', song, updated_at: '2026-01-01T00:00:00Z' },
    { reviewer_id: 'me', target_id: 'me', challenge_id: 'c', question_id: 4, rating: '5.0', song, updated_at: '2026-01-01T00:00:00Z' },
    { reviewer_id: 'a', target_id: 'b', challenge_id: 'c', question_id: 5, rating: '5.0', song, updated_at: '2026-01-01T00:00:00Z' }
  ].map(reviewFromRow);
  const out = reviewNotifications(rows, 'me');
  assert.equal(out.length, 1);
  assert.equal(out[0].fromUserId, 'a');
  assert.equal(out[0].challengeId, 'c');
  assert.equal(out[0].text, 'avaliou a sua música Song no desafio');
});
