// UI Controller — modals, search, music ask grid, compare, notifications, global search
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
  if (titleEl) titleEl.innerHTML = `Item ${q ? q.id : ''}: ${q ? q.title : 'Buscar Música'}`;
  if (noteRow) noteRow.style.display = 'block';

  resetSearchModal();
  openDoodleModal('search-modal');
}

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

async function performSearch(query) {
  const container = document.getElementById('search-results');
  if (!container || !query) return;

  container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted)">Buscando...</div>`;

  try {
    const tracks = await searchTracks(query);
    if (!tracks || !tracks.length) {
      container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted)">Nenhuma música encontrada.</div>`;
      return;
    }

    container.innerHTML = tracks.map(t => `
      <div class="search-result-item" onclick="window._selectTrackFromModal(${JSON.stringify(t).replace(/"/g, '&quot;')})">
        <img class="search-result-cover" src="${t.artwork}" alt="${t.title}" onerror="this.style.display='none'">
        <div>
          <div class="search-result-title">${t.title}</div>
          <div class="search-result-artist">${t.artist} &bull; ${t.duration}</div>
        </div>
        ${t.previewUrl ? `<button style="background:transparent;border:none;color:var(--purple-light);cursor:pointer;padding:4px;" onclick="event.stopPropagation();window._previewTrack(${JSON.stringify(t).replace(/"/g, '&quot;')})">
          ${ICONS.play}
        </button>` : ''}
      </div>`).join('');
  } catch (e) {
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
    const { attachSongToDM } = import('./chat.js').then(m => m.attachSongToDM(track));

  } else if (target.type === 'showcase') {
    const ok = storage.addToShowcase(track);
    showToast(ok ? `Adicionado à vitrine: ${track.title}` : 'Vitrine cheia (máx. 5)');
    window._refreshProfile?.();
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
    return `
      <div class="q-card${hasAns ? ' answered' : ''}" onclick="${isMe ? `window._openQuestion('${cid}',${q.id})` : ''}">
        <div class="q-card-cover">
          ${hasAns && ans.artwork ? `<img src="${ans.artwork}" alt="${ans.title}" loading="lazy">` : `<span style="font-size:1.8rem;color:var(--dimmed)">♪</span>`}
        </div>
        ${hasAns ? `<div class="q-card-answered-badge">ok</div>` : ''}
        <div class="q-card-info">
          <div class="q-number">${q.id}.</div>
          <div class="q-title">${q.title}</div>
          ${hasAns ? `<div style="font-size:0.72rem;color:var(--white);font-weight:700">${ans.title}</div>
                      <div style="font-size:0.65rem;color:var(--muted)">${ans.artist}</div>` : ''}
        </div>
        ${hasAns && isMe ? `
          <div class="q-card-actions">
            <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="event.stopPropagation();window._postAnswer('${cid}',${q.id})" title="Postar no feed">
              ${ICONS.feed}
            </button>
            <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="event.stopPropagation();window._playTrack(${JSON.stringify(ans).replace(/"/g, '&quot;')})" title="Preview">
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
// COMPARE VIEW
// ──────────────────────────────────────────

export function renderCompareView(container) {
  const users = storage.getAllUsers();
  const activeUser = storage.getActiveUser();
  const challenge = storage.getActiveChallenge();
  const questions = challenge.questions || [];

  let compareUserId = users.find(u => u.id !== activeUser.id)?.id;

  function buildHtml() {
    const compareUser = storage.getUserById(compareUserId);
    const myAnswers = storage.getChallengeAnswers(challenge.id, activeUser.id);
    const theirAnswers = storage.getChallengeAnswers(challenge.id, compareUserId);
    const answered = questions.filter(q => myAnswers[q.id] || theirAnswers[q.id]);

    const selectorHtml = users
      .filter(u => u.id !== activeUser.id)
      .map(u => `
        <div class="compare-user-card${compareUserId === u.id ? ' selected' : ''}" onclick="compareUserId='${u.id}';buildHtml();">
          <div class="compare-user-avatar">${u.avatar || u.name[0]}</div>
          <div style="font-size:0.82rem;font-weight:700;color:var(--white)">${u.name}</div>
          <div style="font-size:0.7rem;color:var(--muted)">${u.handle || ''}</div>
        </div>`).join('');

    const rowsHtml = answered.map(q => {
      const my = myAnswers[q.id];
      const their = theirAnswers[q.id];
      const myReview = storage.getSongReviews(activeUser.id, challenge.id, q.id)[compareUserId];
      const theirReview = storage.getSongReviews(compareUserId, challenge.id, q.id)[activeUser.id];

      const cell = (ans) => !ans ? `<div class="compare-song-cell"><span style="color:var(--dimmed);font-size:0.75rem">—</span></div>` : `
        <div class="compare-song-cell" style="cursor:pointer" onclick="window._playTrack(${JSON.stringify(ans).replace(/"/g, '&quot;')})">
          ${ans.artwork ? `<img class="compare-song-cover" src="${ans.artwork}" alt="">` : '<div class="compare-song-cover" style="background:var(--purple-dark);"></div>'}
          <div class="compare-song-title">${ans.title}</div>
          <div class="compare-song-artist">${ans.artist}</div>
        </div>`;

      const reviewBtnMy = their ? `
        <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._openReview('${compareUserId}','${challenge.id}','${q.id}')">
          ${myReview ? renderRatingStars(myReview.rating, 16) : '+ Avaliar'}
        </button>` : '';

      return `
        <div class="compare-row">
          <div class="compare-question-label">${q.id}. ${q.title.length > 30 ? q.title.slice(0,28)+'…' : q.title}</div>
          ${cell(my)}
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            ${cell(their)}
            ${reviewBtnMy}
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="compare-wrap">
        <div class="page-header">
          <div>
            <div class="page-title">Comparar Listas</div>
            <div class="page-sub">Compare suas escolhas com as de outros</div>
          </div>
        </div>
        <div class="compare-selector">${selectorHtml}</div>
        ${!compareUser ? '<div class="empty-state"><div class="empty-state-sub">Selecione um usuário para comparar.</div></div>' : `
          <div class="compare-table">
            <div class="compare-table-header">
              <span>Pergunta</span>
              <span>${activeUser.name}</span>
              <span>${compareUser.name}</span>
            </div>
            ${rowsHtml || '<div style="padding:20px;text-align:center;color:var(--muted)">Sem respostas para comparar.</div>'}
          </div>`}
      </div>`;

    // rebind the onclick for selector cards
    container.querySelectorAll('.compare-user-card').forEach(card => {
      const uid = card.querySelector('.compare-user-avatar') ? users.find(u => card.textContent.includes(u.name))?.id : null;
    });
  }

  // Expose buildHtml so inline onclick works
  window.buildHtml = buildHtml;
  buildHtml();
}

window._openReview = (targetUserId, challengeId, questionId) => {
  renderReviewModal(targetUserId, challengeId, questionId);
};

// ──────────────────────────────────────────
// REVIEW MODAL
// ──────────────────────────────────────────

function renderReviewModal(targetUserId, challengeId, questionId) {
  const targetUser = storage.getUserById(targetUserId);
  const challenge = storage.getAllChallenges().find(c => c.id === challengeId);
  const q = challenge?.questions?.find(q2 => String(q2.id) === String(questionId));
  const ans = storage.getChallengeAnswers(challengeId, targetUserId)[questionId];
  const existingReview = storage.getSongReviews(targetUserId, challengeId, questionId)[storage.getActiveUserId()];

  currentReviewRating = existingReview?.rating || 4.0;

  const modal = document.getElementById('review-modal');
  if (!modal) return;

  modal.querySelector('.modal-header h3').textContent = `Avaliar: ${ans?.title || 'Música'}`;
  modal.querySelector('.modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${ans ? `
        <div style="display:flex;gap:10px;align-items:center;background:var(--bg-input);border:var(--border);border-radius:10px;padding:10px;">
          ${ans.artwork ? `<img src="${ans.artwork}" style="width:50px;height:50px;border-radius:8px;object-fit:cover;">` : ''}
          <div>
            <div style="font-weight:700;color:var(--white)">${ans.title}</div>
            <div style="font-size:0.78rem;color:var(--muted)">${ans.artist}</div>
            <div style="font-size:0.72rem;color:var(--muted)">Lista de ${targetUser?.name}</div>
          </div>
        </div>` : ''}
      <div>
        <label class="form-label">Nota (${currentReviewRating.toFixed(1)})</label>
        <div id="review-stars" style="display:flex;gap:4px;padding:6px 0;">
          ${renderReviewStars(currentReviewRating)}
        </div>
      </div>
      <div>
        <label class="form-label">Opinião (opcional)</label>
        <textarea id="review-comment" class="doodle-input" rows="3" placeholder="O que você acha desta música...">${existingReview?.comment || ''}</textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="doodle-btn doodle-btn-ghost" onclick="closeDoodleModal('review-modal')">Cancelar</button>
        <button class="doodle-btn doodle-btn-primary" onclick="window._submitReview('${targetUserId}','${challengeId}','${questionId}')">Enviar Avaliação</button>
      </div>
    </div>`;

  openDoodleModal('review-modal');
}

function renderReviewStars(rating) {
  return [1,2,3,4,5].map(n => `
    <button style="background:transparent;border:none;cursor:pointer;display:flex;align-items:center;gap:0;"
      onclick="window._setReviewRating(${n})" onmouseover="window._hoverReviewStar(${n})" onmouseout="window._hoverReviewStar(0)">
      ${getStarSVG(rating >= n ? 1 : rating >= n - 0.5 ? 0.5 : 0, 30)}
    </button>
    <button style="background:transparent;border:none;cursor:pointer;margin-left:-26px;clip-path:inset(0 50% 0 0);opacity:0.7;"
      onclick="window._setReviewRating(${n - 0.5})">
      ${getStarSVG(rating >= n - 0.5 ? 0.5 : 0, 30)}
    </button>`).join('');
}

window._setReviewRating = (val) => {
  currentReviewRating = val;
  const starsEl = document.getElementById('review-stars');
  if (starsEl) starsEl.innerHTML = renderReviewStars(val);
};

window._hoverReviewStar = () => {};

window._submitReview = (targetUserId, challengeId, questionId) => {
  const comment = document.getElementById('review-comment')?.value || '';
  storage.saveSongReview(targetUserId, challengeId, questionId, currentReviewRating, comment);
  closeDoodleModal('review-modal');
  showToast(`Avaliação enviada: ${currentReviewRating.toFixed(1)} estrelas`);
  // Re-render compare
  const compareContainer = document.getElementById('compare-view-content');
  if (compareContainer) renderCompareView(compareContainer);
};

// ──────────────────────────────────────────
// CHALLENGE PILLS
// ──────────────────────────────────────────

export function renderChallengePills(container, onSwitch) {
  const all = storage.getAllChallenges();
  const activeId = storage.getActiveChallengeId();

  container.innerHTML = all.map(c => `
    <button class="pill-btn${c.id === activeId ? ' active' : ''}" onclick="window._switchChallenge('${c.id}')">
      ${c.title}
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
    const isImg = fromUser?.avatar && (fromUser.avatar.startsWith('http') || fromUser.avatar.startsWith('data:') || fromUser.avatar.startsWith('/'));
    const avatarHtml = isImg
      ? `<img src="${fromUser.avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : (fromUser?.avatar || fromUser?.name?.[0] || '?');
    const timeAgo = new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="notif-item${!n.read ? ' unread' : ''}">
        <div class="notif-avatar" style="overflow:hidden;">${avatarHtml}</div>
        <div>
          <div class="notif-text"><strong>${n.fromName || 'Alguém'}</strong> ${n.text}</div>
          <div class="notif-time">${timeAgo}</div>
        </div>
      </div>`;
  }).join('');
}

// ──────────────────────────────────────────
// GLOBAL SEARCH (users + music)
// ──────────────────────────────────────────

export function initGlobalSearch() {
  const input = document.getElementById('global-search-input');
  if (!input) return;

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    const resultsEl = document.getElementById('global-search-results');
    if (!resultsEl) return;
    if (q.length < 2) { resultsEl.innerHTML = ''; return; }

    timer = setTimeout(async () => {
      // Search users
      const allUsers = storage.getAllUsers();
      const matchedUsers = allUsers.filter(u =>
        u.name.toLowerCase().includes(q.toLowerCase()) ||
        (u.handle || '').toLowerCase().includes(q.toLowerCase())
      );

      let html = '';
      if (matchedUsers.length) {
        html += `<div style="font-size:0.72rem;color:var(--muted);padding:6px 12px;border-bottom:var(--border)">Usuários</div>`;
        html += matchedUsers.map(u => {
          const isUImg = u.avatar && (u.avatar.startsWith('http') || u.avatar.startsWith('data:') || u.avatar.startsWith('/'));
          const uAvHtml = isUImg
            ? `<img src="${u.avatar}" alt="${u.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : (u.avatar || u.name[0]);
          return `
            <div class="search-result-item" onclick="window._goToProfile('${u.id}')">
              <div class="post-author-avatar" style="width:32px;height:32px;font-size:13px;border-radius:50%;background:var(--purple-dark);color:var(--purple-light);display:flex;align-items:center;justify-content:center;font-weight:700;overflow:hidden;">${uAvHtml}</div>
              <div>
                <div class="search-result-title">${u.name}</div>
                <div class="search-result-artist">${u.handle || ''}</div>
              </div>
            </div>`;
        }).join('');
      }

      // Search tracks (iTunes)
      try {
        const tracks = await searchTracks(q);
        if (tracks?.length) {
          html += `<div style="font-size:0.72rem;color:var(--muted);padding:6px 12px;border-bottom:var(--border)">Músicas</div>`;
          html += tracks.slice(0, 4).map(t => `
            <div class="search-result-item" onclick="window._playTrack(${JSON.stringify(t).replace(/"/g, '&quot;')})">
              <img class="search-result-cover" src="${t.artwork}" alt="" onerror="this.style.display='none'">
              <div>
                <div class="search-result-title">${t.title}</div>
                <div class="search-result-artist">${t.artist}</div>
              </div>
              ${t.previewUrl ? `<button style="background:transparent;border:none;color:var(--purple-light);cursor:pointer;padding:4px;" onclick="event.stopPropagation();window._playTrack(${JSON.stringify(t).replace(/"/g, '&quot;')})">${ICONS.play}</button>` : ''}
            </div>`).join('');
        }
      } catch {}

      resultsEl.innerHTML = html || `<div style="padding:16px;text-align:center;color:var(--muted)">Nenhum resultado.</div>`;
    }, 350);
  });
}

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
      <div class="progress-track" onclick="window._seekPlayer(event)" title="Avançar / Retroceder">
        <div class="progress-fill" id="player-progress-fill" style="width:0%"></div>
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
    if (event === 'timeupdate') {
      const pct = data.progress || 0;
      const fill = document.getElementById('player-progress-fill');
      const curEl = document.getElementById('player-time-cur');
      const durEl = document.getElementById('player-time-dur');
      if (fill) fill.style.width = pct + '%';
      if (curEl) curEl.textContent = data.formattedCurrentTime || '0:00';
      if (durEl) durEl.textContent = data.formattedDuration || '0:00';
    }
  });
}

