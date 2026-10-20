// Star ranking in the feed: the podium card a post carries and the full list in a modal.
// Renders only from the post's frozen snapshot (untrusted: other users' posts), never the live ranking.
import { esc, safeUrl, jsArg } from './dom.js';
import { renderRatingStars } from './icons.js';
import { animateSpring, reducedMotion } from './motion.js';
import { rankItems } from './ranking.js';

export const RANKING_ROW_COUNT = 4;
const KIND_LABEL = { album: 'Álbum', ep: 'EP', single: 'Single' };

const ranked = (r) => rankItems(Array.isArray(r.items) ? r.items : [], r.mode);

const cover = (art, cls = 'ranking-cover') => {
  const src = safeUrl(art);
  return `<div class="${cls}">${src ? `<img src="${src}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</div>`;
};

const slot = (item, place, withCover) => `
  <div class="ranking-podium-slot" data-place="${place}">
    ${withCover ? cover(item.artwork) : ''}
    <span class="ranking-place">${place}</span>
    <span class="ranking-title">${esc(item.title)}</span>
    ${renderRatingStars(Number(item.rating) || 0, withCover ? 14 : 13)}
  </div>`;

export function rankingPostHtml(post) {
  const r = post?.ranking;
  if (!r || typeof r !== 'object') return '';
  const items = ranked(r);
  const album = r.mode === 'album';
  const top = items.slice(0, 3);
  // Artist podium reads 2nd, 1st, 3rd so the winner stands in the middle
  const podium = album
    ? top.map((it, i) => slot(it, i + 1, false)).join('')
    : [[top[1], 2], [top[0], 1], [top[2], 3]].filter(([it]) => it).map(([it, p]) => slot(it, p, true)).join('');
  const row = album ? '' : items.slice(3, 3 + RANKING_ROW_COUNT).map((it, i) => `
    <div class="ranking-row-item" title="${esc(it.title)}">${cover(it.artwork)}<span class="ranking-place">${i + 4}</span></div>`).join('');
  return `
    <div class="post-ranking" data-mode="${album ? 'album' : 'artist'}">
      <div class="ranking-head">
        <span class="ranking-kicker">${album ? 'Ranking do álbum' : 'Ranking do artista'}</span>
        <span class="ranking-subject">${esc(r.subject?.title)}${album && r.subject?.artist ? ` · ${esc(r.subject.artist)}` : ''}</span>
      </div>
      ${album ? `<div class="ranking-album">${cover(r.subject?.artwork, 'ranking-album-cover')}<div class="ranking-podium">${podium}</div></div>`
        : `<div class="ranking-podium">${podium}</div>`}
      ${row ? `<div class="ranking-row">${row}</div>` : ''}
      ${items.length > 3 ? `<button type="button" class="ranking-more" onclick="window._openRankingView(${jsArg(post.id)})">ver ranking completo (${items.length})</button>` : ''}
    </div>`;
}

/** The full numbered list: cover, title, kind label (artist rankings), stars. */
export function rankingListHtml(ranking) {
  const items = ranked(ranking || {});
  if (!items.length) return '<p class="ranking-empty">Nenhuma nota ainda.</p>';
  return `<ol class="ranking-list">${items.map((it, i) => `
    <li class="ranking-list-row">
      <span class="ranking-place">${i + 1}</span>
      ${cover(it.artwork)}
      <div class="ranking-list-text">
        <span class="ranking-title">${esc(it.title)}</span>
        <span class="ranking-meta">${esc([KIND_LABEL[it.kind], it.year].filter(Boolean).join(' · '))}</span>
      </div>
      ${renderRatingStars(Number(it.rating) || 0, 14)}
    </li>`).join('')}</ol>`;
}

/** Opens any ranking (a post's snapshot or a friend's saved one) in #ranking-view-modal. */
export function openRankingView(ranking) {
  const body = document.getElementById('ranking-view-modal')?.querySelector('.modal-body');
  if (!body || !ranking) return;
  const s = ranking.subject || {};
  body.innerHTML = `<p class="ranking-view-subject">${esc(s.title)}${ranking.mode === 'album' && s.artist ? ` · ${esc(s.artist)}` : ''}</p>${rankingListHtml(ranking)}`;
  window.openModal('ranking-view-modal');
  body.scrollTo?.(0, 0);
  if (!reducedMotion()) animateSpring(body.querySelector('.ranking-list'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 'snappy');
}
