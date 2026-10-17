// Logo animado: gatinho branco com fone, cuja expressão muda conforme a ação do usuário.
// Estados: idle, playing, paused, love, happy, alert (estilos e animações em css/social.css).
import { globalAudio } from './audio.js';

const CAT_ART = `
  <ellipse class="cat-shadow" cx="32" cy="59" rx="15" ry="2.4"/>
  <g class="cat-body">
    <path class="cat-head cat-ear cat-ear-l" d="M12.5 28C10 18 11.5 9.5 16 8.2 19.6 7.2 24.5 12.5 27.5 18Z"/>
    <path class="cat-head cat-ear cat-ear-r" d="M51.5 28C54 18 52.5 9.5 48 8.2 44.4 7.2 39.5 12.5 36.5 18Z"/>
    <path class="cat-inner" d="M16 23C15 16.5 16 12.5 18 12 20 11.6 22.5 14.5 24 17.5Z"/>
    <path class="cat-inner" d="M48 23C49 16.5 48 12.5 46 12 44 11.6 41.5 14.5 40 17.5Z"/>
    <ellipse class="cat-head" cx="32" cy="37" rx="21.5" ry="18.5"/>
    <path class="cat-band" d="M10.5 37C9.5 12 54.5 12 53.5 37"/>
    <g class="cat-cup-l"><rect class="cat-cup" x="4" y="29.5" width="10.5" height="15" rx="5.25"/><path class="cat-cup-shine" d="M7.2 33v4.5"/></g>
    <g class="cat-cup-r"><rect class="cat-cup" x="49.5" y="29.5" width="10.5" height="15" rx="5.25"/><path class="cat-cup-shine" d="M52.7 33v4.5"/></g>
    <ellipse class="cat-blush" cx="18.6" cy="43.6" rx="3.8" ry="2.2"/>
    <ellipse class="cat-blush" cx="45.4" cy="43.6" rx="3.8" ry="2.2"/>

    <g class="m m-idle cat-eyes cat-blink">
      <ellipse class="cat-eye" cx="24" cy="36.5" rx="3.7" ry="4.5"/><ellipse class="cat-eye" cx="40" cy="36.5" rx="3.7" ry="4.5"/>
      <circle class="cat-glint" cx="25.4" cy="34.6" r="1.5"/><circle class="cat-glint" cx="41.4" cy="34.6" r="1.5"/>
      <circle class="cat-glint" cx="22.8" cy="38.7" r=".7"/><circle class="cat-glint" cx="38.8" cy="38.7" r=".7"/>
    </g>
    <g class="m m-playing m-happy">
      <path class="cat-line cat-line-eye" d="M20.5 37.6Q24 33.4 27.5 37.6M36.5 37.6Q40 33.4 43.5 37.6"/>
    </g>
    <g class="m m-paused">
      <path class="cat-line cat-line-eye" d="M20.5 36Q24 39.6 27.5 36M36.5 36Q40 39.6 43.5 36"/>
    </g>
    <g class="m m-love cat-heart-eyes">
      <path class="cat-heart-eye" d="M24 41C19.2 37.8 19.6 33.6 22 33.4 23.2 33.3 23.8 34.2 24 34.8 24.2 34.2 24.8 33.3 26 33.4 28.4 33.6 28.8 37.8 24 41Z"/>
      <path class="cat-heart-eye" d="M40 41C35.2 37.8 35.6 33.6 38 33.4 39.2 33.3 39.8 34.2 40 34.8 40.2 34.2 40.8 33.3 42 33.4 44.4 33.6 44.8 37.8 40 41Z"/>
    </g>
    <g class="m m-alert">
      <ellipse class="cat-eye" cx="24" cy="36" rx="4.4" ry="5.2"/><ellipse class="cat-eye" cx="40" cy="36" rx="4.4" ry="5.2"/>
      <circle class="cat-glint" cx="25.6" cy="33.8" r="1.9"/><circle class="cat-glint" cx="41.6" cy="33.8" r="1.9"/>
      <circle class="cat-glint" cx="22.6" cy="38.6" r=".9"/><circle class="cat-glint" cx="38.6" cy="38.6" r=".9"/>
    </g>

    <path class="cat-nose" d="M30.4 40.4Q32 39.4 33.6 40.4 33 42.3 32 42.4 31 42.3 30.4 40.4Z"/>
    <path class="m m-idle m-playing m-paused m-love cat-line cat-mouth" d="M28.4 43.6Q30.2 46.2 32 44 33.8 46.2 35.6 43.6"/>
    <g class="m m-happy"><path class="cat-eye" d="M28.6 43.4Q32 49.4 35.4 43.4Z"/><path class="cat-tongue" d="M30.3 45.7Q32 47.9 33.7 45.7 32 44.8 30.3 45.7Z"/></g>
    <ellipse class="m m-alert cat-eye" cx="32" cy="45.2" rx="1.7" ry="2"/>
  </g>

  <g class="m m-playing">
    <g class="cat-note"><circle cx="56" cy="21" r="2.6"/><path class="cat-note-stem" d="M58.4 21V12l3.6 1.8"/></g>
    <g class="cat-note cat-note-2"><circle cx="6.5" cy="17" r="2.2"/><path class="cat-note-stem" d="M8.5 17V9.5l3 1.4"/></g>
  </g>
  <g class="m m-paused cat-zz"><text class="cat-z" x="48" y="17" font-size="12">z</text><text class="cat-z cat-zz-2" x="56" y="8" font-size="8.5">z</text></g>
  <g class="m m-love">
    <path class="cat-float-heart" d="M56 15C52.6 12.6 51.7 11 51.8 9.5 52 8 54.1 7.2 56 8.9 57.9 7.2 60 8 60.2 9.5 60.3 11 59.4 12.6 56 15Z"/>
    <path class="cat-float-heart cat-float-heart-2" d="M8 12C5.6 10.3 5 9.2 5.1 8.1 5.2 7.1 6.7 6.5 8 7.7 9.3 6.5 10.8 7.1 10.9 8.1 11 9.2 10.4 10.3 8 12Z"/>
  </g>
  <g class="m m-happy">
    <path class="cat-sparkle" d="M56 2.5l1.6 4.4 4.4 1.6-4.4 1.6L56 14.5l-1.6-4.4-4.4-1.6 4.4-1.6z"/>
    <path class="cat-sparkle cat-sparkle-2" d="M8 4l1 2.8 2.8 1-2.8 1L8 11.6l-1-2.8-2.8-1 2.8-1z"/>
    <path class="cat-sparkle cat-sparkle-3" d="M60 24l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>
  </g>
  <g class="m m-alert cat-bang"><circle class="cat-bang-bg" cx="55.5" cy="9" r="6.2"/><path class="cat-bang-mark" d="M55.5 5.6v4.2M55.5 12.3v.1"/></g>`;

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
