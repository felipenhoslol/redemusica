// Lyric picker for the composer: find the song, load its lyrics from LRCLIB (free, no key, crowdsourced),
// tap the lines to quote. Posts carry only a short excerpt (max 4 lines / 280 characters).
import { esc, safeUrl, searchKeyboard } from './dom.js';
import { ICONS } from './icons.js';
import { searchTracks } from './api.js';

export const EXCERPT_MAX_LINES = 4;
export const EXCERPT_MAX_CHARS = 280;
const cache = new Map();

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]|- (remaster|live|ao vivo|mono|stereo).*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function lrclib(params) {
  try {
    const res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams(params)}`);
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

/** Plain lyrics of a track, or '' when LRCLIB doesn't have them. */
export async function fetchLyrics(track) {
  const key = `${norm(track.artist)}|${norm(track.title)}`;
  if (cache.has(key)) return cache.get(key);
  let list = await lrclib({ track_name: track.title, artist_name: track.artist });
  if (!list.length) list = await lrclib({ q: `${track.artist} ${track.title}` });
  const seconds = (track.durationMs || 0) / 1000;
  const scored = list
    .filter(r => r.plainLyrics && !r.instrumental)
    .map(r => ({
      r,
      score: (norm(r.artistName) === norm(track.artist) ? 3 : 0)
        + (norm(r.trackName) === norm(track.title) ? 2 : 0)
        + (seconds && Math.abs((r.duration || 0) - seconds) < 4 ? 2 : 0)
        + (r.syncedLyrics ? 0.5 : 0)
    }))
    .sort((a, b) => b.score - a.score);
  const lyrics = scored[0]?.score >= 2 ? scored[0].r.plainLyrics : '';
  cache.set(key, lyrics);
  return lyrics;
}

/**
 * @param {{ track?: object, onPick: (pick: { lyrics: string, track: object }) => void, onManual: (track: object|null) => void }} opts
 */
export function openLyricPicker({ track = null, onPick, onManual }) {
  document.getElementById('lyric-dialog')?.remove();
  let song = track;
  let lines = [];        // lyric lines; '' marks a stanza break
  let sel = null;        // [start, end] line indexes, inclusive
  let results = [];
  let timer = null, seq = 0;

  const root = document.createElement('div');
  root.id = 'lyric-dialog';
  root.className = 'app-dialog';
  root.innerHTML = `
    <div class="app-dialog-scrim" data-close></div>
    <div class="app-dialog-panel lyric-picker" role="dialog" aria-modal="true" aria-labelledby="lyric-title">
      <div class="app-dialog-head">
        <button type="button" class="photo-editor-icon" data-close aria-label="Fechar">${ICONS.close}</button>
        <h2 id="lyric-title">Trecho da letra</h2>
        <button type="button" class="photo-editor-save" data-use disabled>Usar trecho</button>
      </div>
      <div class="app-dialog-body lyric-body"></div>
    </div>`;
  document.body.appendChild(root);
  const body = root.querySelector('.lyric-body');
  const useBtn = root.querySelector('[data-use]');

  const selectedLines = () => (sel ? lines.slice(sel[0], sel[1] + 1).filter(l => l.trim()) : []);
  const excerpt = () => selectedLines().join('\n');

  // ─── step 1: find the song ───
  function showSearch(q = '') {
    song = null; lines = []; sel = null;
    useBtn.disabled = true;
    body.innerHTML = `
      <p class="account-hint">Busque a música e toque nas linhas que quer postar.</p>
      <label class="search-bar">
        ${ICONS.search}
        <input type="search" placeholder="Nome da música ou artista" aria-label="Buscar música" autocomplete="off" value="${esc(q)}">
      </label>
      <div class="poll-results lyric-results" aria-live="polite"></div>
      <button type="button" class="search-see-all lyric-manual" data-manual>Prefiro escrever o trecho</button>`;
    const input = body.querySelector('input');
    const list = body.querySelector('.lyric-results');
    searchKeyboard(input, list); // list is rebuilt with each search screen, so listeners don't pile up
    const run = () => {
      clearTimeout(timer);
      const term = input.value.trim();
      const mySeq = ++seq;
      if (term.length < 2) { list.innerHTML = ''; return; }
      timer = setTimeout(async () => {
        list.innerHTML = '<p class="account-hint">Buscando…</p>';
        const found = await searchTracks(term, 10).catch(() => []);
        if (mySeq !== seq) return;
        results = found;
        list.innerHTML = found.length ? found.map((t, i) => `
          <button type="button" class="poll-row poll-row-add" data-song="${i}" aria-label="Ver a letra de ${esc(t.title)}, ${esc(t.artist)}">
            ${t.artwork ? `<img class="poll-cover" src="${safeUrl(t.artwork)}" alt="">` : '<span class="poll-cover"></span>'}
            <span class="poll-text"><span class="poll-title">${esc(t.title)}</span><span class="poll-artist">${esc(t.artist)}</span></span>
            <span class="poll-add-icon" aria-hidden="true">${ICONS.chevronRight}</span>
          </button>`).join('') : '<p class="account-hint">Nenhuma música encontrada.</p>';
      }, 300);
    };
    input.addEventListener('input', run);
    if (q) run();
    setTimeout(() => input.focus({ preventScroll: true }), 0);
  }

  // ─── step 2: pick the lines ───
  async function showLyrics(t) {
    song = t; sel = null; useBtn.disabled = true;
    body.innerHTML = `
      ${songHeader(t)}
      <p class="account-hint">Carregando a letra…</p>`;
    const text = await fetchLyrics(t);
    if (song !== t) return;
    if (!text) {
      body.innerHTML = `
        ${songHeader(t)}
        <div class="search-empty lyric-empty">
          <div class="search-empty-title">Não encontramos essa letra</div>
          <div class="search-empty-sub">O LRCLIB ainda não tem “${esc(t.title)}”. Você pode escrever o trecho e a música fica vinculada ao post.</div>
          <button type="button" class="doodle-btn doodle-btn-primary" data-manual>Escrever o trecho</button>
        </div>`;
      return;
    }
    lines = text.split('\n').map(l => l.trim()).filter((l, i, a) => l || (i > 0 && a[i - 1]));
    body.innerHTML = `
      ${songHeader(t)}
      <p class="lyric-counter" aria-live="polite"></p>
      <div class="lyric-lines" role="group" aria-label="Linhas da letra">
        ${lines.map((l, i) => l
          ? `<button type="button" class="lyric-line" data-line="${i}" aria-pressed="false">${esc(l)}</button>`
          : '<span class="lyric-gap" aria-hidden="true"></span>').join('')}
      </div>
      <p class="lyric-credit">Letra: <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>, colaborativa. Achou um erro? Ajuste o trecho depois de usar.</p>`;
    paintSelection();
  }

  const songHeader = (t) => `
    <div class="lyric-song">
      ${t.artwork ? `<img class="poll-cover" src="${safeUrl(t.artwork)}" alt="">` : '<span class="poll-cover"></span>'}
      <span class="poll-text"><span class="poll-title">${esc(t.title)}</span><span class="poll-artist">${esc(t.artist)}</span></span>
      <button type="button" class="search-see-all" data-change>Trocar música</button>
    </div>`;

  function paintSelection() {
    body.querySelectorAll('.lyric-line').forEach(b => {
      const i = Number(b.dataset.line);
      const on = Boolean(sel) && i >= sel[0] && i <= sel[1];
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const count = selectedLines().length;
    const chars = excerpt().length;
    const counter = body.querySelector('.lyric-counter');
    if (counter) {
      counter.textContent = count
        ? `${count} de ${EXCERPT_MAX_LINES} linhas · ${chars}/${EXCERPT_MAX_CHARS} caracteres`
        : `Toque nas linhas que quer postar (até ${EXCERPT_MAX_LINES}).`;
      counter.classList.remove('over');
    }
    useBtn.disabled = !count;
  }

  function toggleLine(i) {
    let next;
    if (!sel) next = [i, i];
    else if (i < sel[0]) next = [i, sel[1]];
    else if (i > sel[1]) next = [sel[0], i];
    else if (sel[0] === sel[1]) next = null;            // tapping the only line clears it
    else if (i === sel[0]) next = [i + 1, sel[1]];      // tapping an edge removes it
    else if (i === sel[1]) next = [sel[0], i - 1];
    else next = [sel[0], i];                            // tapping inside ends the excerpt there
    if (next) {
      // skip stanza breaks at the edges
      while (next[0] <= next[1] && !lines[next[0]]) next[0]++;
      while (next[1] >= next[0] && !lines[next[1]]) next[1]--;
      if (next[0] > next[1]) next = null;
    }
    if (next) {
      const picked = lines.slice(next[0], next[1] + 1).filter(l => l);
      const len = picked.join('\n').length;
      if (picked.length > EXCERPT_MAX_LINES || len > EXCERPT_MAX_CHARS) {
        const counter = body.querySelector('.lyric-counter');
        if (counter) {
          counter.textContent = `Um trecho pode ter até ${EXCERPT_MAX_LINES} linhas e ${EXCERPT_MAX_CHARS} caracteres.`;
          counter.classList.add('over');
        }
        return;
      }
    }
    sel = next;
    paintSelection();
  }

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
    else if (t.hasAttribute('data-use')) { const lyrics = excerpt(); if (lyrics) { close(); onPick({ lyrics, track: song }); } }
    else if (t.hasAttribute('data-manual')) { close(); onManual(song); }
    else if (t.hasAttribute('data-change')) showSearch(song ? `${song.artist} ${song.title}` : '');
    else if (t.dataset.song != null) showLyrics(results[Number(t.dataset.song)]);
    else if (t.dataset.line != null) toggleLine(Number(t.dataset.line));
  });

  if (song) showLyrics(song); else showSearch();
  requestAnimationFrame(() => root.classList.add('open'));
}
