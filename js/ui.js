// UI Controller — modals, search, music ask grid, compare, notifications, global search
import { esc, safeUrl, jsArg, avatarInner, isImageAvatar } from './dom.js';
import * as storage from './storage.js';
import { globalAudio } from './audio.js';
import { searchTracks } from './api.js';
import { renderProfileView, renderFollowListModal, openModal, closeModal, showToast } from './profile.js';
import { ICONS, renderRatingStars, getStarSVG } from './icons.js';

let currentSearchTarget = { type: 'question', id: null, challengeId: null };
let searchDebounceTimer = null;
let currentReviewRating = 4.0;

// ──────────────────────────────────────────
// MODAL HELPERS (re-exported for compat)
// ──────────────────────────────────────────

export function openDoodleModal(modalId) {
  document.getElementById(modalId)?.classList.add('active');
}

export function closeDoodleModal(modalId) {
  document.getElementById(modalId)?.classList.remove('active');
}

export function showDoodleToast(msg) { showToast(msg); }
export { showToast, openModal, closeModal };

window.openDoodleModal = openDoodleModal;
window.closeDoodleModal = closeDoodleModal;
window.showDoodleToast = showDoodleToast;
window.globalAudio = globalAudio;

// ──────────────────────────────────────────
// SEARCH MODAL
// ──────────────────────────────────────────

export function openSearchModalForQuestion(challengeId, questionId) {
  currentSearchTarget = { type: 'question', id: questionId, challengeId };
  const challenge = storage.getAllChallenges().find(c => c.id === challengeId) || storage.getActiveChallenge();
  const q = challenge.questions.find(item => String(item.id) === String(questionId));

  const titleEl = document.getElementById('search-modal-title');
  const noteRow = document.getElementById('search-modal-note-row');
  if (titleEl) titleEl.textContent = `Item ${q ? q.id : ''}: ${q ? q.title : 'Buscar Música'}`;
  if (noteRow) noteRow.style.display = 'block';

  resetSearchModal();
  openDoodleModal('search-modal');
}
window.openSearchModalForQuestion = openSearchModalForQuestion;

export function openSearchModalForFeed() {
  currentSearchTarget = { type: 'feed' };
  const titleEl = document.getElementById('search-modal-title');
  const noteRow = document.getElementById('search-modal-note-row');
  if (titleEl) titleEl.innerHTML = 'Anexar Música ao Post';
  if (noteRow) noteRow.style.display = 'none';

  resetSearchModal();
  openDoodleModal('search-modal');
}

export function openSearchModalForLyrics() {
  currentSearchTarget = { type: 'lyrics' };
  const titleEl = document.getElementById('search-modal-title');
  const noteRow = document.getElementById('search-modal-note-row');
  if (titleEl) titleEl.innerHTML = 'Selecionar Música da Letra (iTunes)';
  if (noteRow) noteRow.style.display = 'none';

  resetSearchModal();
  openDoodleModal('search-modal');
}

export function openSearchModalForFeaturedSong() {
  currentSearchTarget = { type: 'profile' };
  const titleEl = document.getElementById('search-modal-title');
  const noteRow = document.getElementById('search-modal-note-row');
  if (titleEl) titleEl.innerHTML = 'Música em Destaque';
  if (noteRow) noteRow.style.display = 'none';

  resetSearchModal();
  openDoodleModal('search-modal');
}

export function openSearchModalForChat() {
  currentSearchTarget = { type: 'chat' };
  const titleEl = document.getElementById('search-modal-title');
  const noteRow = document.getElementById('search-modal-note-row');
  if (titleEl) titleEl.innerHTML = 'Enviar Música no Chat';
  if (noteRow) noteRow.style.display = 'none';

  resetSearchModal();
  openDoodleModal('search-modal');
}

export function openSearchModalForShowcase() {
  currentSearchTarget = { type: 'showcase' };
  const titleEl = document.getElementById('search-modal-title');
  const noteRow = document.getElementById('search-modal-note-row');
  if (titleEl) titleEl.innerHTML = 'Adicionar à Vitrine';
  if (noteRow) noteRow.style.display = 'none';

  resetSearchModal();
  openDoodleModal('search-modal');
}

export function openSearchModalForPlaylist(playlistId) {
  currentSearchTarget = { type: 'playlist', playlistId };
  const titleEl = document.getElementById('search-modal-title');
  const noteRow = document.getElementById('search-modal-note-row');
  if (titleEl) titleEl.innerHTML = 'Adicionar Música à Playlist';
  if (noteRow) noteRow.style.display = 'block';

  resetSearchModal();
  openDoodleModal('search-modal');
}

export function openSearchModalForComment(postId) {
  currentSearchTarget = { type: 'comment', postId };
  const titleEl = document.getElementById('search-modal-title');
  const noteRow = document.getElementById('search-modal-note-row');
  if (titleEl) titleEl.innerHTML = 'Anexar Música ao Comentário';
  if (noteRow) noteRow.style.display = 'none';

  resetSearchModal();
  openDoodleModal('search-modal');
}


function resetSearchModal() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (input) { input.value = ''; input.focus(); }
  if (results) results.innerHTML = '';
}

export function initSearchModal() {
  const input = document.getElementById('search-input');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      document.getElementById('search-results').innerHTML = '';
      return;
    }
    searchDebounceTimer = setTimeout(() => performSearch(q), 380);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(searchDebounceTimer); performSearch(input.value.trim()); }
    if (e.key === 'Escape') closeDoodleModal('search-modal');
  });
}

let searchModalSeq = 0; // only the latest modal search may write results

async function performSearch(query) {
  const container = document.getElementById('search-results');
  if (!container || !query) return;
  const mySeq = ++searchModalSeq;

  container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted)">Buscando...</div>`;

  try {
    const tracks = await searchTracks(query);
    if (mySeq !== searchModalSeq) return;
    if (!tracks || !tracks.length) {
      container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted)">Nenhuma música encontrada.</div>`;
      return;
    }

    container.innerHTML = tracks.map(t => `
      <div class="search-result-item" onclick="window._selectTrackFromModal(${jsArg(t)})">
        <img class="search-result-cover" src="${safeUrl(t.artwork)}" alt="${esc(t.title)}" onerror="this.style.display='none'">
        <div>
          <div class="search-result-title">${esc(t.title)}</div>
          <div class="search-result-artist">${esc(t.artist)} &bull; ${esc(t.duration)}</div>
        </div>
        ${t.previewUrl ? `<button style="background:transparent;border:none;color:var(--purple-light);cursor:pointer;padding:4px;" onclick="event.stopPropagation();window._previewTrack(${jsArg(t)})">
          ${ICONS.play}
        </button>` : ''}
      </div>`).join('');
  } catch (e) {
    if (mySeq !== searchModalSeq) return;
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--pink)">Erro ao buscar. Tente novamente.</div>`;
  }
}

window._previewTrack = (track) => {
  if (track.previewUrl) {
    window._playTrack(track);
  }
};

window._selectTrackFromModal = (track) => {
  closeDoodleModal('search-modal');
  const target = currentSearchTarget;

  if (target.type === 'question') {
    const noteEl = document.getElementById('search-modal-note');
    const note = noteEl ? noteEl.value.trim() : '';
    storage.saveChallengeAnswer(target.challengeId, target.id, track, note);
    showToast(`${track.title} salvo!`);
    // Re-render grid if visible
    const grid = document.getElementById('questions-grid');
    if (grid) renderMusicAskGrid(grid);
    if (window._refreshCompareView) window._refreshCompareView();

  } else if (target.type === 'feed') {
    window._setCreatorSong?.(track);
    showToast(`Música anexada: ${track.title}`);

  } else if (target.type === 'lyrics') {
    window._setCreatorLyricsSong?.(track);
    showToast(`Música da letra: ${track.title}`);

  } else if (target.type === 'profile') {
    storage.setFeaturedSong(track);
    showToast(`Destaque: ${track.title}`);
    window._refreshProfile?.();

  } else if (target.type === 'chat') {
    import('./chat.js').then(m => {
      m.attachSongToChat(track);
      showToast(`Música "${track.title}" anexada ao chat!`);
    });

  } else if (target.type === 'showcase') {
    const ok = storage.addToShowcase(track);
    showToast(ok ? `Adicionado à vitrine: ${track.title}` : 'Vitrine cheia (máx. 5)');
    window._refreshProfile?.();

  } else if (target.type === 'playlist') {
    const noteEl = document.getElementById('search-modal-note');
    const note = noteEl ? noteEl.value.trim() : '';
    storage.addSongToPlaylist(target.playlistId, track, note);
    showToast(`"${track.title}" adicionada à playlist!`);
    window._refreshPlaylistDetails?.(target.playlistId);
    window._refreshPlaylists?.();

  } else if (target.type === 'comment') {
    window._setCommentSong?.(target.postId, track);
    showToast(`Música "${track.title}" anexada ao comentário!`);
  }
};

// ──────────────────────────────────────────
// MUSIC ASK GRID — Challenge view
// ──────────────────────────────────────────

export function renderMusicAskGrid(container, challengeId, userId) {
  const cid = challengeId || storage.getActiveChallengeId();
  const uid = userId || storage.getActiveUserId();
  const challenge = storage.getAllChallenges().find(c => c.id === cid) || storage.getActiveChallenge();
  const questions = challenge?.questions || [];
  const answers = storage.getChallengeAnswers(cid, uid);
  const isMe = uid === storage.getActiveUserId();

  if (!questions.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Nenhuma questão neste desafio.</div></div>`;
    return;
  }

  const cards = questions.map(q => {
    const ans = answers[q.id];
    const hasAns = !!ans;
    const myReview = hasAns ? storage.getSongReviews(uid, cid, q.id)[storage.getActiveUserId()] : null;

    return `
      <div class="q-card${hasAns ? ' answered' : ''}" onclick="${isMe ? `window._openQuestion('${cid}',${q.id})` : ''}">
        <div class="q-card-cover">
          ${hasAns && ans.artwork ? `<img src="${safeUrl(ans.artwork)}" alt="${esc(ans.title)}" loading="lazy">` : `<span style="color:var(--dimmed);display:flex;align-items:center;justify-content:center;">${ICONS.music}</span>`}
        </div>
        ${hasAns ? `<div class="q-card-answered-badge">${ICONS.check}</div>` : ''}
        <div class="q-card-info">
          <div class="q-number">${q.id}.</div>
          <div class="q-title">${esc(q.title)}</div>
          ${hasAns ? `<div style="font-size:0.72rem;color:var(--white);font-weight:700">${esc(ans.title)}</div>
                      <div style="font-size:0.65rem;color:var(--muted)">${esc(ans.artist)}</div>` : ''}
        </div>
        ${hasAns ? `
          <div class="q-card-actions">
            <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="event.stopPropagation();window._openReview('${uid}','${cid}','${q.id}')" title="${myReview ? `Avaliado com nota ${myReview.rating.toFixed(1)}★ (Clique para editar)` : 'Avaliar música'}" style="${myReview ? 'color:var(--star);' : 'color:var(--purple-light);'}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="${myReview ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
            <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="event.stopPropagation();window._playTrack(${jsArg(ans)})" title="Ouvir música">
              ${ICONS.play}
            </button>
          </div>` : ''}
      </div>`;
  }).join('');

  container.innerHTML = `<div class="questions-grid">${cards}</div>`;
}

window._openQuestion = (challengeId, questionId) => {
  openSearchModalForQuestion(challengeId, questionId);
};

window._postAnswer = (challengeId, questionId) => {
  const challenge = storage.getAllChallenges().find(c => c.id === challengeId);
  const question = challenge?.questions?.find(q => String(q.id) === String(questionId));
  const ans = storage.getChallengeAnswers(challengeId)[questionId];
  if (!ans || !question) return;

  storage.createPost({
    text: `Minha resposta para: "${question.title}"`,
    tag: '#desafio',
    song: ans,
    rating: 0
  });
  showToast('Postado no feed!');
};

// ──────────────────────────────────────────
// COMPARE VIEW (MULTI-CHALLENGE & BATTLE UI)
// ──────────────────────────────────────────

export function renderCompareView(container) {
  const users = storage.getAllUsers();
  const activeUser = storage.getActiveUser();
  const allChallenges = storage.getAllChallenges();

  let selectedChallengeId = storage.getActiveChallengeId() || allChallenges[0]?.id || 'classic_30';
  let compareUserId = users.find(u => u.id !== activeUser.id)?.id || users[0]?.id;
  let activeFilter = 'all'; // 'all' | 'both' | 'my' | 'theirs' | 'reviewed'

  function getAvatarMarkup(user, size = 44) {
    if (!user) return `<div class="compare-user-avatar" style="width:${size}px;height:${size}px;">U</div>`;
    const isImg = isImageAvatar(user.avatar);
    if (isImg) {
      return `<div class="compare-user-avatar" style="width:${size}px;height:${size}px;"><img src="${safeUrl(user.avatar)}" alt="${esc(user.name)}"></div>`;
    }
    return `<div class="compare-user-avatar" style="width:${size}px;height:${size}px;">${esc(user.avatar || user.name?.[0] || 'U')}</div>`;
  }

  function buildHtml() {
    const currentChallenge = allChallenges.find(c => c.id === selectedChallengeId) || allChallenges[0];
    const questions = currentChallenge?.questions || [];
    const compareUser = storage.getUserById(compareUserId);

    const myAnswers = storage.getChallengeAnswers(selectedChallengeId, activeUser.id);
    const theirAnswers = storage.getChallengeAnswers(selectedChallengeId, compareUserId);

    // Challenges Selector Pills
    const challengesPillsHtml = allChallenges.map(c => {
      const qCount = c.questions?.length || 0;
      const isActive = c.id === selectedChallengeId;
      const icon = c.id.includes('30') ? ICONS.fire : (c.id.includes('10') ? ICONS.star : (c.id.includes('night') ? ICONS.moon : ICONS.disc));
      return `
        <button type="button" class="compare-challenge-pill${isActive ? ' active' : ''}" onclick="window._setCompareChallenge('${c.id}')">
          <span>${icon}</span>
          <span>${esc(c.title)}</span>
          <span class="compare-challenge-pill-count">${qCount}</span>
        </button>
      `;
    }).join('');

    // User Selection Cards
    const otherUsers = users.filter(u => u.id !== activeUser.id);
    const selectorHtml = otherUsers.map(u => {
      const uAnswers = storage.getChallengeAnswers(selectedChallengeId, u.id);
      const uCount = Object.keys(uAnswers).length;
      const totalQ = questions.length || 1;
      const affinityData = storage.calculateMusicalAffinity(activeUser.id, u.id);
      const isSelected = compareUserId === u.id;

      const affinityMarkup = affinityData.hasEnoughData
        ? `<span class="compare-user-affinity-badge" title="${affinityData.sharedArtists.length} artistas em comum">${ICONS.sparkles} ${affinityData.percentage}% sintonia</span>`
        : `<span style="font-size:0.66rem;color:var(--muted);">Calculando sintonia...</span>`;

      return `
        <div class="compare-user-card${isSelected ? ' selected' : ''}" onclick="window._setCompareUser('${u.id}')">
          ${getAvatarMarkup(u, 40)}
          <div class="compare-user-info">
            <div class="compare-user-name">${esc(u.name)}</div>
            <div class="compare-user-handle">${esc(u.handle || '')}</div>
            <div class="compare-user-meta-row">
              <span class="compare-user-prog-badge">${uCount}/${totalQ}</span>
              ${affinityMarkup}
            </div>
          </div>
          ${isSelected ? `<div style="color:var(--purple-light);display:flex;align-items:center;">${ICONS.check}</div>` : ''}
        </div>
      `;
    }).join('');

    // If no compare user
    if (!compareUser) {
      container.innerHTML = `
        <div class="compare-wrap">
          <div class="page-header">
            <div>
              <div class="page-title" style="display:flex;align-items:center;gap:8px;">
                ${ICONS.compare}
                <span>Comparar Listas</span>
              </div>
              <div class="page-sub">Selecione uma lista e um usuário para comparar respostas</div>
            </div>
          </div>
          <div class="compare-challenges-bar">${challengesPillsHtml}</div>
          <div class="compare-selector">${selectorHtml}</div>
          <div class="empty-state"><div class="empty-state-sub">Nenhum amigo encontrado para comparar.</div></div>
        </div>`;
      return;
    }

    // Compute Stats for Selected Pair
    const bothAnswered = questions.filter(q => myAnswers[q.id] && theirAnswers[q.id]);
    const myAnsweredCount = Object.keys(myAnswers).length;
    const theirAnsweredCount = Object.keys(theirAnswers).length;
    const reviewedByMe = questions.filter(q => theirAnswers[q.id] && storage.getSongReviews(compareUserId, selectedChallengeId, q.id)[activeUser.id]);
    
    // Average rating given
    let totalRatings = 0;
    let ratingCount = 0;
    reviewedByMe.forEach(q => {
      const rev = storage.getSongReviews(compareUserId, selectedChallengeId, q.id)[activeUser.id];
      if (rev && rev.rating) { totalRatings += rev.rating; ratingCount++; }
    });
    const avgRating = ratingCount > 0 ? (totalRatings / ratingCount).toFixed(1) : '—';
    const totalQ = questions.length || 1;
    const affinityData = storage.calculateMusicalAffinity(activeUser.id, compareUserId);

    // Filter questions
    let filteredQuestions = questions;
    if (activeFilter === 'both') {
      filteredQuestions = questions.filter(q => myAnswers[q.id] && theirAnswers[q.id]);
    } else if (activeFilter === 'my') {
      filteredQuestions = questions.filter(q => myAnswers[q.id]);
    } else if (activeFilter === 'theirs') {
      filteredQuestions = questions.filter(q => theirAnswers[q.id]);
    } else if (activeFilter === 'reviewed') {
      filteredQuestions = questions.filter(q => {
        const rev1 = theirAnswers[q.id] && storage.getSongReviews(compareUserId, selectedChallengeId, q.id)[activeUser.id];
        const rev2 = myAnswers[q.id] && storage.getSongReviews(activeUser.id, selectedChallengeId, q.id)[compareUserId];
        return rev1 || rev2;
      });
    }

    // Render Question Battle Cards
    const battleCardsHtml = filteredQuestions.map(q => {
      const mySong = myAnswers[q.id];
      const theirSong = theirAnswers[q.id];

      const myReview = theirSong ? storage.getSongReviews(compareUserId, selectedChallengeId, q.id)[activeUser.id] : null;
      const theirReview = mySong ? storage.getSongReviews(activeUser.id, selectedChallengeId, q.id)[compareUserId] : null;

      // My Side
      let mySideHtml = '';
      if (mySong) {
        const mySelfReview = storage.getSongReviews(activeUser.id, selectedChallengeId, q.id)[activeUser.id];
        mySideHtml = `
          <div class="compare-choice-box">
            <div class="compare-choice-header">
              <span>Sua Escolha</span>
              <span style="color:var(--purple-light);">#${q.id}</span>
            </div>
            <div class="compare-song-stage">
              <div class="compare-song-cover-wrap" onclick="window._playTrack(${jsArg(mySong)})" title="Ouvir música">
                ${mySong.artwork ? `<img src="${safeUrl(mySong.artwork)}" alt="${esc(mySong.title)}">` : '<div style="width:100%;height:100%;background:var(--purple-dark);"></div>'}
                <div class="compare-song-play-overlay">${ICONS.play}</div>
              </div>
              <div class="compare-song-details">
                <div class="compare-song-title" title="${esc(mySong.title)}">${esc(mySong.title)}</div>
                <div class="compare-song-artist" title="${esc(mySong.artist)}">${esc(mySong.artist)}</div>
              </div>
            </div>

            <!-- Self Rating / Note -->
            ${mySelfReview ? `
              <div class="compare-review-pill-btn" onclick="window._openReview('${activeUser.id}','${selectedChallengeId}','${q.id}')" title="Editar sua nota / comentário">
                <div style="display:flex;align-items:center;gap:5px;">
                  <span style="color:var(--star);display:inline-flex;align-items:center;">${ICONS.star}</span>
                  <span style="font-weight:800;color:var(--star);font-size:0.82rem;">${mySelfReview.rating.toFixed(1)}</span>
                  <span style="font-size:0.68rem;color:var(--muted);">(Sua nota)</span>
                  ${mySelfReview.comment ? `<span style="font-size:0.7rem;color:var(--white);font-style:italic;opacity:0.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;">"${esc(mySelfReview.comment)}"</span>` : ''}
                </div>
                <span style="font-size:0.68rem;color:var(--muted);display:flex;align-items:center;">${ICONS.edit}</span>
              </div>
            ` : `
              <button type="button" class="compare-rate-now-btn" style="border-style:dashed;color:var(--purple-light);border-color:var(--border);background:transparent;" onclick="window._openReview('${activeUser.id}','${selectedChallengeId}','${q.id}')">
                ${ICONS.star} <span>Dar sua nota</span>
              </button>
            `}

            <!-- Received Rating from Friend (if any) -->
            ${theirReview ? `
              <div class="compare-received-badge-pill" title="${esc(compareUser.name)}: \"${esc(theirReview.comment || '')}\"">
                <span>Nota de ${esc(compareUser.name.split(' ')[0])}:</span>
                <span style="font-weight:800;color:var(--star);display:inline-flex;align-items:center;gap:2px;">${ICONS.star} ${theirReview.rating.toFixed(1)}</span>
                ${theirReview.comment ? `<span style="font-size:0.68rem;opacity:0.8;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;">"${esc(theirReview.comment)}"</span>` : ''}
              </div>
            ` : ''}
          </div>
        `;
      } else {
        mySideHtml = `
          <div class="compare-choice-box empty">
            <div style="font-size:0.75rem;color:var(--muted);margin-bottom:6px;">Você ainda não respondeu este item</div>
            <button type="button" class="compare-add-song-btn" onclick="window._openQuestion('${selectedChallengeId}','${q.id}')">
              ${ICONS.plus} <span>Escolher Música</span>
            </button>
          </div>
        `;
      }

      // Their Side
      let theirSideHtml = '';
      if (theirSong) {
        theirSideHtml = `
          <div class="compare-choice-box">
            <div class="compare-choice-header">
              <span>${esc(compareUser.name)}</span>
              <span style="color:var(--purple-light);">#${q.id}</span>
            </div>
            <div class="compare-song-stage">
              <div class="compare-song-cover-wrap" onclick="window._playTrack(${jsArg(theirSong)})" title="Ouvir música">
                ${theirSong.artwork ? `<img src="${safeUrl(theirSong.artwork)}" alt="${esc(theirSong.title)}">` : '<div style="width:100%;height:100%;background:var(--purple-dark);"></div>'}
                <div class="compare-song-play-overlay">${ICONS.play}</div>
              </div>
              <div class="compare-song-details">
                <div class="compare-song-title" title="${esc(theirSong.title)}">${esc(theirSong.title)}</div>
                <div class="compare-song-artist" title="${esc(theirSong.artist)}">${esc(theirSong.artist)}</div>
              </div>
            </div>
            ${myReview ? `
              <div class="compare-review-pill-btn" onclick="window._openReview('${compareUserId}','${selectedChallengeId}','${q.id}')" title="Editar sua avaliação">
                <div style="display:flex;align-items:center;gap:5px;">
                  <span style="color:var(--star);display:inline-flex;align-items:center;">${ICONS.star}</span>
                  <span style="font-weight:800;color:var(--star);font-size:0.82rem;">${myReview.rating.toFixed(1)}</span>
                  ${myReview.comment ? `<span style="font-size:0.7rem;color:var(--white);font-style:italic;opacity:0.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px;">"${esc(myReview.comment)}"</span>` : ''}
                </div>
                <span style="font-size:0.68rem;color:var(--muted);display:flex;align-items:center;">${ICONS.edit}</span>
              </div>
            ` : `
              <button type="button" class="compare-rate-now-btn" onclick="window._openReview('${compareUserId}','${selectedChallengeId}','${q.id}')">
                ${ICONS.star} <span>Avaliar Música</span>
              </button>
            `}
          </div>
        `;
      } else {
        theirSideHtml = `
          <div class="compare-choice-box empty">
            <div style="font-size:0.75rem;color:var(--muted);">${esc(compareUser.name)} ainda não respondeu este item</div>
          </div>
        `;
      }

      return `
        <div class="compare-battle-card">
          <div class="compare-q-header">
            <div class="compare-q-title-wrap">
              <span class="compare-q-badge">DIA ${q.id}</span>
              <div>
                <div class="compare-q-title">${esc(q.title)}</div>
                ${q.subtitle ? `<div class="compare-q-sub">${esc(q.subtitle)}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="compare-q-grid">
            ${mySideHtml}
            ${theirSideHtml}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="compare-wrap">
        <!-- Page Header -->
        <div class="page-header" style="margin-bottom:0;">
          <div>
            <div class="page-title" style="display:flex;align-items:center;gap:8px;">
              ${ICONS.compare}
              <span>Comparar Listas & Desafios</span>
            </div>
            <div class="page-sub">Escolha uma lista musical e um usuário para comparar respostas e avaliar escolhas</div>
          </div>
        </div>

        <!-- Challenge Selection Pills -->
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label class="form-label" style="font-size:0.74rem;color:var(--muted);">Desafio</label>
          <div class="compare-challenges-bar">${challengesPillsHtml}</div>
        </div>

        <!-- Friends Selection Grid -->
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label class="form-label" style="font-size:0.74rem;color:var(--muted);">Comparar com</label>
          <div class="compare-selector">${selectorHtml}</div>
        </div>

        <!-- Matchup Insights Header -->
        <div class="compare-battle-header">
          <div class="battle-pair-col">
            <div class="battle-avatars-wrap">
              ${getAvatarMarkup(activeUser, 44)}
              <div class="battle-avatar-item target">
                ${isImageAvatar(compareUser.avatar)
                  ? `<img src="${safeUrl(compareUser.avatar)}" alt="${esc(compareUser.name)}">`
                  : `<span>${esc(compareUser.avatar || compareUser.name?.[0] || 'U')}</span>`}
              </div>
            </div>
            <div>
              <div style="font-size:0.9rem;font-weight:700;color:var(--white);display:flex;align-items:center;gap:6px;">
                <span>Você</span>
                <span style="color:var(--purple-light);">${ICONS.compare}</span>
                <span>${esc(compareUser.name)}</span>
              </div>
              ${affinityData.hasEnoughData ? `
                <div style="font-size:0.74rem;color:var(--purple-light);font-weight:600;display:flex;align-items:center;gap:5px;margin-top:2px;">
                  ${ICONS.fire}
                  <span>${affinityData.percentage}% de Sintonia Musical</span>
                </div>
                <div style="font-size:0.68rem;color:var(--muted);margin-top:1px;">
                  ${affinityData.sharedArtists.length > 0
                    ? `Artistas em comum: ${affinityData.sharedArtists.map(a => a.charAt(0).toUpperCase() + a.slice(1)).slice(0, 3).join(', ')}${affinityData.sharedArtists.length > 3 ? '...' : ''}`
                    : (affinityData.sharedGenres.length > 0 ? `Gêneros compatíveis: ${affinityData.sharedGenres.slice(0, 2).join(', ')}` : 'Calculado por histórico e respostas')}
                </div>
              ` : `
                <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;">
                  <span>Respondam mais músicas para calcular a sintonia</span>
                </div>
              `}
            </div>
          </div>

          <div class="battle-stats-row">
            <div class="battle-stat-chip">
              <span class="battle-stat-value">${bothAnswered.length}</span>
              <span class="battle-stat-label">Em Comum</span>
            </div>
            <div class="battle-stat-chip">
              <span class="battle-stat-value" style="color:var(--star);">${ICONS.star} ${avgRating}</span>
              <span class="battle-stat-label">Média Notas</span>
            </div>
            <div class="battle-stat-chip">
              <span class="battle-stat-value">${myAnsweredCount}/${totalQ}</span>
              <span class="battle-stat-label">Suas</span>
            </div>
            <div class="battle-stat-chip">
              <span class="battle-stat-value">${theirAnsweredCount}/${totalQ}</span>
              <span class="battle-stat-label">${esc(compareUser.name.split(' ')[0])}</span>
            </div>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="compare-filter-bar">
          <button type="button" class="compare-filter-btn${activeFilter === 'all' ? ' active' : ''}" onclick="window._setCompareFilter('all')">
            Todas (${questions.length})
          </button>
          <button type="button" class="compare-filter-btn${activeFilter === 'both' ? ' active' : ''}" onclick="window._setCompareFilter('both')">
            Ambos Responderam (${bothAnswered.length})
          </button>
          <button type="button" class="compare-filter-btn${activeFilter === 'my' ? ' active' : ''}" onclick="window._setCompareFilter('my')">
            Apenas Você (${myAnsweredCount})
          </button>
          <button type="button" class="compare-filter-btn${activeFilter === 'theirs' ? ' active' : ''}" onclick="window._setCompareFilter('theirs')">
            Apenas ${esc(compareUser.name.split(' ')[0])} (${theirAnsweredCount})
          </button>
          <button type="button" class="compare-filter-btn${activeFilter === 'reviewed' ? ' active' : ''}" onclick="window._setCompareFilter('reviewed')">
            Avaliadas (${reviewedByMe.length})
          </button>
        </div>

        <!-- Questions Battle Cards List -->
        <div class="compare-battle-list">
          ${battleCardsHtml || '<div style="padding:32px 20px;text-align:center;color:var(--muted);background:var(--bg-card);border-radius:8px;">Nenhuma música encontrada com este filtro.</div>'}
        </div>
      </div>
    `;
  }

  // Global window handlers for interaction
  window._setCompareChallenge = (cId) => {
    selectedChallengeId = cId;
    buildHtml();
  };

  window._setCompareUser = (uId) => {
    compareUserId = uId;
    buildHtml();
  };

  window._setCompareFilter = (filterKey) => {
    activeFilter = filterKey;
    buildHtml();
  };

  window._refreshCompareView = () => {
    buildHtml();
  };

  buildHtml();
}

window._openReview = (targetUserId, challengeId, questionId) => {
  renderReviewModal(targetUserId, challengeId, questionId);
};

// ──────────────────────────────────────────
// REVIEW MODAL
// ──────────────────────────────────────────

function renderReviewModal(targetUserId, challengeId, questionId) {
  const activeUser = storage.getActiveUser();
  const isSelf = targetUserId === activeUser.id;
  const targetUser = storage.getUserById(targetUserId);
  const challenge = storage.getAllChallenges().find(c => c.id === challengeId);
  const qObj = challenge?.questions?.find(q => String(q.id) === String(questionId));
  const ans = storage.getChallengeAnswers(challengeId, targetUserId)[questionId];
  const existingReview = storage.getSongReviews(targetUserId, challengeId, questionId)[activeUser.id];

  let currentReviewRating = existingReview?.rating || (ans?.rating || 4.5);

  const modal = document.getElementById('review-modal');
  if (!modal) return;

  const renderModalContent = () => {
    modal.querySelector('.modal-header h3').textContent = isSelf ? `Minha Nota: ${ans?.title || 'Música'}` : `Avaliar: ${ans?.title || 'Música'}`;
    modal.querySelector('.modal-body').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${ans ? `
          <div style="display:flex;gap:12px;align-items:center;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:12px;">
            ${ans.artwork ? `<img src="${safeUrl(ans.artwork)}" style="width:52px;height:52px;border-radius:8px;object-fit:cover;flex-shrink:0;">` : ''}
            <div style="flex:1;min-width:0;">
              <div style="font-weight:800;font-size:0.95rem;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ans.title)}</div>
              <div style="font-size:0.8rem;color:var(--purple-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ans.artist)}</div>
              <div style="font-size:0.74rem;color:var(--muted);margin-top:2px;">
                ${isSelf ? `Sua escolha para: <strong>${esc(qObj?.title || 'este item')}</strong>` : `Resposta de <strong>${esc(targetUser?.name || 'Usuário')}</strong>`}
              </div>
            </div>
            <button type="button" class="doodle-btn doodle-btn-primary doodle-btn-sm" style="width:34px;height:34px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;" onclick="window._playTrack(${jsArg(ans)})" title="Ouvir música">
              ${ICONS.play}
            </button>
          </div>` : ''}

        <!-- Rating Box -->
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <label class="form-label" style="font-weight:700;color:var(--white);margin:0;font-size:0.88rem;">${isSelf ? 'Sua Nota Pessoal:' : 'Sua Nota para a Música:'}</label>
            <span style="font-size:0.88rem;font-weight:800;color:var(--star);background:color-mix(in srgb, var(--star) 12%, transparent);border:1px solid color-mix(in srgb, var(--star) 30%, transparent);padding:2px 10px;border-radius:12px;display:inline-flex;align-items:center;gap:4px;">
              ${ICONS.star} ${currentReviewRating.toFixed(1)}
            </span>
          </div>

          <!-- Interactive 5 Stars with Half-Star Click Zones -->
          <div id="review-stars-row" style="display:flex;gap:8px;align-items:center;justify-content:center;padding:8px 0;">
            ${[1, 2, 3, 4, 5].map(n => {
              const fill = currentReviewRating >= n ? 1 : (currentReviewRating >= n - 0.5 ? 0.5 : 0);
              return `
                <div style="position:relative;display:inline-block;cursor:pointer;line-height:0;transition:transform 0.15s ease;" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'" title="Nota ${n}">
                  ${getStarSVG(fill, 32)}
                  <div onclick="window._setReviewRating(${n - 0.5})" style="position:absolute;top:0;left:0;width:50%;height:100%;z-index:2;" title="Nota ${n - 0.5}"></div>
                  <div onclick="window._setReviewRating(${n})" style="position:absolute;top:0;right:0;width:50%;height:100%;z-index:2;" title="Nota ${n}.0"></div>
                </div>`;
            }).join('')}
          </div>

          <!-- Quick Rating Presets -->
          <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;justify-content:center;margin-top:8px;">
            ${[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0].map(p => `
              <button type="button" onclick="window._setReviewRating(${p})" style="padding:3px 8px;font-size:0.74rem;font-weight:700;background:${currentReviewRating === p ? 'color-mix(in srgb, var(--star) 25%, transparent)' : 'var(--bg-input)'};border:1.5px solid ${currentReviewRating === p ? 'var(--star)' : 'var(--border)'};color:${currentReviewRating === p ? 'var(--star)' : 'var(--muted)'};border-radius:6px;cursor:pointer;transition:all 0.15s ease;">
                ${p.toFixed(1)}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Non-resizable Fixed Textarea -->
        <div>
          <label class="form-label" style="font-weight:700;color:var(--white);margin-bottom:6px;display:block;">Opinião / Comentário (opcional):</label>
          <textarea id="review-comment" class="doodle-input" rows="3" placeholder="O que você achou da escolha desta música..." style="resize:none !important;width:100% !important;box-sizing:border-box !important;min-height:80px !important;max-height:80px !important;font-size:0.86rem;padding:8px 12px;border-radius:8px;line-height:1.4;">${esc(existingReview?.comment || '')}</textarea>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">
          <button class="doodle-btn doodle-btn-secondary" onclick="closeDoodleModal('review-modal')">Cancelar</button>
          <button class="doodle-btn doodle-btn-primary" onclick="window._submitReview('${targetUserId}','${challengeId}','${questionId}')">Salvar Avaliação</button>
        </div>
      </div>`;
  };

  window._setReviewRating = (val) => {
    currentReviewRating = val;
    renderModalContent();
  };

  window._submitReview = (tUserId, cId, qId) => {
    const comment = document.getElementById('review-comment')?.value || '';
    storage.saveSongReview(tUserId, cId, qId, currentReviewRating, comment, ans);
    closeDoodleModal('review-modal');
    showToast(`Avaliação salva: ${currentReviewRating.toFixed(1)} estrelas`);
    const compareContainer = document.getElementById('compare-view-content');
    if (compareContainer) renderCompareView(compareContainer);
    const challengeGrid = document.getElementById('musicask-grid');
    if (challengeGrid) renderMusicAskGrid(challengeGrid, cId, tUserId);
  };

  renderModalContent();
  openDoodleModal('review-modal');
}

// ──────────────────────────────────────────
// CHALLENGE PILLS
// ──────────────────────────────────────────

export function renderChallengePills(container, onSwitch) {
  const all = storage.getAllChallenges();
  const activeId = storage.getActiveChallengeId();

  container.innerHTML = all.map(c => `
    <button class="pill-btn${c.id === activeId ? ' active' : ''}" onclick="window._switchChallenge('${c.id}')">
      ${esc(c.title)}
    </button>`).join('') + `
    <button class="pill-btn" onclick="window._openCreateChallenge()">
      + Novo Desafio
    </button>`;

  window._switchChallenge = (id) => {
    storage.setActiveChallengeId(id);
    if (onSwitch) onSwitch(id);
    renderChallengePills(container, onSwitch);
  };
}

// ──────────────────────────────────────────
// CREATE CHALLENGE MODAL
// ──────────────────────────────────────────

window._openCreateChallenge = () => {
  const modal = document.getElementById('create-challenge-modal');
  if (!modal) return;
  modal.querySelector('.modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div>
        <label class="form-label">Nome do Desafio</label>
        <input id="new-challenge-title" class="doodle-input" placeholder="Ex: Minhas 20 Favoritas">
      </div>
      <div>
        <label class="form-label">Descrição</label>
        <input id="new-challenge-desc" class="doodle-input" placeholder="Opcional...">
      </div>
      <div>
        <label class="form-label">Perguntas (uma por linha)</label>
        <textarea id="new-challenge-questions" class="doodle-input" rows="8" placeholder="Uma música que te faz dançar&#10;Uma música de infância&#10;..."></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="doodle-btn doodle-btn-ghost" onclick="closeDoodleModal('create-challenge-modal')">Cancelar</button>
        <button class="doodle-btn doodle-btn-primary" onclick="window._submitNewChallenge()">Criar Desafio</button>
      </div>
    </div>`;
  openDoodleModal('create-challenge-modal');
};

window._submitNewChallenge = () => {
  const title = document.getElementById('new-challenge-title')?.value?.trim();
  const desc  = document.getElementById('new-challenge-desc')?.value?.trim();
  const rawQ  = document.getElementById('new-challenge-questions')?.value || '';
  const lines = rawQ.split('\n').map(l => l.trim()).filter(Boolean);

  if (!title || !lines.length) {
    showToast('Preencha o nome e pelo menos uma pergunta.');
    return;
  }

  const questions = lines.map((t, i) => ({ id: i + 1, title: t, subtitle: '', category: 'Música' }));
  storage.createCustomChallenge(title, desc, questions);
  closeDoodleModal('create-challenge-modal');
  showToast('Desafio criado!');
  window._refreshChallenges?.();
};

// ──────────────────────────────────────────
// NOTIFICATIONS PANEL
// ──────────────────────────────────────────

export function renderNotificationsPanel(container) {
  const notifs = storage.getMyNotifications();
  storage.markNotificationsRead();

  if (!notifs.length) {
    container.innerHTML = `<div class="notif-empty">Sem notificações ainda.</div>`;
    return;
  }

  container.innerHTML = notifs.map(n => {
    const fromUser = storage.getUserById(n.fromUserId);
    const isImg = fromUser?.avatar && (isImageAvatar(fromUser.avatar));
    const avatarHtml = isImg
      ? `<img src="${safeUrl(fromUser.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : esc(fromUser?.avatar || fromUser?.name?.[0] || '?');
    const timeAgo = new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="notif-item${!n.read ? ' unread' : ''}">
        <div class="notif-avatar" style="overflow:hidden;">${avatarHtml}</div>
        <div>
          <div class="notif-text"><strong>${esc(n.fromName || 'Alguém')}</strong> ${esc(n.text)}</div>
          <div class="notif-time">${esc(timeAgo)}</div>
        </div>
      </div>`;
  }).join('');
}

// ──────────────────────────────────────────
// GLOBAL SEARCH (users + music)
// ──────────────────────────────────────────

// ──────────────────────────────────────────
// PLAYER BAR RENDER
// ──────────────────────────────────────────

export function renderPlayerBar() {
  const bar = document.getElementById('player-bar');
  if (!bar) return;

  bar.innerHTML = `
    <div class="player-track-info">
      <img class="player-cover" id="player-cover" src="" alt="" style="display:none;" onerror="this.style.display='none'">
      <div class="player-text">
        <div class="player-title" id="player-title">Nenhuma faixa</div>
        <div class="player-artist" id="player-artist">—</div>
      </div>
    </div>
    <div class="player-controls">
      <button class="player-play-btn" id="player-play-btn" onclick="window._togglePlayerPlay()" title="Reproduzir / Pausar">
        ${ICONS.play}
      </button>
    </div>
    <div class="player-progress">
      <span class="player-time" id="player-time-cur">0:00</span>
      <div class="progress-track" onclick="window._seekPlayer(event)" title="Avançar / Retroceder" role="slider" aria-label="Posição da faixa" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="player-progress-track">
        <div class="progress-fill" id="player-progress-fill"></div>
      </div>
      <span class="player-time" id="player-time-dur">0:00</span>
    </div>
    <div class="player-vol-container">
      <button class="player-vol-btn" id="player-vol-btn" onclick="window._toggleMute()" title="Mutar / Desmutar som">
        <svg id="player-vol-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
      </button>
      <div class="player-vol-bar-wrapper">
        <input type="range" class="player-vol-slider" id="player-vol-slider" min="0" max="1" step="0.01" value="0.8"
          oninput="window._setPlayerVolume(parseFloat(this.value))">
        <div class="player-vol-fill" id="player-vol-fill" style="width:80%;"></div>
      </div>
      <span class="player-vol-pct" id="player-vol-pct">80%</span>
    </div>`;

  let lastNonZeroVolume = 0.8;

  window._setPlayerVolume = (val) => {
    globalAudio.setVolume(val);
    if (val > 0) lastNonZeroVolume = val;
    updateVolumeUI(val);
  };

  window._toggleMute = () => {
    const current = globalAudio.volume || 0;
    if (current > 0) {
      lastNonZeroVolume = current;
      globalAudio.setVolume(0);
      updateVolumeUI(0);
    } else {
      const restore = lastNonZeroVolume || 0.8;
      globalAudio.setVolume(restore);
      updateVolumeUI(restore);
    }
  };

  function updateVolumeUI(val) {
    const fill = document.getElementById('player-vol-fill');
    const slider = document.getElementById('player-vol-slider');
    const pctEl = document.getElementById('player-vol-pct');
    const iconEl = document.getElementById('player-vol-icon');

    if (fill) fill.style.width = `${Math.round(val * 100)}%`;
    if (slider) slider.value = val;
    if (pctEl) pctEl.textContent = `${Math.round(val * 100)}%`;

    if (iconEl) {
      if (val === 0) {
        iconEl.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>`;
      } else if (val < 0.5) {
        iconEl.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;
      } else {
        iconEl.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;
      }
    }
  }

  // Subscribe to audio events via globalAudio.subscribe(callback)
  globalAudio.subscribe((event, data) => {
    if (event === 'trackchange') {
      document.getElementById('player-bar')?.classList.toggle('has-track', Boolean(data));
      const coverEl = document.getElementById('player-cover');
      const titleEl = document.getElementById('player-title');
      const artistEl = document.getElementById('player-artist');
      const btnEl = document.getElementById('player-play-btn');
      if (coverEl) { coverEl.src = data.artwork || ''; coverEl.style.display = data.artwork ? 'block' : 'none'; }
      if (titleEl) titleEl.textContent = data.title || 'Sem título';
      if (artistEl) artistEl.textContent = data.artist || '—';
      if (btnEl) btnEl.innerHTML = ICONS.pause;
    }
    if (event === 'play') {
      const btn = document.getElementById('player-play-btn');
      if (btn) btn.innerHTML = ICONS.pause;
      document.getElementById('featured-vinyl-img')?.classList.add('playing');
    }
    if (event === 'pause') {
      const btn = document.getElementById('player-play-btn');
      if (btn) btn.innerHTML = ICONS.play;
      document.getElementById('featured-vinyl-img')?.classList.remove('playing');
    }
    if (event === 'error') {
      const btn = document.getElementById('player-play-btn');
      if (btn) btn.innerHTML = ICONS.play;
      document.getElementById('featured-vinyl-img')?.classList.remove('playing');
      showToast(data?.message || 'Não foi possível reproduzir esta música.');
    }
    if (event === 'buffering') {
      document.getElementById('player-bar')?.classList.toggle('buffering', Boolean(data));
    }
    if (event === 'timeupdate') {
      const pct = data.progress || 0;
      const fill = document.getElementById('player-progress-fill');
      const curEl = document.getElementById('player-time-cur');
      const durEl = document.getElementById('player-time-dur');
      if (fill) fill.style.setProperty('--p', pct + '%');
      document.getElementById('player-progress-track')?.setAttribute('aria-valuenow', Math.round(pct));
      if (curEl) curEl.textContent = data.formattedCurrentTime || '0:00';
      if (durEl) durEl.textContent = data.formattedDuration || '0:00';
    }
  });
}

