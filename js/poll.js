// Song polls: a post with 2–4 songs that people vote on. Results show after voting (or to the author),
// so nobody is swayed before choosing. Votes live in post.votes ({ userId: optionIndex }) and sync via sync.js.
import { esc, safeUrl, jsArg } from './dom.js';
import { ICONS } from './icons.js';
import * as Storage from './storage.js';
import { searchTracks } from './api.js';

export const POLL_MIN = 2;
export const POLL_MAX = 4;

/** Only the fields a poll needs, so posts stay light. */
export function pollTrack(t) {
  return {
    id: String(t.id || ''), title: t.title || '', artist: t.artist || '', album: t.album || '',
    artwork: t.artwork || '', previewUrl: t.previewUrl || '', duration: t.duration || ''
  };
}

/** Markup of the voting block inside a post card. */
export function pollHtml(post) {
  const options = post.poll?.options || [];
  if (options.length < POLL_MIN) return '';
  const me = Storage.getActiveUserId();
  const votes = post.votes || {};
  const mine = Number.isInteger(votes[me]) ? votes[me] : null;
  const counts = options.map((_, i) => Object.values(votes).filter(v => v === i).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const showResults = mine !== null || post.authorId === me;
  const leader = total ? Math.max(...counts) : -1;

  return `
    <div class="post-poll${showResults ? ' show-results' : ''}" data-poll-id="${esc(post.id)}" onclick="event.stopPropagation()">
      ${options.map((t, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        const isMine = mine === i;
        return `
        <div class="poll-option${isMine ? ' mine' : ''}${showResults && counts[i] === leader && leader > 0 ? ' leading' : ''}">
          <button type="button" class="poll-vote" onclick="window._votePoll(${jsArg(post.id)}, ${i})"
            aria-pressed="${isMine}" aria-label="${isMine ? 'Tirar meu voto de' : 'Votar em'} ${esc(t.title)}, ${esc(t.artist)}${showResults ? `: ${pct}%` : ''}">
            ${showResults ? `<span class="poll-bar" style="width:${pct}%"></span>` : ''}
            ${t.artwork ? `<img class="poll-cover" src="${safeUrl(t.artwork)}" alt="" loading="lazy">` : '<span class="poll-cover"></span>'}
            <span class="poll-text"><span class="poll-title">${esc(t.title)}</span><span class="poll-artist">${esc(t.artist)}</span></span>
            ${isMine ? `<span class="poll-check" aria-hidden="true">${ICONS.check}</span>` : ''}
            ${showResults ? `<span class="poll-pct">${pct}%</span>` : ''}
          </button>
          <button type="button" class="poll-play" onclick="window._playTrack(${jsArg(t)})" aria-label="Tocar prévia de ${esc(t.title)}">${ICONS.play}</button>
        </div>`;
      }).join('')}
      <div class="poll-meta">${total === 1 ? '1 voto' : `${total} votos`} · ${mine !== null ? 'toque na sua escolha para tirar o voto' : 'toque numa música para votar'}</div>
    </div>`;
}

window._votePoll = (postId, option) => {
  const post = Storage.getPostById(postId);
  if (!post) return;
  const mine = (post.votes || {})[Storage.getActiveUserId()];
  const updated = Storage.votePoll(postId, mine === option ? null : option);
  if (!updated) return;
  document.querySelectorAll(`.post-poll[data-poll-id="${CSS.escape(postId)}"]`).forEach(el => { el.outerHTML = pollHtml(updated); });
};

/**
 * Dialog to pick the songs of a new poll.
 * @param {Array} initial already picked songs
 * @param {(options: Array) => void} onDone
 */
export function openPollBuilder(initial, onDone) {
  document.getElementById('poll-dialog')?.remove();
  let picked = (initial || []).map(pollTrack);
  let results = [];
  let timer = null;
  let seq = 0;

  const root = document.createElement('div');
  root.id = 'poll-dialog';
  root.className = 'app-dialog';
  root.innerHTML = `
    <div class="app-dialog-scrim" data-close></div>
    <div class="app-dialog-panel poll-builder" role="dialog" aria-modal="true" aria-labelledby="poll-title">
      <div class="app-dialog-head">
        <button type="button" class="photo-editor-icon" data-close aria-label="Fechar">${ICONS.close}</button>
        <h2 id="poll-title">Votação de músicas</h2>
        <button type="button" class="photo-editor-save" data-done disabled>Adicionar</button>
      </div>
      <div class="app-dialog-body">
        <p class="account-hint">Escolha de ${POLL_MIN} a ${POLL_MAX} músicas. Quem vir o post vota na favorita.</p>
        <ol class="poll-picked" aria-label="Músicas da votação"></ol>
        <label class="search-bar poll-search">
          ${ICONS.search}
          <input type="search" placeholder="Buscar música para adicionar" aria-label="Buscar música para adicionar" autocomplete="off">
        </label>
        <div class="poll-results" aria-live="polite"></div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const input = root.querySelector('input');
  const pickedEl = root.querySelector('.poll-picked');
  const resultsEl = root.querySelector('.poll-results');
  const doneBtn = root.querySelector('[data-done]');

  const row = (t, action, label) => `
    <span class="poll-row">
      ${t.artwork ? `<img class="poll-cover" src="${safeUrl(t.artwork)}" alt="">` : '<span class="poll-cover"></span>'}
      <span class="poll-text"><span class="poll-title">${esc(t.title)}</span><span class="poll-artist">${esc(t.artist)}</span></span>
      ${action}
    </span>`;

  function paint() {
    pickedEl.innerHTML = picked.length
      ? picked.map((t, i) => `<li>${row(t, `<button type="button" class="search-icon-btn" data-remove="${i}" aria-label="Remover ${esc(t.title)}">${ICONS.close}</button>`)}</li>`).join('')
      : '<li class="poll-empty">Nenhuma música ainda.</li>';
    const full = picked.length >= POLL_MAX;
    resultsEl.innerHTML = full
      ? `<p class="account-hint">Já são ${POLL_MAX} músicas, o máximo da votação.</p>`
      : results.map((t, i) => {
          // The whole row is the button: tap anywhere on the song to add it
          const already = picked.some(p => p.id === String(t.id));
          return `
            <button type="button" class="poll-row poll-row-add" data-add="${i}" ${already ? 'disabled' : ''}
              aria-label="${already ? `${esc(t.title)} já está na votação` : `Adicionar ${esc(t.title)}, ${esc(t.artist)}`}">
              ${t.artwork ? `<img class="poll-cover" src="${safeUrl(t.artwork)}" alt="">` : '<span class="poll-cover"></span>'}
              <span class="poll-text"><span class="poll-title">${esc(t.title)}</span><span class="poll-artist">${esc(t.artist)}</span></span>
              <span class="poll-add-icon" aria-hidden="true">${already ? ICONS.check : ICONS.plus}</span>
            </button>`;
        }).join('');
    doneBtn.disabled = picked.length < POLL_MIN;
    input.disabled = full;
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    const mySeq = ++seq;
    if (q.length < 2) { results = []; paint(); return; }
    timer = setTimeout(async () => {
      resultsEl.innerHTML = '<p class="account-hint">Buscando…</p>';
      const found = await searchTracks(q, 8).catch(() => []);
      if (mySeq !== seq) return;
      results = found;
      if (!found.length) { resultsEl.innerHTML = '<p class="account-hint">Nenhuma música encontrada.</p>'; return; }
      paint();
    }, 300);
  });

  const close = () => {
    document.removeEventListener('keydown', onKey);
    root.classList.remove('open');
    setTimeout(() => root.remove(), 200);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-close]');
    if (!t) return;
    if (t.hasAttribute('data-close')) close();
    else if (t.hasAttribute('data-done')) { close(); onDone(picked); }
    else if (t.dataset.remove != null) { picked.splice(Number(t.dataset.remove), 1); paint(); }
    else if (t.dataset.add != null && picked.length < POLL_MAX) { picked.push(pollTrack(results[Number(t.dataset.add)])); paint(); input.focus(); }
  });

  paint();
  requestAnimationFrame(() => { root.classList.add('open'); input.focus({ preventScroll: true }); });
}
