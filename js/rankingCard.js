// Star ranking in the feed: the podium card a post carries and the summary screen in a modal.
// Renders only from the post's frozen snapshot (untrusted: other users' posts), never the live ranking.
import { esc, safeUrl, jsArg } from './dom.js';
import { renderRatingStars, ICONS } from './icons.js';
import { animateSpring, reducedMotion } from './motion.js';
import { rankItems } from './ranking.js';

export const RANKING_ROW_COUNT = 4;

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

// Tapping anywhere on the card opens the full list; the button (no handler: its click bubbles here) is the keyboard path
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
    <div class="post-ranking" data-mode="${album ? 'album' : 'artist'}" onclick="window._openRankingView(${jsArg(post.id)})">
      <div class="ranking-head">
        <span class="ranking-kicker">${album ? 'Ranking do álbum' : 'Ranking do artista'}</span>
        <span class="ranking-subject">${esc(r.subject?.title)}${album && r.subject?.artist ? ` · ${esc(r.subject.artist)}` : ''}</span>
      </div>
      ${album ? `<div class="ranking-album">${cover(r.subject?.artwork, 'ranking-album-cover')}<div class="ranking-podium">${podium}</div></div>`
        : `<div class="ranking-podium">${podium}</div>`}
      ${row ? `<div class="ranking-row">${row}</div>` : ''}
      ${items.length ? `<button type="button" class="ranking-more">ver ranking completo (${items.length})</button>` : ''}
    </div>`;
}

const comma = (n) => String(n).replace('.', ',');

/** Mean rating, pt-BR with one decimal ("4,1"); '' with no items. Ratings are half steps, so sum*10 is an exact integer. */
export function averageLabel(items) {
  const n = items?.length || 0;
  if (!n) return '';
  const sum = items.reduce((t, i) => t + (Number(i.rating) || 0), 0);
  return comma((Math.round(sum * 10 / n) / 10).toFixed(1));
}

/** Podium reading order: 2nd, 1st (center), 3rd; fewer items keep the winner in the middle. */
export const podiumOrder = (items) => [[items[1], 2], [items[0], 1], [items[2], 3]].filter(([it]) => it);

const sumSlot = (it, place, art) => `
  <div class="rk-sum-slot" data-place="${place}">
    ${cover(art)}
    <span class="rk-sum-place">${place}º · ${comma(Number(it.rating) || 0)}</span>
    <span class="ranking-title" title="${esc(it.title)}">${esc(it.title)}</span>
  </div>`;

/** The ranking summary: header with the average, top-3 podium, every rated item; own rankings get Editar/Postar. */
export function rankingSummaryHtml(ranking, { own = false } = {}) {
  const r = ranking || {};
  const s = r.subject || {};
  const album = r.mode === 'album';
  const items = ranked(r);
  const art = (it) => (album && !it.artwork ? s.artwork : it.artwork);
  // Artist photo arrives later (hydrateSummaryPhoto) into this fixed round slot; the icon stays when there is none
  const pic = album ? cover(s.artwork, 'ranking-cover rk-sum-pic')
    : `<div class="rk-sum-pic rk-sum-photo" data-rk-photo="${esc(s.title)}">${ICONS.profile}</div>`;
  const avg = averageLabel(items);
  return `
    <div class="rk-sum" data-mode="${album ? 'album' : 'artist'}">
      <div class="rk-sum-head">
        ${pic}
        <div class="rk-sum-text">
          <span class="rk-sum-name">${esc(s.title)}</span>
          <span class="ranking-meta">${album && s.artist ? `${esc(s.artist)} · ` : ''}${items.length} com nota</span>
        </div>
        ${avg ? `<div class="rk-sum-avg"><span class="rk-sum-avg-n">${avg}</span><span class="ranking-meta">média</span></div>` : ''}
      </div>
      ${items.length ? `<div class="rk-sum-podium">${podiumOrder(items).map(([it, p]) => sumSlot(it, p, art(it))).join('')}</div>
      <ol class="rk-sum-list">${items.map((it, i) => `
        <li class="rk-sum-row">
          <span class="ranking-place">${i + 1}</span>
          ${cover(art(it))}
          <span class="ranking-title" title="${esc(it.title)}">${esc(it.title)}</span>
          ${renderRatingStars(Number(it.rating) || 0, 14)}
        </li>`).join('')}</ol>` : '<p class="rk-sum-empty">Nenhuma nota ainda.</p>'}
      ${own ? `<div class="rk-sum-actions">
        <button type="button" class="doodle-btn doodle-btn-secondary" onclick="closeDoodleModal('ranking-view-modal')">Editar notas</button>
        <button type="button" class="doodle-btn doodle-btn-primary" ${items.length ? '' : 'disabled'} onclick="window._rankPostSaved(${jsArg(r.key)}, this)">Postar no feed</button>
      </div>` : ''}
    </div>`;
}

// lastfm.js is loaded on demand: it pulls in api.js, which this feed-card module does not need otherwise
function hydrateSummaryPhoto(el) {
  if (!el?.dataset.rkPhoto) return;
  import('./lastfm.js').then(m => m.getArtistImage(el.dataset.rkPhoto)).then(u => {
    const url = safeUrl(u);
    if (!url || !el.isConnected) return;
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.onload = () => { el.replaceChildren(img); if (!reducedMotion()) animateSpring(img, [{ opacity: 0 }, { opacity: 1 }], 'smooth'); };
    img.src = url;
  }).catch(() => {});
}

/** Opens any ranking (a post's snapshot, a friend's or my saved one) as the summary in #ranking-view-modal. */
export function openRankingView(ranking, { own = false } = {}) {
  const body = document.getElementById('ranking-view-modal')?.querySelector('.modal-body');
  if (!body || !ranking) return;
  body.innerHTML = rankingSummaryHtml(ranking, { own });
  window.openModal('ranking-view-modal');
  body.scrollTo?.(0, 0);
  hydrateSummaryPhoto(body.querySelector('[data-rk-photo]'));
  if (reducedMotion()) return;
  // Podium lands 1st, 2nd, 3rd; the list follows as one block
  body.querySelectorAll('.rk-sum-slot').forEach(el => animateSpring(el, [{ opacity: 0, transform: 'translateY(10px) scale(.96)' }, { opacity: 1, transform: 'none' }],
    'pop', { delay: (Number(el.dataset.place) - 1) * 60, fill: 'backwards' }));
  animateSpring(body.querySelector('.rk-sum-list'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 'smooth', { delay: 120, fill: 'backwards' });
}
