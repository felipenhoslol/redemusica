// Logo animado: gatinho branco com fone, cuja expressão muda conforme a ação do usuário.
// Estados: idle, playing, paused, love, happy, alert (estilos em css/rabisco.css).
import { globalAudio } from './audio.js';

const CAT_ART = `
  <g class="cat-bob">
    <path class="cat-head" d="M12 35C12 25 15 19 17 16.5L15.5 5.5 26 12C28.3 11.3 30 11 32 11S35.7 11.3 38 12L48.5 5.5 47 16.5C49 19 52 25 52 35 52 45.5 43.5 52 32 52S12 45.5 12 35Z"/>
    <path class="cat-stroke cat-phones" stroke-width="3.2" d="M11.5 31C9.5 7.5 54.5 7.5 52.5 31"/>
    <rect class="cat-cup" x="6.5" y="26" width="9" height="14.5" rx="4.2"/>
    <rect class="cat-cup" x="48.5" y="26" width="9" height="14.5" rx="4.2"/>
    <g class="m m-idle cat-face cat-blink"><ellipse cx="25" cy="32" rx="2.4" ry="3.2"/><ellipse cx="39" cy="32" rx="2.4" ry="3.2"/></g>
    <path class="m m-playing cat-stroke" d="M22 33Q25 29.5 28 33M36 33Q39 29.5 42 33"/>
    <path class="m m-paused cat-stroke" d="M22.5 33.5Q25 35 27.5 33.5M36.5 33.5Q39 35 41.5 33.5"/>
    <g class="m m-love cat-hot"><path d="M25 35.6C22.2 33.6 21.4 32.3 21.5 31 21.6 29.8 23.4 29.1 25 30.5 26.6 29.1 28.4 29.8 28.5 31 28.6 32.3 27.8 33.6 25 35.6Z"/><path transform="translate(14 0)" d="M25 35.6C22.2 33.6 21.4 32.3 21.5 31 21.6 29.8 23.4 29.1 25 30.5 26.6 29.1 28.4 29.8 28.5 31 28.6 32.3 27.8 33.6 25 35.6Z"/></g>
    <g class="m m-happy"><ellipse class="cat-face" cx="25" cy="32" rx="2.4" ry="3.2"/><path class="cat-stroke" d="M36 33Q39 29.5 42 33"/></g>
    <g class="m m-alert"><circle class="cat-face" cx="25" cy="32" r="3.6"/><circle class="cat-face" cx="39" cy="32" r="3.6"/><circle class="cat-glint" cx="26.2" cy="30.8" r="1.1"/><circle class="cat-glint" cx="40.2" cy="30.8" r="1.1"/></g>
    <path class="cat-face" d="M30.6 37.6H33.4L32 39.3Z"/>
    <path class="cat-stroke" stroke-width="1.8" d="M28.4 41.2Q30.2 43 32 41.2Q33.8 43 35.6 41.2"/>
  </g>
  <g class="m m-playing cat-white">
    <g class="cat-note"><circle cx="56" cy="17" r="2"/><path class="cat-note-stem" stroke-width="1.6" d="M57.8 17V9.5l3 1"/></g>
    <g class="cat-note cat-note-2"><circle cx="5" cy="14" r="1.6"/><path class="cat-note-stem" stroke-width="1.4" d="M6.4 14V8.5l2.4.8"/></g>
  </g>
  <g class="m m-paused cat-zz cat-white"><text x="52" y="13" font-size="9">z</text><text x="58" y="7" font-size="6">z</text></g>
  <path class="m m-love cat-pop cat-hot" d="M56 13C52.6 10.6 51.7 9 51.8 7.5 52 6 54.1 5.2 56 6.9 57.9 5.2 60 6 60.2 7.5 60.3 9 59.4 10.6 56 13Z"/>
  <path class="m m-happy cat-pop cat-neon" d="M56 3l1.4 4.1L61.5 8.5l-4.1 1.4L56 14l-1.4-4.1-4.1-1.4 4.1-1.4z"/>
  <g class="m m-alert cat-pop"><circle class="cat-hot" cx="56" cy="8" r="5.5"/><path class="cat-stroke" stroke-width="2" d="M56 5v3.6M56 11v.1"/></g>`;

/**
 * Markup of the cat logo
 * @param {object} [opts]
 * @param {string} [opts.mood] initial mood
 * @param {boolean} [opts.live] reacts to player and app actions
 * @param {string} [opts.className] extra classes
 * @returns {string}
 */
export function catLogoHtml({ mood, live = false, className = '' } = {}) {
  mood = mood || (live ? baseMood : 'idle');
  return `<svg class="cat${live ? ' cat-live' : ''}${className ? ' ' + className : ''}" data-mood="${mood}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${CAT_ART}</svg>`;
}

let baseMood = 'idle';
let moodTimer = null;

function liveCats() {
  return document.querySelectorAll('.cat-live');
}

/**
 * Change the mood of every live cat. With `ms`, it returns to the base mood afterwards.
 * @param {'idle'|'playing'|'paused'|'love'|'happy'|'alert'} mood
 * @param {number} [ms]
 */
export function setCatMood(mood, ms) {
  clearTimeout(moodTimer);
  liveCats().forEach(c => { c.dataset.mood = mood; });
  if (ms) moodTimer = setTimeout(() => setCatMood(baseMood), ms);
}


let audioBound = false;

/** Bind live cats to the global audio player (call once). */
export function initCatLogo() {
  if (audioBound) return;
  audioBound = true;
  globalAudio.subscribe((event) => {
    if (event === 'play') { baseMood = 'playing'; setCatMood('playing'); }
    if (event === 'pause' || event === 'ended' || event === 'error') { baseMood = 'paused'; setCatMood('paused'); }
  });
}
