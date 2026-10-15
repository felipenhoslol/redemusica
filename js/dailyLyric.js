// Lyric of the day: one excerpt per calendar day, the same for everyone.
// Source order: excerpt curated by an admin for that date (Supabase) → rotation over the local list.
import { esc, jsArg } from './dom.js';
import { ICONS } from './icons.js';
import { searchTracks } from './api.js';
import { REAL_LYRICS_DB } from './lyrics_db.js';
import * as sb from './supabase.js';

export const MAX_EXCERPT_CHARS = 280;
export const MAX_EXCERPT_LINES = 4;
const MAX_DAYS_BACK = 6;

const lyricCache = new Map(); // iso date → lyric
const coverCache = new Map(); // "song artist" → track | null

/** Local calendar date as YYYY-MM-DD (not UTC, so the lyric changes at local midnight). */
export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Validate an excerpt for length and line count; returns an error message or ''. */
export function validateExcerpt(text) {
  const t = String(text || '').trim();
  if (t.length < 5) return 'O trecho precisa ter pelo menos 5 caracteres.';
  if (t.length > MAX_EXCERPT_CHARS) return `Use no máximo ${MAX_EXCERPT_CHARS} caracteres: só um trecho curto da letra.`;
  if (t.split('\n').length > MAX_EXCERPT_LINES) return `Use no máximo ${MAX_EXCERPT_LINES} linhas.`;
  return '';
}

function rotationLyric(iso) {
  const list = REAL_LYRICS_DB;
  const item = list[((dayNumber(iso) % list.length) + list.length) % list.length];
  return {
    date: iso,
    excerpt: item.lyrics,
    song: item.song,
    artist: item.artist,
    year: item.year || '',
    note: '',
    source: 'rotation'
  };
}

/**
 * Lyric for a given day.
 * @param {string} iso YYYY-MM-DD
 */
export async function getLyricForDate(iso) {
  if (lyricCache.has(iso)) return lyricCache.get(iso);
  let lyric = null;
  if (sb.isSupabaseConfigured()) {
    try {
      const row = await sb.fetchDailyLyric(iso);
      if (row) lyric = { date: iso, excerpt: row.excerpt, song: row.song, artist: row.artist, year: '', note: row.note || '', source: 'curated' };
    } catch (err) {
      console.warn('Curated lyric unavailable, using rotation:', err.message);
    }
  }
  lyric = lyric || rotationLyric(iso);
  lyricCache.set(iso, lyric);
  return lyric;
}

/** Forget cached days (after an admin edits the schedule). */
export function clearLyricCache() {
  lyricCache.clear();
}

async function findTrack(song, artist) {
  const key = `${song} ${artist}`.toLowerCase();
  if (coverCache.has(key)) return coverCache.get(key);
  let match = null;
  try {
    const results = await searchTracks(`${song} ${artist}`, 3);
    match = results.find(r => r.artist.toLowerCase().includes(artist.toLowerCase().split(/[&,]/)[0].trim())) || results[0] || null;
  } catch { /* cover is optional */ }
  coverCache.set(key, match);
  return match;
}

function dateLabel(iso, today) {
  if (iso === today) return 'Hoje';
  if (iso === shiftISO(today, -1)) return 'Ontem';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Render the "Letra do dia" widget with day navigation.
 * @param {HTMLElement} container
 * @param {string} [iso] day to show (defaults to today)
 */
export async function renderDailyLyric(container, iso) {
  if (!container) return;
  const today = toISODate();
  const day = iso || today;
  const oldest = shiftISO(today, -MAX_DAYS_BACK);

  container.dataset.day = day;
  container.innerHTML = `<div class="daily-lyric daily-lyric-loading" aria-busy="true"><div class="daily-lyric-text">Carregando a letra do dia…</div></div>`;

  const lyric = await getLyricForDate(day);
  if (container.dataset.day !== day) return; // user already moved to another day

  container.innerHTML = `
    <div class="daily-lyric">
      <div class="daily-lyric-nav">
        <button type="button" class="daily-lyric-arrow" data-day="${shiftISO(day, -1)}" ${day <= oldest ? 'disabled' : ''} aria-label="Dia anterior">${ICONS.chevronLeft}</button>
        <time datetime="${day}">${esc(dateLabel(day, today))}</time>
        <button type="button" class="daily-lyric-arrow" data-day="${shiftISO(day, 1)}" ${day >= today ? 'disabled' : ''} aria-label="Próximo dia">${ICONS.chevronRight}</button>
      </div>
      <blockquote class="daily-lyric-text">${esc(lyric.excerpt)}</blockquote>
      <div class="daily-lyric-song">
        <span class="daily-lyric-cover" aria-hidden="true">${esc(lyric.song[0] || '♪')}</span>
        <div class="daily-lyric-meta">
          <b>${esc(lyric.song)}</b>
          <span>${esc(lyric.artist)}${lyric.year ? ` · ${esc(lyric.year)}` : ''}</span>
        </div>
        <button type="button" class="daily-lyric-play" aria-label="Ouvir ${esc(lyric.song)}"
          onclick="window._playTrack(${jsArg({ title: lyric.song, artist: lyric.artist })})">${ICONS.play}</button>
      </div>
      ${lyric.note ? `<p class="daily-lyric-note">${esc(lyric.note)}</p>` : ''}
      ${lyric.source === 'curated' ? `<div class="daily-lyric-badge">Escolhida pela equipe</div>` : ''}
    </div>`;

  container.querySelectorAll('.daily-lyric-arrow').forEach(btn =>
    btn.addEventListener('click', () => renderDailyLyric(container, btn.dataset.day)));

  // Cover art and a precise play target arrive later
  const track = await findTrack(lyric.song, lyric.artist);
  if (!track || container.dataset.day !== day) return;
  const cover = container.querySelector('.daily-lyric-cover');
  if (cover && track.artwork) {
    const img = document.createElement('img');
    img.className = 'daily-lyric-cover';
    img.alt = '';
    img.src = track.artwork;
    img.onerror = () => img.replaceWith(cover);
    cover.replaceWith(img);
  }
  const play = container.querySelector('.daily-lyric-play');
  if (play) play.onclick = () => window._playTrack({ ...track });
}

